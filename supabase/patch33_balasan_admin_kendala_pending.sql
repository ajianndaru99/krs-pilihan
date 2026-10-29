-- ==============================================================================
-- PATCH 33: SINKRONISASI BALASAN ADMIN (HANYA SAAT RESET KRS ATAU DITOLAK)
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Membersihkan catatan_admin pada laporan kendala & pengajuan akses yang masih
--    berstatus 'pending' (Menunggu), karena balasan hanya diberikan saat Admin
--    memutuskan Reset KRS ('resolved') atau Tolak ('rejected').
-- 2. Memperbarui admin_resolve_complaint() agar mereset penuh pendaftaran mahasiswa
--    (registrations, students.registered_at, queue) dan menyimpan balasan admin
--    baik saat Reset KRS maupun saat Tolak, serta mencatat ke system_logs.
-- 3. Memperbarui cek_nim() agar:
--    - Saat status = 'pending': pesan_admin = NULL (mahasiswa melihat "Sedang Ditinjau Admin").
--    - Saat status = 'rejected': pesan_admin dikirimkan (mahasiswa melihat balasan penolakan).
--    - Saat status = 'resolved' dan mahasiswa belum daftar ulang (NOT v_sudah_daftar):
--      pesan_admin dikirimkan agar balasan Reset KRS tampil saat mahasiswa Cek NIM.
--    - Saat status = 'resolved' dan mahasiswa sudah selesai daftar ulang (v_sudah_daftar):
--      status_kendala & pesan_admin dikosongkan agar status pendaftaran baru bersih.
-- ==============================================================================

BEGIN;

-- 1. Bersihkan catatan_admin yang menggantung pada status 'pending'
UPDATE public.student_complaints
SET catatan_admin = NULL
WHERE status = 'pending';

UPDATE public.access_requests
SET catatan_admin = NULL
WHERE status = 'pending';

-- 2. Perbarui fungsi RPC admin_resolve_complaint()
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
    v_clean_catatan TEXT := NULLIF(trim(COALESCE(p_catatan, '')), '');
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT * INTO v_complaint FROM public.student_complaints WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data laporan kendala tidak ditemukan.');
    END IF;

    IF p_action = 'reset_and_batal' THEN
        -- Hapus seluruh pilihan KRS mahasiswa (otomatis mengembalikan kuota via trigger)
        DELETE FROM public.registrations WHERE nim = v_complaint.nim;

        -- Reset penanda waktu daftar pada tabel students
        UPDATE public.students SET registered_at = NULL WHERE nim = v_complaint.nim;

        -- Bersihkan antrian lama jika ada
        DELETE FROM public.queue WHERE nim = v_complaint.nim;

        -- Tandai laporan selesai beserta balasan admin
        UPDATE public.student_complaints
        SET status = 'resolved',
            catatan_admin = COALESCE(
                v_clean_catatan,
                'Pendaftaran KRS Anda telah direset oleh Admin. Silakan masuk kembali untuk memilih ulang mata kuliah.'
            ),
            resolved_at = now()
        WHERE id = p_id;

        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES (
            'info',
            'ADMIN_RESET_KENDALA',
            v_complaint.nim,
            v_complaint.nama,
            format('Admin mereset KRS mahasiswa %s (%s) atas laporan kendala.', v_complaint.nama, v_complaint.nim),
            jsonb_build_object('complaint_id', p_id, 'catatan_admin', v_clean_catatan)
        );

        RETURN jsonb_build_object(
            'ok', true,
            'message', format('Pendaftaran mahasiswa %s (%s) berhasil direset dan balasan telah dikirim.', v_complaint.nama, v_complaint.nim)
        );

    ELSIF p_action = 'reject' THEN
        IF v_clean_catatan IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Alasan penolakan / balasan untuk mahasiswa wajib diisi.');
        END IF;

        UPDATE public.student_complaints
        SET status = 'rejected',
            catatan_admin = v_clean_catatan,
            resolved_at = now()
        WHERE id = p_id;

        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES (
            'warning',
            'ADMIN_TOLAK_KENDALA',
            v_complaint.nim,
            v_complaint.nama,
            format('Admin menolak laporan kendala mahasiswa %s (%s).', v_complaint.nama, v_complaint.nim),
            jsonb_build_object('complaint_id', p_id, 'catatan_admin', v_clean_catatan)
        );

        RETURN jsonb_build_object(
            'ok', true,
            'message', format('Laporan untuk mahasiswa %s (%s) telah ditolak beserta balasan admin.', v_complaint.nama, v_complaint.nim)
        );
    ELSE
        RETURN jsonb_build_object('ok', false, 'error', 'Aksi tidak valid. Gunakan reset_and_batal atau reject.');
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_resolve_complaint(INT, TEXT, TEXT) TO authenticated;

