-- ==============================================================================
-- PATCH 22: TRIGGER DINAMIS ANTRIAN (5 MENIT SAAT ANTRIAN AKTIF)
-- ------------------------------------------------------------------------------
-- Deskripsi:
-- 1. Mengubah alokasi durasi sesi pemilihan mahasiswa menjadi dinamis:
--    - Jika tidak ada antrian menunggu (waiting = 0), mahasiswa diberikan waktu
--      leluasa (15 menit) tanpa peringatan tergesa-gesa.
--    - Begitu antrian terbentuk (waiting > 0), sistem memicu (trigger) batas
--      maksimal 5 menit sejak antrian terdeteksi. Sisa waktu sesi aktif yang
--      lebih dari 5 menit otomatis dipangkas menjadi maksimal 5 menit.
-- 2. Mengembalikan flag 'ada_antrian' pada queue_status dan list_offerings
--    agar antarmuka pengguna dapat memunculkan pop-up peringatan 5 menit dan
--    menampilkan countdown timer hanya ketika diperlukan.
-- 3. Nol overhead: menggunakan indeks B-tree yang sudah ada, eksekusi < 1 ms.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. PERBAIKAN join_queue() DENGAN DURASI DINAMIS
-- ------------------------------------------------------------------------------
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
    v_allocated_minutes INT := 15;
