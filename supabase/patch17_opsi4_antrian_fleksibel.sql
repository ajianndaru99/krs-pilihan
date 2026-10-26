-- ==============================================================================
-- PATCH 17: SISTEM ANTRIAN FLEKSIBEL (OPSI 4 - TANPA BLOKIR PERMANEN)
-- ==============================================================================
-- 1. Mahasiswa TIDAK PERNAH diblokir permanen saat sesi kedaluwarsa.
--    Mahasiswa bebas mencoba terus sampai berhasil menyelesaikan pengisian KRS.
-- 2. KONDISI SEPI (Slot aktif masih tersedia & tidak ada antrian menunggu):
--    Mahasiswa yang kedaluwarsa langsung diizinkan masuk kembali seketika (Active).
-- 3. KONDISI PADAT (Slot aktif penuh atau ada antrian menunggu):
--    Mahasiswa yang baru saja kedaluwarsa dikenakan jeda santun (cooldown 2 menit)
--    agar giliran server dinikmati mahasiswa lain. Setelah 2 menit, mahasiswa
--    ditempatkan ke antrian tunggu (Waiting) di urutan paling belakang.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.join_queue(p_nim TEXT, p_pin TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_student RECORD;
    v_settings RECORD;
    v_cur_token TEXT;
    v_cur_state TEXT;
    v_cur_expires_at TIMESTAMPTZ;
    v_cur_entered_at TIMESTAMPTZ;
    v_cur_nomor INT;
    v_token TEXT;
    v_nomor INT;
    v_expires_at TIMESTAMPTZ;
    v_active_count INT;
    v_waiting_count INT;
    v_waiting_pos INT;
    v_est_minutes INT;
    v_now TIMESTAMPTZ := now();
    v_sisa_detik INT := 0;
    v_last_expired_at TIMESTAMPTZ;
    v_cooldown_seconds INT := 120; -- Jeda 2 menit saat portal padat
    v_sisa_cooldown INT := 0;
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

    -- Periksa antrian yang sedang aktif/waiting untuk mahasiswa ini (menggunakan variabel skalar)
    SELECT token, state, expires_at, entered_at, nomor
    INTO v_cur_token, v_cur_state, v_cur_expires_at, v_cur_entered_at, v_cur_nomor
    FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    IF FOUND THEN
        IF v_cur_state = 'active' THEN
            v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_cur_expires_at - v_now))::INT);
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'active',
                'token', v_cur_token,
                'sisa_detik', v_sisa_detik
            );
        ELSIF v_cur_state = 'waiting' THEN
            SELECT count(*) INTO v_waiting_pos FROM public.queue WHERE state = 'waiting' AND entered_at <= v_cur_entered_at;
            v_est_minutes := CEIL(v_waiting_pos::FLOAT / GREATEST(1, v_settings.max_active)::FLOAT * 1.5)::INT;
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'waiting',
                'token', v_cur_token,
                'nomor', v_cur_nomor,
                'posisi', v_waiting_pos,
                'estimasi_menit', v_est_minutes
            );
        END IF;
    END IF;

    -- Hitung slot antrian aktif dan jumlah antrian tunggu saat ini
    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    -- Periksa waktu kedaluwarsa terakhir (jika pernah expired)
    SELECT expires_at INTO v_last_expired_at
    FROM public.queue
    WHERE nim = v_student.nim AND state = 'expired'
    ORDER BY entered_at DESC LIMIT 1;

    -- LOGIKA FLEKSIBEL OPSI 4:
    -- Jika portal sedang PADAT (slot aktif penuh ATAU ada mahasiswa antri di waiting)
    -- dan mahasiswa baru saja kedaluwarsa dalam 2 menit terakhir:
    IF (v_active_count >= v_settings.max_active OR v_waiting_count > 0) AND v_last_expired_at IS NOT NULL THEN
        v_sisa_cooldown := v_cooldown_seconds - EXTRACT(EPOCH FROM (v_now - v_last_expired_at))::INT;
        IF v_sisa_cooldown > 0 THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Sesi Anda sebelumnya berakhir. Karena antrian saat ini sedang padat, silakan tunggu %s detik lagi sebelum mencoba antri kembali.', v_sisa_cooldown),
                'cooldown', true,
                'sisa_detik', v_sisa_cooldown
            );
        END IF;
    END IF;

    -- Buat token sesi baru
    v_token := gen_random_uuid()::TEXT;

    -- KONDISI SEPI: Slot aktif masih tersedia dan tidak ada antrian tunggu
    IF v_active_count < v_settings.max_active AND v_waiting_count = 0 THEN
        v_expires_at := v_now + (v_settings.session_duration_minutes || ' minutes')::INTERVAL;
        v_sisa_detik := v_settings.session_duration_minutes * 60;
        
        INSERT INTO public.queue (token, nim, state, activated_at, expires_at)
        VALUES (v_token, v_student.nim, 'active', v_now, v_expires_at);

        RETURN jsonb_build_object(
            'ok', true,
            'token', v_token,
            'state', 'active',
            'sisa_detik', v_sisa_detik
        );
    ELSE
        -- KONDISI PADAT: Masuk antrian tunggu di urutan paling belakang (FIFO)
        INSERT INTO public.queue (token, nim, state)
        VALUES (v_token, v_student.nim, 'waiting');

        SELECT count(*) INTO v_waiting_pos FROM public.queue WHERE state = 'waiting';
        v_est_minutes := CEIL(v_waiting_pos::FLOAT / GREATEST(1, v_settings.max_active)::FLOAT * 1.5)::INT;

        SELECT nomor INTO v_nomor FROM public.queue WHERE token = v_token;

        RETURN jsonb_build_object(
            'ok', true,
            'token', v_token,
            'state', 'waiting',
            'nomor', v_nomor,
            'posisi', v_waiting_pos,
            'estimasi_menit', v_est_minutes
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
