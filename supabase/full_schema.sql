-- ============================================================================
-- FULL SCHEMA & MIGRATION: Sistem Pemilihan Mata Kuliah Pilihan
-- Jalankan seluruh berkas ini sekaligus di Supabase SQL Editor (Run 1x)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- 1. TABEL UTAMA & RLS
-- ----------------------------------------------------------------------------

-- 1.1 Pengaturan Global
CREATE TABLE IF NOT EXISTS public.settings (
    id INT PRIMARY KEY DEFAULT 1,
    portal_open BOOLEAN NOT NULL DEFAULT false,
    max_active INT NOT NULL DEFAULT 30,
    session_duration_minutes INT NOT NULL DEFAULT 5,
    need_matkul INT NOT NULL DEFAULT 3,
    need_proyek INT NOT NULL DEFAULT 1,
    max_requeue INT NOT NULL DEFAULT 2,
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.settings (id, portal_open, max_active, session_duration_minutes, need_matkul, need_proyek, max_requeue)
VALUES (1, false, 30, 5, 3, 1, 2)
ON CONFLICT (id) DO NOTHING;

-- 1.2 Data Mahasiswa
CREATE TABLE IF NOT EXISTS public.students (
    nim TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    kelas TEXT, -- Opsional
    pin TEXT,
    pin_hash TEXT,
    registered_at TIMESTAMPTZ
);

-- 1.3 Administrator
CREATE TABLE IF NOT EXISTS public.admins (
    email TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Seed akun default admin (Username: admin)
INSERT INTO public.admins (email, username)
VALUES ('admin@admin.local', 'admin')
ON CONFLICT (email) DO NOTHING;

-- 1.4 Mata Kuliah & Proyek Pilihan
CREATE TABLE IF NOT EXISTS public.offerings (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    kelas VARCHAR(10) DEFAULT 'A',
    topik TEXT,
    jenis TEXT NOT NULL CHECK (jenis IN ('matkul', 'proyek')),
    kuota INT NOT NULL DEFAULT 30
);

-- 1.5 Jadwal Perkuliahan Pilihan
CREATE TABLE IF NOT EXISTS public.schedules (
    id SERIAL PRIMARY KEY,
    offering_id INT NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
    hari TEXT NOT NULL,
    jam_mulai TIME NOT NULL,
    jam_selesai TIME NOT NULL,
    ruang TEXT
);

-- 1.6 Jadwal Kelas Tetap Mahasiswa
CREATE TABLE IF NOT EXISTS public.class_schedules (
    id SERIAL PRIMARY KEY,
    kelas TEXT NOT NULL,
    hari TEXT NOT NULL,
    jam_mulai TIME NOT NULL,
    jam_selesai TIME NOT NULL,
    matkul TEXT,
    ruang TEXT
);
CREATE INDEX IF NOT EXISTS idx_class_sched_kelas ON public.class_schedules(kelas);

-- 1.7 Antrian Mahasiswa
CREATE TABLE IF NOT EXISTS public.queue (
    token TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nim TEXT NOT NULL REFERENCES public.students(nim) ON DELETE CASCADE,
    nomor SERIAL,
    state TEXT NOT NULL DEFAULT 'waiting' CHECK (state IN ('menunggu_undian', 'waiting', 'active', 'done', 'expired')),
    entered_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    activated_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    retry_count INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_queue_state ON public.queue(state, nomor);
CREATE INDEX IF NOT EXISTS idx_queue_nim ON public.queue(nim);
CREATE INDEX IF NOT EXISTS idx_queue_waiting_fifo ON public.queue(nomor ASC) WHERE state = 'waiting';
CREATE INDEX IF NOT EXISTS idx_queue_active_exp ON public.queue(expires_at) WHERE state = 'active';

-- 1.8 Registrasi Final Mahasiswa
CREATE TABLE IF NOT EXISTS public.registrations (
    id SERIAL PRIMARY KEY,
    nim TEXT NOT NULL REFERENCES public.students(nim) ON DELETE CASCADE,
    offering_id INT NOT NULL REFERENCES public.offerings(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_nim_offering UNIQUE (nim, offering_id)
);
CREATE INDEX IF NOT EXISTS idx_reg_nim ON public.registrations(nim);
CREATE INDEX IF NOT EXISTS idx_reg_offering ON public.registrations(offering_id);

-- 1.9 Pengajuan Akses Mahasiswa
CREATE TABLE IF NOT EXISTS public.access_requests (
    id SERIAL PRIMARY KEY,
    nim TEXT NOT NULL,
    nama TEXT NOT NULL,
    kelas TEXT,
    catatan TEXT,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_access_req_status ON public.access_requests(status);

-- AKTIFKAN ROW LEVEL SECURITY (RLS)
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.class_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.access_requests ENABLE ROW LEVEL SECURITY;

-- ----------------------------------------------------------------------------
-- 2. DATA AWAL (34 MATKUL PILIHAN + 1 PROYEK)
-- ----------------------------------------------------------------------------
INSERT INTO public.offerings (nama, topik, jenis, kuota) VALUES
('Bioteknologi Tanaman', 'Bioteknologi', 'matkul', 30),
('Kultur Jaringan Lanjut', 'Bioteknologi', 'matkul', 30),
('Fisiologi Cekaman Tanaman', 'Fisiologi', 'matkul', 30),
('Nutrisi Tanaman Lanjut', 'Fisiologi', 'matkul', 30),
('Teknologi Benih Unggul', 'Pemuliaan', 'matkul', 30),
('Pemuliaan Tanaman Perkebunan', 'Pemuliaan', 'matkul', 30),
('Genetika Molekuler Tanaman', 'Pemuliaan', 'matkul', 30),
('Manajemen Gulma Terpadu', 'Proteksi', 'matkul', 30),
('Epidemiologi Penyakit Tanaman', 'Proteksi', 'matkul', 30),
('Pengendalian Hayati & Biopestisida', 'Proteksi', 'matkul', 30),
('Toksikologi Pestisida', 'Proteksi', 'matkul', 30),
('Kesuburan Tanah Presisi', 'Ilmu Tanah', 'matkul', 30),
('Biologi Tanah & Remidiasi', 'Ilmu Tanah', 'matkul', 30),
('Konservasi Tanah dan Air Tropika', 'Ilmu Tanah', 'matkul', 30),
('Klasifikasi Tanah & Evaluasi Lahan', 'Ilmu Tanah', 'matkul', 30),
('Agroforestri Perkebunan', 'Agronomi', 'matkul', 30),
('Budidaya Kelapa Sawit Berkelanjutan', 'Agronomi', 'matkul', 30),
('Budidaya Kopi dan Kakao Spesialti', 'Agronomi', 'matkul', 30),
('Budidaya Tebu & Bioetanol', 'Agronomi', 'matkul', 30),
('Manajemen Pasca Panen Perkebunan', 'Agronomi', 'matkul', 30),
('Sistem Informasi Geografis Pertanian', 'Teknologi', 'matkul', 30),
('Pertanian Presisi Berbasis IoT & Drone', 'Teknologi', 'matkul', 30),
('Klimatologi Pertanian & Perubahan Iklim', 'Lingkungan', 'matkul', 30),
('Ekologi Lanskap Perkebunan', 'Lingkungan', 'matkul', 30),
('Rantai Pasok Agribisnis Komoditas', 'Sosial Ekonomi', 'matkul', 30),
('Pemasaran Digital Produk Perkebunan', 'Sosial Ekonomi', 'matkul', 30),
('Kewirausahaan Berbasis Agroteknologi', 'Sosial Ekonomi', 'matkul', 30),
('Sertifikasi & Standarisasi Sawit (ISPO/RSPO)', 'Kebijakan', 'matkul', 30),
('Hukum Agraria & Konflik Perkebunan', 'Kebijakan', 'matkul', 30),
('Analisis Kebijakan Komoditas Perkebunan', 'Kebijakan', 'matkul', 30),
('Manajemen Sumber Daya Manusia Kebun', 'Manajemen', 'matkul', 30),
('Sistem Manajemen Mutu Perkebunan', 'Manajemen', 'matkul', 30),
('Pengelolaan Limbah Industri Kelapa Sawit', 'Lingkungan', 'matkul', 30),
('Energi Terbarukan Berbasis Biomassa Kebun', 'Teknologi', 'matkul', 30),
('Proyek Mandiri Inovasi Agroteknologi', 'Proyek Terapan', 'proyek', 150)
ON CONFLICT DO NOTHING;

-- ----------------------------------------------------------------------------
-- 3. FUNGSI LOGIKA BISNIS (SECURITY DEFINER RPC)
-- ----------------------------------------------------------------------------

-- ==============================================================================
-- PATCH 10: SECURITY HARDENING & CONCURRENCY RACE CONDITION PREVENTION
-- ==============================================================================

-- 1. HARDENING is_admin(): HANYA mencocokkan email lengkap yang terdaftar
-- Mencegah penyerang dengan email berawalan admin@domain-lain mendapatkan hak admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- 2. HARDENING cek_nim()
CREATE OR REPLACE FUNCTION public.cek_nim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_student RECORD;
    v_sudah_daftar BOOLEAN;
    v_nama_parts TEXT[];
    v_samar TEXT := '';
    v_part TEXT;
    v_idx INT;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar di sistem.');
    END IF;

    SELECT EXISTS (
        SELECT 1 FROM public.registrations WHERE nim = v_student.nim
    ) INTO v_sudah_daftar;

    -- Mengembalikan nama asli lengkap tanpa sensor/masking bintang
    RETURN jsonb_build_object(
        'ok', true,
        'nim', v_student.nim,
        'nama', v_student.nama,
        'nama_samar', v_student.nama,
        'kelas', COALESCE(v_student.kelas, '-'),
        'sudah_daftar', v_sudah_daftar
    );
END;
$$;

-- 3. HARDENING join_queue()
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
    SELECT * INTO v_settings FROM public.settings WHERE id = 1 FOR UPDATE;
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

-- 4. HARDENING queue_status()
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

    IF v_state = 'active' THEN
        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_state := 'expired';
        END IF;
    ELSIF v_state = 'waiting' THEN
        -- Promosikan antrian teratas jika ada slot active yang kosong
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_max_active THEN
            -- Ambil nomor antrian waiting paling awal dengan SKIP LOCKED untuk mencegah race condition
            SELECT token INTO v_next_token 
            FROM public.queue 
            WHERE state = 'waiting' 
            ORDER BY nomor ASC 
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF v_next_token = p_token THEN
                UPDATE public.queue
                SET state = 'active', 
                    activated_at = v_now, 
                    expires_at = v_now + (v_session_min || ' minutes')::interval
                WHERE token = p_token;
                
                v_state := 'active';
                v_sisa_detik := v_session_min * 60;
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
        'sisa_detik', v_sisa_detik
    );
END;
$$;

-- 5. HARDENING list_offerings()
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
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
    END IF;

    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim) AND state = 'active' AND expires_at >= now();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
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
        'sisa_detik', GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - now()))::INT)
    );
