-- ==============================================================================
-- SEED DATA DUMMY LENGKAP: KRS PILIHAN FAKULTAS PERTANIAN
-- ==============================================================================
-- Skrip ini menyiapkan seluruh data master yang dibutuhkan untuk pengujian
-- langsung antarmuka mahasiswa dan admin:
-- 1. Pengaturan Portal (DIBUKA)
-- 2. Data Master 34 Mata Kuliah Pilihan + 1 Proyek Mandiri
-- 3. Jadwal Mata Kuliah & Proyek Pilihan
-- 4. Jadwal Kuliah Tetap Mahasiswa (Kelas AGR-A, AGR-B, AGR-C)
-- 5. Data 10 Mahasiswa Dummy Siap Pakai
-- ==============================================================================

-- 1. BUKA PORTAL PENDAFTARAN & SET PARAMETER
INSERT INTO public.settings (id, portal_open, max_active, session_duration_minutes, need_matkul, need_proyek)
VALUES (1, true, 30, 5, 3, 1)
ON CONFLICT (id) DO UPDATE SET
    portal_open = true,
    max_active = 30,
    session_duration_minutes = 5,
    need_matkul = 3,
    need_proyek = 1;

-- 2. INSERT MATA KULIAH PILIHAN (34 MATKUL) & 1 PROYEK MANDIRI
INSERT INTO public.offerings (id, nama, topik, jenis, kuota) VALUES
(1, 'Bioteknologi Tanaman', 'Bioteknologi', 'matkul', 30),
(2, 'Kultur Jaringan Lanjut', 'Bioteknologi', 'matkul', 30),
(3, 'Fisiologi Cekaman Tanaman', 'Fisiologi', 'matkul', 30),
(4, 'Nutrisi Tanaman Lanjut', 'Fisiologi', 'matkul', 30),
(5, 'Teknologi Benih Unggul', 'Pemuliaan', 'matkul', 30),
(6, 'Pemuliaan Tanaman Perkebunan', 'Pemuliaan', 'matkul', 30),
(7, 'Genetika Molekuler Tanaman', 'Pemuliaan', 'matkul', 30),
(8, 'Manajemen Gulma Terpadu', 'Proteksi', 'matkul', 30),
(9, 'Epidemiologi Penyakit Tanaman', 'Proteksi', 'matkul', 30),
(10, 'Pengendalian Hayati & Biopestisida', 'Proteksi', 'matkul', 30),
(11, 'Toksikologi Pestisida', 'Proteksi', 'matkul', 30),
(12, 'Kesuburan Tanah Presisi', 'Ilmu Tanah', 'matkul', 30),
(13, 'Biologi Tanah & Remidiasi', 'Ilmu Tanah', 'matkul', 30),
(14, 'Konservasi Tanah dan Air Tropika', 'Ilmu Tanah', 'matkul', 30),
(15, 'Klasifikasi Tanah & Evaluasi Lahan', 'Ilmu Tanah', 'matkul', 30),
(16, 'Agroforestri Perkebunan', 'Agronomi', 'matkul', 30),
(17, 'Budidaya Kelapa Sawit Berkelanjutan', 'Agronomi', 'matkul', 30),
(18, 'Budidaya Kopi dan Kakao Spesialti', 'Agronomi', 'matkul', 30),
(19, 'Budidaya Tebu & Bioetanol', 'Agronomi', 'matkul', 30),
(20, 'Manajemen Pasca Panen Perkebunan', 'Agronomi', 'matkul', 30),
(21, 'Sistem Informasi Geografis Pertanian', 'Teknologi', 'matkul', 30),
(22, 'Pertanian Presisi Berbasis IoT & Drone', 'Teknologi', 'matkul', 30),
(23, 'Klimatologi Pertanian & Perubahan Iklim', 'Lingkungan', 'matkul', 30),
(24, 'Ekologi Lanskap Perkebunan', 'Lingkungan', 'matkul', 30),
(25, 'Rantai Pasok Agribisnis Komoditas', 'Sosial Ekonomi', 'matkul', 30),
(26, 'Pemasaran Digital Produk Perkebunan', 'Sosial Ekonomi', 'matkul', 30),
(27, 'Kewirausahaan Berbasis Agroteknologi', 'Sosial Ekonomi', 'matkul', 30),
(28, 'Sertifikasi & Standarisasi Sawit (ISPO/RSPO)', 'Kebijakan', 'matkul', 30),
(29, 'Hukum Agraria & Konflik Perkebunan', 'Kebijakan', 'matkul', 30),
(30, 'Analisis Kebijakan Komoditas Perkebunan', 'Kebijakan', 'matkul', 30),
(31, 'Manajemen Sumber Daya Manusia Kebun', 'Manajemen', 'matkul', 30),
(32, 'Sistem Manajemen Mutu Perkebunan', 'Manajemen', 'matkul', 30),
(33, 'Pengelolaan Limbah Industri Kelapa Sawit', 'Lingkungan', 'matkul', 30),
(34, 'Energi Terbarukan Berbasis Biomassa Kebun', 'Teknologi', 'matkul', 30),
(35, 'Proyek Mandiri Inovasi Agroteknologi', 'Proyek Terapan', 'proyek', 150)
ON CONFLICT (id) DO UPDATE SET
    nama = EXCLUDED.nama,
    topik = EXCLUDED.topik,
    jenis = EXCLUDED.jenis,
    kuota = EXCLUDED.kuota;

-- Set sequence SERIAL untuk offerings
SELECT setval('public.offerings_id_seq', (SELECT max(id) FROM public.offerings));

