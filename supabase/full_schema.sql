-- ============================================================================
-- FULL SCHEMA & MIGRATION: Sistem Pemilihan Mata Kuliah Pilihan
-- Jalankan seluruh berkas ini sekaligus di Supabase SQL Editor (Run 1x)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

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
    CONSTRAINT single_row CHECK (id = 1)
);

INSERT INTO public.settings (id, portal_open, max_active, session_duration_minutes, need_matkul, need_proyek)
VALUES (1, false, 30, 5, 3, 1)
ON CONFLICT (id) DO NOTHING;

-- 1.2 Data Mahasiswa
CREATE TABLE IF NOT EXISTS public.students (
    nim TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    kelas TEXT, -- Opsional
    pin TEXT,
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
    expires_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_queue_state ON public.queue(state, nomor);
CREATE INDEX IF NOT EXISTS idx_queue_nim ON public.queue(nim);

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

-- Helper Verifikasi Admin (Mendukung email atau username)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE email = auth.jwt() ->> 'email'
       OR (username IS NOT NULL AND (
            username = auth.jwt() ->> 'email'
            OR username = split_part(auth.jwt() ->> 'email', '@', 1)
          ))
  );
$$;

-- 3.1 Fungsi cek_nim
CREATE OR REPLACE FUNCTION public.cek_nim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_sudah_daftar BOOLEAN;
    v_nama_parts TEXT[];
    v_samar TEXT := '';
    v_part TEXT;
    v_idx INT;
    v_portal_open BOOLEAN;
BEGIN
    SELECT portal_open INTO v_portal_open FROM public.settings WHERE id = 1;
    
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar dalam database mahasiswa.');
    END IF;

    v_sudah_daftar := (v_student.registered_at IS NOT NULL) OR EXISTS (
        SELECT 1 FROM public.registrations WHERE nim = v_student.nim
    );

    v_nama_parts := string_to_array(trim(v_student.nama), ' ');
    FOR v_idx IN 1..array_length(v_nama_parts, 1) LOOP
        v_part := v_nama_parts[v_idx];
        IF length(v_part) > 1 THEN
            v_samar := v_samar || left(v_part, 1) || repeat('*', length(v_part) - 1) || ' ';
        ELSE
            v_samar := v_samar || v_part || ' ';
        END IF;
    END LOOP;
    v_samar := trim(v_samar);

    RETURN jsonb_build_object(
        'ok', true,
        'nama_samar', v_samar,
        'kelas', v_student.kelas,
        'butuh_pin', (v_student.pin IS NOT NULL AND v_student.pin <> ''),
        'sudah_terdaftar', v_sudah_daftar,
        'portal_open', v_portal_open
    );
END;
$$;

-- 3.2 Fungsi join_queue
CREATE OR REPLACE FUNCTION public.join_queue(p_nim TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_token TEXT;
    v_state TEXT;
    v_portal_open BOOLEAN;
    v_active_count INT;
    v_max_active INT;
    v_session_min INT;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT portal_open, max_active, session_duration_minutes
    INTO v_portal_open, v_max_active, v_session_min
    FROM public.settings WHERE id = 1;

    IF NOT v_portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang DITUTUP oleh administrator prodi.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar.');
    END IF;

    IF v_student.pin IS NOT NULL AND v_student.pin <> '' THEN
        IF p_pin IS NULL OR trim(p_pin) <> v_student.pin THEN
            RETURN jsonb_build_object('ok', false, 'error', 'PIN yang Anda masukkan salah.');
        END IF;
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    SELECT token, state INTO v_token, v_state
    FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'token', v_token, 'state', v_state);
    END IF;

    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;

    v_token := gen_random_uuid()::text;

    IF v_active_count < v_max_active THEN
        v_state := 'active';
        INSERT INTO public.queue (token, nim, state, activated_at, expires_at)
        VALUES (v_token, v_student.nim, 'active', v_now, v_now + (v_session_min || ' minutes')::interval);
    ELSE
        v_state := 'waiting';
        INSERT INTO public.queue (token, nim, state)
        VALUES (v_token, v_student.nim, 'waiting');
    END IF;

    RETURN jsonb_build_object('ok', true, 'token', v_token, 'state', v_state);
END;
$$;

