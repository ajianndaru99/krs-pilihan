-- ==============================================================================
-- PATCH 21: PENAMBAHAN KELAS (A-E), PELEPASAN SESI, & PENGHAPUSAN TOPIK
-- ==============================================================================
-- 1. Menambahkan kolom `kelas` pada tabel offerings (Kelas A, B, C, D, E).
-- 2. Menghapus konsep 'topik' dan validasi 'topik kembar' di daftar().
--    Digantikan dengan validasi mata kuliah ganda (tidak boleh memilih matkul sama 2x).
-- 3. Membuat RPC batal_sesi_antrian(p_nim, p_token) agar saat mahasiswa keluar/tutup
--    browser, slot 'SESI AKTIF MEMILIH' langsung dilepas seketika (tidak tertahan 5 menit).
-- 4. Membuat RPC admin_sapu_sesi() untuk membersihkan sesi menggantung di admin dashboard.
-- 5. Memperbarui list_offerings() dan admin_list_offerings() menyertakan kolom kelas.
-- ==============================================================================

-- 1. Tambah kolom kelas pada tabel offerings (jika belum ada)
ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS kelas VARCHAR(10) DEFAULT 'A';

-- Distribusikan kelas default A-E untuk 34 matkul pilihan jika masih null atau default
UPDATE public.offerings SET kelas = 'A' WHERE id BETWEEN 1 AND 7 AND (kelas IS NULL OR kelas = 'A');
UPDATE public.offerings SET kelas = 'B' WHERE id BETWEEN 8 AND 14 AND (kelas IS NULL OR kelas = 'A');
UPDATE public.offerings SET kelas = 'C' WHERE id BETWEEN 15 AND 21 AND (kelas IS NULL OR kelas = 'A');
UPDATE public.offerings SET kelas = 'D' WHERE id BETWEEN 22 AND 28 AND (kelas IS NULL OR kelas = 'A');
UPDATE public.offerings SET kelas = 'E' WHERE id BETWEEN 29 AND 34 AND (kelas IS NULL OR kelas = 'A');
UPDATE public.offerings SET kelas = 'Semua' WHERE jenis = 'proyek';

-- ------------------------------------------------------------------------------
-- 2. RPC batal_sesi_antrian(): PELEPASAN SESI AKTIF SECARA INSTAN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.batal_sesi_antrian(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next_token TEXT;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
    v_cur_state TEXT;
BEGIN
    SELECT state INTO v_cur_state
    FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'message', 'Sesi tidak ditemukan.');
    END IF;

    -- Ubah status sesi menjadi expired seketika
    UPDATE public.queue
    SET state = 'expired'
    WHERE token = p_token AND nim = trim(p_nim) AND state IN ('active', 'waiting', 'menunggu_undian');

    -- Jika yang keluar berstatus active, segera promosikan mahasiswa di antrian waiting teratas
    IF v_cur_state = 'active' THEN
        SELECT max_active, session_duration_minutes INTO v_max_active, v_session_min FROM public.settings WHERE id = 1;

        SELECT token INTO v_next_token 
        FROM public.queue 
        WHERE state = 'waiting' 
        ORDER BY nomor ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED;

        IF v_next_token IS NOT NULL THEN
            UPDATE public.queue
            SET state = 'active', 
                activated_at = v_now, 
                expires_at = v_now + (v_session_min || ' minutes')::interval
            WHERE token = v_next_token;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'message', 'Sesi pemilihan berhasil dilepaskan.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.batal_sesi_antrian(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. RPC admin_sapu_sesi(): BERSIHKAN SESI MENGGANTUNG DARI DASHBOARD ADMIN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_sapu_sesi()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    -- Bersihkan semua sesi aktif yang sudah lewat masa berlaku
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    GET DIAGNOSTICS v_cleaned = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true, 
        'message', format('%s sesi menggantung berhasil dibersihkan.', v_cleaned),
        'cleaned', v_cleaned
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sapu_sesi() TO authenticated;

