-- ==============================================================================
-- PATCH 12: Pengelolaan & Edit Data Master Mahasiswa di Panel Admin
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================

-- 1. Hapus fungsi lama terlebih dahulu agar tidak terjadi konflik tipe kembalian
DROP FUNCTION IF EXISTS public.admin_list_students();
DROP FUNCTION IF EXISTS public.admin_update_student(VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.admin_update_student(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_delete_student(VARCHAR);
DROP FUNCTION IF EXISTS public.admin_delete_student(TEXT);

-- 2. Fungsi RPC untuk menampilkan daftar master mahasiswa bagi Admin (Tipe TEXT konsisten)
CREATE OR REPLACE FUNCTION public.admin_list_students()
RETURNS TABLE(
    nim TEXT,
    nama TEXT,
    kelas TEXT,
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
        s.nim::TEXT,
        s.nama::TEXT,
        COALESCE(s.kelas, '-')::TEXT AS kelas,
        s.registered_at,
        (s.registered_at IS NOT NULL) AS has_registered
    FROM public.students s
    ORDER BY s.nim ASC;
END;
$$;

-- 3. Fungsi RPC untuk memperbarui data mahasiswa (Nama & Kelas)
CREATE OR REPLACE FUNCTION public.admin_update_student(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(p_nim);
    v_clean_nama TEXT := trim(p_nama);
    v_clean_kelas TEXT := NULLIF(trim(p_kelas), '');
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

-- 4. Fungsi RPC untuk menghapus data master mahasiswa
CREATE OR REPLACE FUNCTION public.admin_delete_student(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(p_nim);
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
GRANT EXECUTE ON FUNCTION public.admin_update_student(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_student(TEXT) TO authenticated;