-- 3.3 Fungsi queue_status (Polling 10s)
CREATE OR REPLACE FUNCTION public.queue_status(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_q RECORD;
    v_posisi INT := 0;
    v_active_count INT := 0;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_sisa_detik INT := 0;
    v_est_menit INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT max_active, session_duration_minutes INTO v_max_active, v_session_min FROM public.settings WHERE id = 1;

    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT * INTO v_q FROM public.queue WHERE token = p_token AND nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak ditemukan.');
    END IF;

    IF v_q.state = 'active' THEN
        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_q.state := 'expired';
        END IF;
    ELSIF v_q.state = 'waiting' THEN
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_max_active THEN
            IF (SELECT token FROM public.queue WHERE state = 'waiting' ORDER BY nomor ASC LIMIT 1) = p_token THEN
                UPDATE public.queue
                SET state = 'active', activated_at = v_now, expires_at = v_now + (v_session_min || ' minutes')::interval
                WHERE token = p_token;
                v_q.state := 'active';
                v_sisa_detik := v_session_min * 60;
            END IF;
        END IF;

        IF v_q.state = 'waiting' THEN
            SELECT count(*) INTO v_posisi FROM public.queue WHERE state = 'waiting' AND nomor < v_q.nomor;
            v_posisi := v_posisi + 1;
            v_est_menit := CEIL((v_posisi::NUMERIC / GREATEST(1, v_max_active)) * v_session_min);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'state', v_q.state,
        'nomor', v_q.nomor,
        'posisi', v_posisi,
        'estimasi_menit', v_est_menit,
        'sisa_detik', v_sisa_detik,
        'bisa_antri_lagi', true
    );
END;
$$;

-- 3.4 Fungsi list_offerings
CREATE OR REPLACE FUNCTION public.list_offerings(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_pilihan JSONB;
BEGIN
    SELECT * INTO v_q FROM public.queue WHERE token = p_token AND nim = trim(p_nim) AND state = 'active' AND expires_at >= now();
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak aktif atau telah kedaluwarsa.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'topik', o.topik,
            'jenis', o.jenis,
            'kuota', o.kuota,
            'terisi', (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id),
            'sisa', GREATEST(0, o.kuota - (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id))::INT,
            'bentrok', (
                CASE WHEN v_student.kelas IS NULL OR trim(v_student.kelas) = '' THEN false
                ELSE EXISTS (
                    SELECT 1
                    FROM public.schedules s
                    JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                    WHERE s.offering_id = o.id
                      AND lower(trim(s.hari)) = lower(trim(cs.hari))
                      AND s.jam_mulai < cs.jam_selesai
                      AND cs.jam_mulai < s.jam_selesai
                ) END
            ),
            'jadwal', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object('hari', s.hari, 'jam_mulai', s.jam_mulai::text, 'jam_selesai', s.jam_selesai::text, 'ruang', s.ruang)
                ) FROM public.schedules s WHERE s.offering_id = o.id
            ), '[]'::jsonb)
        ) ORDER BY o.jenis, o.nama
    ) INTO v_pilihan
    FROM public.offerings o;

    RETURN jsonb_build_object('ok', true, 'pilihan', COALESCE(v_pilihan, '[]'::jsonb), 'paket', '[]'::jsonb);
END;
$$;

-- 3.5 Fungsi daftar (Pendaftaran final)
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_off_id INT;
    v_matkul_count INT := 0;
    v_proyek_count INT := 0;
    v_topik_arr TEXT[] := ARRAY[]::TEXT[];
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
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    IF p_offering_ids IS NULL OR array_length(p_offering_ids, 1) <> (v_settings.need_matkul + v_settings.need_proyek) THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Jumlah pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    FOR v_off IN
        SELECT o.*, COALESCE(count(r.id), 0) AS terisi
        FROM public.offerings o
        LEFT JOIN public.registrations r ON r.offering_id = o.id
        WHERE o.id = ANY(p_offering_ids)
        GROUP BY o.id
        FOR UPDATE OF o
    LOOP
        IF v_off.jenis = 'matkul' THEN
            v_matkul_count := v_matkul_count + 1;
        ELSIF v_off.jenis = 'proyek' THEN
            v_proyek_count := v_proyek_count + 1;
        END IF;

        IF v_off.topik IS NOT NULL AND v_off.topik <> '' THEN
            IF v_off.topik = ANY(v_topik_arr) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Topik mata kuliah kembar terdeteksi: %s.', v_off.topik));
            END IF;
            v_topik_arr := array_append(v_topik_arr, v_off.topik);
        END IF;

        IF v_off.terisi >= v_off.kuota THEN
            RETURN jsonb_build_object('ok', false, 'error', format('Kuota untuk %s sudah penuh.', v_off.nama));
        END IF;

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
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s bentrok dengan jadwal kelas tetap Anda.', v_off.nama));
            END IF;
        END IF;
    END LOOP;

    IF v_matkul_count <> v_settings.need_matkul OR v_proyek_count <> v_settings.need_proyek THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Komposisi pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

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

    FOREACH v_off_id IN ARRAY p_offering_ids LOOP
        INSERT INTO public.registrations (nim, offering_id)
        VALUES (v_student.nim, v_off_id);
    END LOOP;

    UPDATE public.students SET registered_at = now() WHERE nim = v_student.nim;
    UPDATE public.queue SET state = 'done' WHERE token = p_token;

    RETURN jsonb_build_object('ok', true, 'message', 'Pendaftaran berhasil disimpan.');
