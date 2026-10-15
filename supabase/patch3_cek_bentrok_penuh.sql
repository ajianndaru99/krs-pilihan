-- ============================================================================
-- 4. patch3_cek_bentrok_penuh.sql
-- Impor jadwal kelas, impor jadwal pilihan, fail-closed clash checking, dan daftar
-- ============================================================================

-- 4.1 Tabel Jadwal Kelas Tetap
CREATE TABLE IF NOT EXISTS public.class_schedules (
    id SERIAL PRIMARY KEY,
    kelas TEXT NOT NULL,
    hari TEXT NOT NULL,
    jam_mulai TIME NOT NULL,
    jam_selesai TIME NOT NULL,
    matkul TEXT,
    ruang TEXT
);

CREATE INDEX IF NOT EXISTS idx_class_sched_kelas ON public.class_schedules(kelas);
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;

-- 4.2 Fungsi Admin: Impor Jadwal Kelas Tetap
CREATE OR REPLACE FUNCTION public.admin_import_jadwal_kelas(p_jadwal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_jadwal) LOOP
        INSERT INTO public.class_schedules (kelas, hari, jam_mulai, jam_selesai, matkul, ruang)
        VALUES (
            trim(v_item ->> 'kelas'),
            trim(v_item ->> 'hari'),
            (v_item ->> 'jam_mulai')::TIME,
            (v_item ->> 'jam_selesai')::TIME,
            v_item ->> 'matkul',
            v_item ->> 'ruang'
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'imported_count', v_count);
END;
$$;

-- 4.3 Fungsi Admin: Impor Jadwal Mata Kuliah Pilihan
CREATE OR REPLACE FUNCTION public.admin_import_jadwal_pilihan(p_jadwal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_off_id INT;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_jadwal) LOOP
        v_off_id := (v_item ->> 'offering_id')::INT;
        IF v_off_id IS NULL AND (v_item ->> 'nama_pilihan') IS NOT NULL THEN
            SELECT id INTO v_off_id FROM public.offerings WHERE lower(nama) = lower(trim(v_item ->> 'nama_pilihan')) LIMIT 1;
        END IF;

        IF v_off_id IS NOT NULL THEN
            INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang)
            VALUES (
                v_off_id,
                trim(v_item ->> 'hari'),
                (v_item ->> 'jam_mulai')::TIME,
                (v_item ->> 'jam_selesai')::TIME,
                v_item ->> 'ruang'
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'imported_count', v_count);
END;
$$;

-- 4.4 Fungsi list_offerings (dengan status bentrok terhadap kelas mahasiswa)
CREATE OR REPLACE FUNCTION public.list_offerings(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_pilihan JSONB;
BEGIN
    -- Validasi sesi aktif
    SELECT * INTO v_q FROM public.queue WHERE token = p_token AND nim = trim(p_nim) AND state = 'active' AND expires_at >= now();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak aktif atau telah kedaluwarsa.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'topik', o.topik,
            'jenis', o.jenis,
            'kuota', o.kuota,
            'terisi', (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id),
            'sisa', GREATEST(0, o.kuota - (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id))::INT,
            'bentrok', (
                -- Periksa bentrok dengan jadwal kelas tetap mahasiswa
                CASE WHEN v_student.kelas IS NULL OR trim(v_student.kelas) = '' THEN false
                ELSE EXISTS (
                    SELECT 1
                    FROM public.schedules s
                    JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                    WHERE s.offering_id = o.id
                      AND lower(trim(s.hari)) = lower(trim(cs.hari))
                      AND s.jam_mulai < cs.jam_selesai
                      AND cs.jam_mulai < s.jam_selesai
                ) END
            ),
            'jadwal', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object('hari', s.hari, 'jam_mulai', s.jam_mulai::text, 'jam_selesai', s.jam_selesai::text, 'ruang', s.ruang)
                ) FROM public.schedules s WHERE s.offering_id = o.id
            ), '[]'::jsonb)
        ) ORDER BY o.jenis, o.nama
    ) INTO v_pilihan
    FROM public.offerings o;

    RETURN jsonb_build_object('ok', true, 'pilihan', COALESCE(v_pilihan, '[]'::jsonb), 'paket', '[]'::jsonb);
