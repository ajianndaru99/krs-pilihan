-- ==============================================================================
-- PATCH 12: Pengelolaan & Edit Data Master Mahasiswa di Panel Admin
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================

-- 1. Fungsi RPC untuk menampilkan daftar master mahasiswa bagi Admin
CREATE OR REPLACE FUNCTION public.admin_list_students()
RETURNS TABLE(
    nim VARCHAR(20),
    nama VARCHAR(100),
    kelas VARCHAR(50),
    registered_at TIMESTAMPTZ,
    has_registered BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    RETURN QUERY
    SELECT 
        s.nim,
        s.nama,
        COALESCE(s.kelas, '-') AS kelas,
        s.registered_at,
        (s.registered_at IS NOT NULL) AS has_registered
    FROM public.students s
    ORDER BY s.nim ASC;
END;
$$;

-- 2. Fungsi RPC untuk memperbarui data mahasiswa (Nama & Kelas)
CREATE OR REPLACE FUNCTION public.admin_update_student(
    p_nim VARCHAR(20),
    p_nama VARCHAR(100),
    p_kelas VARCHAR(50)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(20) := trim(p_nim);
    v_clean_nama VARCHAR(100) := trim(p_nama);
    v_clean_kelas VARCHAR(50) := NULLIF(trim(p_kelas), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    IF v_clean_nim = '' OR v_clean_nama = '' THEN
        RAISE EXCEPTION 'NIM dan Nama Mahasiswa tidak boleh kosong.';
    END IF;

    UPDATE public.students
    SET 
        nama = v_clean_nama,
        kelas = v_clean_kelas
    WHERE nim = v_clean_nim;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mahasiswa dengan NIM % tidak ditemukan.', v_clean_nim;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Data mahasiswa %s (%s) berhasil diperbarui.', v_clean_nama, v_clean_nim)
    );
END;
$$;

-- 3. Fungsi RPC untuk menghapus data master mahasiswa
CREATE OR REPLACE FUNCTION public.admin_delete_student(p_nim VARCHAR(20))
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(20) := trim(p_nim);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    -- Jika mahasiswa sudah memilih mata kuliah, batalkan terlebih dahulu agar kuota kelas kembali
    IF EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_clean_nim) THEN
        PERFORM public.admin_batal_daftar(v_clean_nim);
    END IF;

    -- Bersihkan antrian
    DELETE FROM public.queue WHERE nim = v_clean_nim;

    -- Hapus dari master students
    DELETE FROM public.students WHERE nim = v_clean_nim;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mahasiswa dengan NIM % tidak ditemukan.', v_clean_nim;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Mahasiswa dengan NIM %s berhasil dihapus dari sistem.', v_clean_nim)
    );
END;
$$;

-- Hak Akses (Security Definier hanya untuk authenticated admin)
GRANT EXECUTE ON FUNCTION public.admin_list_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_student(VARCHAR, VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_student(VARCHAR) TO authenticated;