END;
$$;

-- 6. HARDENING daftar(): PENGUNCIAN EKSKLUSIF (FOR UPDATE) PADA MAHASISWA & SESI
-- Mencegah 100% peluang pendaftaran ganda dari pengiriman paralel simultan
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_off_id INT;
    v_matkul_count INT := 0;
    v_proyek_count INT := 0;
    v_nama_arr TEXT[] := ARRAY[]::TEXT[];
    v_current_terisi INT;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
    END IF;

    -- 1. Kunci baris mahasiswa eksklusif (mencegah pendaftaran ganda dari NIM yang sama)
    SELECT * INTO v_student FROM public.students 
    WHERE nim = trim(p_nim) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    -- 2. Kunci baris sesi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = v_student.nim AND state = 'active' AND expires_at >= now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- 3. Validasi komposisi jumlah pilihan
    IF p_offering_ids IS NULL OR array_length(p_offering_ids, 1) <> (v_settings.need_matkul + v_settings.need_proyek) THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Jumlah pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- 4. KUNCI BARIS OFFERINGS TERPISAH SECARA DETERMINISTIK (urut ID ASC)
    -- Ini menjamin transaksi konkuren pada offering yang sama mengantri di sini.
    -- Ketika transaksi unblock, statement baru di bawah akan melihat data snapshot terbaru (Read Committed)
    -- yang sudah dicommit oleh pendaftar sebelumnya.
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    -- 5. Periksa kuota dan aturan bisnis pada snapshot segar setelah kunci dipegang
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        -- Hitung pendaftar terisi terkini secara presisi dari registrations
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Kuota untuk mata kuliah "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih kelas atau mata kuliah lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota)
            );
        END IF;

        IF v_off.jenis = 'matkul' THEN
            v_matkul_count := v_matkul_count + 1;
        ELSIF v_off.jenis = 'proyek' THEN
            v_proyek_count := v_proyek_count + 1;
        END IF;

        -- Validasi: Mahasiswa tidak boleh memilih mata kuliah dengan NAMA yang sama dua kali (di kelas berbeda)
        IF v_off.nama = ANY(v_nama_arr) THEN
            RETURN jsonb_build_object('ok', false, 'error', format('Mata kuliah "%s" dipilih lebih dari satu kali.', v_off.nama));
        END IF;
        v_nama_arr := array_append(v_nama_arr, v_off.nama);

        -- Cek bentrok dengan jadwal kelas tetap mahasiswa
        IF v_student.kelas IS NOT NULL AND trim(v_student.kelas) <> '' THEN
            IF EXISTS (
                SELECT 1
                FROM public.schedules s
                JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                WHERE s.offering_id = v_off.id
                  AND lower(trim(s.hari)) = lower(trim(cs.hari))
                  AND s.jam_mulai < cs.jam_selesai
                  AND cs.jam_mulai < s.jam_selesai
            ) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s (Kelas %s) bentrok dengan jadwal kelas tetap Anda.', v_off.nama, COALESCE(v_off.kelas, 'A')));
            END IF;
        END IF;
    END LOOP;

    IF v_matkul_count <> v_settings.need_matkul OR v_proyek_count <> v_settings.need_proyek THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Komposisi pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- Cek bentrok jadwal antar mata kuliah pilihan yang dipilih
    IF EXISTS (
        SELECT 1
        FROM public.schedules s1
        JOIN public.schedules s2 ON s1.id <> s2.id AND s1.offering_id <> s2.offering_id
        WHERE s1.offering_id = ANY(p_offering_ids)
          AND s2.offering_id = ANY(p_offering_ids)
          AND lower(trim(s1.hari)) = lower(trim(s2.hari))
          AND s1.jam_mulai < s2.jam_selesai
          AND s2.jam_mulai < s1.jam_selesai
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat bentrok jadwal antar mata kuliah pilihan yang Anda pilih.');
    END IF;

    -- 6. Simpan pendaftaran secara atomik
    UPDATE public.students 
    SET registered_at = now() 
    WHERE nim = v_student.nim AND registered_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    FOREACH v_off_id IN ARRAY p_offering_ids LOOP
        INSERT INTO public.registrations (nim, offering_id)
        VALUES (v_student.nim, v_off_id);
    END LOOP;

    UPDATE public.queue SET state = 'done' WHERE token = p_token;

    RETURN jsonb_build_object('ok', true, 'message', 'Pendaftaran berhasil disimpan.');
END;
$$;

-- 7. HARDENING hasil_saya()
CREATE OR REPLACE FUNCTION public.hasil_saya(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_student RECORD;
    v_reg RECORD;
    v_pilihan JSONB;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM public.queue
        WHERE nim = v_student.nim AND token = p_token
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi tidak valid.');
    END IF;

    SELECT created_at INTO v_reg FROM public.registrations WHERE nim = v_student.nim ORDER BY id ASC LIMIT 1;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda belum menyelesaikan pendaftaran.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'topik', COALESCE(o.topik, ''),
            'jadwal', COALESCE(sched.arr, '[]'::JSONB)
        )
    ) INTO v_pilihan
    FROM public.registrations r
    JOIN public.offerings o ON o.id = r.offering_id
    LEFT JOIN (
        SELECT s.offering_id, jsonb_agg(
            jsonb_build_object(
                'hari', s.hari,
                'jam_mulai', to_char(s.jam_mulai, 'HH24:MI:SS'),
                'jam_selesai', to_char(s.jam_selesai, 'HH24:MI:SS'),
                'ruang', s.ruang
            ) ORDER BY s.hari, s.jam_mulai
        ) AS arr
        FROM public.schedules s
        GROUP BY s.offering_id
    ) sched ON sched.offering_id = o.id
    WHERE r.nim = v_student.nim;

    RETURN jsonb_build_object(
        'ok', true,
        'mahasiswa', jsonb_build_object(
            'nim', v_student.nim,
            'nama', v_student.nama,
            'kelas', v_student.kelas
        ),
        'pendaftaran', jsonb_build_object(
            'waktu_daftar', to_char(v_reg.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'pilihan', COALESCE(v_pilihan, '[]'::JSONB)
        )
    );
END;
$$;

-- 8. HARDENING daftar_kelas()
CREATE OR REPLACE FUNCTION public.daftar_kelas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_res JSONB;
BEGIN
    SELECT jsonb_agg(k.kelas ORDER BY k.kelas)
    INTO v_res
    FROM (
        SELECT DISTINCT kelas FROM public.students WHERE kelas IS NOT NULL AND trim(kelas) <> ''
        UNION
        SELECT DISTINCT kelas FROM public.class_schedules WHERE kelas IS NOT NULL AND trim(kelas) <> ''
    ) k;

    RETURN COALESCE(v_res, '[]'::JSONB);
END;
$$;

-- 9. HARDENING ajukan_akses()
-- 9. HARDENING ajukan_akses(): MENYIMPAN KE KOLOM CATATAN (4 & 5 PARAMETER)
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
DECLARE
    v_nim TEXT := trim(p_nim);
    v_nama TEXT := trim(p_nama);
    v_kelas TEXT := trim(p_kelas);
    v_catatan TEXT := trim(p_catatan);
    v_id INT;
BEGIN
    IF v_nim = '' OR length(v_nim) < 5 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi dengan benar.');
    END IF;

    IF v_nama = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nama lengkap wajib diisi.');
    END IF;

    IF v_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Catatan / alasan pengajuan wajib diisi.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.access_requests
        WHERE nim = v_nim AND status = 'pending'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah memiliki pengajuan akses yang sedang menunggu verifikasi admin.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.students WHERE nim = v_nim
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM Anda sudah terdaftar di sistem. Silakan login langsung.');
    END IF;

    INSERT INTO public.access_requests (nim, nama, kelas, catatan, status)
    VALUES (v_nim, v_nama, NULLIF(v_kelas, ''), v_catatan, 'pending')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan akses berhasil dikirim.', 'id', v_id);
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
    v_gabungan := CASE 
        WHEN NULLIF(trim(p_kontak), '') IS NOT NULL THEN trim(p_alasan) || ' (Kontak: ' || trim(p_kontak) || ')'
        ELSE trim(p_alasan)
    END;
    RETURN public.ajukan_akses(p_nim, p_nama, p_kelas, v_gabungan);
END;
$$;

-- 10. HARDENING admin_status()
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
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    SELECT count(*) INTO v_total_students FROM public.students;
    SELECT count(DISTINCT nim) INTO v_sudah_daftar FROM public.registrations;
    SELECT count(*) INTO v_active_queue FROM public.queue WHERE state = 'active' AND expires_at >= now();
    SELECT count(*) INTO v_waiting_queue FROM public.queue WHERE state = 'waiting';

    RETURN jsonb_build_object(
        'ok', true,
        'portal_open', v_settings.portal_open,
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

-- 11. HARDENING admin_toggle_portal()
CREATE OR REPLACE FUNCTION public.admin_toggle_portal(p_buka BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    UPDATE public.settings
    SET portal_open = p_buka
    WHERE id = 1;

    RETURN jsonb_build_object('ok', true, 'portal_open', p_buka);
END;
$$;

-- 12. HARDENING admin_list_offerings()
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
            'topik', COALESCE(o.topik, ''),
            'jenis', o.jenis,
            'kuota', o.kuota,
            'terisi', COALESCE(r.cnt, 0),
            'jadwal', COALESCE(sched.arr, '[]'::JSONB)
        ) ORDER BY o.jenis, o.nama
    ) INTO v_offerings
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

    RETURN jsonb_build_object('ok', true, 'offerings', COALESCE(v_offerings, '[]'::JSONB));
END;
$$;

-- 13. HARDENING admin_upsert_offering()
CREATE OR REPLACE FUNCTION public.admin_upsert_offering(
    p_id INT,
    p_nama TEXT,
    p_topik TEXT,
    p_jenis TEXT,
    p_kuota INT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_res_id INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF p_jenis NOT IN ('matkul', 'proyek') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Jenis harus "matkul" atau "proyek".');
    END IF;

    IF p_kuota <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Kuota harus lebih besar dari 0.');
    END IF;

    IF p_id IS NULL OR p_id = 0 THEN
        INSERT INTO public.offerings (nama, topik, jenis, kuota)
        VALUES (trim(p_nama), NULLIF(trim(p_topik), ''), p_jenis, p_kuota)
        RETURNING id INTO v_res_id;
    ELSE
        UPDATE public.offerings
        SET nama = trim(p_nama),
            topik = NULLIF(trim(p_topik), ''),
            jenis = p_jenis,
            kuota = p_kuota
        WHERE id = p_id
        RETURNING id INTO v_res_id;

        IF NOT FOUND THEN
            RETURN jsonb_build_object('ok', false, 'error', 'Mata kuliah pilihan tidak ditemukan.');
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'id', v_res_id);
END;
$$;

-- 14. HARDENING admin_delete_offering()
CREATE OR REPLACE FUNCTION public.admin_delete_offering(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF EXISTS (SELECT 1 FROM public.registrations WHERE offering_id = p_id) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Tidak dapat menghapus pilihan yang sudah memiliki pendaftar.');
    END IF;

    DELETE FROM public.schedules WHERE offering_id = p_id;
    DELETE FROM public.offerings WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pilihan berhasil dihapus.');
END;
$$;

-- 15. HARDENING admin_tambah_jadwal()
CREATE OR REPLACE FUNCTION public.admin_tambah_jadwal(
    p_offering_id INT,
    p_hari TEXT,
    p_jam_mulai TEXT,
    p_jam_selesai TEXT,
    p_ruang TEXT DEFAULT ''
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_id INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang)
    VALUES (p_offering_id, trim(p_hari), p_jam_mulai::TIME, p_jam_selesai::TIME, NULLIF(trim(p_ruang), ''))
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- 16. HARDENING admin_hapus_jadwal()
CREATE OR REPLACE FUNCTION public.admin_hapus_jadwal(p_schedule_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    DELETE FROM public.schedules WHERE id = p_schedule_id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

-- 17. HARDENING admin_import_offerings()
CREATE OR REPLACE FUNCTION public.admin_import_offerings(p_offerings JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item JSONB;
    v_inserted INT := 0;
    v_updated INT := 0;
    v_off_id INT;
    v_kuota INT;
    v_jenis TEXT;
    v_sched JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_offerings) LOOP
        v_kuota := COALESCE((v_item->>'kuota')::INT, 30);
        v_jenis := LOWER(COALESCE(v_item->>'jenis', 'matkul'));
        IF v_jenis NOT IN ('matkul', 'proyek') THEN
            v_jenis := 'matkul';
        END IF;

        SELECT id INTO v_off_id FROM public.offerings
        WHERE lower(trim(nama)) = lower(trim(v_item->>'nama'));

        IF FOUND THEN
            UPDATE public.offerings
            SET topik = NULLIF(trim(v_item->>'topik'), ''),
                jenis = v_jenis,
                kuota = v_kuota
            WHERE id = v_off_id;
            v_updated := v_updated + 1;
        ELSE
            INSERT INTO public.offerings (nama, topik, jenis, kuota)
            VALUES (trim(v_item->>'nama'), NULLIF(trim(v_item->>'topik'), ''), v_jenis, v_kuota)
            RETURNING id INTO v_off_id;
            v_inserted := v_inserted + 1;
        END IF;

        IF v_item ? 'jadwal' AND jsonb_typeof(v_item->'jadwal') = 'array' THEN
            DELETE FROM public.schedules WHERE offering_id = v_off_id;
            FOR v_sched IN SELECT * FROM jsonb_array_elements(v_item->'jadwal') LOOP
                INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang)
                VALUES (
                    v_off_id,
                    trim(v_sched->>'hari'),
                    (v_sched->>'jam_mulai')::TIME,
                    (v_sched->>'jam_selesai')::TIME,
                    NULLIF(trim(v_sched->>'ruang'), '')
                );
            END LOOP;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated);
END;
$$;

-- 18. HARDENING admin_update_kuota()
CREATE OR REPLACE FUNCTION public.admin_update_kuota(p_offering_id INT, p_kuota INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF p_kuota <= 0 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Kuota harus lebih besar dari 0.');
    END IF;

    UPDATE public.offerings SET kuota = p_kuota WHERE id = p_offering_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pilihan tidak ditemukan.');
    END IF;

    RETURN jsonb_build_object('ok', true, 'kuota', p_kuota);
END;
$$;

-- 19. HARDENING admin_batal_daftar()
CREATE OR REPLACE FUNCTION public.admin_batal_daftar(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nim TEXT := trim(p_nim);
    v_count INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    DELETE FROM public.registrations WHERE nim = v_nim;
    GET DIAGNOSTICS v_count = ROW_COUNT;

    UPDATE public.students SET registered_at = NULL WHERE nim = v_nim;
    DELETE FROM public.queue WHERE nim = v_nim;

    RETURN jsonb_build_object('ok', true, 'deleted_rows', v_count);
END;
$$;

-- 20. HARDENING admin_export_pendaftaran()
CREATE OR REPLACE FUNCTION public.admin_export_pendaftaran()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_data JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'nim', s.nim,
            'nama', s.nama,
            'kelas', COALESCE(s.kelas, '-'),
            'offering_id', o.id,
            'nama_pilihan', o.nama,
            'jenis', o.jenis,
            'topik', COALESCE(o.topik, '-'),
            'waktu_daftar', to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
        ) ORDER BY r.created_at ASC, s.nim ASC
    ) INTO v_data
    FROM public.registrations r
    JOIN public.students s ON s.nim = r.nim
    JOIN public.offerings o ON o.id = r.offering_id;

    RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_data, '[]'::JSONB));
