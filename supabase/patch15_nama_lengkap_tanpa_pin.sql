-- ==============================================================================
-- PATCH 15: TAMPILKAN NAMA LENGKAP TANPA SENSOR & HILANGKAN KEWAJIBAN PIN
-- ==============================================================================
-- 1. Fungsi cek_nim() mengembalikan nama lengkap mahasiswa secara utuh (tanpa sensor bintang)
--    dan mengatur butuh_pin = false.
-- 2. Fungsi join_queue() menerima p_nim dan p_pin opsional (DEFAULT NULL) tanpa
--    memvalidasi PIN, sehingga mahasiswa cukup dengan NIM untuk bergabung ke antrian.

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

    -- Mengembalikan nama asli lengkap tanpa sensor/masking bintang
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

    -- Cek jika mahasiswa sudah menyelesaikan pemilihan KRS
    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    -- Update sesi usang sebelum memeriksa antrian aktif
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    -- Cek antrian yang sudah ada untuk mahasiswa ini
    SELECT * INTO v_q FROM public.queue WHERE nim = v_student.nim;

    IF FOUND THEN
        IF v_q.state = 'active' THEN
            v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - v_now))::INT);
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'active',
                'token', v_q.token,
                'nomor', v_q.queue_number,
                'sisa_detik', v_sisa_detik,
                'posisi', 1,
                'estimasi_menit', 0
            );
        ELSIF v_q.state = 'waiting' THEN
            SELECT count(*) INTO v_waiting_pos
            FROM public.queue
            WHERE state = 'waiting' AND queue_number <= v_q.queue_number;

            v_est_minutes := GREATEST(1, ceil((v_waiting_pos::NUMERIC / GREATEST(1, v_settings.max_active)) * v_settings.session_duration_minutes)::INT);

            RETURN jsonb_build_object(
                'ok', true,
                'state', 'waiting',
                'token', v_q.token,
                'nomor', v_q.queue_number,
                'posisi', v_waiting_pos,
                'estimasi_menit', v_est_minutes
            );
        ELSIF v_q.state = 'expired' THEN
            IF v_q.requeue_count >= v_settings.max_requeue THEN
                RETURN jsonb_build_object('ok', false, 'error', 'Anda telah mencapai batas maksimal antri ulang. Silakan hubungi admin prodi.');
            END IF;
        END IF;
    END IF;

    -- Tentukan apakah langsung aktif atau masuk antrian tunggu
    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active';

    v_token := encode(extensions.digest(v_student.nim || '-' || gen_random_uuid()::TEXT, 'sha256'), 'hex');

    IF v_active_count < v_settings.max_active THEN
        v_expires_at := v_now + (v_settings.session_duration_minutes || ' minutes')::INTERVAL;
        v_sisa_detik := (v_settings.session_duration_minutes * 60);

        INSERT INTO public.queue (nim, token, queue_number, state, expires_at, requeue_count)
        VALUES (v_student.nim, v_token, nextval('public.queue_seq'), 'active', v_expires_at, 0)
        ON CONFLICT (nim) DO UPDATE
        SET token = EXCLUDED.token,
            state = 'active',
            expires_at = EXCLUDED.expires_at,
            requeue_count = public.queue.requeue_count + 1;

        RETURN jsonb_build_object(
            'ok', true,
            'state', 'active',
            'token', v_token,
            'sisa_detik', v_sisa_detik,
            'posisi', 1,
            'estimasi_menit', 0
        );
    ELSE
        INSERT INTO public.queue (nim, token, queue_number, state, requeue_count)
        VALUES (v_student.nim, v_token, nextval('public.queue_seq'), 'waiting', 0)
        ON CONFLICT (nim) DO UPDATE
        SET token = EXCLUDED.token,
            state = 'waiting',
            queue_number = nextval('public.queue_seq'),
            requeue_count = public.queue.requeue_count + 1;

        SELECT count(*) INTO v_waiting_pos
        FROM public.queue
        WHERE state = 'waiting';

        v_est_minutes := GREATEST(1, ceil((v_waiting_pos::NUMERIC / GREATEST(1, v_settings.max_active)) * v_settings.session_duration_minutes)::INT);

        RETURN jsonb_build_object(
            'ok', true,
            'state', 'waiting',
            'token', v_token,
            'posisi', v_waiting_pos,
            'estimasi_menit', v_est_minutes
        );
    END IF;
END;
$$;

-- Izin eksekusi publik
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
