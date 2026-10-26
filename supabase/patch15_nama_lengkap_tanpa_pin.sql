-- ==============================================================================
-- PATCH 15 (REVISI): NAMA LENGKAP TANPA SENSOR & JOIN QUEUE TANPA PIN (SKEMA VALID)
-- ==============================================================================
-- 1. Fungsi cek_nim() mengembalikan nama lengkap mahasiswa secara utuh (tanpa sensor bintang)
--    dan mengatur butuh_pin = false.
-- 2. Fungsi join_queue() menggunakan kolom tabel queue yang sah (nomor, retry_count, entered_at)
--    tanpa referensi ke kolom palsu queue_number/requeue_count, dan tanpa validasi PIN.
-- 3. Fungsi ajukan_akses() disinkronkan agar aman dipanggil baik dengan 4 maupun 5 parameter.

-- 1. FUNGSI cek_nim(p_nim TEXT)
CREATE OR REPLACE FUNCTION public.cek_nim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_student RECORD;
    v_portal_open BOOLEAN;
    v_sudah_daftar BOOLEAN := false;
BEGIN
    SELECT portal_open INTO v_portal_open FROM public.settings WHERE id = 1;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar dalam database mahasiswa.');
    END IF;

    SELECT (v_student.registered_at IS NOT NULL OR EXISTS (
        SELECT 1 FROM public.registrations WHERE nim = v_student.nim
    )) INTO v_sudah_daftar;

    -- Mengembalikan nama asli lengkap tanpa sensor bintang
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

-- 2. FUNGSI join_queue(p_nim TEXT, p_pin TEXT DEFAULT NULL)
CREATE OR REPLACE FUNCTION public.join_queue(p_nim TEXT, p_pin TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_student RECORD;
    v_settings RECORD;
    v_q RECORD;
    v_token TEXT;
    v_expires_at TIMESTAMPTZ;
    v_active_count INT;
    v_waiting_pos INT;
    v_est_minutes INT;
    v_now TIMESTAMPTZ := now();
    v_sisa_detik INT := 0;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang DITUTUP oleh administrator prodi.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar.');
    END IF;

    -- Mahasiswa yang sudah menyelesaikan pemilihan KRS tidak boleh antri lagi
    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    -- Update sesi usang sebelum memeriksa antrian aktif
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    -- Periksa antrian yang sudah ada untuk mahasiswa ini
    SELECT * INTO v_q FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    IF FOUND THEN
        IF v_q.state = 'active' THEN
            v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - v_now))::INT);
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'active',
                'token', v_q.token,
                'sisa_detik', v_sisa_detik
            );
        ELSIF v_q.state = 'waiting' THEN
            SELECT count(*) INTO v_waiting_pos FROM public.queue WHERE state = 'waiting' AND entered_at <= v_q.entered_at;
            v_est_minutes := CEIL(v_waiting_pos::FLOAT / GREATEST(1, v_settings.max_active)::FLOAT * 1.5)::INT;
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'waiting',
                'token', v_q.token,
                'nomor', v_q.nomor,
                'posisi', v_waiting_pos,
                'estimasi_menit', v_est_minutes
            );
        END IF;
    END IF;

    -- Periksa apakah sesi sebelumnya expired dan sudah mencapai batas retry
    SELECT * INTO v_q FROM public.queue
    WHERE nim = v_student.nim AND state = 'expired'
    ORDER BY entered_at DESC LIMIT 1;

    IF FOUND AND v_q.retry_count >= v_settings.max_requeue THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Batas maksimal antri ulang Anda telah habis.');
    END IF;

    -- Hitung slot antrian aktif
    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
    v_token := gen_random_uuid()::TEXT;

    IF v_active_count < v_settings.max_active THEN
        v_expires_at := v_now + (v_settings.session_duration_minutes || ' minutes')::INTERVAL;
        v_sisa_detik := v_settings.session_duration_minutes * 60;
        INSERT INTO public.queue (token, nim, state, activated_at, expires_at, retry_count)
        VALUES (v_token, v_student.nim, 'active', v_now, v_expires_at, COALESCE(v_q.retry_count, 0));
        RETURN jsonb_build_object('ok', true, 'token', v_token, 'state', 'active', 'sisa_detik', v_sisa_detik);
    ELSE
        INSERT INTO public.queue (token, nim, state, retry_count)
        VALUES (v_token, v_student.nim, 'waiting', COALESCE(v_q.retry_count, 0));

        SELECT count(*) INTO v_waiting_pos FROM public.queue WHERE state = 'waiting';
        v_est_minutes := CEIL(v_waiting_pos::FLOAT / GREATEST(1, v_settings.max_active)::FLOAT * 1.5)::INT;

        SELECT nomor INTO v_q FROM public.queue WHERE token = v_token;
        RETURN jsonb_build_object(
            'ok', true,
            'token', v_token,
            'state', 'waiting',
            'nomor', v_q.nomor,
            'posisi', v_waiting_pos,
            'estimasi_menit', v_est_minutes
        );
    END IF;
END;
$$;

-- 3. FUNGSI ajukan_akses (4 PARAMETER: p_nim, p_nama, p_kelas, p_catatan)
CREATE OR REPLACE FUNCTION public.ajukan_akses(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF trim(p_nim) = '' OR trim(p_nama) = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM dan Nama Lengkap wajib diisi.');
    END IF;

    -- Cek jika NIM sudah terdaftar di tabel mahasiswa
    IF EXISTS (SELECT 1 FROM public.students WHERE nim = trim(p_nim)) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM Anda sudah terdaftar di database sistem.');
    END IF;

    -- Catat pengajuan akses ke tabel access_requests
    INSERT INTO public.access_requests (nim, nama, kelas, catatan, status)
    VALUES (trim(p_nim), trim(p_nama), NULLIF(trim(p_kelas), ''), NULLIF(trim(p_catatan), ''), 'pending');

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan akses Anda berhasil dicatat dan menunggu verifikasi.');
END;
$$;

-- Izin eksekusi publik
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