-- 3. Perbarui fungsi RPC cek_nim()
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
    v_status_kendala TEXT := NULL;
    v_pesan_admin TEXT := NULL;
BEGIN
    SELECT portal_open INTO v_portal_open FROM public.settings WHERE id = 1;

    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
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
                    'pesan_admin', NULL,
                    'error', 'Pengajuan akses Anda masih menunggu verifikasi Admin Akademik.'
                );
            ELSIF v_req.status = 'rejected' THEN
                RETURN jsonb_build_object(
                    'ok', false,
                    'tipe_pesan', 'akses_rejected',
                    'status_pengajuan', 'rejected',
                    'pesan_admin', NULLIF(trim(v_req.catatan_admin), ''),
                    'error', COALESCE(NULLIF(trim(v_req.catatan_admin), ''), 'Pengajuan akses Anda ditolak. Silakan datang langsung ke Loket Admin FAPERTA.')
                );
            END IF;
        END IF;

        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar dalam database mahasiswa.');
    END IF;

    SELECT (v_student.registered_at IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.registrations WHERE nim = v_student.nim
    )) INTO v_sudah_daftar;

    IF v_sudah_daftar THEN
        SELECT token INTO v_token 
        FROM public.queue 
        WHERE nim = v_student.nim 
        ORDER BY nomor DESC 
        LIMIT 1;
    END IF;

    SELECT * INTO v_complaint
    FROM public.student_complaints
    WHERE nim = v_student.nim
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_complaint.id IS NOT NULL THEN
        IF v_complaint.status = 'pending' THEN
            -- Belum ada keputusan dari Admin: tampilkan "Sedang Ditinjau Admin" tanpa pesan balasan
            v_status_kendala := 'pending';
            v_pesan_admin := NULL;
        ELSIF v_complaint.status = 'rejected' THEN
            -- Ditolak oleh Admin: tampilkan status ditolak beserta balasan Admin
            v_status_kendala := 'rejected';
            v_pesan_admin := NULLIF(trim(v_complaint.catatan_admin), '');
        ELSIF v_complaint.status = 'resolved' THEN
            -- Direset oleh Admin: tampilkan balasan Admin selama mahasiswa belum menyelesaikan pendaftaran ulang baru
            IF NOT v_sudah_daftar THEN
                v_status_kendala := 'resolved';
                v_pesan_admin := COALESCE(
                    NULLIF(trim(v_complaint.catatan_admin), ''),
                    'Pendaftaran KRS Anda telah direset oleh Admin. Silakan masuk kembali untuk memilih ulang mata kuliah.'
                );
            ELSE
                v_status_kendala := NULL;
                v_pesan_admin := NULL;
            END IF;
        END IF;
    END IF;

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
        'status_kendala', v_status_kendala,
        'pesan_admin', v_pesan_admin,
        'alasan_kendala', CASE WHEN v_status_kendala IS NOT NULL THEN v_complaint.alasan ELSE NULL END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;

COMMIT;
