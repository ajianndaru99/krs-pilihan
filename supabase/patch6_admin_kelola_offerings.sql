-- ============================================================================
-- PATCH 6: Impor & Pengelolaan Lengkap Mata Kuliah / Proyek Pilihan (CRUD)
-- Jalankan skrip ini di Supabase SQL Editor.
-- ============================================================================

-- 1. Perbarui admin_list_offerings agar menyertakan detail jadwal lengkap
CREATE OR REPLACE FUNCTION public.admin_list_offerings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'nama', o.nama,
                'jenis', o.jenis,
                'topik', o.topik,
                'kuota', o.kuota,
                'terisi', (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id),
                'sisa', GREATEST(0, o.kuota - (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id))::INT,
                'jadwal', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', s.id,
                            'hari', s.hari,
                            'jam_mulai', s.jam_mulai::text,
                            'jam_selesai', s.jam_selesai::text,
                            'ruang', s.ruang
                        ) ORDER BY s.hari, s.jam_mulai
                    ) FROM public.schedules s WHERE s.offering_id = o.id
                ), '[]'::jsonb)
            ) ORDER BY o.jenis, o.nama
        ) FROM public.offerings o
    );
END;
$$;

-- 2. Tambah / Ubah Mata Kuliah & Proyek Pilihan (Upsert)
CREATE OR REPLACE FUNCTION public.admin_upsert_offering(
    p_id INT,
    p_nama TEXT,
    p_jenis TEXT,
    p_topik TEXT,
    p_kuota INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_id INT;
    v_terisi INT;
    v_jenis TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    IF p_nama IS NULL OR trim(p_nama) = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nama mata kuliah/proyek wajib diisi.');
    END IF;

    v_jenis := lower(trim(p_jenis));
    IF v_jenis NOT IN ('matkul', 'proyek') THEN
        v_jenis := 'matkul';
    END IF;

    IF p_kuota IS NULL OR p_kuota < 1 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Kuota harus berupa angka lebih dari 0.');
    END IF;

    IF p_id IS NULL OR p_id = 0 THEN
        -- Insert baru
        INSERT INTO public.offerings (nama, jenis, topik, kuota)
        VALUES (trim(p_nama), v_jenis, nullif(trim(p_topik), ''), p_kuota)
        RETURNING id INTO v_id;

        RETURN jsonb_build_object('ok', true, 'id', v_id, 'action', 'created');
    ELSE
        -- Update yang sudah ada
        SELECT count(*) INTO v_terisi FROM public.registrations WHERE offering_id = p_id;
        IF p_kuota < v_terisi THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Kuota baru (' || p_kuota || ') tidak boleh lebih kecil dari jumlah mahasiswa yang sudah mendaftar (' || v_terisi || ').');
        END IF;

        UPDATE public.offerings
        SET nama = trim(p_nama),
            jenis = v_jenis,
            topik = nullif(trim(p_topik), ''),
            kuota = p_kuota
        WHERE id = p_id;

        RETURN jsonb_build_object('ok', true, 'id', p_id, 'action', 'updated');
    END IF;
END;
$$;

-- 3. Hapus Mata Kuliah / Proyek Pilihan (Aman dengan proteksi pendaftar)
CREATE OR REPLACE FUNCTION public.admin_delete_offering(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_terisi INT;
    v_nama TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    SELECT nama INTO v_nama FROM public.offerings WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mata kuliah/proyek tidak ditemukan.');
    END IF;

    SELECT count(*) INTO v_terisi FROM public.registrations WHERE offering_id = p_id;
    IF v_terisi > 0 THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Tidak dapat menghapus "' || v_nama || '" karena sudah memiliki ' || v_terisi || ' pendaftar. Batalkan pendaftaran mahasiswa terlebih dahulu.'
        );
    END IF;

    -- Hapus jadwal terkait dan offering
    DELETE FROM public.schedules WHERE offering_id = p_id;
    DELETE FROM public.offerings WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Mata kuliah "' || v_nama || '" berhasil dihapus.');
END;
$$;

-- 4. Tambah Jadwal ke Offering Tertentu
CREATE OR REPLACE FUNCTION public.admin_tambah_jadwal(
    p_offering_id INT,
    p_hari TEXT,
    p_jam_mulai TEXT,
    p_jam_selesai TEXT,
    p_ruang TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_sched_id INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.offerings WHERE id = p_offering_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mata kuliah tidak ditemukan.');
    END IF;

    INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang)
    VALUES (
        p_offering_id,
        trim(p_hari),
        p_jam_mulai::TIME,
        p_jam_selesai::TIME,
        nullif(trim(p_ruang), '')
    )
    RETURNING id INTO v_sched_id;

    RETURN jsonb_build_object('ok', true, 'id', v_sched_id);
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Format waktu atau data jadwal tidak valid.');
END;
$$;

-- 5. Hapus Jadwal Tertentu
CREATE OR REPLACE FUNCTION public.admin_hapus_jadwal(p_schedule_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    DELETE FROM public.schedules WHERE id = p_schedule_id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 6. Impor Massal Daftar Mata Kuliah & Proyek Pilihan dari Excel (Beserta Jadwal jika ada)
CREATE OR REPLACE FUNCTION public.admin_import_offerings(p_offerings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_nama TEXT;
    v_jenis TEXT;
    v_topik TEXT;
    v_kuota INT;
    v_hari TEXT;
    v_mulai TEXT;
    v_selesai TEXT;
    v_ruang TEXT;
    v_off_id INT;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_offerings) LOOP
        v_nama := trim(v_item ->> 'nama');
        IF v_nama IS NOT NULL AND v_nama <> '' THEN
            v_jenis := lower(trim(COALESCE(v_item ->> 'jenis', 'matkul')));
            IF v_jenis NOT IN ('matkul', 'proyek') THEN
                v_jenis := 'matkul';
            END IF;

            v_topik := nullif(trim(v_item ->> 'topik'), '');
            v_kuota := GREATEST(1, COALESCE((v_item ->> 'kuota')::INT, 30));

            -- Cek apakah offering sudah ada berdasarkan nama
            SELECT id INTO v_off_id FROM public.offerings WHERE lower(nama) = lower(v_nama) LIMIT 1;

            IF v_off_id IS NOT NULL THEN
                UPDATE public.offerings
                SET jenis = v_jenis,
                    topik = COALESCE(v_topik, topik),
                    kuota = v_kuota
                WHERE id = v_off_id;
            ELSE
                INSERT INTO public.offerings (nama, jenis, topik, kuota)
                VALUES (v_nama, v_jenis, v_topik, v_kuota)
                RETURNING id INTO v_off_id;
            END IF;

            -- Jika menyertakan kolom jadwal pada baris ini, masukkan ke schedules
            v_hari := nullif(trim(v_item ->> 'hari'), '');
            v_mulai := nullif(trim(v_item ->> 'jam_mulai'), '');
            v_selesai := nullif(trim(v_item ->> 'jam_selesai'), '');
            v_ruang := nullif(trim(v_item ->> 'ruang'), '');

            IF v_hari IS NOT NULL AND v_mulai IS NOT NULL AND v_selesai IS NOT NULL THEN
                BEGIN
                    -- Hindari duplikasi jadwal yang identik
                    IF NOT EXISTS (
                        SELECT 1 FROM public.schedules
                        WHERE offering_id = v_off_id
                          AND lower(hari) = lower(v_hari)
                          AND jam_mulai = v_mulai::TIME
                          AND jam_selesai = v_selesai::TIME
                    ) THEN
                        INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang)
                        VALUES (v_off_id, v_hari, v_mulai::TIME, v_selesai::TIME, v_ruang);
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    -- Abaikan error jadwal individu agar tidak menggagalkan seluruh baris offering
                    NULL;
                END;
            END IF;

            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'imported_count', v_count);
END;
$$;

-- 7. Grant Permission ke Role Authenticated
GRANT EXECUTE ON FUNCTION public.admin_list_offerings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_offering(INT, TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_offering(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tambah_jadwal(INT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hapus_jadwal(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_offerings(JSONB) TO authenticated;
