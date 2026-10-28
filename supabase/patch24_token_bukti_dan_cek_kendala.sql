-- ==============================================================================
-- PATCH 24: TOKEN BUKTI PENDAFTARAN, DETEKSI PESAN KENDALA, & ANTI DUPLIKASI LAPOR
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Menambahkan indeks komposit performa tinggi pada student_complaints & queue.
-- 2. Memperbarui cek_nim() agar mengembalikan token pendaftaran mahasiswa yang sudah
--    terdaftar, serta mengembalikan pesan balasan & status kendala jika ada.
-- 3. Memperketat lapor_kendala_mahasiswa() agar menolak laporan baru jika masih ada
--    laporan sebelumnya yang berstatus pending (menunggu tanggapan admin).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. INDEKS PERFORMA TINGGI (ZERO SERVER LAG)
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_student_complaints_nim_status ON public.student_complaints(nim, status);
CREATE INDEX IF NOT EXISTS idx_queue_nim_nomor ON public.queue(nim, nomor DESC);

-- ------------------------------------------------------------------------------
-- 2. RPC MAHASISWA: cek_nim() DENGAN TOKEN BUKTI & PESAN KENDALA LENGKAP
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cek_nim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(20) := trim(p_nim);
    v_student RECORD;
    v_portal_open BOOLEAN;
    v_sudah_daftar BOOLEAN := false;
    v_token TEXT := NULL;
    v_req RECORD;
    v_complaint RECORD;
BEGIN
    SELECT portal_open INTO v_portal_open FROM public.settings WHERE id = 1;

    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
        -- Cek apakah mahasiswa ini memiliki riwayat pengajuan akses di access_requests
        SELECT * INTO v_req 
        FROM public.access_requests 
        WHERE nim = v_clean_nim 
        ORDER BY created_at DESC 
        LIMIT 1;

        IF FOUND THEN
            IF v_req.status = 'pending' THEN
                RETURN jsonb_build_object(
                    'ok', false,
                    'tipe_pesan', 'akses_pending',
                    'status_pengajuan', 'pending',
                    'pesan_admin', v_req.catatan_admin,
                    'error', COALESCE(v_req.catatan_admin, 'Pengajuan akses Anda masih menunggu verifikasi admin.')
                );
            ELSIF v_req.status = 'rejected' THEN
                RETURN jsonb_build_object(
                    'ok', false,
                    'tipe_pesan', 'akses_rejected',
                    'status_pengajuan', 'rejected',
                    'pesan_admin', v_req.catatan_admin,
                    'error', COALESCE(v_req.catatan_admin, 'Pengajuan akses Anda ditolak. Silakan datang langsung ke Loket Admin FAPERTA.')
                );
            END IF;
        END IF;

        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar dalam database mahasiswa.');
    END IF;

    -- Mahasiswa ditemukan di master students: periksa pendaftaran
    SELECT (v_student.registered_at IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.registrations WHERE nim = v_student.nim
    )) INTO v_sudah_daftar;

    -- Jika sudah terdaftar, ambil token antrian terakhirnya untuk bukti KRS
    IF v_sudah_daftar THEN
        SELECT token INTO v_token 
        FROM public.queue 
        WHERE nim = v_student.nim 
        ORDER BY nomor DESC 
        LIMIT 1;
    END IF;

    -- Cek riwayat laporan kendala mahasiswa (student_complaints)
    SELECT * INTO v_complaint
    FROM public.student_complaints
    WHERE nim = v_student.nim
    ORDER BY created_at DESC
    LIMIT 1;

    -- Kembalikan info lengkap dalam satu panggilan RPC efisien
    RETURN jsonb_build_object(
        'ok', true,
        'nim', v_student.nim,
        'nama', v_student.nama,
        'nama_samar', v_student.nama,
        'kelas', COALESCE(v_student.kelas, '-'),
        'butuh_pin', false,
        'sudah_terdaftar', v_sudah_daftar,
        'token', v_token,
        'portal_open', COALESCE(v_portal_open, false),
        'status_kendala', CASE WHEN v_complaint.id IS NOT NULL THEN v_complaint.status ELSE NULL END,
        'pesan_admin', CASE WHEN v_complaint.id IS NOT NULL THEN NULLIF(trim(v_complaint.catatan_admin), '') ELSE NULL END,
        'alasan_kendala', CASE WHEN v_complaint.id IS NOT NULL THEN v_complaint.alasan ELSE NULL END
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. PERKETAT lapor_kendala_mahasiswa() CEGAH LAPORAN GANDA SAAT PENDING
-- ------------------------------------------------------------------------------
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

    -- Cegah pengiriman laporan baru jika ada laporan pending yang belum dibalas/diproses
    IF EXISTS (
        SELECT 1 FROM public.student_complaints 
        WHERE nim = v_clean_nim AND status = 'pending'
    ) THEN
        RETURN jsonb_build_object(
            'ok', false, 
            'error', 'Laporan Anda sebelumnya masih dalam antrian peninjauan admin. Mohon menunggu tanggapan admin sebelum membuat laporan baru.'
        );
    END IF;

    INSERT INTO public.student_complaints (
        nim, nama, kelas, kategori, alasan, kontak, status
    ) VALUES (
        v_clean_nim, v_clean_nama, v_student.kelas, v_clean_kategori, v_clean_alasan, v_clean_kontak, 'pending'
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Laporan kendala berhasil dikirimkan. Silakan tunggu tanggapan dan arahan dari Admin Akademik.',
        'complaint_id', v_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. HAK AKSES EKSPLISIT
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lapor_kendala_mahasiswa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