END;
$$;

-- 21. HARDENING admin_import_students()
CREATE OR REPLACE FUNCTION public.admin_import_students(p_students JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_item JSONB;
    v_inserted INT := 0;
    v_updated INT := 0;
    v_nim TEXT;
    v_nama TEXT;
    v_kelas TEXT;
    v_pin TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_students) LOOP
        v_nim := trim(v_item->>'nim');
        v_nama := trim(v_item->>'nama');
        v_kelas := NULLIF(trim(v_item->>'kelas'), '');
        v_pin := COALESCE(NULLIF(trim(v_item->>'pin'), ''), right(v_nim, 4));

        CONTINUE WHEN v_nim = '' OR v_nama = '';

        IF EXISTS (SELECT 1 FROM public.students WHERE nim = v_nim) THEN
            UPDATE public.students
            SET nama = v_nama,
                kelas = COALESCE(v_kelas, kelas),
                pin_hash = encode(digest(v_pin, 'sha256'), 'hex')
            WHERE nim = v_nim;
            v_updated := v_updated + 1;
        ELSE
            INSERT INTO public.students (nim, nama, kelas, pin_hash)
            VALUES (v_nim, v_nama, v_kelas, encode(digest(v_pin, 'sha256'), 'hex'));
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated);
END;
$$;

