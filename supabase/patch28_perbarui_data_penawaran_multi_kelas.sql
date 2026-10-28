-- ==============================================================================
-- PATCH 28: PERBARUI DATA PENAWARAN MULTI-KELAS (SESUAI LAMPIRAN DATA PENGGUNA)
-- Sistem Pemilihan Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Menjamin kolom kelas dan terisi ada di tabel offerings.
-- 2. Mengganti data lama dengan data multi-kelas paralel (Literasi A-D, Ekonomi A-D,
--    Pengawetan A-D, Biofuel A-D, Pengolahan Hasil A-D, Agroforestry C-D,
--    Precision C-D, GIS C-D, Pasca Panen A-D, Hama Penyakit A-D, dan Proyek Mandiri).
-- 3. Menyelaraskan jadwal (hari, jam, ruang) untuk setiap kelas.
-- ==============================================================================

BEGIN;

-- 1. Pastikan kolom kelas ada di tabel offerings
ALTER TABLE public.offerings ADD COLUMN IF NOT EXISTS kelas VARCHAR(10) DEFAULT 'A';

-- 2. Bersihkan transaksi pendaftaran, antrian, dan penawaran lama
DELETE FROM public.registrations;
DELETE FROM public.queue;
DELETE FROM public.schedules;
DELETE FROM public.offerings;

-- Reset sequence
ALTER SEQUENCE public.offerings_id_seq RESTART WITH 1;
ALTER SEQUENCE public.schedules_id_seq RESTART WITH 1;

-- 3. INSERT OFFERINGS MULTI-KELAS (HANYA KOLOM STANDARD: id, nama, kelas, jenis, kuota)
INSERT INTO public.offerings (id, nama, kelas, jenis, kuota) VALUES
-- 1. LITERASI (4 KELAS)
(1, 'Literasi A', 'A', 'matkul', 23),
(2, 'Literasi B', 'B', 'matkul', 23),
(3, 'Literasi C', 'C', 'matkul', 23), -- Diset Penuh untuk uji coba
(4, 'Literasi D', 'D', 'matkul', 21), -- Kuota 21, terisi 18, sisa 3

-- 2. EKONOMI (4 KELAS)
(5, 'Ekonomi A', 'A', 'matkul', 23),
(6, 'Ekonomi B', 'B', 'matkul', 23),
(7, 'Ekonomi C', 'C', 'matkul', 23), -- Diset Penuh
(8, 'Ekonomi D', 'D', 'matkul', 23),

-- 3. PENGAWETAN (4 KELAS)
(9, 'Pengawetan A', 'A', 'matkul', 23),
(10, 'Pengawetan B', 'B', 'matkul', 23),
(11, 'Pengawetan C', 'C', 'matkul', 23),
(12, 'Pengawetan D', 'D', 'matkul', 23),

-- 4. BIOFUEL (4 KELAS)
(13, 'Biofuel A', 'A', 'matkul', 23),
(14, 'Biofuel B', 'B', 'matkul', 23),
(15, 'Biofuel C', 'C', 'matkul', 23),
(16, 'Biofuel D', 'D', 'matkul', 23), -- Diset Penuh

-- 5. PENGOLAHAN HASIL (4 KELAS)
(17, 'Pengolahan Hasil A', 'A', 'matkul', 23),
(18, 'Pengolahan Hasil B', 'B', 'matkul', 23),
(19, 'Pengolahan Hasil C', 'C', 'matkul', 23),
(20, 'Pengolahan Hasil D', 'D', 'matkul', 23),

-- 6. AGROFORESTRY (2 KELAS: C & D)
(21, 'Agroforestry C', 'C', 'matkul', 23),
(22, 'Agroforestry D', 'D', 'matkul', 23),

-- 7. PRECISION (2 KELAS: C & D)
(23, 'Precision C', 'C', 'matkul', 23),
(24, 'Precision D', 'D', 'matkul', 23),

-- 8. GIS (2 KELAS: C & D)
(25, 'GIS C', 'C', 'matkul', 23),
(26, 'GIS D', 'D', 'matkul', 23),

-- 9. PASCA PANEN (4 KELAS)
(27, 'Pasca Panen A', 'A', 'matkul', 23),
(28, 'Pasca Panen B', 'B', 'matkul', 23),
(29, 'Pasca Panen C', 'C', 'matkul', 23),
(30, 'Pasca Panen D', 'D', 'matkul', 23),

-- 10. HAMA PENYAKIT (4 KELAS)
(31, 'Hama Penyakit A', 'A', 'matkul', 23),
(32, 'Hama Penyakit B', 'B', 'matkul', 23),
(33, 'Hama Penyakit C', 'C', 'matkul', 23),
(34, 'Hama Penyakit D', 'D', 'matkul', 23),

