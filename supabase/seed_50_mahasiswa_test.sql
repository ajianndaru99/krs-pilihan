-- ==============================================================================
-- SEED DATA 50 MAHASISWA DUMMY UNTUK PENGUJIAN BEBAN (30 AKTIF + 20 WAITING)
-- ==============================================================================
-- Skrip ini memasukkan 50 mahasiswa unik (NIM 2110211001 s/d 2110211050)
-- dan mereset status registrasi serta antrian agar siap diuji serentak.
-- ==============================================================================

-- 1. Bersihkan antrian & registrasi uji coba sebelumnya
DELETE FROM public.registrations WHERE nim LIKE '2110211%';
DELETE FROM public.queue WHERE nim LIKE '2110211%';

-- 2. Pastikan Portal Terbuka & Kapasitas 30 Aktif
UPDATE public.settings 
SET portal_open = true, 
    max_active = 30, 
    session_duration_minutes = 5,
    need_matkul = 3,
    need_proyek = 1
WHERE id = 1;

-- 3. Masukkan 50 Mahasiswa Dummy Unik
INSERT INTO public.students (nim, nama, kelas, registered_at) VALUES
('2110211001', 'Ahmad Fauzan Pratama', 'AGR-A', NULL),
('2110211002', 'Siti Nurhaliza Zahra', 'AGR-A', NULL),
('2110211003', 'Budi Santoso', 'AGR-B', NULL),
('2110211004', 'Dewi Lestari Kusuma', 'AGR-B', NULL),
('2110211005', 'Rian Hidayat Syahputra', 'AGR-C', NULL),
('2110211006', 'Putri Ayu Wulandari', 'AGR-C', NULL),
('2110211007', 'Kevin Pratama Wijaya', 'AGR-A', NULL),
('2110211008', 'Nabila Rahmawati', 'AGR-A', NULL),
('2110211009', 'Dimas Aditya Nugraha', 'AGR-B', NULL),
('2110211010', 'Zahra Maharani Putri', 'AGR-C', NULL),
('2110211011', 'Fajar Ramadhan', 'AGR-A', NULL),
('2110211012', 'Anisa Tri Wahyuni', 'AGR-A', NULL),
('2110211013', 'Bagas Eka Saputra', 'AGR-B', NULL),
('2110211014', 'Rizky Firmansyah', 'AGR-B', NULL),
('2110211015', 'Mega Silvia Lestari', 'AGR-C', NULL),
('2110211016', 'Hendra Gunawan', 'AGR-C', NULL),
('2110211017', 'Intan Permatasari', 'AGR-A', NULL),
('2110211018', 'Yoga Pratama Putra', 'AGR-A', NULL),
('2110211019', 'Taufik Hidayatullah', 'AGR-B', NULL),
('2110211020', 'Laras Setyowati', 'AGR-C', NULL),
('2110211021', 'Dedi Kurniawan', 'AGR-A', NULL),
('2110211022', 'Fitri Handayani', 'AGR-A', NULL),
('2110211023', 'Gilang Ramadhan', 'AGR-B', NULL),
('2110211024', 'Hana Novitasari', 'AGR-B', NULL),
('2110211025', 'Irfan Maulana', 'AGR-C', NULL),
('2110211026', 'Joko Susilo', 'AGR-C', NULL),
('2110211027', 'Kartika Sari Dewi', 'AGR-A', NULL),
('2110211028', 'Lukman Hakim', 'AGR-A', NULL),
('2110211029', 'Maya Anggraini', 'AGR-B', NULL),
('2110211030', 'Nurul Fatimah', 'AGR-C', NULL),
('2110211031', 'Oki Setiawan', 'AGR-A', NULL),
('2110211032', 'Pradita Ayu Wardani', 'AGR-A', NULL),
('2110211033', 'Qori Amelia', 'AGR-B', NULL),
('2110211034', 'Reza Pahlevi', 'AGR-B', NULL),
('2110211035', 'Sandi Wijaya', 'AGR-C', NULL),
('2110211036', 'Tiara Puspa Kirana', 'AGR-C', NULL),
('2110211037', 'Umar Al Faruq', 'AGR-A', NULL),
('2110211038', 'Vina Yuliana', 'AGR-A', NULL),
('2110211039', 'Wahyu Setiaji', 'AGR-B', NULL),
('2110211040', 'Xaverius Bayu', 'AGR-C', NULL),
('2110211041', 'Yudha Pratama', 'AGR-A', NULL),
('2110211042', 'Zulham Affandi', 'AGR-A', NULL),
('2110211043', 'Agung Nugroho', 'AGR-B', NULL),
('2110211044', 'Bella Safitri', 'AGR-B', NULL),
('2110211045', 'Candra Wijaya', 'AGR-C', NULL),
('2110211046', 'Dina Mariana', 'AGR-C', NULL),
('2110211047', 'Eko Prasetyo', 'AGR-A', NULL),
('2110211048', 'Farah Diba', 'AGR-A', NULL),
('2110211049', 'Genta Buana', 'AGR-B', NULL),
('2110211050', 'Hesti Wulandari', 'AGR-C', NULL)
ON CONFLICT (nim) DO UPDATE SET
    nama = EXCLUDED.nama,
    kelas = EXCLUDED.kelas,
    registered_at = NULL;
