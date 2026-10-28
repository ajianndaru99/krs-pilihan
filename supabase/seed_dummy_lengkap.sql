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

-- 2. INSERT MATA KULIAH PILIHAN MULTI-KELAS (34 KELAS MATKUL) & 1 PROYEK MANDIRI
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

-- Set sequence SERIAL untuk offerings
SELECT setval('public.offerings_id_seq', (SELECT max(id) FROM public.offerings));

-- 3. INSERT JADWAL MATA KULIAH & PROYEK PILIHAN
DELETE FROM public.schedules WHERE offering_id BETWEEN 1 AND 35;
INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang) VALUES
(1, 'Senin', '08:00', '09:40', 'R. Literasi 1'),
(2, 'Selasa', '10:00', '11:40', 'R. Literasi 2'),
(3, 'Rabu', '13:00', '14:40', 'R. Literasi 1'),
(4, 'Kamis', '08:00', '09:40', 'R. Literasi 3'),
(5, 'Senin', '10:00', '11:40', 'R. Ekonomi 1'),
(6, 'Selasa', '13:00', '14:40', 'R. Ekonomi 2'),
(7, 'Rabu', '08:00', '09:40', 'R. Ekonomi 1'),
(8, 'Kamis', '10:00', '11:40', 'R. Ekonomi 3'),
(9, 'Senin', '13:00', '14:40', 'Lab. Pengolahan'),
(10, 'Selasa', '08:00', '09:40', 'Lab. Pengolahan'),
(11, 'Rabu', '10:00', '11:40', 'Lab. Pengolahan'),
(12, 'Kamis', '13:00', '14:40', 'Lab. Pengolahan'),
(13, 'Senin', '15:00', '16:40', 'Lab. Energi'),
(14, 'Selasa', '15:00', '16:40', 'Lab. Energi'),
(15, 'Rabu', '15:00', '16:40', 'Lab. Energi'),
(16, 'Jumat', '08:00', '09:40', 'Lab. Energi'),
(17, 'Senin', '08:00', '09:40', 'R. THP 1'),
(18, 'Selasa', '10:00', '11:40', 'R. THP 2'),
(19, 'Kamis', '15:00', '16:40', 'R. THP 1'),
(20, 'Jumat', '13:30', '15:10', 'R. THP 2'),
(21, 'Rabu', '08:00', '09:40', 'R. Kehutanan 1'),
(22, 'Kamis', '10:00', '11:40', 'R. Kehutanan 2'),
(23, 'Rabu', '10:00', '11:40', 'Lab. Komputer 1'),
(24, 'Kamis', '13:00', '14:40', 'Lab. Komputer 2'),
(25, 'Selasa', '13:00', '14:40', 'Lab. GIS'),
(26, 'Rabu', '15:00', '16:40', 'Lab. GIS'),
(27, 'Senin', '10:00', '11:40', 'R. Agronomi 1'),
(28, 'Selasa', '08:00', '09:40', 'R. Agronomi 2'),
(29, 'Kamis', '13:00', '14:40', 'R. Agronomi 1'),
(30, 'Jumat', '08:00', '09:40', 'R. Agronomi 2'),
(31, 'Senin', '13:00', '14:40', 'Lab. Proteksi'),
(32, 'Rabu', '13:00', '14:40', 'Lab. Proteksi'),
(33, 'Kamis', '08:00', '09:40', 'Lab. Proteksi'),
(34, 'Jumat', '13:30', '15:10', 'Lab. Proteksi'),
(35, 'Selasa', '08:00', '09:40', 'Aula Pertanian & Lapangan');

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