-- ------------------------------------------------------------------------------
-- 4. PERBARUI admin_status(): BERSIHKAN SESI USANG SEBELUM MENGHITUNG STATISTIK
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settings RECORD;
    v_total_students INT;
    v_sudah_daftar INT;
    v_active_queue INT;
    v_waiting_queue INT;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    -- Otomatis bersihkan sesi active yang sudah lewat waktu sebelum menghitung kuota aktif
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    SELECT count(*) INTO v_total_students FROM public.students;
    SELECT count(DISTINCT nim) INTO v_sudah_daftar FROM public.registrations;
    SELECT count(*) INTO v_active_queue FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
    SELECT count(*) INTO v_waiting_queue FROM public.queue WHERE state = 'waiting';

    RETURN jsonb_build_object(
        'ok', true,
        'portal_open', v_settings.portal_open,
        'need_matkul', v_settings.need_matkul,
        'need_proyek', v_settings.need_proyek,
        'session_duration_minutes', v_settings.session_duration_minutes,
        'max_active', v_settings.max_active,
        'max_requeue', v_settings.max_requeue,
        'total_students', v_total_students,
        'sudah_daftar', v_sudah_daftar,
        'active_queue', v_active_queue,
        'waiting_queue', v_waiting_queue
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_status() TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. PERBARUI list_offerings(): MENYERTAKAN KOLOM KELAS (A-E) & TANPA TOPIK
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_offerings(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_pilihan JSONB;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
    END IF;

    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim) AND state = 'active' AND expires_at >= now();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'kelas', COALESCE(o.kelas, 'A'),
            'kuota', o.kuota,
            'terisi', COALESCE(r.cnt, 0),
            'sisa', GREATEST(0, o.kuota - COALESCE(r.cnt, 0)),
            'jadwal', COALESCE(sched.arr, '[]'::JSONB),
            'bentrok_kelas', (
                v_student.kelas IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM public.schedules s
                    JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                    WHERE s.offering_id = o.id
                      AND lower(trim(s.hari)) = lower(trim(cs.hari))
                      AND s.jam_mulai < cs.jam_selesai
                      AND cs.jam_mulai < s.jam_selesai
                )
            ),
            'bentrok', (
                v_student.kelas IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM public.schedules s
                    JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                    WHERE s.offering_id = o.id
                      AND lower(trim(s.hari)) = lower(trim(cs.hari))
                      AND s.jam_mulai < cs.jam_selesai
                      AND cs.jam_mulai < s.jam_selesai
                )
            )
        ) ORDER BY o.jenis DESC, o.kelas ASC, o.nama ASC
    ) INTO v_pilihan
    FROM public.offerings o
    LEFT JOIN (
        SELECT offering_id, count(*)::INT AS cnt
        FROM public.registrations
        GROUP BY offering_id
    ) r ON r.offering_id = o.id
    LEFT JOIN (
        SELECT s.offering_id, jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'hari', s.hari,
                'jam_mulai', to_char(s.jam_mulai, 'HH24:MI:SS'),
                'jam_selesai', to_char(s.jam_selesai, 'HH24:MI:SS'),
                'ruang', s.ruang
            ) ORDER BY s.hari, s.jam_mulai
        ) AS arr
        FROM public.schedules s
        GROUP BY s.offering_id
    ) sched ON sched.offering_id = o.id;

    RETURN jsonb_build_object(
        'ok', true,
        'pilihan', COALESCE(v_pilihan, '[]'::JSONB),
        'need_matkul', v_settings.need_matkul,
        'need_proyek', v_settings.need_proyek,
        'sisa_detik', GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - now()))::INT)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_offerings(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 6. PERBARUI daftar(): HAPUS ATURAN TOPIK KEMBAR, CEK NAMA MATKUL GANDA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_off_id INT;
    v_matkul_count INT := 0;
    v_proyek_count INT := 0;
    v_nama_arr TEXT[] := ARRAY[]::TEXT[];
    v_current_terisi INT;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
    END IF;

    -- 1. Kunci baris mahasiswa eksklusif
    SELECT * INTO v_student FROM public.students 
    WHERE nim = trim(p_nim) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    -- 2. Kunci baris sesi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = v_student.nim AND state = 'active' AND expires_at >= now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- 3. Validasi komposisi jumlah pilihan
    IF p_offering_ids IS NULL OR array_length(p_offering_ids, 1) <> (v_settings.need_matkul + v_settings.need_proyek) THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Jumlah pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- 4. KUNCI BARIS OFFERINGS SECARA DETERMINISTIK (urut ID ASC)
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    -- 5. Periksa kuota dan aturan bisnis pada snapshot segar
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        -- Hitung pendaftar terisi terkini secara presisi
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Kuota untuk mata kuliah "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih kelas atau mata kuliah lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota)
            );
        END IF;

        IF v_off.jenis = 'matkul' THEN
            v_matkul_count := v_matkul_count + 1;
        ELSIF v_off.jenis = 'proyek' THEN
            v_proyek_count := v_proyek_count + 1;
        END IF;

        -- Validasi: Mahasiswa tidak boleh memilih mata kuliah dengan NAMA yang sama dua kali (di kelas berbeda)
        IF v_off.nama = ANY(v_nama_arr) THEN
            RETURN jsonb_build_object('ok', false, 'error', format('Mata kuliah "%s" dipilih lebih dari satu kali.', v_off.nama));
        END IF;
        v_nama_arr := array_append(v_nama_arr, v_off.nama);

        -- Cek bentrok dengan jadwal kelas tetap mahasiswa
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
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s (Kelas %s) bentrok dengan jadwal kelas tetap Anda.', v_off.nama, COALESCE(v_off.kelas, 'A')));
            END IF;
        END IF;
    END LOOP;

    IF v_matkul_count <> v_settings.need_matkul OR v_proyek_count <> v_settings.need_proyek THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Komposisi pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- Cek bentrok jadwal antar mata kuliah pilihan yang dipilih
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

    -- 6. Simpan pendaftaran secara atomik
    UPDATE public.students 
    SET registered_at = now() 
    WHERE nim = v_student.nim AND registered_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    FOREACH v_off_id IN ARRAY p_offering_ids LOOP
        INSERT INTO public.registrations (nim, offering_id)
        VALUES (v_student.nim, v_off_id);
    END LOOP;

    UPDATE public.queue SET state = 'done' WHERE token = p_token;

    RETURN jsonb_build_object('ok', true, 'message', 'Pendaftaran berhasil disimpan.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. PERBARUI admin_list_offerings(): MENYERTAKAN KOLOM KELAS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_offerings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offerings JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'kelas', COALESCE(o.kelas, 'A'),
            'kuota', o.kuota,
            'terisi', COALESCE(r.cnt, 0),
            'sisa', GREATEST(0, o.kuota - COALESCE(r.cnt, 0)),
            'jadwal', COALESCE(sched.arr, '[]'::JSONB)
        ) ORDER BY o.jenis DESC, o.kelas ASC, o.nama ASC
    ) INTO v_offerings
    FROM public.offerings o
    LEFT JOIN (
        SELECT offering_id, count(*)::INT AS cnt
        FROM public.registrations
        GROUP BY offering_id
    ) r ON r.offering_id = o.id
    LEFT JOIN (
        SELECT s.offering_id, jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'hari', s.hari,
                'jam_mulai', to_char(s.jam_mulai, 'HH24:MI:SS'),
                'jam_selesai', to_char(s.jam_selesai, 'HH24:MI:SS'),
                'ruang', s.ruang
            ) ORDER BY s.hari, s.jam_mulai
        ) AS arr
        FROM public.schedules s
        GROUP BY s.offering_id
    ) sched ON sched.offering_id = o.id;

    RETURN jsonb_build_object('ok', true, 'offerings', COALESCE(v_offerings, '[]'::JSONB));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_offerings() TO authenticated;
