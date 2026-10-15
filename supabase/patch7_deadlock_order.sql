-- ==============================================================================
-- PATCH 7: Pencegahan Deadlock pada Pendaftaran Konkuren (ORDER BY o.id ASC)
-- ==============================================================================
-- Menjamin lock FOR UPDATE pada tabel offerings selalu berurutan secara deterministik (id ASC)
-- untuk mengeliminasi potensi PostgreSQL 40P01 (deadlock detected) saat beban tinggi.

CREATE OR REPLACE FUNCTION public.daftar(
    p_nim TEXT,
    p_token TEXT,
    p_offering_ids INT[]
)
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
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    IF p_offering_ids IS NULL OR array_length(p_offering_ids, 1) <> (v_settings.need_matkul + v_settings.need_proyek) THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Jumlah pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- Urutkan kunci berdasarkan o.id ASC guna menjamin determinisme lock dan anti-deadlock
    FOR v_off IN
        SELECT o.*, COALESCE(count(r.id), 0) AS terisi
        FROM public.offerings o
        LEFT JOIN public.registrations r ON r.offering_id = o.id
        WHERE o.id = ANY(p_offering_ids)
        GROUP BY o.id
        ORDER BY o.id ASC
        FOR UPDATE OF o
    LOOP
        IF v_off.jenis = 'matkul' THEN
            v_matkul_count := v_matkul_count + 1;
        ELSIF v_off.jenis = 'proyek' THEN
            v_proyek_count := v_proyek_count + 1;
        END IF;

        IF v_off.topik IS NOT NULL AND v_off.topik <> '' THEN
            IF v_off.topik = ANY(v_topik_arr) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Topik mata kuliah kembar terdeteksi: %s.', v_off.topik));
            END IF;
            v_topik_arr := array_append(v_topik_arr, v_off.topik);
        END IF;

        IF v_off.terisi >= v_off.kuota THEN
            RETURN jsonb_build_object('ok', false, 'error', format('Kuota untuk %s sudah penuh.', v_off.nama));
        END IF;

        -- Bentrok kelas tetap jika ada
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

    IF v_matkul_count <> v_settings.need_matkul OR v_proyek_count <> v_settings.need_proyek THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Komposisi pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- Bentrok antar pilihan
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

    -- Simpan pendaftaran
    FOREACH v_off_id IN ARRAY p_offering_ids LOOP
        INSERT INTO public.registrations (nim, offering_id)
        VALUES (v_student.nim, v_off_id);
    END LOOP;

    UPDATE public.students SET registered_at = now() WHERE nim = v_student.nim;
    UPDATE public.queue SET state = 'done' WHERE token = p_token;

    RETURN jsonb_build_object('ok', true, 'message', 'Pendaftaran berhasil disimpan.');
END;
$$;
