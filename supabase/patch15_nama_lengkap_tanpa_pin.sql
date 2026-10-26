-- ==============================================================================
-- PATCH 15 (DEFINITIF): NAMA LENGKAP TANPA SENSOR & JOIN QUEUE KEBAL ERROR SKEMA
-- ==============================================================================
-- 1. Menambahkan kolom pendukung di settings dan queue secara aman (idempoten).
-- 2. Fungsi cek_nim() menampilkan nama asli mahasiswa lengkap (tanpa sensor bintang)
--    dan mengatur butuh_pin = false.
-- 3. Fungsi join_queue() kebal error RECORD field (menggunakan variabel skalar murni,
--    tanpa dependensi kolom v_q.retry_count atau queue_number).
-- 4. Fungsi queue_status() untuk polling antrian yang aman dan sinkron.
-- 5. Fungsi ajukan_akses() mendukung pemanggilan 4 parameter maupun 5 parameter.
-- ==============================================================================

-- 1. PASTIKAN STRUKTUR KOLOM TABEL LENGKAP
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS max_requeue INT NOT NULL DEFAULT 2;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;

-- 2. FUNGSI cek_nim(p_nim TEXT)
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

-- 3. FUNGSI join_queue(p_nim TEXT, p_pin TEXT DEFAULT NULL)
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
    v_cooldown_seconds INT := 120;
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

    -- Hitung slot antrian aktif dan antrian tunggu saat ini
    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    -- Periksa waktu kedaluwarsa terakhir mahasiswa ini
    SELECT expires_at INTO v_last_expired_at
    FROM public.queue
    WHERE nim = v_student.nim AND state = 'expired'
    ORDER BY entered_at DESC LIMIT 1;

    -- LOGIKA FLEKSIBEL OPSI 4:
    -- Jika portal sedang PADAT dan mahasiswa baru saja kedaluwarsa dalam 2 menit terakhir:
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

    -- KONDISI SEPI: Langsung Aktif
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
        -- KONDISI PADAT: Masuk antrian tunggu di urutan paling belakang
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

-- 4. FUNGSI queue_status(p_nim TEXT, p_token TEXT)
CREATE OR REPLACE FUNCTION public.queue_status(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state TEXT;
    v_nomor INT;
    v_expires_at TIMESTAMPTZ;
    v_posisi INT := 0;
    v_active_count INT := 0;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_sisa_detik INT := 0;
    v_est_menit INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT max_active, session_duration_minutes INTO v_max_active, v_session_min FROM public.settings WHERE id = 1;

    -- Update sesi yang sudah lewat batas waktu
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT state, nomor, expires_at INTO v_state, v_nomor, v_expires_at
    FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak ditemukan.');
    END IF;

    IF v_state = 'active' THEN
        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_state := 'expired';
        END IF;
    ELSIF v_state = 'waiting' THEN
        -- Promosikan jika ada slot active kosong
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_max_active THEN
            -- Ambil nomor terkecil di antrian waiting
            IF (SELECT token FROM public.queue WHERE state = 'waiting' ORDER BY nomor ASC LIMIT 1) = p_token THEN
                UPDATE public.queue
                SET state = 'active', activated_at = v_now, expires_at = v_now + (v_session_min || ' minutes')::interval
                WHERE token = p_token;
                v_state := 'active';
                v_sisa_detik := v_session_min * 60;
            END IF;
        END IF;

        IF v_state = 'waiting' THEN
            SELECT count(*) INTO v_posisi FROM public.queue WHERE state = 'waiting' AND nomor < v_nomor;
            v_posisi := v_posisi + 1;
            v_est_menit := CEIL((v_posisi::NUMERIC / GREATEST(1, v_max_active)) * v_session_min);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'state', v_state,
        'nomor', v_nomor,
        'posisi', v_posisi,
        'estimasi_menit', v_est_menit,
        'sisa_detik', v_sisa_detik,
        'bisa_antri_lagi', true
    );
END;
$$;

-- 5. FUNGSI ajukan_akses (VERSI 4 PARAMETER & 5 PARAMETER)
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

    IF EXISTS (SELECT 1 FROM public.students WHERE nim = trim(p_nim)) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM Anda sudah terdaftar di database sistem.');
    END IF;

    INSERT INTO public.access_requests (nim, nama, kelas, catatan, status)
    VALUES (trim(p_nim), trim(p_nama), NULLIF(trim(p_kelas), ''), NULLIF(trim(p_catatan), ''), 'pending');

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan akses Anda berhasil dicatat dan menunggu verifikasi.');
END;
$$;

CREATE OR REPLACE FUNCTION public.ajukan_akses(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT,
    p_alasan TEXT,
    p_kontak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_gabungan TEXT;
BEGIN
    v_gabungan := trim(p_alasan);
    IF trim(COALESCE(p_kontak, '')) <> '' THEN
        v_gabungan := v_gabungan || ' (Kontak: ' || trim(p_kontak) || ')';
    END IF;

    RETURN public.ajukan_akses(p_nim, p_nama, p_kelas, v_gabungan);
END;
$$;

-- 6. HAK AKSES EKSEKUSI
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