END;
$$;

-- 3.6 Fungsi hasil_saya
CREATE OR REPLACE FUNCTION public.hasil_saya(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_pilihan JSONB;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'topik', o.topik,
            'jadwal', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object('hari', s.hari, 'jam_mulai', s.jam_mulai::text, 'jam_selesai', s.jam_selesai::text, 'ruang', s.ruang)
                ) FROM public.schedules s WHERE s.offering_id = o.id
            ), '[]'::jsonb)
        )
    ), '[]'::jsonb)
    INTO v_pilihan
    FROM public.registrations r
    JOIN public.offerings o ON o.id = r.offering_id
    WHERE r.nim = v_student.nim;

    RETURN jsonb_build_object(
        'ok', true,
        'mahasiswa', jsonb_build_object(
            'nim', v_student.nim,
            'nama', v_student.nama,
            'kelas', v_student.kelas
        ),
        'pendaftaran', jsonb_build_object(
            'waktu_daftar', v_student.registered_at,
            'pilihan', v_pilihan
        )
    );
END;
$$;

-- 3.7 Fungsi daftar_kelas
CREATE OR REPLACE FUNCTION public.daftar_kelas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(jsonb_agg(k), '[]'::jsonb)
        FROM (
            SELECT DISTINCT kelas AS k
            FROM public.students
            WHERE kelas IS NOT NULL AND trim(kelas) <> ''
            ORDER BY kelas
        ) sub
    );
END;
$$;

