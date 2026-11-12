-- ==============================================================================
-- SKRIP PENYIAPAN 70 MAHASISWA UJI & RESET DATA UJI COBA
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Jalankan skrip ini di SQL Editor Supabase Dashboard:
-- https://supabase.com/dashboard/project/vkoaezphrfojzkbpyfyw/sql
-- ==============================================================================

BEGIN;

-- 1. Bersihkan seluruh registrasi, antrian, pengajuan, dan kendala uji coba (2110211001 s/d 2110211070)
DELETE FROM public.registrations WHERE nim BETWEEN '2110211001' AND '2110211070';
DELETE FROM public.queue WHERE nim BETWEEN '2110211001' AND '2110211070';
DELETE FROM public.access_requests WHERE nim BETWEEN '2110211001' AND '2110211070';
DELETE FROM public.student_complaints WHERE nim BETWEEN '2110211001' AND '2110211070';

-- 2. Pastikan Portal Terbuka & Pengaturan Sesi Default (30 Slot Aktif, Durasi 5 Menit)
UPDATE public.settings
SET portal_open = true,
    max_active = 30,
    session_duration_minutes = 5,
    need_matkul = 3,
    need_proyek = 1
WHERE id = 1;

-- 3. Masukkan 70 Mahasiswa Dummy Bersih (NIM 2110211001 s/d 2110211070)
--    Dibagi merata ke kelas tetap AGR-A, AGR-B, dan AGR-C
INSERT INTO public.students (nim, nama, kelas, registered_at)
SELECT 
    '2110211' || lpad(g::text, 3, '0') AS nim,
    'Mahasiswa Uji ' || g AS nama,
    (ARRAY['AGR-A', 'AGR-B', 'AGR-C'])[1 + (g % 3)] AS kelas,
    NULL AS registered_at
FROM generate_series(1, 70) g
ON CONFLICT (nim) DO UPDATE SET
    nama = EXCLUDED.nama,
    kelas = EXCLUDED.kelas,
    registered_at = NULL;

COMMIT;

-- ==============================================================================
-- 4. Kueri Verifikasi Kesiapan (Jalankan untuk memastikan data siap diuji):
-- ==============================================================================
SELECT 'students' AS tabel, count(*) AS total FROM public.students WHERE nim BETWEEN '2110211001' AND '2110211070'
UNION ALL
SELECT 'registrations', count(*) FROM public.registrations WHERE nim BETWEEN '2110211001' AND '2110211070'
UNION ALL
SELECT 'queue', count(*) FROM public.queue WHERE nim BETWEEN '2110211001' AND '2110211070'
UNION ALL
SELECT 'access_requests', count(*) FROM public.access_requests WHERE nim BETWEEN '2110211001' AND '2110211070';

