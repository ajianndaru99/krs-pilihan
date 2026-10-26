-- ==============================================================================
-- PATCH 11: UNIFIKASI SKEMA & STANDARISASI KONTRAK FUNGSI DATABASE
-- ==============================================================================
-- Patch ini menyelaraskan seluruh skema tabel, keamanan RLS, dan kontrak fungsi
-- RPC antara frontend Next.js dan backend PostgreSQL di Supabase:
-- 1. Menjamin ekstensi pgcrypto di skema extensions dan search_path aman.
-- 2. Menjamin kolom tabel konsisten: settings (max_requeue), queue (retry_count), students (pin, pin_hash).
-- 3. Kontrak RPC standar untuk status admin, antrian, kuota, dan pendaftar.
-- ==============================================================================

-- 1. EKSTENSI & SEARCH PATH
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA extensions;

-- 2. TAMBAH KOLOM DENGAN AMAN (IDEMPOTEN)
ALTER TABLE public.settings ADD COLUMN IF NOT EXISTS max_requeue INT NOT NULL DEFAULT 2;
ALTER TABLE public.queue ADD COLUMN IF NOT EXISTS retry_count INT NOT NULL DEFAULT 0;
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS pin_hash TEXT;

-- Sinkronkan pin_hash jika mahasiswa memiliki pin teks
UPDATE public.students
SET pin_hash = encode(extensions.digest(trim(pin), 'sha256'), 'hex')
WHERE pin IS NOT NULL AND trim(pin) <> '' AND (pin_hash IS NULL OR pin_hash = '');

-- 3. FUNGSI is_admin()
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
       OR (username IS NOT NULL AND (
            lower(username) = lower(auth.jwt() ->> 'email')
            OR lower(username) = lower(split_part(auth.jwt() ->> 'email', '@', 1))
          ))
  );
$$;

-- 4. FUNGSI cek_nim(p_nim TEXT)
CREATE OR REPLACE FUNCTION public.cek_nim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_student RECORD;
    v_sudah_daftar BOOLEAN;
    v_portal_open BOOLEAN;
    v_nama_parts TEXT[];
    v_samar TEXT := '';
    v_part TEXT;
    v_idx INT;
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

-- 5. FUNGSI join_queue(p_nim TEXT, p_pin TEXT DEFAULT NULL)
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

    -- Validasi PIN dinonaktifkan: Mahasiswa cukup memasukkan NIM yang terdaftar

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
        IF v_q.state = 'active' AND v_q.expires_at >= v_now THEN
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
    v_token := gen_random_uuid()::text;

    IF v_active_count < v_settings.max_active THEN
        v_expires_at := v_now + (v_settings.session_duration_minutes || ' minutes')::interval;
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

-- 6. FUNGSI queue_status(p_nim TEXT, p_token TEXT)
CREATE OR REPLACE FUNCTION public.queue_status(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_q RECORD;
    v_settings RECORD;
    v_active_count INT;
    v_waiting_pos INT;
    v_est_minutes INT;
    v_now TIMESTAMPTZ := now();
    v_sisa_detik INT := 0;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;

    -- Expire sesi usang
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Token sesi antrian tidak valid atau sudah dihapus.');
    END IF;

    -- Promosikan waiting ke active jika ada kuota slot kosong
    IF v_q.state = 'waiting' THEN
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_settings.max_active THEN
            -- Pastikan hanya antrian terdepan yang dipromosikan
            IF NOT EXISTS (
                SELECT 1 FROM public.queue
                WHERE state = 'waiting' AND entered_at < v_q.entered_at
            ) THEN
                UPDATE public.queue
                SET state = 'active',
                    activated_at = v_now,
                    expires_at = v_now + (v_settings.session_duration_minutes || ' minutes')::interval
                WHERE token = p_token
                RETURNING * INTO v_q;
            END IF;
        END IF;
    END IF;

    IF v_q.state = 'active' THEN
        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - v_now))::INT);
        RETURN jsonb_build_object(
            'ok', true,
            'state', 'active',
            'nomor', v_q.nomor,
            'sisa_detik', v_sisa_detik,
            'bisa_antri_lagi', (v_q.retry_count < v_settings.max_requeue)
        );
    ELSIF v_q.state = 'waiting' THEN
        SELECT count(*) INTO v_waiting_pos FROM public.queue WHERE state = 'waiting' AND entered_at <= v_q.entered_at;
        v_est_minutes := CEIL(v_waiting_pos::FLOAT / GREATEST(1, v_settings.max_active)::FLOAT * 1.5)::INT;
        RETURN jsonb_build_object(
            'ok', true,
            'state', 'waiting',
            'nomor', v_q.nomor,
            'posisi', v_waiting_pos,
            'estimasi_menit', v_est_minutes,
            'bisa_antri_lagi', true
        );
    ELSIF v_q.state = 'done' THEN
        RETURN jsonb_build_object('ok', true, 'state', 'done', 'nomor', v_q.nomor);
    ELSE
        RETURN jsonb_build_object(
            'ok', true,
            'state', 'expired',
            'nomor', v_q.nomor,
            'bisa_antri_lagi', (v_q.retry_count < v_settings.max_requeue)
        );
    END IF;