-- 22. HARDENING admin_import_jadwal_kelas()
CREATE OR REPLACE FUNCTION public.admin_import_jadwal_kelas(p_jadwal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item JSONB;
    v_inserted INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_jadwal) LOOP
        CONTINUE WHEN v_item->>'kelas' IS NULL OR trim(v_item->>'kelas') = '';

        INSERT INTO public.class_schedules (kelas, nama_matkul, hari, jam_mulai, jam_selesai, ruang)
        VALUES (
            trim(v_item->>'kelas'),
            trim(v_item->>'nama_matkul'),
            trim(v_item->>'hari'),
            (v_item->>'jam_mulai')::TIME,
            (v_item->>'jam_selesai')::TIME,
            NULLIF(trim(v_item->>'ruang'), '')
        );
        v_inserted := v_inserted + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

-- 23. HARDENING admin_import_jadwal_pilihan()
CREATE OR REPLACE FUNCTION public.admin_import_jadwal_pilihan(p_jadwal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_item JSONB;
    v_inserted INT := 0;
    v_off_id INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_jadwal) LOOP
        SELECT id INTO v_off_id FROM public.offerings
        WHERE lower(trim(nama)) = lower(trim(v_item->>'nama_pilihan'));

        IF FOUND THEN
            INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang)
            VALUES (
                v_off_id,
                trim(v_item->>'hari'),
                (v_item->>'jam_mulai')::TIME,
                (v_item->>'jam_selesai')::TIME,
                NULLIF(trim(v_item->>'ruang'), '')
            );
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'inserted', v_inserted);
END;
$$;

-- 24. HARDENING admin_list_pengajuan()
CREATE OR REPLACE FUNCTION public.admin_list_pengajuan()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_data JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'nim', nim,
            'nama', nama,
            'kelas', COALESCE(kelas, '-'),
            'alasan', alasan,
            'kontak', COALESCE(kontak, '-'),
            'status', status,
            'created_at', to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
        ) ORDER BY created_at DESC
    ) INTO v_data
    FROM public.access_requests;

    RETURN jsonb_build_object('ok', true, 'pengajuan', COALESCE(v_data, '[]'::JSONB));
END;
$$;

