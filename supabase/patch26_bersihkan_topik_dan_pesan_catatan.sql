-- ==============================================================================
-- PATCH 26: BERSIHKAN TOPIK DARI JADWAL PUBLIK & FILTER CATATAN ADMIN DI CEK_NIM
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Memperbarui cek_nim() agar catatan_admin HANYA dikirimkan jika status kendala
--    adalah 'rejected' (ditolak). Jika pendaftaran di-ACC atau dibatalkan ('resolved'),
--    catatan admin lama tidak ditampilkan agar mahasiswa dapat memilih ulang dengan bersih.
-- 2. Memperbarui jadwal_kuliah_publik() agar tidak lagi menampilkan topik.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PERBARUI cek_nim()
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
        -- Catatan admin HANYA dikirimkan jika statusnya 'rejected' (ditolak). Jika sudah di-ACC/dibatalkan ('resolved'), jangan kirim pesan catatan lama.
        'pesan_admin', CASE WHEN v_complaint.id IS NOT NULL AND v_complaint.status = 'rejected' THEN NULLIF(trim(v_complaint.catatan_admin), '') ELSE NULL END,
        'alasan_kendala', CASE WHEN v_complaint.id IS NOT NULL THEN v_complaint.alasan ELSE NULL END
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. PERBARUI jadwal_kuliah_publik() TANPA ATRIBUT TOPIK
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jadwal_kuliah_publik()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offerings JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'kelas', COALESCE(o.kelas, '-'),
            'jenis', o.jenis,
            'kuota', o.kuota,
            'jadwal', COALESCE(sched.arr, '[]'::JSONB)
        ) ORDER BY o.jenis DESC, o.kelas ASC, o.nama ASC
    ) INTO v_offerings
    FROM public.offerings o
    LEFT JOIN (
        SELECT s.offering_id, jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'hari', s.hari,
                'jam_mulai', to_char(s.jam_mulai, 'HH24:MI'),
                'jam_selesai', to_char(s.jam_selesai, 'HH24:MI'),
                'ruang', s.ruang
            ) ORDER BY s.hari, s.jam_mulai
        ) AS arr
        FROM public.schedules s
        GROUP BY s.offering_id
    ) sched ON sched.offering_id = o.id;

    RETURN jsonb_build_object(
        'ok', true,
        'offerings', COALESCE(v_offerings, '[]'::JSONB)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.jadwal_kuliah_publik() TO anon, authenticated;