END;
$$;

-- 7. FUNGSI admin_status()
CREATE OR REPLACE FUNCTION public.admin_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settings RECORD;
    v_tot_stud INT;
    v_tot_reg INT;
    v_act_q INT;
    v_wait_q INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    SELECT count(*) INTO v_tot_stud FROM public.students;
    SELECT count(DISTINCT nim) INTO v_tot_reg FROM public.registrations;
    SELECT count(*) INTO v_act_q FROM public.queue WHERE state = 'active' AND expires_at >= now();
    SELECT count(*) INTO v_wait_q FROM public.queue WHERE state = 'waiting';

    RETURN jsonb_build_object(
        'ok', true,
        'portal_open', v_settings.portal_open,
        'need_matkul', v_settings.need_matkul,
        'need_proyek', v_settings.need_proyek,
        'session_duration_minutes', v_settings.session_duration_minutes,
        'max_active', v_settings.max_active,
        'max_requeue', COALESCE(v_settings.max_requeue, 2),
        'total_students', v_tot_stud,
        'sudah_daftar', v_tot_reg,
        'total_registered', v_tot_reg,
        'active_queue', v_act_q,
        'waiting_queue', v_wait_q
    );
END;
$$;

-- 8. FUNGSI admin_list_offerings()
CREATE OR REPLACE FUNCTION public.admin_list_offerings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offerings JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'topik', o.topik,
            'kuota', o.kuota,
            'terisi', (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id)::INT,
            'sisa', GREATEST(0, o.kuota - (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id))::INT,
            'jadwal', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object(
                        'id', s.id,
                        'hari', s.hari,
                        'jam_mulai', s.jam_mulai::text,
                        'jam_selesai', s.jam_selesai::text,
                        'ruang', COALESCE(s.ruang, '-')
                    )
                ) FROM public.schedules s WHERE s.offering_id = o.id
            ), '[]'::jsonb)
        ) ORDER BY o.jenis, o.nama
    ) INTO v_offerings
    FROM public.offerings o;

    RETURN jsonb_build_object('ok', true, 'offerings', COALESCE(v_offerings, '[]'::jsonb));
END;
$$;

-- 9. FUNGSI admin_list_pendaftar()
CREATE OR REPLACE FUNCTION public.admin_list_pendaftar()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pendaftar JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'nim', s.nim,
            'nama', s.nama,
            'kelas', COALESCE(s.kelas, '-'),
            'registered_at', to_char(COALESCE(s.registered_at, now()) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'pilihan', COALESCE(p.arr, '[]'::jsonb)
        ) ORDER BY s.registered_at DESC NULLS LAST, s.nim DESC
    ) INTO v_pendaftar
    FROM public.students s
    JOIN (
        SELECT r.nim, jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'nama', o.nama,
                'jenis', o.jenis,
                'topik', COALESCE(o.topik, '-')
            ) ORDER BY o.jenis, o.nama
        ) AS arr
        FROM public.registrations r
        JOIN public.offerings o ON o.id = r.offering_id
        GROUP BY r.nim
    ) p ON p.nim = s.nim;

    RETURN jsonb_build_object('ok', true, 'pendaftar', COALESCE(v_pendaftar, '[]'::jsonb));
END;
$$;

-- 10. GRANTS
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_offerings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pendaftar() TO authenticated;