-- 25. HARDENING admin_setujui_pengajuan()
CREATE OR REPLACE FUNCTION public.admin_setujui_pengajuan(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_pin TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT * INTO v_req FROM public.access_requests WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan tidak ditemukan.');
    END IF;

    IF v_req.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan sudah diproses sebelumnya.');
    END IF;

    v_pin := right(v_req.nim, 4);
    INSERT INTO public.students (nim, nama, kelas, pin_hash)
    VALUES (v_req.nim, v_req.nama, v_req.kelas, encode(digest(v_pin, 'sha256'), 'hex'))
    ON CONFLICT (nim) DO UPDATE
    SET nama = EXCLUDED.nama,
        kelas = COALESCE(EXCLUDED.kelas, students.kelas);

    UPDATE public.access_requests
    SET status = 'approved', updated_at = now()
    WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan disetujui dan mahasiswa berhasil didaftarkan.');
END;
$$;

-- 26. HARDENING admin_list_pendaftar()
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
            'registered_at', to_char(s.registered_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'pilihan', COALESCE(p.arr, '[]'::JSONB)
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

    RETURN jsonb_build_object('ok', true, 'pendaftar', COALESCE(v_pendaftar, '[]'::JSONB));
END;
$$;

-- 27. HARDENING admin_reset_data_uji():
-- Syaratkan Portal TUTUP, butuh kode konfirmasi "RESET-DATA-UJI-SEKARANG",
-- dan batasi penghapusan mahasiswa HANYA pada pola NIM dummy
CREATE OR REPLACE FUNCTION public.admin_reset_data_uji(p_confirm_code TEXT DEFAULT '')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_settings RECORD;
    v_deleted_reg INT;
    v_deleted_queue INT;
    v_deleted_req INT;
    v_deleted_students INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Gagal: Portal harus dalam status TUTUP sebelum melakukan reset data uji.');
    END IF;

    IF p_confirm_code <> 'RESET-DATA-UJI-SEKARANG' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Kode konfirmasi salah. Masukkan "RESET-DATA-UJI-SEKARANG" untuk melanjutkan.');
    END IF;

    -- 1. Hapus seluruh data pendaftaran pemilihan uji coba
    WITH del_reg AS (
        DELETE FROM public.registrations RETURNING 1
    )
    SELECT count(*) INTO v_deleted_reg FROM del_reg;

    -- 2. Hapus seluruh antrian dan token sesi uji coba
    WITH del_q AS (
        DELETE FROM public.queue RETURNING 1
    )
    SELECT count(*) INTO v_deleted_queue FROM del_q;

    -- 3. Hapus seluruh pengajuan akses uji coba
    WITH del_req AS (
        DELETE FROM public.access_requests RETURNING 1
    )
    SELECT count(*) INTO v_deleted_req FROM del_req;

    -- 4. Hapus mahasiswa dummy uji coba HANYA berdasarkan pola NIM (tanpa wildcard nama)
    WITH del_stud AS (
        DELETE FROM public.students
        WHERE nim ~ '^21102110[0-9]{2}$'
           OR nim LIKE 'DUMMY%'
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted_students FROM del_stud;

    -- Reset status registered_at untuk data mahasiswa asli yang tersisa
    UPDATE public.students SET registered_at = NULL WHERE registered_at IS NOT NULL;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Data uji coba berhasil dibersihkan dengan sukses.',
        'pendaftaran_dihapus', v_deleted_reg,
        'antrian_dihapus', v_deleted_queue,
        'pengajuan_dihapus', v_deleted_req,
        'mahasiswa_dummy_dihapus', v_deleted_students
    );
END;
$$;

-- ==============================================================================
-- REVOKE DEFAULT PERMISSIONS & EXPLICIT LEAST-PRIVILEGE GRANTS
-- ==============================================================================

-- Cabut semua izin eksekusi bawaan
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;

-- Berikan izin HANYA untuk fungsi publik mahasiswa kepada anon dan authenticated
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_offerings(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daftar_kelas() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hasil_saya(TEXT, TEXT) TO anon, authenticated;

-- Berikan izin fungsi admin HANYA kepada role authenticated (dan divalidasi oleh is_admin())
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_portal(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_offerings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_upsert_offering(INT, TEXT, TEXT, TEXT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_offering(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tambah_jadwal(INT, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hapus_jadwal(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_offerings(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_kuota(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_batal_daftar(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_pendaftaran() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_students(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_jadwal_kelas(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_jadwal_pilihan(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pengajuan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_setujui_pengajuan(INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pendaftar() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reset_data_uji(TEXT) TO authenticated;

-- ==============================================================================
-- PATCH 12: Pengelolaan & Edit Data Master Mahasiswa di Panel Admin
-- ==============================================================================

-- 1. Hapus fungsi lama terlebih dahulu agar tidak terjadi konflik tipe kembalian
DROP FUNCTION IF EXISTS public.admin_list_students();
DROP FUNCTION IF EXISTS public.admin_update_student(VARCHAR, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS public.admin_update_student(TEXT, TEXT, TEXT);
DROP FUNCTION IF EXISTS public.admin_delete_student(VARCHAR);
DROP FUNCTION IF EXISTS public.admin_delete_student(TEXT);

-- 2. Fungsi RPC untuk menampilkan daftar master mahasiswa bagi Admin (Tipe TEXT konsisten)
CREATE OR REPLACE FUNCTION public.admin_list_students()
RETURNS TABLE(
    nim TEXT,
    nama TEXT,
    kelas TEXT,
    registered_at TIMESTAMPTZ,
    has_registered BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    RETURN QUERY
    SELECT 
        s.nim::TEXT,
        s.nama::TEXT,
        COALESCE(s.kelas, '-')::TEXT AS kelas,
        s.registered_at,
        (s.registered_at IS NOT NULL) AS has_registered
    FROM public.students s
    ORDER BY s.nim ASC;
END;
$$;

-- 3. Fungsi RPC untuk memperbarui data mahasiswa (Nama & Kelas)
CREATE OR REPLACE FUNCTION public.admin_update_student(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(p_nim);
    v_clean_nama TEXT := trim(p_nama);
    v_clean_kelas TEXT := NULLIF(trim(p_kelas), '');
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    IF v_clean_nim = '' OR v_clean_nama = '' THEN
        RAISE EXCEPTION 'NIM dan Nama Mahasiswa tidak boleh kosong.';
    END IF;

    UPDATE public.students
    SET 
        nama = v_clean_nama,
        kelas = v_clean_kelas
    WHERE nim = v_clean_nim;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mahasiswa dengan NIM % tidak ditemukan.', v_clean_nim;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Data mahasiswa %s (%s) berhasil diperbarui.', v_clean_nama, v_clean_nim)
    );
END;
$$;

-- 4. Fungsi RPC untuk menghapus data master mahasiswa
CREATE OR REPLACE FUNCTION public.admin_delete_student(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(p_nim);
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    -- Jika mahasiswa sudah memilih mata kuliah, batalkan terlebih dahulu agar kuota kelas kembali
    IF EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_clean_nim) THEN
        PERFORM public.admin_batal_daftar(v_clean_nim);
    END IF;

    -- Bersihkan antrian
    DELETE FROM public.queue WHERE nim = v_clean_nim;

    -- Hapus dari master students
    DELETE FROM public.students WHERE nim = v_clean_nim;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Mahasiswa dengan NIM % tidak ditemukan.', v_clean_nim;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Mahasiswa dengan NIM %s berhasil dihapus dari sistem.', v_clean_nim)
    );
END;
$$;

-- Hak Akses (Security Definier hanya untuk authenticated admin)
GRANT EXECUTE ON FUNCTION public.admin_list_students() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_student(TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_student(TEXT) TO authenticated;

-- ==============================================================================
-- PATCH 13: Kanal Pelaporan Kendala Mahasiswa & Tab Admin Reset KRS
-- ==============================================================================

-- 1. Buat tabel student_complaints
CREATE TABLE IF NOT EXISTS public.student_complaints (
    id SERIAL PRIMARY KEY,
    nim VARCHAR(20) NOT NULL,
    nama VARCHAR(100),
    kelas VARCHAR(50),
    kategori VARCHAR(50) NOT NULL DEFAULT 'salah_pilih',
    alasan TEXT NOT NULL,
    kontak VARCHAR(50) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'resolved', 'rejected'
    catatan_admin TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_student_complaints_nim ON public.student_complaints(nim);
CREATE INDEX IF NOT EXISTS idx_student_complaints_status ON public.student_complaints(status);

ALTER TABLE public.student_complaints ENABLE ROW LEVEL SECURITY;

-- 2. Fungsi RPC untuk mahasiswa mengirim laporan kendala (Akses role anon & authenticated)
CREATE OR REPLACE FUNCTION public.lapor_kendala_mahasiswa(
    p_nim TEXT,
    p_nama TEXT,
    p_kategori TEXT,
    p_alasan TEXT,
    p_kontak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(20) := trim(p_nim);
    v_clean_nama VARCHAR(100) := trim(p_nama);
    v_clean_kategori VARCHAR(50) := COALESCE(NULLIF(trim(p_kategori), ''), 'salah_pilih');
    v_clean_alasan TEXT := trim(p_alasan);
    v_clean_kontak VARCHAR(50) := trim(p_kontak);
    v_student RECORD;
    v_id INT;
BEGIN
    IF v_clean_nim = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi.');
    END IF;

    IF v_clean_alasan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Alasan kendala wajib diisi.');
    END IF;

    IF v_clean_kontak = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nomor kontak WhatsApp/telepon wajib diisi.');
    END IF;

    -- Periksa apakah mahasiswa terdaftar di master students
    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar di sistem.');
    END IF;

    IF v_clean_nama = '' THEN
        v_clean_nama := v_student.nama;
    END IF;

    -- Cegah spam laporan pending ganda untuk NIM yang sama
    IF EXISTS (
        SELECT 1 FROM public.student_complaints 
        WHERE nim = v_clean_nim AND status = 'pending'
    ) THEN
        RETURN jsonb_build_object(
            'ok', false, 
            'error', 'Laporan Anda sebelumnya masih berstatus menunggu verifikasi admin. Mohon tunggu tanggapan admin.'
        );
    END IF;

    -- Masukkan laporan kendala
    INSERT INTO public.student_complaints (
        nim, nama, kelas, kategori, alasan, kontak, status
    ) VALUES (
        v_clean_nim,
        v_clean_nama,
        COALESCE(v_student.kelas, '-'),
        v_clean_kategori,
        v_clean_alasan,
        v_clean_kontak,
        'pending'
    ) RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Laporan kendala berhasil dikirimkan ke Admin. Tim akademik akan segera memverifikasi laporan Anda.',
        'id', v_id
    );
END;
$$;

-- 3. Fungsi RPC untuk Admin melihat seluruh laporan pengaduan
CREATE OR REPLACE FUNCTION public.admin_list_complaints()
RETURNS TABLE (
    id INT,
    nim VARCHAR(20),
    nama VARCHAR(100),
    kelas VARCHAR(50),
    kategori VARCHAR(50),
    alasan TEXT,
    kontak VARCHAR(50),
    status VARCHAR(20),
    catatan_admin TEXT,
    created_at TIMESTAMPTZ,
    resolved_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    RETURN QUERY
    SELECT 
        c.id,
        c.nim,
        c.nama,
        COALESCE(c.kelas, '-') AS kelas,
        c.kategori,
        c.alasan,
        c.kontak,
        c.status,
        c.catatan_admin,
        c.created_at,
        c.resolved_at
    FROM public.student_complaints c
    ORDER BY 
        CASE WHEN c.status = 'pending' THEN 0 ELSE 1 END,
        c.created_at DESC;
END;
$$;

-- 4. Fungsi RPC untuk Admin menyelesaikan / menolak laporan kendala
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
BEGIN
    IF NOT public.is_admin() THEN
        RAISE EXCEPTION 'Akses ditolak: Hanya untuk administrator';
    END IF;

    SELECT * INTO v_complaint FROM public.student_complaints WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data laporan tidak ditemukan.');
    END IF;

    IF p_action = 'reset_and_batal' THEN
        -- Batalkan pendaftaran mahasiswa bersangkutan agar kuota kembali dan mahasiswa bisa memilih ulang
        IF EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_complaint.nim) THEN
            PERFORM public.admin_batal_daftar(v_complaint.nim);
        END IF;

        -- Bersihkan antrian jika ada
        DELETE FROM public.queue WHERE nim = v_complaint.nim;

        -- Tandai laporan selesai
        UPDATE public.student_complaints
        SET 
            status = 'resolved',
            catatan_admin = COALESCE(p_catatan, 'Pendaftaran berhasil direset oleh admin.'),
            resolved_at = now()
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'ok', true,
            'message', format('Pendaftaran mahasiswa %s (%s) berhasil dibatalkan dan kuota telah dikembalikan.', v_complaint.nama, v_complaint.nim)
        );
    ELSIF p_action = 'reject' THEN
        UPDATE public.student_complaints
        SET 
            status = 'rejected',
            catatan_admin = COALESCE(p_catatan, 'Laporan kendala ditolak.'),
            resolved_at = now()
        WHERE id = p_id;

        RETURN jsonb_build_object(
            'ok', true,
            'message', format('Laporan untuk mahasiswa %s (%s) telah ditandai ditolak.', v_complaint.nama, v_complaint.nim)
        );
    ELSE
        RETURN jsonb_build_object('ok', false, 'error', 'Aksi tidak valid. Gunakan reset_and_batal atau reject.');
    END IF;
END;
$$;

-- Berikan izin eksekusi eksplisit
GRANT EXECUTE ON FUNCTION public.lapor_kendala_mahasiswa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_complaints() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_resolve_complaint(INT, TEXT, TEXT) TO authenticated;

-- ==============================================================================
-- 10. PELEPASAN SESI AKTIF & PEMBERSIHAN SESI MENGGANTUNG (PATCH 21)
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.batal_sesi_antrian(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_next_token TEXT;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
    v_cur_state TEXT;
BEGIN
    SELECT state INTO v_cur_state
    FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', true, 'message', 'Sesi tidak ditemukan.');
    END IF;

    -- Ubah status sesi menjadi expired seketika
    UPDATE public.queue
    SET state = 'expired'
    WHERE token = p_token AND nim = trim(p_nim) AND state IN ('active', 'waiting', 'menunggu_undian');

    -- Jika yang keluar berstatus active, segera promosikan mahasiswa di antrian waiting teratas
    IF v_cur_state = 'active' THEN
        SELECT max_active, session_duration_minutes INTO v_max_active, v_session_min FROM public.settings WHERE id = 1;

        SELECT token INTO v_next_token 
        FROM public.queue 
        WHERE state = 'waiting' 
        ORDER BY nomor ASC 
        LIMIT 1 
        FOR UPDATE SKIP LOCKED;

        IF v_next_token IS NOT NULL THEN
            UPDATE public.queue
            SET state = 'active', 
                activated_at = v_now, 
                expires_at = v_now + (v_session_min || ' minutes')::interval
            WHERE token = v_next_token;
        END IF;
    END IF;

    RETURN jsonb_build_object('ok', true, 'message', 'Sesi pemilihan berhasil dilepaskan.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.batal_sesi_antrian(TEXT, TEXT) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.admin_sapu_sesi()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    -- Bersihkan semua sesi aktif yang sudah lewat masa berlaku
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    GET DIAGNOSTICS v_cleaned = ROW_COUNT;

    RETURN jsonb_build_object(
        'ok', true, 
        'message', format('%s sesi menggantung berhasil dibersihkan.', v_cleaned),
        'cleaned', v_cleaned
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sapu_sesi() TO authenticated;

-- ==============================================================================
-- PATCH 22: TRIGGER DINAMIS ANTRIAN (5 MENIT SAAT ANTRIAN AKTIF)
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
    v_cooldown_seconds INT := 120;
    v_sisa_cooldown INT := 0;
    v_allocated_minutes INT := 15;
BEGIN
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

    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT token, state, expires_at, entered_at, nomor
    INTO v_cur_token, v_cur_state, v_cur_expires_at, v_cur_entered_at, v_cur_nomor
    FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    IF FOUND THEN
        IF v_cur_state = 'active' THEN
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

    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT state, nomor, expires_at INTO v_state, v_nomor, v_expires_at
    FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak ditemukan.');
    END IF;

    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    IF v_state = 'active' THEN
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
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_max_active THEN
            SELECT token INTO v_next_token 
            FROM public.queue 
            WHERE state = 'waiting' 
            ORDER BY nomor ASC 
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF v_next_token = p_token THEN
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

    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

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

-- ==============================================================================
-- PATCH 23: BALASAN PESAN ADMIN (PENGAJUAN AKSES & KENDALA) & INDEKS PERFORMA
-- ==============================================================================

ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS catatan_admin TEXT;
ALTER TABLE public.access_requests ADD COLUMN IF NOT EXISTS resolved_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_access_requests_nim ON public.access_requests(nim);
CREATE INDEX IF NOT EXISTS idx_access_requests_nim_status ON public.access_requests(nim, status);

CREATE OR REPLACE FUNCTION public.admin_setujui_pengajuan(
    p_id INT,
    p_catatan TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_pin TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT * INTO v_req FROM public.access_requests WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan tidak ditemukan.');
    END IF;

    IF v_req.status <> 'pending' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan sudah diproses sebelumnya.');
    END IF;

    v_pin := right(v_req.nim, 4);
    INSERT INTO public.students (nim, nama, kelas, pin_hash)
    VALUES (v_req.nim, v_req.nama, v_req.kelas, encode(digest(v_pin, 'sha256'), 'hex'))
    ON CONFLICT (nim) DO UPDATE
    SET nama = EXCLUDED.nama,
        kelas = COALESCE(EXCLUDED.kelas, students.kelas);

    UPDATE public.access_requests
    SET status = 'approved',
        catatan_admin = COALESCE(trim(p_catatan), v_req.catatan_admin, 'Pengajuan disetujui oleh admin.'),
        resolved_at = now()
    WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan disetujui dan mahasiswa berhasil didaftarkan.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_tolak_pengajuan(
    p_id INT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_req RECORD;
    v_clean_catatan TEXT := trim(p_catatan);
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF v_clean_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Alasan penolakan / catatan admin wajib diisi.');
    END IF;

    SELECT * INTO v_req FROM public.access_requests WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan tidak ditemukan.');
    END IF;

    UPDATE public.access_requests
    SET status = 'rejected',
        catatan_admin = v_clean_catatan,
        resolved_at = now()
    WHERE id = p_id;

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Pengajuan akses untuk %s (%s) telah ditolak dengan pesan yang dicatat.', v_req.nama, v_req.nim)
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_balas_pengajuan(
    p_id INT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_catatan TEXT := trim(p_catatan);
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF v_clean_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pesan balasan admin tidak boleh kosong.');
    END IF;

    UPDATE public.access_requests
    SET catatan_admin = v_clean_catatan
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data pengajuan tidak ditemukan.');
    END IF;

    RETURN jsonb_build_object('ok', true, 'message', 'Pesan balasan admin berhasil disimpan.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_balas_kendala(
    p_id INT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_catatan TEXT := trim(p_catatan);
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    IF v_clean_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pesan balasan admin tidak boleh kosong.');
    END IF;

    UPDATE public.student_complaints
    SET catatan_admin = v_clean_catatan
    WHERE id = p_id;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Data pengaduan kendala tidak ditemukan.');
    END IF;

    RETURN jsonb_build_object('ok', true, 'message', 'Pesan balasan kendala berhasil disimpan.');
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_pengajuan()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_data JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', id,
            'nim', nim,
            'nama', nama,
            'kelas', COALESCE(kelas, '-'),
            'alasan', catatan,
            'kontak', COALESCE(substring(catatan from 'Kontak:\s*([^)]+)'), '-'),
            'status', status,
            'catatan_admin', catatan_admin,
            'created_at', to_char(created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'resolved_at', CASE WHEN resolved_at IS NOT NULL THEN to_char(resolved_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS') ELSE NULL END
        ) ORDER BY 
            CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
            created_at DESC
    ) INTO v_data
    FROM public.access_requests;

    RETURN jsonb_build_object('ok', true, 'pengajuan', COALESCE(v_data, '[]'::JSONB));
END;
$$;

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
        'pesan_admin', CASE WHEN v_complaint.id IS NOT NULL THEN NULLIF(trim(v_complaint.catatan_admin), '') ELSE NULL END,
        'alasan_kendala', CASE WHEN v_complaint.id IS NOT NULL THEN v_complaint.alasan ELSE NULL END
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pengajuan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_setujui_pengajuan(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_tolak_pengajuan(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_balas_pengajuan(INT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_balas_kendala(INT, TEXT) TO authenticated;

-- ==============================================================================
-- PATCH 25: JADWAL KULIAH PUBLIK & PROTEKSI LAPOR KENDALA DITOLAK
-- ==============================================================================
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
            'topik', COALESCE(o.topik, ''),
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

CREATE OR REPLACE FUNCTION public.lapor_kendala_mahasiswa(
    p_nim TEXT,
    p_nama TEXT,
    p_kategori TEXT,
    p_alasan TEXT,
    p_kontak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(20) := trim(p_nim);
    v_clean_nama VARCHAR(100) := trim(p_nama);
    v_clean_kategori VARCHAR(50) := COALESCE(NULLIF(trim(p_kategori), ''), 'salah_pilih');
    v_clean_alasan TEXT := trim(p_alasan);
    v_clean_kontak VARCHAR(50) := trim(p_kontak);
    v_student RECORD;
    v_existing_complaint RECORD;
    v_id INT;
BEGIN
    IF v_clean_nim = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi.');
    END IF;

    IF v_clean_alasan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Alasan kendala wajib diisi.');
    END IF;

    IF v_clean_kontak = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nomor kontak WhatsApp/telepon aktif wajib diisi.');
    END IF;

    -- Periksa apakah mahasiswa terdaftar di master students
    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar di sistem.');
    END IF;

    IF v_clean_nama = '' THEN
        v_clean_nama := v_student.nama;
    END IF;

    -- Periksa apakah mahasiswa memiliki laporan yang masih pending atau sudah ditolak
    SELECT * INTO v_existing_complaint
    FROM public.student_complaints
    WHERE nim = v_clean_nim
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF v_existing_complaint.status = 'pending' THEN
            RETURN jsonb_build_object(
                'ok', false, 
                'error', 'Laporan kendala Anda sebelumnya masih dalam antrian peninjauan admin. Mohon menunggu tanggapan admin.'
            );
        ELSIF v_existing_complaint.status = 'rejected' THEN
            RETURN jsonb_build_object(
                'ok', false, 
                'error', 'Laporan kendala Anda sebelumnya telah ditolak oleh admin. Keputusan admin bersifat final dan tidak dapat mengajukan laporan baru.'
            );
        END IF;
    END IF;

    INSERT INTO public.student_complaints (
        nim, nama, kelas, kategori, alasan, kontak, status
    ) VALUES (
        v_clean_nim, v_clean_nama, v_student.kelas, v_clean_kategori, v_clean_alasan, v_clean_kontak, 'pending'
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Laporan kendala berhasil dikirimkan. Silakan tunggu tanggapan dan arahan dari Admin Akademik.',
        'complaint_id', v_id
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.jadwal_kuliah_publik() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lapor_kendala_mahasiswa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ==============================================================================
-- PATCH 26: BERSIHKAN TOPIK DARI JADWAL PUBLIK & FILTER CATATAN ADMIN DI CEK_NIM
-- ==============================================================================
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

-- ==============================================================================
-- PATCH 27: FLEKSIBILITAS PEMILIHAN 1-4 MATKUL & ANTI-DUPLIKASI KELAS MATKUL
-- ==============================================================================
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_count INT;
    v_nama_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_name TEXT;
    v_current_terisi INT;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang ditutup.');
    END IF;

    -- 1. Kunci baris mahasiswa eksklusif
    SELECT * INTO v_student FROM public.students 
    WHERE nim = trim(p_nim) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran pemilihan mata kuliah.');
    END IF;

    -- 2. Kunci baris sesi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = v_student.nim AND state = 'active' AND expires_at >= now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- 3. Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah
    v_count := array_length(p_offering_ids, 1);
    IF p_offering_ids IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 4 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pilihan harus berjumlah minimal 1 dan maksimal 4 mata kuliah.');
    END IF;

    -- 4. KUNCI BARIS OFFERINGS SECARA DETERMINISTIK (urut ID ASC untuk mencegah deadlock)
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    -- 5. Periksa kuota dan aturan anti-duplikasi mata kuliah
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        -- Hitung pendaftar terisi terkini secara presisi dari tabel registrations
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Kuota untuk mata kuliah "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih mata kuliah lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota)
            );
        END IF;

        -- Ekstrak nama dasar (membuang sufiks kelas seperti " A", " B", " - A", dll.)
        v_base_name := lower(trim(regexp_replace(v_off.nama, '(\s+|-|/)+[A-Za-z]$', '')));

        -- Mahasiswa tidak boleh memilih mata kuliah dengan NAMA yang sama atau NAMA DASAR yang sama di kelas berbeda
        IF v_off.nama = ANY(v_nama_arr) OR (v_base_name <> '' AND v_base_name = ANY(v_base_arr)) THEN
            RETURN jsonb_build_object('ok', false, 'error', format('Mata kuliah "%s" dipilih lebih dari satu kali di kelas berbeda. Setiap pilihan mata kuliah harus berbeda.', v_off.nama));
        END IF;

        v_nama_arr := array_append(v_nama_arr, v_off.nama);
        IF v_base_name <> '' THEN
            v_base_arr := array_append(v_base_arr, v_base_name);
        END IF;

        -- Cek bentrok dengan jadwal kelas tetap mahasiswa
        IF v_student.kelas IS NOT NULL AND trim(v_student.kelas) <> '' THEN
            IF EXISTS (
                SELECT 1
                FROM public.schedules s
                JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                WHERE s.offering_id = v_off.id
                  AND lower(trim(s.hari)) = lower(trim(cs.hari))
                  AND s.jam_mulai < cs.jam_selesai
                  AND cs.jam_mulai < s.jam_selesai
            ) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s (Kelas %s) bentrok dengan jadwal kelas Anda.', v_off.nama, COALESCE(v_off.kelas, 'A')));
            END IF;
        END IF;
    END LOOP;

    -- Cek bentrok jadwal antar mata kuliah pilihan yang dipilih
    IF EXISTS (
        SELECT 1
        FROM public.schedules s1
        JOIN public.schedules s2 ON s1.id <> s2.id AND s1.offering_id <> s2.offering_id
        WHERE s1.offering_id = ANY(p_offering_ids)
          AND s2.offering_id = ANY(p_offering_ids)
          AND lower(trim(s1.hari)) = lower(trim(s2.hari))
          AND s1.jam_mulai < s2.jam_selesai
          AND s2.jam_mulai < s1.jam_selesai
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat bentrok jadwal antar mata kuliah pilihan yang Anda pilih.');
    END IF;

    -- 6. Simpan seluruh pendaftaran
    INSERT INTO public.registrations (nim, offering_id)
    SELECT v_student.nim, unnest(p_offering_ids);

    -- Tandai mahasiswa sudah menyelesaikan pendaftaran
    UPDATE public.students
    SET registered_at = now()
    WHERE nim = v_student.nim;

    -- Tandai sesi antrian mahasiswa selesai
    UPDATE public.queue
    SET state = 'done'
    WHERE token = p_token AND nim = v_student.nim;

    -- Promosikan antrian berikutnya jika ada yang menunggu
    PERFORM public.batal_sesi_antrian(v_student.nim, p_token);

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Pendaftaran mata kuliah pilihan berhasil disimpan secara resmi.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

-- ==============================================================================
-- PATCH 28: SEED DATA PENAWARAN MULTI-KELAS (LITERASI, EKONOMI, PENGAWETAN, DLL)
-- ==============================================================================
INSERT INTO public.offerings (id, nama, kelas, jenis, kuota) VALUES
(1, 'Literasi A', 'A', 'matkul', 23),
(2, 'Literasi B', 'B', 'matkul', 23),
(3, 'Literasi C', 'C', 'matkul', 23),
(4, 'Literasi D', 'D', 'matkul', 21),
(5, 'Ekonomi A', 'A', 'matkul', 23),
(6, 'Ekonomi B', 'B', 'matkul', 23),
(7, 'Ekonomi C', 'C', 'matkul', 23),
(8, 'Ekonomi D', 'D', 'matkul', 23),
(9, 'Pengawetan A', 'A', 'matkul', 23),
(10, 'Pengawetan B', 'B', 'matkul', 23),
(11, 'Pengawetan C', 'C', 'matkul', 23),
(12, 'Pengawetan D', 'D', 'matkul', 23),
(13, 'Biofuel A', 'A', 'matkul', 23),
(14, 'Biofuel B', 'B', 'matkul', 23),
(15, 'Biofuel C', 'C', 'matkul', 23),
(16, 'Biofuel D', 'D', 'matkul', 23),
(17, 'Pengolahan Hasil A', 'A', 'matkul', 23),
(18, 'Pengolahan Hasil B', 'B', 'matkul', 23),
(19, 'Pengolahan Hasil C', 'C', 'matkul', 23),
(20, 'Pengolahan Hasil D', 'D', 'matkul', 23),
(21, 'Agroforestry C', 'C', 'matkul', 23),
(22, 'Agroforestry D', 'D', 'matkul', 23),
(23, 'Precision C', 'C', 'matkul', 23),
(24, 'Precision D', 'D', 'matkul', 23),
(25, 'GIS C', 'C', 'matkul', 23),
(26, 'GIS D', 'D', 'matkul', 23),
(27, 'Pasca Panen A', 'A', 'matkul', 23),
(28, 'Pasca Panen B', 'B', 'matkul', 23),
(29, 'Pasca Panen C', 'C', 'matkul', 23),
(30, 'Pasca Panen D', 'D', 'matkul', 23),
(31, 'Hama Penyakit A', 'A', 'matkul', 23),
(32, 'Hama Penyakit B', 'B', 'matkul', 23),
(33, 'Hama Penyakit C', 'C', 'matkul', 23),
(34, 'Hama Penyakit D', 'D', 'matkul', 23),
(35, 'Proyek Mandiri Inovasi Agroteknologi', 'Semua', 'proyek', 150)
ON CONFLICT (id) DO UPDATE SET
    nama = EXCLUDED.nama,
    kelas = EXCLUDED.kelas,
    jenis = EXCLUDED.jenis,
    kuota = EXCLUDED.kuota;

SELECT setval('public.offerings_id_seq', (SELECT max(id) FROM public.offerings));