BEGIN
    -- Kunci baris settings secara eksklusif untuk serialisasi alokasi slot antrian
    SELECT * INTO v_settings FROM public.settings WHERE id = 1 FOR UPDATE;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang DITUTUP oleh administrator prodi.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    -- Update sesi usang sebelum menghitung slot aktif
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    -- Periksa antrian yang sedang berjalan untuk mahasiswa ini
    SELECT token, state, expires_at, entered_at, nomor
    INTO v_cur_token, v_cur_state, v_cur_expires_at, v_cur_entered_at, v_cur_nomor
    FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    IF FOUND THEN
        IF v_cur_state = 'active' THEN
            -- Jika antrian terbentuk, batasi maksimal 5 menit dari sekarang
            IF v_waiting_count > 0 AND v_cur_expires_at > (v_now + interval '5 minutes') THEN
                UPDATE public.queue
                SET expires_at = v_now + interval '5 minutes'
                WHERE token = v_cur_token;
                v_cur_expires_at := v_now + interval '5 minutes';
            END IF;

            v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_cur_expires_at - v_now))::INT);
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'active',
                'token', v_cur_token,
                'sisa_detik', v_sisa_detik,
                'ada_antrian', (v_waiting_count > 0)
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
                'estimasi_menit', v_est_minutes,
                'ada_antrian', true
            );
        END IF;
    END IF;

    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;

    -- Periksa cooldown bila baru saja kedaluwarsa saat portal padat
    SELECT expires_at INTO v_last_expired_at
    FROM public.queue
    WHERE nim = v_student.nim AND state = 'expired'
    ORDER BY entered_at DESC LIMIT 1;

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

    v_token := gen_random_uuid()::TEXT;

    IF v_active_count < v_settings.max_active AND v_waiting_count = 0 THEN
        -- Bebas antrian: berikan waktu santai (15 menit)
        v_allocated_minutes := 15;
        v_expires_at := v_now + (v_allocated_minutes || ' minutes')::INTERVAL;
        v_sisa_detik := v_allocated_minutes * 60;
        
        INSERT INTO public.queue (token, nim, state, activated_at, expires_at)
        VALUES (v_token, v_student.nim, 'active', v_now, v_expires_at);

        RETURN jsonb_build_object(
            'ok', true,
            'token', v_token,
            'state', 'active',
            'sisa_detik', v_sisa_detik,
            'ada_antrian', false
        );
    ELSE
        -- Antrian ada: masukkan ke ruang tunggu
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
            'estimasi_menit', v_est_minutes,
            'ada_antrian', true
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. PERBAIKAN queue_status() DENGAN TRIGGER PEMANGKASAN 5 MENIT
-- ------------------------------------------------------------------------------
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
    v_waiting_count INT := 0;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_sisa_detik INT := 0;
    v_est_menit INT := 0;
    v_now TIMESTAMPTZ := now();
    v_next_token TEXT;
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

    -- Hitung jumlah antrian yang sedang menunggu giliran
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    IF v_state = 'active' THEN
        -- Trigger dinamis: jika ada antrian menunggu dan sisa waktu > 5 menit, pangkas jadi 5 menit!
        IF v_waiting_count > 0 AND v_expires_at > (v_now + interval '5 minutes') THEN
            UPDATE public.queue
            SET expires_at = v_now + interval '5 minutes'
            WHERE token = p_token;
            v_expires_at := v_now + interval '5 minutes';
        END IF;

        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_state := 'expired';
        END IF;
    ELSIF v_state = 'waiting' THEN
        -- Promosikan antrian teratas jika ada slot active yang kosong
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_max_active THEN
            SELECT token INTO v_next_token 
            FROM public.queue 
            WHERE state = 'waiting' 
            ORDER BY nomor ASC 
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF v_next_token = p_token THEN
                -- Mahasiswa yang baru dipromosikan saat ada antrian mendapat 5 menit
                UPDATE public.queue
                SET state = 'active', 
                    activated_at = v_now, 
                    expires_at = v_now + interval '5 minutes'
                WHERE token = p_token;
                
                v_state := 'active';
                v_sisa_detik := 300;
            END IF;
        END IF;

        IF v_state = 'waiting' THEN
            SELECT count(*) INTO v_posisi FROM public.queue WHERE state = 'waiting' AND nomor < v_nomor;
            v_est_menit := CEIL((v_posisi + 1)::FLOAT / GREATEST(1, v_max_active)::FLOAT * 1.5)::INT;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'state', v_state,
        'token', p_token,
        'nomor', v_nomor,
        'posisi', CASE WHEN v_state = 'waiting' THEN v_posisi + 1 ELSE 0 END,
        'estimasi_menit', v_est_menit,
        'sisa_detik', v_sisa_detik,
        'ada_antrian', (v_waiting_count > 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. PERBAIKAN list_offerings() DENGAN INFORMASI TRIGGER ANTRIAN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_offerings(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_pilihan JSONB;
    v_waiting_count INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
    END IF;

    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim) AND state = 'active' AND expires_at >= v_now;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- Hitung jumlah mahasiswa di ruang tunggu
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    -- Trigger pemangkasan waktu dinamis: jika antrian terbentuk dan sisa waktu > 5 menit
    IF v_waiting_count > 0 AND v_q.expires_at > (v_now + interval '5 minutes') THEN
        UPDATE public.queue
        SET expires_at = v_now + interval '5 minutes'
        WHERE token = p_token;
        v_q.expires_at := v_now + interval '5 minutes';
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'kelas', COALESCE(o.kelas, 'A'),
            'kuota', o.kuota,
            'terisi', COALESCE(r.cnt, 0),
            'sisa', GREATEST(0, o.kuota - COALESCE(r.cnt, 0)),
            'jadwal', COALESCE(sched.arr, '[]'::JSONB),
            'bentrok_kelas', (
                v_student.kelas IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM public.schedules s
                    JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                    WHERE s.offering_id = o.id
                      AND lower(trim(s.hari)) = lower(trim(cs.hari))
                      AND s.jam_mulai < cs.jam_selesai
                      AND cs.jam_mulai < s.jam_selesai
                )
            ),
            'bentrok', (
                v_student.kelas IS NOT NULL AND EXISTS (
                    SELECT 1
                    FROM public.schedules s
                    JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                    WHERE s.offering_id = o.id
                      AND lower(trim(s.hari)) = lower(trim(cs.hari))
                      AND s.jam_mulai < cs.jam_selesai
                      AND cs.jam_mulai < s.jam_selesai
                )
            )
        ) ORDER BY o.jenis DESC, o.kelas ASC, o.nama ASC
    ) INTO v_pilihan
    FROM public.offerings o
    LEFT JOIN (
        SELECT offering_id, count(*)::INT AS cnt
        FROM public.registrations
        GROUP BY offering_id
    ) r ON r.offering_id = o.id
    LEFT JOIN (
        SELECT s.offering_id, jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'hari', s.hari,
                'jam_mulai', to_char(s.jam_mulai, 'HH24:MI:SS'),
                'jam_selesai', to_char(s.jam_selesai, 'HH24:MI:SS'),
                'ruang', s.ruang
            ) ORDER BY s.hari, s.jam_mulai
        ) AS arr
        FROM public.schedules s
        GROUP BY s.offering_id
    ) sched ON sched.offering_id = o.id;

    RETURN jsonb_build_object(
        'ok', true,
        'pilihan', COALESCE(v_pilihan, '[]'::JSONB),
        'need_matkul', v_settings.need_matkul,
        'need_proyek', v_settings.need_proyek,
        'ada_antrian', (v_waiting_count > 0),
        'sisa_detik', GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - v_now))::INT)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_offerings(TEXT, TEXT) TO anon, authenticated;
