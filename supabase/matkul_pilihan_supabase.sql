-- ============================================================================
-- 1. matkul_pilihan_supabase.sql
-- Skema dasar, antrian, pendaftaran, dan data awal mata kuliah pilihan
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1.1 Tabel Pengaturan Global
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

-- 1.2 Tabel Mahasiswa
CREATE TABLE IF NOT EXISTS public.students (
    nim TEXT PRIMARY KEY,
    nama TEXT NOT NULL,
    kelas TEXT,
    pin TEXT,
    registered_at TIMESTAMPTZ
);

-- 1.3 Tabel Mata Kuliah & Proyek (Offerings)
CREATE TABLE IF NOT EXISTS public.offerings (
    id SERIAL PRIMARY KEY,
    nama TEXT NOT NULL,
    topik TEXT,
    jenis TEXT NOT NULL CHECK (jenis IN ('matkul', 'proyek')),
    kuota INT NOT NULL DEFAULT 30
);

-- 1.4 Tabel Jadwal Pilihan
CREATE TABLE IF NOT EXISTS public.schedules (
    id SERIAL PRIMARY KEY,
    offering_id INT NOT NULL REFERENCES public.offerings(id) ON DELETE CASCADE,
    hari TEXT NOT NULL,
    jam_mulai TIME NOT NULL,
    jam_selesai TIME NOT NULL,
    ruang TEXT
);

-- 1.5 Tabel Antrian (Queue)
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

-- 1.6 Tabel Registrasi Hasil Pilihan
CREATE TABLE IF NOT EXISTS public.registrations (
    id SERIAL PRIMARY KEY,
    nim TEXT NOT NULL REFERENCES public.students(nim) ON DELETE CASCADE,
    offering_id INT NOT NULL REFERENCES public.offerings(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_nim_offering UNIQUE (nim, offering_id)
);

CREATE INDEX IF NOT EXISTS idx_reg_nim ON public.registrations(nim);
CREATE INDEX IF NOT EXISTS idx_reg_offering ON public.registrations(offering_id);

-- AKTIFKAN RLS (Row Level Security) PADA SEMUA TABEL
-- Sesuai spesifikasi: RLS aktif tanpa policy publik, semua akses lewat SECURITY DEFINER RPC.
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offerings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.registrations ENABLE ROW LEVEL SECURITY;

-- 1.7 Data Awal 34 Mata Kuliah Pilihan
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
('Energi Terbarukan Berbasis Biomassa Kebun', 'Teknologi', 'matkul', 30)
ON CONFLICT DO NOTHING;

-- Minimal 1 Proyek (agar count >= 35)
INSERT INTO public.offerings (nama, topik, jenis, kuota) VALUES
('Proyek Mandiri Inovasi Agroteknologi', 'Proyek Terapan', 'proyek', 150)
ON CONFLICT DO NOTHING;
