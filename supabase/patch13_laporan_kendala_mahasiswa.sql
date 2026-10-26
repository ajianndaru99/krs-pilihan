-- ==============================================================================
-- PATCH 13: Kanal Pelaporan Kendala Mahasiswa & Tab Admin Reset KRS
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================

-- 1. Buat tabel student_complaints
CREATE TABLE IF NOT EXISTS public.student_complaints (
    id SERIAL PRIMARY KEY,
    nim VARCHAR(20) NOT NULL,
    nama VARCHAR(100),
    kelas VARCHAR(50),
    kategori VARCHAR(50) NOT NULL DEFAULT 'salah_pilih',
    alasan TEXT NOT NULL,
    kontak VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'rejected'
    catatan_admin TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_complaints_nim ON public.student_complaints(nim);
CREATE INDEX IF NOT EXISTS idx_student_complaints_status ON public.student_complaints(status);

ALTER TABLE public.student_complaints ENABLE ROW LEVEL SECURITY;

-- 2. Fungsi RPC untuk mahasiswa mengirim laporan kendala (Akses role anon & authenticated)
CREATE OR REPLACE FUNCTION public.lapor_kendala_mahasiswa(
    p_nim TEXT,
    p_nama TEXT,
    p_kategori TEXT,
    p_alasan TEXT,
    p_kontak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(20) := trim(p_nim);
    v_clean_nama VARCHAR(100) := trim(p_nama);
    v_clean_kategori VARCHAR(50) := COALESCE(NULLIF(trim(p_kategori), ''), 'salah_pilih');
    v_clean_alasan TEXT := trim(p_alasan);
    v_clean_kontak VARCHAR(50) := trim(p_kontak);
    v_student RECORD;
    v_id INT;
BEGIN
    IF v_clean_nim = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi.');
    END IF;

    IF v_clean_alasan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Alasan kendala wajib diisi.');
    END IF;

    IF v_clean_kontak = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nomor kontak WhatsApp/telepon wajib diisi.');
    END IF;

    -- Periksa apakah mahasiswa terdaftar di master students
    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar di sistem.');
    END IF;

    IF v_clean_nama = '' THEN
        v_clean_nama := v_student.nama;
    END IF;

    -- Cegah spam laporan pending ganda untuk NIM yang sama
    IF EXISTS (
        SELECT 1 FROM public.student_complaints 
        WHERE nim = v_clean_nim AND status = 'pending'
    ) THEN
        RETURN jsonb_build_object(
            'ok', false, 
            'error', 'Laporan Anda sebelumnya masih berstatus menunggu verifikasi admin. Mohon tunggu tanggapan admin.'
        );
    END IF;

    -- Masukkan laporan kendala
    INSERT INTO public.student_complaints (
        nim, nama, kelas, kategori, alasan, kontak, status
    ) VALUES (
        v_clean_nim,
        v_clean_nama,
        COALESCE(v_student.kelas, '-'),
        v_clean_kategori,
        v_clean_alasan,
        v_clean_kontak,
        'pending'
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Laporan kendala berhasil dikirimkan ke Admin. Tim akademik akan segera memverifikasi laporan Anda.',
        'id', v_id
    );
END;
$$;

-- 3. Fungsi RPC untuk Admin melihat seluruh laporan pengaduan
CREATE OR REPLACE FUNCTION public.admin_list_complaints()
RETURNS TABLE (
    id INT,
    nim VARCHAR(20),
    nama VARCHAR(100),
    kelas VARCHAR(50),
    kategori VARCHAR(50),
    alasan TEXT,
    kontak VARCHAR(50),
    status VARCHAR(20),
    catatan_admin TEXT,
    created_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
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
        c.id,
        c.nim,
        c.nama,
        COALESCE(c.kelas, '-') AS kelas,
        c.kategori,
        c.alasan,
        c.kontak,
        c.status,
        c.catatan_admin,
        c.created_at,
        c.resolved_at
    FROM public.student_complaints c
    ORDER BY 
        CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END,
        c.created_at DESC;
END;
$$;

-- 4. Fungsi RPC untuk Admin menyelesaikan / menolak laporan kendala
CREATE OR REPLACE FUNCTION public.admin_resolve_complaint(
    p_id INT,
    p_action TEXT,
    p_catatan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_complaint RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    SELECT * INTO v_complaint FROM public.student_complaints WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data laporan tidak ditemukan.');
    END IF;

    IF p_action = 'reset_and_batal' THEN
        -- Batalkan pendaftaran mahasiswa bersangkutan agar kuota kembali dan mahasiswa bisa memilih ulang
        IF EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_complaint.nim) THEN
            PERFORM public.admin_batal_daftar(v_complaint.nim);
        END IF;

        -- Bersihkan antrian jika ada
        DELETE FROM public.queue WHERE nim = v_complaint.nim;

        -- Tandai laporan selesai
        UPDATE public.student_complaints
        SET 
            status = 'resolved',
            catatan_admin = COALESCE(p_catatan, 'Pendaftaran berhasil direset oleh admin.'),
            resolved_at = now()
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'ok', true,
            'message', format('Pendaftaran mahasiswa %s (%s) berhasil dibatalkan dan kuota telah dikembalikan.', v_complaint.nama, v_complaint.nim)
        );
    ELSIF p_action = 'reject' THEN
        UPDATE public.student_complaints
        SET 
            status = 'rejected',
            catatan_admin = COALESCE(p_catatan, 'Laporan kendala ditolak.'),
            resolved_at = now()
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'ok', true,
            'message', format('Laporan untuk mahasiswa %s (%s) telah ditandai ditolak.', v_complaint.nama, v_complaint.nim)
        );
    ELSE
        RETURN jsonb_build_object('ok', false, 'error', 'Aksi tidak valid. Gunakan reset_and_batal atau reject.');
    END IF;
END;
$$;

-- Berikan izin eksekusi eksplisit
GRANT EXECUTE ON FUNCTION public.lapor_kendala_mahasiswa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_complaints() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_complaint(INT, TEXT, TEXT) TO authenticated;
