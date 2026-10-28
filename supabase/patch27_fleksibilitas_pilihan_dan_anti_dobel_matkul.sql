-- ==============================================================================
-- PATCH 27: FLEKSIBILITAS PEMILIHAN 1-4 MATKUL & ANTI-DUPLIKASI KELAS MATKUL
-- Sistem Pemilihan Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Mengubah aturan kuota pemilihan pada fungsi daftar():
--    - Minimal 1 mata kuliah dan maksimal 4 mata kuliah (bisa submit 1, 2, 3, atau 4).
--    - Tidak lagi membatasi kaku rasio matkul vs proyek.
-- 2. Memperketat validasi agar mahasiswa TIDAK DAPAT memilih mata kuliah yang sama
--    di kelas yang berbeda (misal: jika memilih Literasi A, tidak bisa memilih Literasi B/C/D).
--    Sistem mengekstrak nama dasar (base name) untuk memastikan setiap pilihan adalah matkul yang berbeda.
-- ==============================================================================

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
    v_count INT;
    v_nama_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_name TEXT;
    v_current_terisi INT;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang ditutup.');
    END IF;

    -- 1. Kunci baris mahasiswa eksklusif
    SELECT * INTO v_student FROM public.students 
    WHERE nim = trim(p_nim) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran pemilihan mata kuliah.');
    END IF;

    -- 2. Kunci baris sesi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = v_student.nim AND state = 'active' AND expires_at >= now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- 3. Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah
    v_count := array_length(p_offering_ids, 1);
    IF p_offering_ids IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pilihan harus berjumlah minimal 1 dan maksimal 4 mata kuliah.');
    END IF;

    -- 4. KUNCI BARIS OFFERINGS SECARA DETERMINISTIK (urut ID ASC untuk mencegah deadlock)
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    -- 5. Periksa kuota dan aturan anti-duplikasi mata kuliah
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        -- Hitung pendaftar terisi terkini secara presisi dari tabel registrations
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Kuota untuk mata kuliah "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih mata kuliah lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota)
            );
        END IF;

        -- Ekstrak nama dasar (membuang sufiks kelas seperti " A", " B", " - A", dll.)
        v_base_name := lower(trim(regexp_replace(v_off.nama, '(\s+|-|/)+[A-Za-z]$', '')));

        -- Mahasiswa tidak boleh memilih mata kuliah dengan NAMA yang sama atau NAMA DASAR yang sama di kelas berbeda
        IF v_off.nama = ANY(v_nama_arr) OR (v_base_name <> '' AND v_base_name = ANY(v_base_arr)) THEN
            RETURN jsonb_build_object('ok', false, 'error', format('Mata kuliah "%s" dipilih lebih dari satu kali di kelas berbeda. Setiap pilihan mata kuliah harus berbeda.', v_off.nama));
        END IF;

        v_nama_arr := array_append(v_nama_arr, v_off.nama);
        IF v_base_name <> '' THEN
            v_base_arr := array_append(v_base_arr, v_base_name);
        END IF;

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
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s (Kelas %s) bentrok dengan jadwal kelas Anda.', v_off.nama, COALESCE(v_off.kelas, 'A')));
            END IF;
        END IF;
    END LOOP;

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

    -- 6. Simpan seluruh pendaftaran
    INSERT INTO public.registrations (nim, offering_id)
    SELECT v_student.nim, unnest(p_offering_ids);

    -- Tandai mahasiswa sudah menyelesaikan pendaftaran
    UPDATE public.students
    SET registered_at = now()
    WHERE nim = v_student.nim;

    -- Tandai sesi antrian mahasiswa selesai
    UPDATE public.queue
    SET state = 'done'
    WHERE token = p_token AND nim = v_student.nim;

    -- Promosikan antrian berikutnya jika ada yang menunggu
    PERFORM public.batal_sesi_antrian(v_student.nim, p_token);

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Pendaftaran mata kuliah pilihan berhasil disimpan secara resmi.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;
