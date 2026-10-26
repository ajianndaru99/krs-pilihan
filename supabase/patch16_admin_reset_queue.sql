-- ==============================================================================
-- PATCH 16: KONTROL ADMIN UNTUK RESET ANTRIAN & SESI KADALUARSA MAHASISWA
-- ==============================================================================
-- Memberikan wewenang penuh kepada Administrator di Panel Admin untuk:
-- 1. Mereset sesi antrian per mahasiswa (menghapus riwayat expired/stuck satu NIM)
-- 2. Membersihkan seluruh sesi antrian yang kedaluwarsa secara massal
-- ==============================================================================

-- 1. FUNGSI admin_reset_queue_student(p_nim TEXT)
CREATE OR REPLACE FUNCTION public.admin_reset_queue_student(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(p_nim);
    v_deleted_count INT := 0;
    v_student_nama TEXT := '';
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk administrator prodi.');
    END IF;

    IF v_clean_nim = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM mahasiswa tidak boleh kosong.');
    END IF;

    SELECT nama INTO v_student_nama FROM public.students WHERE nim = v_clean_nim;

    DELETE FROM public.queue WHERE nim = v_clean_nim;
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Sesi antrian untuk %s (NIM %s) berhasil direset (%s antrian dibersihkan). Mahasiswa dapat langsung masuk antrian kembali.', COALESCE(v_student_nama, v_clean_nim), v_clean_nim, v_deleted_count),
        'deleted_count', v_deleted_count
    );
END;
$$;

-- 2. FUNGSI admin_reset_all_expired_queue()
CREATE OR REPLACE FUNCTION public.admin_reset_all_expired_queue()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_deleted_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk administrator prodi.');
    END IF;

    DELETE FROM public.queue WHERE state = 'expired';
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Seluruh sesi kadaluarsa berhasil dibersihkan (%s sesi). Mahasiswa yang tertahan batas waktu kini dapat masuk antrian kembali.', v_deleted_count),
        'deleted_count', v_deleted_count
    );
END;
$$;

-- 3. HAK AKSES EKSEKUSI (AUTHENTICATED ADMIN ONLY)
GRANT EXECUTE ON FUNCTION public.admin_reset_queue_student(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_all_expired_queue() TO authenticated;
