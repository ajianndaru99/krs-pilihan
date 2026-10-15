-- ============================================================================
-- 5. patch4_ajukan_akses.sql
-- Tabel pengajuan akses, fungsi pengajuan dari anon, dan persetujuan admin
-- ============================================================================

-- 5.1 Tabel Pengajuan Akses Mahasiswa
CREATE TABLE IF NOT EXISTS public.access_requests (
    id SERIAL PRIMARY KEY,
    nim TEXT NOT NULL,
    nama TEXT NOT NULL,
    kelas TEXT,
    catatan TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_access_req_status ON public.access_requests(status);
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- 5.2 Fungsi Mahasiswa: Ajukan Akses
CREATE OR REPLACE FUNCTION public.ajukan_akses(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF trim(p_nim) = '' OR trim(p_nama) = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM dan Nama Lengkap wajib diisi.');
    END IF;

    -- Cek jika NIM sudah ada di students
    IF EXISTS (SELECT 1 FROM public.students WHERE nim = trim(p_nim)) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM Anda sudah terdaftar di database sistem.');
    END IF;

    INSERT INTO public.access_requests (nim, nama, kelas, catatan, status)
    VALUES (trim(p_nim), trim(p_nama), NULLIF(trim(p_kelas), ''), NULLIF(trim(p_catatan), ''), 'pending');

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan akses Anda berhasil dicatat dan menunggu verifikasi.');
END;
$$;

-- 5.3 Fungsi Admin: Daftar Pengajuan Akses
CREATE OR REPLACE FUNCTION public.admin_list_pengajuan()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    RETURN (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'nim', nim,
                'nama', nama,
                'kelas', kelas,
                'catatan', catatan,
                'status', status,
                'created_at', created_at
            ) ORDER BY (status = 'pending') DESC, created_at DESC
        ), '[]'::jsonb)
        FROM public.access_requests
    );
END;
$$;

-- 5.4 Fungsi Admin: Setujui Pengajuan Akses
CREATE OR REPLACE FUNCTION public.admin_setujui_pengajuan(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_req RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    SELECT * INTO v_req FROM public.access_requests WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan tidak ditemukan.');
    END IF;

    -- Tambahkan ke tabel students
    INSERT INTO public.students (nim, nama, kelas)
    VALUES (v_req.nim, v_req.nama, v_req.kelas)
    ON CONFLICT (nim) DO UPDATE
    SET nama = EXCLUDED.nama,
        kelas = COALESCE(EXCLUDED.kelas, students.kelas);

    -- Tandai disetujui
    UPDATE public.access_requests
    SET status = 'approved'
    WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan berhasil disetujui dan NIM telah aktif.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pengajuan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_setujui_pengajuan(INT) TO authenticated;
