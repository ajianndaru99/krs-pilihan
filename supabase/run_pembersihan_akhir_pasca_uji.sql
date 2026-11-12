-- ==============================================================================
-- PEMBERSIHAN TOTAL DATA UJI SEBELUM HARI H PRODUKSI RESMI
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Jalankan HANYA setelah seluruh pengujian selesai dan sebelum mahasiswa asli memilih!
-- https://supabase.com/dashboard/project/vkoaezphrfojzkbpyfyw/sql
-- ==============================================================================

BEGIN;

-- 1. Hapus seluruh data pendaftaran, antrian, pengajuan, dan kendala dummy uji coba
DELETE FROM public.registrations WHERE nim BETWEEN '2110211001' AND '2110211070';
DELETE FROM public.queue WHERE nim BETWEEN '2110211001' AND '2110211070';
DELETE FROM public.access_requests WHERE nim BETWEEN '2110211001' AND '2110211070';
DELETE FROM public.student_complaints WHERE nim BETWEEN '2110211001' AND '2110211070';

-- 2. Hapus seluruh data mahasiswa dummy uji coba
DELETE FROM public.students WHERE nim BETWEEN '2110211001' AND '2110211070';

-- 3. Kunci kembali portal ke status TUTUP
UPDATE public.settings
SET portal_open = false
WHERE id = 1;

COMMIT;

-- Verifikasi akhir (Semua harus bernilai 0):
SELECT 'students_dummy' AS jenis, count(*) AS total FROM public.students WHERE nim BETWEEN '2110211001' AND '2110211070'
UNION ALL
SELECT 'registrations_dummy', count(*) FROM public.registrations WHERE nim BETWEEN '2110211001' AND '2110211070'
UNION ALL
SELECT 'queue_dummy', count(*) FROM public.queue WHERE nim BETWEEN '2110211001' AND '2110211070';

