-- ==============================================================================
-- PATCH 23: BALASAN PESAN ADMIN (PENGAJUAN AKSES & KENDALA) & INDEKS PERFORMA
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Menambahkan kolom catatan_admin & resolved_at pada tabel access_requests.
-- 2. Menambahkan indeks performa B-Tree pada access_requests(nim) dan (nim, status)
--    sehingga pencarian status mahasiswa instan (< 0.1 ms).
-- 3. Menambahkan RPC admin_tolak_pengajuan, admin_balas_pengajuan, dan admin_balas_kendala.
-- 4. Memperbarui RPC admin_setujui_pengajuan agar mendukung p_catatan opsional.
-- 5. Memperbarui RPC admin_list_pengajuan agar menyertakan catatan_admin dan resolved_at.
-- 6. Memperbarui cek_nim() untuk mengembalikan pesan balasan admin jika ada:
--    - Jika belum di-ACC / ditolak: menampilkan pesan admin dan arahan ke Loket FAPERTA.
--    - Jika sudah di-ACC: mahasiswa langsung masuk ke sistem normal tanpa hambatan.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. STRUKTUR TABEL & INDEKS
-- ------------------------------------------------------------------------------
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS catatan_admin TEXT;
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_access_requests_nim ON public.access_requests(nim);
CREATE INDEX IF NOT EXISTS idx_access_requests_nim_status ON public.access_requests(nim, status);

-- ------------------------------------------------------------------------------
-- 2. RPC ADMIN: SETUJUI PENGAJUAN (ACC)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_setujui_pengajuan(
    p_id INT,
    p_catatan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_pin TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT * INTO v_req FROM public.access_requests WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan tidak ditemukan.');
    END IF;

    IF v_req.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan sudah diproses sebelumnya.');
    END IF;

    v_pin := right(v_req.nim, 4);
    INSERT INTO public.students (nim, nama, kelas, pin_hash)
    VALUES (v_req.nim, v_req.nama, v_req.kelas, encode(digest(v_pin, 'sha256'), 'hex'))
    ON CONFLICT (nim) DO UPDATE
    SET nama = EXCLUDED.nama,
        kelas = COALESCE(EXCLUDED.kelas, students.kelas);

    UPDATE public.access_requests
    SET status = 'approved',
        catatan_admin = COALESCE(trim(p_catatan), v_req.catatan_admin, 'Pengajuan disetujui oleh admin.'),
        resolved_at = now()
    WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan disetujui dan mahasiswa berhasil didaftarkan.');
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. RPC ADMIN: TOLAK PENGAJUAN AKSES (DENGAN ALASAN / PESAN ADMIN)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_tolak_pengajuan(
    p_id INT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_clean_catatan TEXT := trim(p_catatan);
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF v_clean_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Alasan penolakan / catatan admin wajib diisi.');
    END IF;

    SELECT * INTO v_req FROM public.access_requests WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan tidak ditemukan.');
    END IF;

    UPDATE public.access_requests
    SET status = 'rejected',
        catatan_admin = v_clean_catatan,
        resolved_at = now()
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Pengajuan akses untuk %s (%s) telah ditolak dengan pesan yang dicatat.', v_req.nama, v_req.nim)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. RPC ADMIN: BALAS PESAN PENGAJUAN AKSES
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_balas_pengajuan(
    p_id INT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_catatan TEXT := trim(p_catatan);
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF v_clean_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pesan balasan admin tidak boleh kosong.');
    END IF;

    UPDATE public.access_requests
    SET catatan_admin = v_clean_catatan
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data pengajuan tidak ditemukan.');
    END IF;

    RETURN jsonb_build_object('ok', true, 'message', 'Pesan balasan admin berhasil disimpan.');
END;
$$;

-- ------------------------------------------------------------------------------
-- 5. RPC ADMIN: BALAS PESAN LAPORAN KENDALA MAHASISWA
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_balas_kendala(
    p_id INT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_catatan TEXT := trim(p_catatan);
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF v_clean_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pesan balasan admin tidak boleh kosong.');
    END IF;

    UPDATE public.student_complaints
    SET catatan_admin = v_clean_catatan
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data pengaduan kendala tidak ditemukan.');
    END IF;

    RETURN jsonb_build_object('ok', true, 'message', 'Pesan balasan kendala berhasil disimpan.');
END;
$$;

-- ------------------------------------------------------------------------------
-- 6. RPC ADMIN: LIST PENGAJUAN AKSES DENGAN CATATAN ADMIN & RESOLVED_AT
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_pengajuan()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_data JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'nim', nim,
            'nama', nama,
            'kelas', COALESCE(kelas, '-'),
            'alasan', catatan,
            'kontak', COALESCE(substring(catatan from 'Kontak:\s*([^)]+)'), '-'),
            'status', status,
            'catatan_admin', catatan_admin,
            'created_at', to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'resolved_at', CASE WHEN resolved_at IS NOT NULL THEN to_char(resolved_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END
        ) ORDER BY 
            CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
            created_at DESC
    ) INTO v_data
    FROM public.access_requests;

    RETURN jsonb_build_object('ok', true, 'pengajuan', COALESCE(v_data, '[]'::JSONB));
END;
$$;

-- ------------------------------------------------------------------------------
-- 7. RPC MAHASISWA: cek_nim() DENGAN DETEKSI PESAN ADMIN
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
            -- Jika v_req.status = 'approved', pendaftaran sudah disetujui (mahasiswa ada di students)
        END IF;

        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar dalam database mahasiswa.');
    END IF;

    -- Mahasiswa ditemukan di master students
    SELECT (v_student.registered_at IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.registrations WHERE nim = v_student.nim
    )) INTO v_sudah_daftar;

    -- Cek riwayat laporan kendala mahasiswa (student_complaints)
    SELECT * INTO v_complaint
    FROM public.student_complaints
    WHERE nim = v_student.nim
    ORDER BY created_at DESC
    LIMIT 1;

    -- Jika ada laporan kendala berstatus pending/rejected dan memiliki catatan balasan dari admin
    IF FOUND AND v_complaint.status IN ('pending', 'rejected') AND NULLIF(trim(v_complaint.catatan_admin), '') IS NOT NULL THEN
        RETURN jsonb_build_object(
            'ok', true,
            'nim', v_student.nim,
            'nama', v_student.nama,
            'nama_samar', v_student.nama,
            'kelas', COALESCE(v_student.kelas, '-'),
            'butuh_pin', false,
            'sudah_terdaftar', v_sudah_daftar,
            'portal_open', COALESCE(v_portal_open, false),
            'status_kendala', v_complaint.status,
            'pesan_admin', v_complaint.catatan_admin
        );
    END IF;

    -- Mahasiswa normal / kendala sudah di-ACC (resolved) -> langsung lanjut masuk ke sistem
    RETURN jsonb_build_object(
        'ok', true,
        'nim', v_student.nim,
        'nama', v_student.nama,
        'nama_samar', v_student.nama,
        'kelas', COALESCE(v_student.kelas, '-'),
        'butuh_pin', false,
        'sudah_terdaftar', v_sudah_daftar,
        'portal_open', COALESCE(v_portal_open, false)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 8. HAK AKSES EKSPLISIT (SECURITY DEFINER TANPA POLICY)
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pengajuan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_setujui_pengajuan(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tolak_pengajuan(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_balas_pengajuan(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_balas_kendala(INT, TEXT) TO authenticated;