END;
$$;

-- 4.5 Fungsi daftar (Pendaftaran final dengan validasi ketat, lock kuota, dan transaksi aman)
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_off_id INT;
    v_matkul_count INT := 0;
    v_proyek_count INT := 0;
    v_topik_arr TEXT[] := ARRAY[]::TEXT[];
    v_schedules RECORD;
    v_reg_count INT;
BEGIN
    -- Validasi pengaturan
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
    END IF;

    -- Validasi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim) AND state = 'active' AND expires_at >= now();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- Validasi mahasiswa
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    -- Validasi belum terdaftar
    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    -- Validasi array input
    IF p_offering_ids IS NULL OR array_length(p_offering_ids, 1) <> (v_settings.need_matkul + v_settings.need_proyek) THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Jumlah pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- Validasi per pilihan & lock kuota (FOR UPDATE)
    FOR v_off IN
        SELECT o.*, COALESCE(count(r.id), 0) AS terisi
        FROM public.offerings o
        LEFT JOIN public.registrations r ON r.offering_id = o.id
        WHERE o.id = ANY(p_offering_ids)
        GROUP BY o.id
        FOR UPDATE OF o
    LOOP
        -- Hitung jenis
        IF v_off.jenis = 'matkul' THEN
            v_matkul_count := v_matkul_count + 1;
        ELSIF v_off.jenis = 'proyek' THEN
            v_proyek_count := v_proyek_count + 1;
        END IF;

        -- Cek topik kembar
        IF v_off.topik IS NOT NULL AND v_off.topik <> '' THEN
            IF v_off.topik = ANY(v_topik_arr) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Topik mata kuliah kembar terdeteksi: %s.', v_off.topik));
            END IF;
            v_topik_arr := array_append(v_topik_arr, v_off.topik);
        END IF;

        -- Cek sisa kuota
        IF v_off.terisi >= v_off.kuota THEN
            RETURN jsonb_build_object('ok', false, 'error', format('Kuota untuk %s sudah penuh.', v_off.nama));
        END IF;

        -- Cek bentrok dengan jadwal kelas mahasiswa
        IF v_student.kelas IS NOT NULL AND trim(v_student.kelas) <> '' THEN
            IF EXISTS (
                SELECT 1
                FROM public.schedules s
                JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                WHERE s.offering_id = v_off.id
                  AND lower(trim(s.hari)) = lower(trim(cs.hari))
                  AND s.jam_mulai < cs.jam_selesai
                  AND cs.jam_mulai < s.jam_selesai
            ) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s bentrok dengan jadwal kelas tetap Anda.', v_off.nama));
            END IF;
        END IF;
    END LOOP;

    -- Validasi komposisi
    IF v_matkul_count <> v_settings.need_matkul OR v_proyek_count <> v_settings.need_proyek THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Komposisi pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- Cek bentrok antar jadwal pilihan yang dipilih
    IF EXISTS (
        SELECT 1
        FROM public.schedules s1
        JOIN public.schedules s2 ON s1.id <> s2.id AND s1.offering_id <> s2.offering_id
        WHERE s1.offering_id = ANY(p_offering_ids)
          AND s2.offering_id = ANY(p_offering_ids)
          AND lower(trim(s1.hari)) = lower(trim(s2.hari))
          AND s1.jam_mulai < s2.jam_selesai
          AND s2.jam_mulai < s1.jam_selesai
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat bentrok jadwal antar mata kuliah pilihan yang Anda pilih.');
    END IF;

    -- Eksekusi Pendaftaran
    FOREACH v_off_id IN ARRAY p_offering_ids LOOP
        INSERT INTO public.registrations (nim, offering_id)
        VALUES (v_student.nim, v_off_id);
    END LOOP;

    UPDATE public.students
    SET registered_at = now()
    WHERE nim = v_student.nim;

    UPDATE public.queue
    SET state = 'done'
    WHERE token = p_token;

    RETURN jsonb_build_object('ok', true, 'message', 'Pendaftaran berhasil disimpan.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_offerings(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_jadwal_kelas(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_jadwal_pilihan(JSONB) TO authenticated;
