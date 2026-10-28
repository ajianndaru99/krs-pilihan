-- ==============================================================================
-- PATCH 30: PERBAIKI FUNGSI DAFTAR & SAPU SESI AKTIF TERTINGGAL
-- Sistem Pemilihan Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Memperbaiki fungsi public.daftar() yang memicu galat 42703 (registered_at).
-- 2. Memastikan pendaftaran tersimpan sempurna ke public.registrations(nim, offering_id).
-- 3. Memperbarui admin_sapu_sesi() agar saat tombol ditekan di dashboard admin,
--    seluruh sesi aktif yang menggantung/idle langsung dibersihkan menjadi 0.
-- 4. Langsung membersihkan sesi aktif saat ini agar counter 1/30 menjadi 0/30.
-- ==============================================================================

BEGIN;

-- 1. PERBARUI FUNGSI DAFTAR
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
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang ditutup.');
    END IF;

    -- Kunci baris mahasiswa eksklusif
    SELECT * INTO v_student FROM public.students 
    WHERE nim = trim(p_nim) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan dalam sistem.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran pemilihan mata kuliah.');
    END IF;

    -- Kunci baris sesi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = v_student.nim AND state = 'active' AND expires_at >= v_now
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid. Silakan masuk kembali.');
    END IF;

    -- Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah
    v_count := array_length(p_offering_ids, 1);
    IF p_offering_ids IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pilihan harus berjumlah minimal 1 dan maksimal 4 mata kuliah.');
    END IF;

    -- KUNCI BARIS OFFERINGS SECARA DETERMINISTIK (urut ID ASC untuk mencegah deadlock)
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    -- Periksa kuota, anti-duplikasi, dan bentrok jadwal kelas tetap
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Kuota untuk mata kuliah "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih mata kuliah atau kelas lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota)
            );
        END IF;

        v_base_name := lower(trim(regexp_replace(v_off.nama, '(\s+|-|/)+[A-Za-z]$', '')));

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
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s (Kelas %s) bentrok dengan jadwal kuliah tetap kelas Anda (%s).', v_off.nama, COALESCE(v_off.kelas, 'A'), v_student.kelas));
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

    -- SIMPAN PENDAFTARAN RESMI KE TABEL REGISTRATIONS (KOLOM: nim, offering_id)
    INSERT INTO public.registrations (nim, offering_id)
    SELECT v_student.nim, unnest(p_offering_ids);

    -- Tandai profil mahasiswa sudah menyelesaikan pendaftaran
    UPDATE public.students
    SET registered_at = v_now
    WHERE nim = v_student.nim;

    -- Tandai sesi antrian mahasiswa selesai
    UPDATE public.queue
    SET state = 'done'
    WHERE token = p_token AND nim = v_student.nim;

    -- Promosikan antrian berikutnya jika kapasitas slot masih tersedia
    v_max_active := COALESCE(v_settings.max_active, 30);
    v_session_min := COALESCE(v_settings.session_duration_minutes, 5);

    IF (SELECT count(*) FROM public.queue WHERE state = 'active' AND expires_at >= v_now) < v_max_active THEN
        UPDATE public.queue
        SET state = 'active', 
            activated_at = v_now, 
            expires_at = v_now + (v_session_min || ' minutes')::interval
        WHERE id = (
            SELECT id FROM public.queue 
            WHERE state = 'waiting' 
            ORDER BY nomor ASC 
            LIMIT 1 
            FOR UPDATE SKIP LOCKED
        );
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Pendaftaran mata kuliah pilihan berhasil disimpan secara resmi.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

-- 2. PERBARUI RPC admin_sapu_sesi(): BISA MEMBERSIHKAN SEMUA SESI AKTIF IDLE
CREATE OR REPLACE FUNCTION public.admin_sapu_sesi()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    -- Bersihkan seluruh sesi aktif menggantung/idle seketika
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active';

    GET DIAGNOSTICS v_cleaned = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true, 
        'message', format('%s sesi aktif berhasil dibersihkan.', v_cleaned),
        'cleaned', v_cleaned
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sapu_sesi() TO authenticated;

-- 3. BERSIHKAN SESI AKTIF SAAT INI AGAR COUNTER 1/30 MENJADI 0/30
UPDATE public.queue
SET state = 'expired'
WHERE state = 'active';

COMMIT;

