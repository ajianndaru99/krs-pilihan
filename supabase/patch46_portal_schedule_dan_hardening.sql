-- ==============================================================================
-- PATCH 46: PENGATURAN JADWAL PORTAL (MANUAL & TERJADWAL), COUNTDOWN, DAN HARDENING DATABASE
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Berdasarkan Hasil Inspeksi Beban (350-400 Mahasiswa) dan Keputusan User Bagian III:
--   1. Penjadwalan Portal: mode 'manual' & 'scheduled' (open_at, close_at, note)
--   2. RPC Publik Ringan portal_status_publik() (nol lock, respon < 0.5 ms)
--   3. RPC Admin admin_atur_portal() & sinkronisasi admin_toggle_portal() (override manual)
--   4. Aturan Bentrok Bebas: bentrok jam diizinkan; yang ditolak keras hanya duplikasi
--      nama pokok matkul (termasuk matkul yang sudah wajib di kelas mahasiswa).
--   5. Toleransi Masa Tenggang: mahasiswa yang sesinya aktif sebelum jam tutup terjadwal
--      tetap diizinkan menyelesaikan pendaftaran hingga sisa waktu sesinya habis.
--   6. Hardening Beban: eliminasi 'settings FOR UPDATE' di join_queue(), guard IF EXISTS
--      pada UPDATE expired di queue_status(), dan advisory lock pada promosi waiting.
--   7. Hardening Keamanan RPC Email: admin_tandai_email_terkirim khusus admin, dan
--      fungsi aman tandai_email_terkirim_bukti() untuk route bukti pendaftaran.
--   8. admin_sapu_sesi(p_paksa_semua BOOLEAN DEFAULT FALSE) default hanya bersihkan sesi
--      aktif yang memang sudah expired (< now()) tanpa memutus mahasiswa yang sedang memilih.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. STRUKTUR TABEL SETTINGS
-- ------------------------------------------------------------------------------
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS portal_mode TEXT NOT NULL DEFAULT 'manual';
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS scheduled_open_at TIMESTAMPTZ NULL;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS scheduled_close_at TIMESTAMPTZ NULL;
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS portal_note TEXT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'check_settings_portal_mode' 
          AND conrelid = 'public.settings'::regclass
    ) THEN
        ALTER TABLE public.settings 
        ADD CONSTRAINT check_settings_portal_mode 
        CHECK (portal_mode IN ('manual', 'scheduled'));
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. HELPER STATUS PORTAL EFEKTIF & FASE PORTAL
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_portal_effectively_open(
    p_mode TEXT,
    p_manual_open BOOLEAN,
    p_open_at TIMESTAMPTZ,
    p_close_at TIMESTAMPTZ,
    p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF COALESCE(p_mode, 'manual') = 'manual' THEN
        RETURN COALESCE(p_manual_open, false);
    ELSIF p_mode = 'scheduled' THEN
        IF p_open_at IS NULL AND p_close_at IS NULL THEN
            RETURN false;
        END IF;

        IF p_open_at IS NOT NULL AND p_now < p_open_at THEN
            RETURN false;
        END IF;

        IF p_close_at IS NOT NULL AND p_now >= p_close_at THEN
            RETURN false;
        END IF;

        RETURN true;
    ELSE
        RETURN false;
    END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_portal_phase(
    p_mode TEXT,
    p_manual_open BOOLEAN,
    p_open_at TIMESTAMPTZ,
    p_close_at TIMESTAMPTZ,
    p_now TIMESTAMPTZ DEFAULT now()
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
    IF COALESCE(p_mode, 'manual') = 'manual' THEN
        RETURN CASE WHEN COALESCE(p_manual_open, false) THEN 'open' ELSE 'closed' END;
    ELSIF p_mode = 'scheduled' THEN
        IF p_open_at IS NOT NULL AND p_now < p_open_at THEN
            RETURN 'upcoming';
        ELSIF p_close_at IS NOT NULL AND p_now >= p_close_at THEN
            RETURN 'closed';
        ELSE
            RETURN 'open';
        END IF;
    ELSE
        RETURN 'closed';
    END IF;
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. RPC PUBLIK: portal_status_publik() (NOL LOCK, RESPON CEPAT UNTUK COUNTDOWN)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.portal_status_publik()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_s RECORD;
    v_now TIMESTAMPTZ := now();
    v_open BOOLEAN;
    v_phase TEXT;
    v_seconds_rem BIGINT := NULL;
BEGIN
    SELECT * INTO v_s FROM public.settings WHERE id = 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Pengaturan portal tidak ditemukan.'
        );
    END IF;

    v_open := public.is_portal_effectively_open(v_s.portal_mode, v_s.portal_open, v_s.scheduled_open_at, v_s.scheduled_close_at, v_now);
    v_phase := public.get_portal_phase(v_s.portal_mode, v_s.portal_open, v_s.scheduled_open_at, v_s.scheduled_close_at, v_now);

    IF v_phase = 'upcoming' AND v_s.scheduled_open_at IS NOT NULL THEN
        v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_s.scheduled_open_at - v_now))::BIGINT);
    ELSIF v_phase = 'open' AND v_s.scheduled_close_at IS NOT NULL THEN
        v_seconds_rem := GREATEST(0, EXTRACT(EPOCH FROM (v_s.scheduled_close_at - v_now))::BIGINT);
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'server_now', v_now,
        'portal_open', v_open,
        'portal_mode', COALESCE(v_s.portal_mode, 'manual'),
        'portal_phase', v_phase,
        'scheduled_open_at', v_s.scheduled_open_at,
        'scheduled_close_at', v_s.scheduled_close_at,
        'portal_note', COALESCE(v_s.portal_note, ''),
        'seconds_remaining', v_seconds_rem
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.portal_status_publik() TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. RPC ADMIN: admin_atur_portal() & admin_toggle_portal()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_atur_portal(
    p_mode TEXT,
    p_manual_open BOOLEAN,
    p_open_at TIMESTAMPTZ,
    p_close_at TIMESTAMPTZ,
    p_note TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_mode TEXT := lower(trim(COALESCE(p_mode, 'manual')));
    v_clean_note TEXT := NULLIF(trim(COALESCE(p_note, '')), '');
    v_effective_open BOOLEAN;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya administrator yang dapat mengatur jadwal portal.');
    END IF;

    IF v_mode NOT IN ('manual', 'scheduled') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mode portal harus "manual" atau "scheduled".');
    END IF;

    IF v_mode = 'scheduled' THEN
        IF p_open_at IS NULL AND p_close_at IS NULL THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Pilih minimal waktu pembukaan atau penutupan untuk mode terjadwal.');
        END IF;

        IF p_open_at IS NOT NULL AND p_close_at IS NOT NULL AND p_close_at <= p_open_at THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Waktu penutupan harus lebih lambat daripada waktu pembukaan.');
        END IF;
    END IF;

    v_effective_open := public.is_portal_effectively_open(v_mode, p_manual_open, p_open_at, p_close_at, v_now);

    UPDATE public.settings
    SET portal_mode = v_mode,
        portal_open = CASE WHEN v_mode = 'manual' THEN COALESCE(p_manual_open, false) ELSE v_effective_open END,
        scheduled_open_at = CASE WHEN v_mode = 'scheduled' THEN p_open_at ELSE NULL END,
        scheduled_close_at = CASE WHEN v_mode = 'scheduled' THEN p_close_at ELSE NULL END,
        portal_note = v_clean_note,
        updated_at = v_now
    WHERE id = 1;

    INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
    VALUES (
        'info',
        'ADMIN_ATUR_PORTAL',
        '-',
        'Admin',
        format('Admin mengatur portal ke mode "%s" (Status Efektif: %s).', v_mode, CASE WHEN v_effective_open THEN 'BUKA' ELSE 'TUTUP' END),
        jsonb_build_object(
            'portal_mode', v_mode,
            'manual_open', p_manual_open,
            'scheduled_open_at', p_open_at,
            'scheduled_close_at', p_close_at,
            'portal_note', v_clean_note,
            'effective_open', v_effective_open
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Pengaturan jadwal portal berhasil disimpan.',
        'portal_mode', v_mode,
        'portal_open', v_effective_open
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_atur_portal(TEXT, BOOLEAN, TIMESTAMPTZ, TIMESTAMPTZ, TEXT) TO authenticated;

-- Perbarui admin_toggle_portal agar selalu beralih ke mode manual secara deterministik
CREATE OR REPLACE FUNCTION public.admin_toggle_portal(p_buka BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya administrator yang dapat mengubah status portal.');
    END IF;

    UPDATE public.settings
    SET portal_mode = 'manual',
        portal_open = COALESCE(p_buka, false),
        updated_at = v_now
    WHERE id = 1;

    INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
    VALUES (
        'warning',
        'ADMIN_TOGGLE_PORTAL',
        '-',
        'Admin',
        format('Admin mengubah status portal menjadi %s secara manual.', CASE WHEN p_buka THEN 'DIBUKA' ELSE 'DITUTUP' END),
        jsonb_build_object('portal_open', p_buka, 'portal_mode', 'manual')
    );

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Portal berhasil %s (Mode Manual).', CASE WHEN p_buka THEN 'dibuka' ELSE 'ditutup' END),
        'portal_open', p_buka,
        'portal_mode', 'manual'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_toggle_portal(BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 5. RPC ADMIN: admin_status() LENGKAP DENGAN DATA JADWAL & SERVER TIME
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settings RECORD;
    v_total_students INT;
    v_sudah_daftar INT;
    v_active_queue INT;
    v_waiting_queue INT;
    v_now TIMESTAMPTZ := now();
    v_effective_open BOOLEAN;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    -- Bersihkan expired aktif hanya jika ada
    IF EXISTS (SELECT 1 FROM public.queue WHERE state = 'active' AND expires_at < v_now) THEN
        UPDATE public.queue
        SET state = 'expired'
        WHERE state = 'active' AND expires_at < v_now;
    END IF;

    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    v_effective_open := public.is_portal_effectively_open(v_settings.portal_mode, v_settings.portal_open, v_settings.scheduled_open_at, v_settings.scheduled_close_at, v_now);

    SELECT count(*) INTO v_total_students FROM public.students;
    SELECT count(DISTINCT nim) INTO v_sudah_daftar FROM public.registrations;
    SELECT count(*) INTO v_active_queue FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
    SELECT count(*) INTO v_waiting_queue FROM public.queue WHERE state = 'waiting';

    RETURN jsonb_build_object(
        'ok', true,
        'server_now', v_now,
        'portal_open', v_effective_open,
        'portal_mode', COALESCE(v_settings.portal_mode, 'manual'),
        'scheduled_open_at', v_settings.scheduled_open_at,
        'scheduled_close_at', v_settings.scheduled_close_at,
        'portal_note', COALESCE(v_settings.portal_note, ''),
        'need_matkul', v_settings.need_matkul,
        'need_proyek', v_settings.need_proyek,
        'session_duration_minutes', v_settings.session_duration_minutes,
        'max_active', v_settings.max_active,
        'max_requeue', v_settings.max_requeue,
        'total_students', v_total_students,
        'sudah_daftar', v_sudah_daftar,
        'active_queue', v_active_queue,
        'waiting_queue', v_waiting_queue
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_status() TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. PERBARUI cek_nim(): STATUS PORTAL EFEKTIF
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
    v_settings RECORD;
    v_portal_open BOOLEAN := false;
    v_portal_phase TEXT := 'closed';
    v_sudah_daftar BOOLEAN := false;
    v_token TEXT := NULL;
    v_req RECORD;
    v_complaint RECORD;
    v_status_kendala TEXT := NULL;
    v_pesan_admin TEXT := NULL;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF FOUND THEN
        v_portal_open := public.is_portal_effectively_open(v_settings.portal_mode, v_settings.portal_open, v_settings.scheduled_open_at, v_settings.scheduled_close_at, v_now);
        v_portal_phase := public.get_portal_phase(v_settings.portal_mode, v_settings.portal_open, v_settings.scheduled_open_at, v_settings.scheduled_close_at, v_now);
    END IF;

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
            v_status_kendala := 'pending';
            v_pesan_admin := NULL;
        ELSIF v_complaint.status = 'rejected' THEN
            v_status_kendala := 'rejected';
            v_pesan_admin := NULLIF(trim(v_complaint.catatan_admin), '');
        ELSIF v_complaint.status = 'resolved' THEN
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
        'portal_open', v_portal_open,
        'portal_phase', v_portal_phase,
        'status_kendala', v_status_kendala,
        'pesan_admin', v_pesan_admin,
        'alasan_kendala', CASE WHEN v_status_kendala IS NOT NULL THEN v_complaint.alasan ELSE NULL END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 7. PERBARUI join_queue(): HILANGKAN 'settings FOR UPDATE' (ANTI SERIALISASI BOTTLENECK)
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
    v_portal_open BOOLEAN;
BEGIN
    -- 1. Baca settings tanpa lock eksklusif tabel (menghindari bottleneck 400 mahasiswa antre di 1 baris)
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    v_portal_open := public.is_portal_effectively_open(v_settings.portal_mode, v_settings.portal_open, v_settings.scheduled_open_at, v_settings.scheduled_close_at, v_now);

    IF NOT v_portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang DITUTUP.');
    END IF;

    -- 2. Validasi mahasiswa
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    -- 3. Periksa antrian yang sedang berjalan untuk mahasiswa ini
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

    -- 4. Hitung slot aktif
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

    -- 5. Kunci advisory transaksi singkat hanya saat alokasi tiket baru (sub-milidetik)
    PERFORM pg_advisory_xact_lock(998877);

    v_token := gen_random_uuid()::TEXT;

    IF v_active_count < v_settings.max_active AND v_waiting_count = 0 THEN
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
-- 8. PERBARUI queue_status(): GUARD 'IF EXISTS' & ADVISORY LOCK PADA PROMOSI
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_status(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state VARCHAR(20);
    v_nomor INT;
    v_expires_at TIMESTAMPTZ;
    v_sisa_detik INT := 0;
    v_posisi INT := 0;
    v_est_menit INT := 0;
    v_max_active INT := 50;
    v_active_count INT := 0;
    v_waiting_count INT := 0;
    v_vacant_slots INT := 0;
    v_session_min INT := 5;
    v_settings RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF v_settings.max_active IS NOT NULL THEN
        v_max_active := v_settings.max_active;
    END IF;
    IF v_settings.session_duration_minutes IS NOT NULL THEN
        v_session_min := v_settings.session_duration_minutes;
    END IF;

    -- 1. Tandai expired hanya jika ADA sesi yang sudah lewat waktu (menghilangkan dead-tuple storm)
    IF EXISTS (SELECT 1 FROM public.queue WHERE state = 'active' AND expires_at < v_now) THEN
        UPDATE public.queue
        SET state = 'expired'
        WHERE state = 'active' AND expires_at < v_now;
    END IF;

    -- 2. Ambil data sesi pemanggil
    SELECT state, nomor, expires_at INTO v_state, v_nomor, v_expires_at
    FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak ditemukan.');
    END IF;

    -- 3. Hitung jumlah antrian yang sedang menunggu giliran
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    -- 4. Jika user dalam status active, periksa sisa waktu dan pangkas jika ada antrean
    IF v_state = 'active' THEN
        IF v_waiting_count > 0 AND v_expires_at > (v_now + (v_session_min || ' minutes')::interval) THEN
            UPDATE public.queue
            SET expires_at = v_now + (v_session_min || ' minutes')::interval
            WHERE token = p_token;
            v_expires_at := v_now + (v_session_min || ' minutes')::interval;
        END IF;

        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_state := 'expired';
        END IF;

    ELSIF v_state = 'waiting' THEN
        -- 5. Promosi batch antrean jika ada slot kosong
        SELECT count(*) INTO v_active_count 
        FROM public.queue 
        WHERE state = 'active' AND expires_at >= v_now;

        v_vacant_slots := v_max_active - v_active_count;

        IF v_vacant_slots > 0 THEN
            -- Gunakan advisory lock non-blocking agar hanya 1 transaksi per gelombang yang mempromosikan
            IF pg_try_advisory_xact_lock(776655) THEN
                UPDATE public.queue
                SET state = 'active',
                    activated_at = v_now,
                    expires_at = v_now + (v_session_min || ' minutes')::interval
                WHERE token IN (
                    SELECT token FROM public.queue
                    WHERE state = 'waiting'
                    ORDER BY nomor ASC
                    LIMIT v_vacant_slots
                    FOR UPDATE SKIP LOCKED
                );
            END IF;

            SELECT state, expires_at INTO v_state, v_expires_at
            FROM public.queue
            WHERE token = p_token AND nim = trim(p_nim);

            IF v_state = 'active' THEN
                v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
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
-- 9. PERBARUI daftar(): MASA TENGGANG JAM TUTUP & ATURAN BENTROK BEBAS
-- ------------------------------------------------------------------------------
-- Keputusan User Bagian III:
-- - Bentrok jam kuliah dengan jadwal kelas tetap: DIIZINKAN (tidak ditolak!).
-- - Bentrok jam kuliah antar pilihan: DIIZINKAN (tidak ditolak!).
-- - Ditolak mutlak:
--     1. Nama dasar mata kuliah pilihan SAMA DENGAN nama mata kuliah di jadwal kelasnya (sudah_di_kelas).
--     2. Nama dasar mata kuliah pilihan KEMBAR antar pilihan yang diajukan (mis. Agronomi A dan Agronomi C).
--     3. Duplikasi ID mata kuliah yang sama.
-- - Toleransi Masa Tenggang: jika portal ditutup terjadwal, mahasiswa yang sesinya active
--   sebelum jam tutup dan belum expired tetap diizinkan menyelesaikan pendaftaran.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(30) := trim(COALESCE(p_nim, ''));
    v_clean_token TEXT := trim(COALESCE(p_token, ''));
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_count INT;
    v_unique_count INT;
    v_found_offerings INT;
    v_nama_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_name TEXT;
    v_current_terisi INT;
    v_active_count INT := 0;
    v_waiting_count INT := 0;
    v_max_active INT := 50;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
    v_err_msg TEXT;
    v_portal_open BOOLEAN;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    v_max_active := COALESCE(v_settings.max_active, 50);
    v_session_min := COALESCE(v_settings.session_duration_minutes, 5);

    -- 1. Kunci baris mahasiswa eksklusif
    SELECT * INTO v_student FROM public.students 
    WHERE nim = v_clean_nim 
    FOR UPDATE;

    IF NOT FOUND THEN
        v_err_msg := 'Mahasiswa tidak ditemukan dalam sistem.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_clean_nim, '-', v_err_msg, jsonb_build_object('alasan', 'student_not_found'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        v_err_msg := 'Anda sudah pernah menyelesaikan pendaftaran pemilihan mata kuliah.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('warning', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'already_registered'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    -- 2. Kunci baris sesi antrian milik mahasiswa
    SELECT * INTO v_q FROM public.queue
    WHERE token = v_clean_token AND nim = v_student.nim
    FOR UPDATE;

    IF NOT FOUND THEN
        v_err_msg := 'Sesi pemilihan Anda tidak ditemukan atau token tidak valid. Silakan masuk antrian kembali.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'token_not_found', 'token', v_clean_token));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    -- 3. Periksa status portal dengan toleransi MASA TENGGANG (Grace Period)
    v_portal_open := public.is_portal_effectively_open(v_settings.portal_mode, v_settings.portal_open, v_settings.scheduled_open_at, v_settings.scheduled_close_at, v_now);

    IF NOT v_portal_open THEN
        -- Cek masa tenggang: diizinkan jika sesi aktif sebelum jam tutup terjadwal dan masih dalam masa berlaku timer
        IF v_q.state = 'active'
           AND v_settings.scheduled_close_at IS NOT NULL
           AND v_q.activated_at < v_settings.scheduled_close_at
           AND v_q.expires_at >= v_now THEN
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES (
                'info',
                'MASA_TENGGANG_DIGUNAKAN',
                v_student.nim,
                v_student.nama,
                format('Mahasiswa %s (%s) menyelesaikan pendaftaran dalam masa tenggang setelah portal ditutup terjadwal.', v_student.nama, v_student.nim),
                jsonb_build_object('scheduled_close_at', v_settings.scheduled_close_at, 'expires_at', v_q.expires_at)
            );
        ELSE
            v_err_msg := 'Portal pemilihan saat ini sedang ditutup.';
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'portal_closed'));
            RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
        END IF;
    END IF;

    -- Pemulihan sesi jika slot masih ada (< 50) dan tidak ada antrean menunggu
    IF v_q.state <> 'active' OR v_q.expires_at < v_now THEN
        SELECT count(*)::INT INTO v_active_count
        FROM public.queue
        WHERE state = 'active' AND expires_at >= v_now;

        SELECT count(*)::INT INTO v_waiting_count
        FROM public.queue
        WHERE state = 'waiting' AND token <> v_clean_token;

        IF v_active_count < v_max_active AND v_waiting_count = 0 THEN
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES (
                'info',
                'SESI_DIPULIHKAN',
                v_student.nim,
                v_student.nama,
                format('Sesi mahasiswa %s (%s) dipulihkan otomatis saat submit karena slot aktif masih tersedia.', v_student.nama, v_student.nim),
                jsonb_build_object('prev_state', v_q.state, 'token', v_clean_token, 'active_count', v_active_count)
            );
        ELSE
            v_err_msg := 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid. Silakan masuk antrian kembali.';
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
                'alasan', 'session_expired',
                'token', v_clean_token,
                'state', v_q.state,
                'active_count', v_active_count,
                'waiting_count', v_waiting_count
            ));
            RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
        END IF;
    END IF;

    -- 4. Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah / Proyek
    v_count := array_length(p_offering_ids, 1);
    IF p_offering_ids IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 4 THEN
        v_err_msg := 'Pilihan harus berjumlah minimal 1 dan maksimal 4 mata kuliah / proyek.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'invalid_count', 'count', v_count));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    SELECT count(DISTINCT x)::INT INTO v_unique_count
    FROM unnest(p_offering_ids) AS x
    WHERE x IS NOT NULL;

    IF v_unique_count <> v_count THEN
        v_err_msg := 'Mental: Terdapat duplikasi ID mata kuliah dalam daftar pilihan.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'duplicate_offering_id', 'offering_ids', p_offering_ids));
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat duplikasi pilihan yang tidak valid. Silakan pilih ulang mata kuliah Anda.');
    END IF;

    -- 5. Kunci baris offerings secara deterministik (urut id)
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    GET DIAGNOSTICS v_found_offerings = ROW_COUNT;
    IF v_found_offerings <> v_count THEN
        v_err_msg := 'Mental: Salah satu pilihan yang dipilih sudah tidak tersedia atau telah diperbarui admin.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
            'alasan', 'offering_not_found',
            'offering_ids', p_offering_ids,
            'expected_count', v_count,
            'found_count', v_found_offerings
        ));
        RETURN jsonb_build_object('ok', false, 'error', 'Salah satu pilihan yang Anda pilih telah diperbarui oleh admin. Silakan muat ulang halaman dan pilih kembali.');
    END IF;

    -- 6. Periksa kuota dan aturan nama pokok mata kuliah
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            v_err_msg := format('Mental: Kuota untuk "%s" (Kelas %s) sudah penuh (%s/%s).', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
                'alasan', 'kuota_penuh', 
                'offering_id', v_off.id, 
                'nama', v_off.nama, 
                'kelas', v_off.kelas, 
                'kuota', v_off.kuota, 
                'terisi', v_current_terisi
            ));
            RETURN jsonb_build_object('ok', false, 'error', format('Kuota untuk "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih kelas atau mata kuliah lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota));
        END IF;

        -- Proteksi 1: Mata kuliah pilihan TIDAK BOLEH SAMA dengan mata kuliah wajib di kelasnya
        IF v_student.kelas IS NOT NULL AND trim(v_student.kelas) <> '' THEN
            IF EXISTS (
                SELECT 1
                FROM public.class_schedules cs
                WHERE cs.kelas = v_student.kelas
                  AND COALESCE(NULLIF(trim(cs.nama_matkul), ''), trim(cs.matkul)) IS NOT NULL
                  AND (
                    public.normalize_course_name(v_off.nama) = public.normalize_course_name(COALESCE(NULLIF(trim(cs.nama_matkul), ''), cs.matkul))
                    OR lower(trim(v_off.nama)) = lower(trim(COALESCE(NULLIF(trim(cs.nama_matkul), ''), cs.matkul)))
                  )
            ) THEN
                v_err_msg := format('Mental: Mata kuliah "%s" tidak dapat dipilih karena sudah ada pada jadwal kuliah kelas %s.', v_off.nama, v_student.kelas);
                INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
                VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
                    'alasan', 'course_already_in_class_schedule',
                    'offering_id', v_off.id,
                    'kelas', v_student.kelas,
                    'nama', v_off.nama
                ));
                RETURN jsonb_build_object(
                    'ok', false,
                    'error', format('Mata kuliah "%s" tidak dapat dipilih karena sudah menjadi mata kuliah wajib kelas Anda (%s).', v_off.nama, v_student.kelas)
                );
            END IF;
        END IF;

        -- Proteksi 2: Anti-duplikasi nama mata kuliah pokok di antara pilihan yang diajukan
        v_base_name := public.normalize_course_name(v_off.nama);

        IF v_off.nama = ANY(v_nama_arr) OR (v_base_name <> '' AND v_base_name = ANY(v_base_arr)) THEN
            v_err_msg := format('Mental: Mata kuliah / proyek "%s" dipilih lebih dari satu kali di kelas berbeda.', v_off.nama);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'duplicate_course', 'offering_id', v_off.id));
            RETURN jsonb_build_object('ok', false, 'error', format('Pilihan "%s" dipilih lebih dari satu kali di kelas berbeda. Setiap pilihan mata kuliah / proyek harus berbeda topik / mata kuliah.', v_off.nama));
        END IF;

        v_nama_arr := array_append(v_nama_arr, v_off.nama);
        IF v_base_name <> '' THEN
            v_base_arr := array_append(v_base_arr, v_base_name);
        END IF;
    END LOOP;

    -- 7. Simpan pendaftaran dan selesaikan sesi
    BEGIN
        INSERT INTO public.registrations (nim, offering_id)
        SELECT v_student.nim, unnest(p_offering_ids);

        UPDATE public.students
        SET registered_at = v_now
        WHERE nim = v_student.nim;

        UPDATE public.queue
        SET state = 'done'
        WHERE token = v_clean_token AND nim = v_student.nim;

        -- Promosikan antrian berikutnya jika kapasitas slot masih tersedia (< 50)
        IF (SELECT count(*) FROM public.queue WHERE state = 'active' AND expires_at >= v_now) < v_max_active THEN
            UPDATE public.queue
            SET state = 'active', 
                activated_at = v_now, 
                expires_at = v_now + (v_session_min || ' minutes')::interval
            WHERE token = (
                SELECT token FROM public.queue 
                WHERE state = 'waiting' 
                ORDER BY nomor ASC 
                LIMIT 1 
                FOR UPDATE SKIP LOCKED
            );
        END IF;

        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES (
            'success', 
            'PENDAFTARAN_BERHASIL', 
            v_student.nim, 
            v_student.nama, 
            format('Mahasiswa %s (%s) berhasil mendaftar %s mata kuliah/proyek.', v_student.nama, v_student.nim, v_count), 
            jsonb_build_object('offering_ids', p_offering_ids)
        );

        RETURN jsonb_build_object(
            'ok', true,
            'message', 'Pendaftaran mata kuliah pilihan berhasil disimpan secara resmi.'
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_err_msg := format('Mental: Terjadi kesalahan sistem saat menyimpan pendaftaran (%s - %s).', SQLERRM, SQLSTATE);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES (
                'error', 
                'DAFTAR_MENTAL', 
                v_student.nim, 
                v_student.nama, 
                v_err_msg, 
                jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE)
            );
            RETURN jsonb_build_object(
                'ok', false, 
                'error', format('Terjadi kesalahan sistem saat menyimpan data pemilihan: %s. Silakan coba kembali.', SQLERRM)
            );
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 10. PERBARUI list_offerings(): OPTIMASI CTE DAN STATUS PORTAL EFEKTIF
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
    v_portal_open BOOLEAN;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    v_portal_open := public.is_portal_effectively_open(v_settings.portal_mode, v_settings.portal_open, v_settings.scheduled_open_at, v_settings.scheduled_close_at, v_now);

    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim) AND state = 'active' AND expires_at >= v_now;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- Izinkan jika portal buka ATAU sedang dalam masa tenggang aktif
    IF NOT v_portal_open THEN
        IF NOT (v_settings.scheduled_close_at IS NOT NULL AND v_q.activated_at < v_settings.scheduled_close_at) THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
        END IF;
    END IF;

    -- Hitung jumlah antrian di ruang tunggu
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    -- Pangkas sisa waktu maksimal 5 menit bila antrian terbentuk
    IF v_waiting_count > 0 AND v_q.expires_at > (v_now + interval '5 minutes') THEN
        UPDATE public.queue
        SET expires_at = v_now + interval '5 minutes'
        WHERE token = p_token;
        v_q.expires_at := v_now + interval '5 minutes';
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);

    -- Komputasi CTE satu kali untuk seluruh offering mahasiswa
    WITH student_sched AS (
        SELECT 
            cs.hari,
            cs.jam_mulai,
            cs.jam_selesai,
            public.normalize_course_name(COALESCE(NULLIF(trim(cs.nama_matkul), ''), cs.matkul)) AS base_name,
            lower(trim(COALESCE(NULLIF(trim(cs.nama_matkul), ''), cs.matkul))) AS raw_name
        FROM public.class_schedules cs
        WHERE cs.kelas = v_student.kelas
          AND COALESCE(NULLIF(trim(cs.nama_matkul), ''), trim(cs.matkul)) IS NOT NULL
    )
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
            -- Flag 1: Matkul sudah ada di kelas wajib mahasiswa
            'sudah_di_kelas', (
                v_student.kelas IS NOT NULL AND EXISTS (
                    SELECT 1 FROM student_sched ss
                    WHERE ss.base_name = public.normalize_course_name(o.nama)
                       OR ss.raw_name = lower(trim(o.nama))
                )
            ),
            -- Flag 2: Bentrok jadwal kelas (jam bentrok atau sudah ada di kelas)
            'bentrok_kelas', (
                v_student.kelas IS NOT NULL AND (
                    EXISTS (
                        SELECT 1
                        FROM public.schedules s
                        JOIN student_sched ss ON lower(trim(s.hari)) = lower(trim(ss.hari))
                        WHERE s.offering_id = o.id
                          AND s.jam_mulai < ss.jam_selesai
                          AND ss.jam_mulai < s.jam_selesai
                    )
                    OR
                    EXISTS (
                        SELECT 1 FROM student_sched ss
                        WHERE ss.base_name = public.normalize_course_name(o.nama)
                           OR ss.raw_name = lower(trim(o.nama))
                    )
                )
            ),
            -- Flag 3: Bentrok visual jam
            'bentrok', (
                v_student.kelas IS NOT NULL AND (
                    EXISTS (
                        SELECT 1
                        FROM public.schedules s
                        JOIN student_sched ss ON lower(trim(s.hari)) = lower(trim(ss.hari))
                        WHERE s.offering_id = o.id
                          AND s.jam_mulai < ss.jam_selesai
                          AND ss.jam_mulai < s.jam_selesai
                    )
                    OR
                    EXISTS (
                        SELECT 1 FROM student_sched ss
                        WHERE ss.base_name = public.normalize_course_name(o.nama)
                           OR ss.raw_name = lower(trim(o.nama))
                    )
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

-- ------------------------------------------------------------------------------
-- 11. PERBARUI admin_sapu_sesi(): DEFAULT HANYA BERSIHKAN SESI EXPIRED
-- ------------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_sapu_sesi();
DROP FUNCTION IF EXISTS public.admin_sapu_sesi(BOOLEAN);

CREATE OR REPLACE FUNCTION public.admin_sapu_sesi(p_paksa_semua BOOLEAN DEFAULT FALSE)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned INT := 0;
    v_promoted INT := 0;
    v_max_active INT := 50;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT COALESCE(max_active, 50), COALESCE(session_duration_minutes, 5)
    INTO v_max_active, v_session_min
    FROM public.settings
    WHERE id = 1;

    -- Jika tidak dipaksa semua, hanya bersihkan sesi active yang memang sudah lewat waktu
    IF p_paksa_semua THEN
        UPDATE public.queue
        SET state = 'expired'
        WHERE state = 'active';
    ELSE
        UPDATE public.queue
        SET state = 'expired'
        WHERE state = 'active' AND expires_at < v_now;
    END IF;

    GET DIAGNOSTICS v_cleaned = ROW_COUNT;

    -- Promosikan antrean waiting jika masih ada slot kosong
    WITH next_waiting AS (
        SELECT token
        FROM public.queue
        WHERE state = 'waiting'
        ORDER BY nomor ASC
        LIMIT v_max_active
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.queue q
    SET state = 'active',
        activated_at = v_now,
        expires_at = v_now + (v_session_min || ' minutes')::interval
    FROM next_waiting nw
    WHERE q.token = nw.token;

    GET DIAGNOSTICS v_promoted = ROW_COUNT;

    INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
    VALUES (
        'info',
        'ADMIN_SAPU_SESI',
        '-',
        'Administrator',
        format('Admin membersihkan %s sesi aktif (%s antrian dipromosikan, paksa_semua: %s).', v_cleaned, v_promoted, p_paksa_semua),
        jsonb_build_object('cleaned', v_cleaned, 'promoted', v_promoted, 'paksa_semua', p_paksa_semua)
    );

    RETURN jsonb_build_object(
        'ok', true, 
        'message', format('%s sesi aktif berhasil dibersihkan.', v_cleaned),
        'cleaned', v_cleaned,
        'promoted', v_promoted
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sapu_sesi(BOOLEAN) TO authenticated;

-- ------------------------------------------------------------------------------
-- 12. HARDENING KEAMANAN RPC EMAIL
-- ------------------------------------------------------------------------------
-- A. admin_tandai_email_terkirim(): kembalikan proteksi is_admin() khusus panel admin
CREATE OR REPLACE FUNCTION public.admin_tandai_email_terkirim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk administrator.');
  END IF;

  UPDATE public.students
  SET email_terkirim = TRUE
  WHERE nim = trim(p_nim);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak ditemukan.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_tandai_email_terkirim(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.admin_tandai_email_terkirim(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.admin_tandai_email_terkirim(TEXT) TO authenticated;

-- B. tandai_email_terkirim_bukti(): fungsi aman khusus route bukti pendaftaran /api/send-email
CREATE OR REPLACE FUNCTION public.tandai_email_terkirim_bukti(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_clean_nim TEXT := trim(COALESCE(p_nim, ''));
  v_student RECORD;
BEGIN
  SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak ditemukan.');
  END IF;

  -- Pastikan mahasiswa benar-benar sudah menyelesaikan pendaftaran krs dan memiliki email
  IF v_student.registered_at IS NULL AND NOT EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_clean_nim) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa belum menyelesaikan pendaftaran.');
  END IF;

  IF v_student.email IS NULL OR trim(v_student.email) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Email mahasiswa belum terdaftar.');
  END IF;

  UPDATE public.students
  SET email_terkirim = TRUE
  WHERE nim = v_clean_nim;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.tandai_email_terkirim_bukti(TEXT) TO anon, authenticated;

-- C. simpan_email_mahasiswa(): validasi format email & proteksi penimpaan setelah email_terkirim
CREATE OR REPLACE FUNCTION public.simpan_email_mahasiswa(p_nim TEXT, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(COALESCE(p_nim, ''));
    v_clean_email TEXT := lower(trim(COALESCE(p_email, '')));
    v_student RECORD;
BEGIN
    IF v_clean_nim = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data mahasiswa tidak ditemukan.');
    END IF;

    IF v_clean_email <> '' AND v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Format alamat email tidak valid.');
    END IF;

    -- Proteksi penimpaan jika email arsip sudah berhasil dikirim
    IF COALESCE(v_student.email_terkirim, false) AND NOT public.is_admin() THEN
        IF lower(trim(COALESCE(v_student.email, ''))) = v_clean_email THEN
            RETURN jsonb_build_object('ok', true, 'message', 'Email mahasiswa sudah tersimpan.', 'email', v_clean_email);
        END IF;
        RETURN jsonb_build_object('ok', false, 'error', 'Bukti pendaftaran sudah terkirim ke email arsip. Hubungi admin untuk perubahan email.');
    END IF;

    UPDATE public.students
    SET email = CASE WHEN v_clean_email = '' THEN NULL ELSE v_clean_email END
    WHERE nim = v_clean_nim;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Email mahasiswa berhasil disimpan.',
        'email', v_clean_email
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.simpan_email_mahasiswa(TEXT, TEXT) TO anon, authenticated;

COMMIT;
