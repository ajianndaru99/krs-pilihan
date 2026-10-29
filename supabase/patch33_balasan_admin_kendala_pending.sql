-- ==============================================================================
-- PATCH 33: TAMPILKAN BALASAN ADMIN PADA LAPORAN KENDALA BERSTATUS PENDING & REJECTED
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- Memperbaiki fungsi public.cek_nim(p_nim) yang sebelumnya (di Patch 26) memfilter
-- pesan_admin hanya untuk v_complaint.status = 'rejected'. Akibatnya, saat admin
-- menekan tombol "Balas" pada laporan yang masih berstatus 'pending' (Menunggu),
-- catatan_admin tersimpan di database tetapi tidak dikirim ke halaman mahasiswa.
-- Kini pesan_admin dikirimkan selama status IN ('pending', 'rejected').
-- ==============================================================================

BEGIN;

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
                    'pesan_admin', NULLIF(trim(v_req.catatan_admin), ''),
                    'error', COALESCE(NULLIF(trim(v_req.catatan_admin), ''), 'Pengajuan akses Anda masih menunggu verifikasi admin.')
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
        -- Catatan admin dikirimkan untuk status 'pending' (dibalas saat masih ditinjau) maupun 'rejected' (ditolak).
        -- Jika sudah di-ACC/direset ('resolved'), jangan kirim catatan lama agar tampilan kembali bersih.
        'pesan_admin', CASE WHEN v_complaint.id IS NOT NULL AND v_complaint.status IN ('pending', 'rejected') THEN NULLIF(trim(v_complaint.catatan_admin), '') ELSE NULL END,
        'alasan_kendala', CASE WHEN v_complaint.id IS NOT NULL THEN v_complaint.alasan ELSE NULL END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;

COMMIT;