-- 3.8 Fungsi ajukan_akses
CREATE OR REPLACE FUNCTION public.ajukan_akses(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
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

-- ----------------------------------------------------------------------------
-- 4. FUNGSI ADMIN
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_portal BOOLEAN;
    v_tot_stud INT;
    v_tot_reg INT;
    v_act_q INT;
    v_no_sched_off INT;
    v_no_sched_cls INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT portal_open INTO v_portal FROM public.settings WHERE id = 1;
    SELECT count(*) INTO v_tot_stud FROM public.students;
    SELECT count(DISTINCT nim) INTO v_tot_reg FROM public.registrations;
    SELECT count(*) INTO v_act_q FROM public.queue WHERE state = 'active' AND expires_at >= now();
    SELECT count(*) INTO v_no_sched_off FROM public.offerings o WHERE NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.offering_id = o.id);
    SELECT count(DISTINCT s.kelas) INTO v_no_sched_cls FROM public.students s WHERE s.kelas IS NOT NULL AND s.kelas <> '' AND NOT EXISTS (SELECT 1 FROM public.class_schedules cs WHERE cs.kelas = s.kelas);

    RETURN jsonb_build_object(
        'ok', true,
        'portal_open', v_portal,
        'total_students', v_tot_stud,
        'total_registered', v_tot_reg,
        'active_queue', v_act_q,
        'offerings_without_schedule', v_no_sched_off,
        'classes_without_schedule', v_no_sched_cls
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_portal(p_buka BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    UPDATE public.settings SET portal_open = p_buka WHERE id = 1;
    RETURN jsonb_build_object('ok', true, 'portal_open', p_buka);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_offerings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'nama', o.nama,
                'jenis', o.jenis,
                'topik', o.topik,
                'kuota', o.kuota,
                'terisi', (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id),
                'sisa', GREATEST(0, o.kuota - (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id))::INT
            ) ORDER BY o.jenis, o.nama
        ) FROM public.offerings o
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_kuota(p_offering_id INT, p_kuota INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    UPDATE public.offerings SET kuota = p_kuota WHERE id = p_offering_id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_batal_daftar(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    DELETE FROM public.registrations WHERE nim = trim(p_nim);
    UPDATE public.students SET registered_at = NULL WHERE nim = trim(p_nim);
    DELETE FROM public.queue WHERE nim = trim(p_nim);

    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_export_pendaftaran()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    RETURN (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'NIM', s.nim,
                'Nama', s.nama,
                'Kelas', s.kelas,
                'Mata Kuliah / Proyek', o.nama,
                'Jenis', o.jenis,
                'Topik', o.topik,
                'Waktu Registrasi', r.created_at
            ) ORDER BY s.nim, o.jenis, o.nama
        ), '[]'::jsonb)
        FROM public.registrations r
        JOIN public.students s ON s.nim = r.nim
        JOIN public.offerings o ON o.id = r.offering_id
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_import_students(p_students JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_nim TEXT;
    v_nama TEXT;
    v_kelas TEXT;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_students) LOOP
        v_nim := trim(v_item ->> 'nim');
        v_nama := trim(v_item ->> 'nama');
        v_kelas := trim(v_item ->> 'kelas');
        IF v_kelas = '' THEN
            v_kelas := NULL;
        END IF;

        IF v_nim IS NOT NULL AND v_nim <> '' AND v_nama IS NOT NULL AND v_nama <> '' THEN
            INSERT INTO public.students (nim, nama, kelas)
            VALUES (v_nim, v_nama, v_kelas)
            ON CONFLICT (nim) DO UPDATE
            SET nama = EXCLUDED.nama,
                kelas = COALESCE(EXCLUDED.kelas, students.kelas);
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'imported_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_import_jadwal_kelas(p_jadwal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_jadwal) LOOP
        INSERT INTO public.class_schedules (kelas, hari, jam_mulai, jam_selesai, matkul, ruang)
        VALUES (
            trim(v_item ->> 'kelas'),
            trim(v_item ->> 'hari'),
            (v_item ->> 'jam_mulai')::TIME,
            (v_item ->> 'jam_selesai')::TIME,
            v_item ->> 'matkul',
            v_item ->> 'ruang'
        );
        v_count := v_count + 1;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'imported_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_import_jadwal_pilihan(p_jadwal JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_off_id INT;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_jadwal) LOOP
        v_off_id := (v_item ->> 'offering_id')::INT;
        IF v_off_id IS NULL AND (v_item ->> 'nama_pilihan') IS NOT NULL THEN
            SELECT id INTO v_off_id FROM public.offerings WHERE lower(nama) = lower(trim(v_item ->> 'nama_pilihan')) LIMIT 1;
        END IF;

        IF v_off_id IS NOT NULL THEN
            INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang)
            VALUES (
                v_off_id,
                trim(v_item ->> 'hari'),
                (v_item ->> 'jam_mulai')::TIME,
                (v_item ->> 'jam_selesai')::TIME,
                v_item ->> 'ruang'
            );
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'imported_count', v_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_list_pengajuan()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    RETURN (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'id', id,
                'nim', nim,
                'nama', nama,
                'kelas', kelas,
                'catatan', catatan,
                'status', status,
                'created_at', created_at
            ) ORDER BY (status = 'pending') DESC, created_at DESC
        ), '[]'::jsonb)
        FROM public.access_requests
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_setujui_pengajuan(p_id INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_req RECORD;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    SELECT * INTO v_req FROM public.access_requests WHERE id = p_id;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Pengajuan tidak ditemukan.');
    END IF;

    INSERT INTO public.students (nim, nama, kelas)
    VALUES (v_req.nim, v_req.nama, v_req.kelas)
    ON CONFLICT (nim) DO UPDATE
    SET nama = EXCLUDED.nama,
        kelas = COALESCE(EXCLUDED.kelas, students.kelas);

    UPDATE public.access_requests SET status = 'approved' WHERE id = p_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan berhasil disetujui.');
END;
$$;

-- ----------------------------------------------------------------------------
-- 5. PERMISSION GRANTS (HANYA ANON & AUTHENTICATED VIA RPC)
-- ----------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_offerings(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hasil_saya(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daftar_kelas() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

GRANT EXECUTE ON FUNCTION public.admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_portal(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_offerings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_kuota(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_batal_daftar(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_pendaftaran() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_students(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_jadwal_kelas(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_jadwal_pilihan(JSONB) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_pengajuan() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_setujui_pengajuan(INT) TO authenticated;