-- 3. INSERT JADWAL MATA KULIAH & PROYEK PILIHAN
DELETE FROM public.schedules WHERE offering_id BETWEEN 1 AND 35;
INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang) VALUES
(1, 'Senin', '08:00', '09:40', 'R. 201 Lab Terpadu'),
(2, 'Senin', '10:00', '11:40', 'R. 202 Lab Terpadu'),
(3, 'Senin', '13:00', '14:40', 'R. 101 Gedung A'),
(4, 'Senin', '15:00', '16:40', 'R. 102 Gedung A'),
(5, 'Selasa', '08:00', '09:40', 'R. 301 Gedung B'),
(6, 'Selasa', '10:00', '11:40', 'R. 302 Gedung B'),
(7, 'Selasa', '13:00', '14:40', 'R. 203 Lab Terpadu'),
(8, 'Selasa', '15:00', '16:40', 'R. 103 Gedung A'),
(9, 'Rabu', '08:00', '09:40', 'R. 104 Gedung A'),
(10, 'Rabu', '10:00', '11:40', 'R. 105 Gedung A'),
(11, 'Rabu', '13:00', '14:40', 'R. 204 Lab Terpadu'),
(12, 'Rabu', '15:00', '16:40', 'R. 303 Gedung B'),
(13, 'Kamis', '08:00', '09:40', 'R. 205 Lab Terpadu'),
(14, 'Kamis', '10:00', '11:40', 'R. 106 Gedung A'),
(15, 'Kamis', '13:00', '14:40', 'R. 107 Gedung A'),
(16, 'Kamis', '15:00', '16:40', 'R. 304 Gedung B'),
(17, 'Jumat', '08:00', '09:40', 'R. 305 Gedung B'),
(18, 'Jumat', '13:30', '15:10', 'R. 108 Gedung A'),
(19, 'Jumat', '15:30', '17:10', 'R. 109 Gedung A'),
(20, 'Senin', '08:00', '09:40', 'R. 306 Gedung B'),
(21, 'Senin', '10:00', '11:40', 'R. Lab Komputer SIG'),
(22, 'Selasa', '08:00', '09:40', 'R. Lab Komputer Presisi'),
(23, 'Selasa', '13:00', '14:40', 'R. 110 Gedung A'),
(24, 'Rabu', '08:00', '09:40', 'R. 307 Gedung B'),
(25, 'Rabu', '13:00', '14:40', 'R. 308 Gedung B'),
(26, 'Kamis', '08:00', '09:40', 'R. Lab Bisnis Digital'),
(27, 'Kamis', '13:00', '14:40', 'R. 111 Gedung A'),
(28, 'Jumat', '08:00', '09:40', 'R. 112 Gedung A'),
(29, 'Jumat', '13:30', '15:10', 'R. 309 Gedung B'),
(30, 'Senin', '13:00', '14:40', 'R. 113 Gedung A'),
(31, 'Selasa', '15:00', '16:40', 'R. 114 Gedung A'),
(32, 'Rabu', '15:00', '16:40', 'R. 115 Gedung A'),
(33, 'Kamis', '15:00', '16:40', 'R. 206 Lab Terpadu'),
(34, 'Jumat', '15:30', '17:10', 'R. 207 Lab Terpadu'),
(35, 'Jumat', '13:30', '15:10', 'Aula Fakultas Pertanian');

-- 4. INSERT JADWAL KULIAH TETAP KELAS MAHASISWA (Untuk Pengecekan Bentrok)
DELETE FROM public.class_schedules WHERE kelas IN ('AGR-A', 'AGR-B', 'AGR-C');
INSERT INTO public.class_schedules (kelas, hari, jam_mulai, jam_selesai, ruang) VALUES
-- Kelas AGR-A memiliki kuliah tetap di Senin 08:00-09:40 & Rabu 10:00-11:40
('AGR-A', 'Senin', '08:00', '09:40', 'R. Kuliah Utama 1'),
('AGR-A', 'Rabu', '10:00', '11:40', 'R. Kuliah Utama 1'),

-- Kelas AGR-B memiliki kuliah tetap di Selasa 08:00-09:40 & Kamis 10:00-11:40
('AGR-B', 'Selasa', '08:00', '09:40', 'R. Kuliah Utama 2'),
('AGR-B', 'Kamis', '10:00', '11:40', 'R. Kuliah Utama 2'),

-- Kelas AGR-C memiliki kuliah tetap di Rabu 08:00-09:40 & Jumat 08:00-09:40
('AGR-C', 'Rabu', '08:00', '09:40', 'R. Kuliah Utama 3'),
('AGR-C', 'Jumat', '08:00', '09:40', 'R. Kuliah Utama 3');

-- 5. INSERT 10 DATA MAHASISWA DUMMY (SIAP DIUJI COBA)
INSERT INTO public.students (nim, nama, kelas, pin, registered_at) VALUES
('2110211001', 'Ahmad Fauzan Pratama', 'AGR-A', NULL, NULL),
('2110211002', 'Siti Nurhaliza Zahra', 'AGR-A', NULL, NULL),
('2110211003', 'Budi Santoso', 'AGR-B', NULL, NULL),
('2110211004', 'Dewi Lestari Kusuma', 'AGR-B', NULL, NULL),
('2110211005', 'Rian Hidayat Syahputra', 'AGR-C', NULL, NULL),
('2110211006', 'Putri Ayu Wulandari', 'AGR-C', NULL, NULL),
('2110211007', 'Kevin Pratama Wijaya', NULL, NULL, NULL),
('2110211008', 'Nabila Rahmawati', 'AGR-A', NULL, NULL),
('2110211009', 'Dimas Aditya Nugraha', 'AGR-B', NULL, NULL),
('2110211010', 'Zahra Maharani Putri', 'AGR-C', NULL, NULL)
ON CONFLICT (nim) DO UPDATE SET
    nama = EXCLUDED.nama,
    kelas = EXCLUDED.kelas,
    registered_at = NULL;