-- 11. PROYEK MANDIRI
(35, 'Proyek Mandiri Inovasi Agroteknologi', 'Semua', 'proyek', 150);

-- Sinkronkan sequence id
SELECT setval('public.offerings_id_seq', 35);

-- 4. INSERT PENDAFTAR DUMMY UNTUK KELAS PENUH (Agar sisa kursi dihitung konsisten)
-- Offering Penuh (id 3, 7, 16): Literasi C, Ekonomi C, Biofuel D
INSERT INTO public.registrations (nim, offering_id, registered_at)
SELECT 'DUMMY_' || o.id || '_' || gs, o.id, now()
FROM public.offerings o
CROSS JOIN generate_series(1, o.kuota) gs
WHERE o.id IN (3, 7, 16);

-- Offering Literasi D (id 4, kuota 21, terisi 18, sisa 3)
INSERT INTO public.registrations (nim, offering_id, registered_at)
SELECT 'DUMMY_4_' || gs, 4, now()
FROM generate_series(1, 18) gs;

-- 5. JADWAL PERKULIAHAN (SCHEDULES) UNTUK SETIAP KELAS
INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang) VALUES
-- Literasi
(1, 'Senin', '08:00:00', '09:40:00', 'R. Literasi 1'),
(2, 'Selasa', '10:00:00', '11:40:00', 'R. Literasi 2'),
(3, 'Rabu', '13:00:00', '14:40:00', 'R. Literasi 1'),
(4, 'Kamis', '08:00:00', '09:40:00', 'R. Literasi 3'),

-- Ekonomi
(5, 'Senin', '10:00:00', '11:40:00', 'R. Ekonomi 1'),
(6, 'Selasa', '13:00:00', '14:40:00', 'R. Ekonomi 2'),
(7, 'Rabu', '08:00:00', '09:40:00', 'R. Ekonomi 1'),
(8, 'Kamis', '10:00:00', '11:40:00', 'R. Ekonomi 3'),

-- Pengawetan
(9, 'Senin', '13:00:00', '14:40:00', 'Lab. Pengolahan'),
(10, 'Selasa', '08:00:00', '09:40:00', 'Lab. Pengolahan'),
(11, 'Rabu', '10:00:00', '11:40:00', 'Lab. Pengolahan'),
(12, 'Kamis', '13:00:00', '14:40:00', 'Lab. Pengolahan'),

-- Biofuel
(13, 'Senin', '15:00:00', '16:40:00', 'Lab. Energi'),
(14, 'Selasa', '15:00:00', '16:40:00', 'Lab. Energi'),
(15, 'Rabu', '15:00:00', '16:40:00', 'Lab. Energi'),
(16, 'Jumat', '08:00:00', '09:40:00', 'Lab. Energi'),

-- Pengolahan Hasil
(17, 'Senin', '08:00:00', '09:40:00', 'R. THP 1'),
(18, 'Selasa', '10:00:00', '11:40:00', 'R. THP 2'),
(19, 'Kamis', '15:00:00', '16:40:00', 'R. THP 1'),
(20, 'Jumat', '13:30:00', '15:10:00', 'R. THP 2'),

-- Agroforestry
(21, 'Rabu', '08:00:00', '09:40:00', 'R. Kehutanan 1'),
(22, 'Kamis', '10:00:00', '11:40:00', 'R. Kehutanan 2'),

-- Precision
(23, 'Rabu', '10:00:00', '11:40:00', 'Lab. Komputer 1'),
(24, 'Kamis', '13:00:00', '14:40:00', 'Lab. Komputer 2'),

-- GIS
(25, 'Selasa', '13:00:00', '14:40:00', 'Lab. GIS'),
(26, 'Rabu', '15:00:00', '16:40:00', 'Lab. GIS'),

-- Pasca Panen
(27, 'Senin', '10:00:00', '11:40:00', 'R. Agronomi 1'),
(28, 'Selasa', '08:00:00', '09:40:00', 'R. Agronomi 2'),
(29, 'Kamis', '13:00:00', '14:40:00', 'R. Agronomi 1'),
(30, 'Jumat', '08:00:00', '09:40:00', 'R. Agronomi 2'),

-- Hama Penyakit
(31, 'Senin', '13:00:00', '14:40:00', 'Lab. Proteksi'),
(32, 'Rabu', '13:00:00', '14:40:00', 'Lab. Proteksi'),
(33, 'Kamis', '08:00:00', '09:40:00', 'Lab. Proteksi'),
(34, 'Jumat', '13:30:00', '15:10:00', 'Lab. Proteksi'),

-- Proyek Mandiri
(35, 'Selasa', '08:00:00', '09:40:00', 'Aula Pertanian & Lapangan');

-- Buka kembali portal
UPDATE public.settings SET portal_open = true WHERE id = 1;

COMMIT;
