-- ==============================================================================
-- SKRIP PENYIAPAN 420 MAHASISWA (14 KELAS RIIL) & RESET TOTAL PENGUJIAN
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Menyiapkan 420 mahasiswa (14 kelas x 30 mhs) untuk pengujian beban beruntun:
-- 1. Skenario 30 mahasiswa serentak berebut 1 kelas kuota 25 (25 sukses, 5 mental).
-- 2. Skenario gelombang bertingkat: 50 serentak, 100 serentak, hingga 420 tuntas.
-- ==============================================================================

BEGIN;

-- 1. Bersihkan seluruh registrasi, antrian, kendala, dan log uji coba lama
DELETE FROM public.registrations;
DELETE FROM public.queue;
DELETE FROM public.access_requests;
DELETE FROM public.student_complaints;
DELETE FROM public.system_logs;

-- 2. Pastikan Portal Terbuka & Konfigurasi Sesi Maksimal 30 Mahasiswa Aktif
UPDATE public.settings
SET portal_open = true,
    max_active = 30,
    session_duration_minutes = 5,
    need_matkul = 3,
    need_proyek = 1
WHERE id = 1;

-- 3. Masukkan 420 Mahasiswa Dummy Bersih Terbagi Merata ke 14 Kelas Riil:
--    - SPKS A s/d SPKS J (10 kelas x 30 = 300 mhs)
--    - ANTAN A & ANTAN B (2 kelas x 30 = 60 mhs)
--    - AGR A & AGR B     (2 kelas x 30 = 60 mhs)
--    Total = 14 kelas x 30 mhs = 420 Mahasiswa
INSERT INTO public.students (nim, nama, kelas, registered_at)
SELECT 
    '2410211' || lpad(g::text, 3, '0') AS nim,
    'Mahasiswa ' || (ARRAY[
        'SPKS A', 'SPKS B', 'SPKS C', 'SPKS D', 'SPKS E', 
        'SPKS F', 'SPKS G', 'SPKS H', 'SPKS I', 'SPKS J', 
        'ANTAN A', 'ANTAN B', 'AGR A', 'AGR B'
    ])[1 + ((g - 1) % 14)] || ' #' || lpad(CEIL(g::float / 14)::text, 2, '0') AS nama,
    (ARRAY[
        'SPKS A', 'SPKS B', 'SPKS C', 'SPKS D', 'SPKS E', 
        'SPKS F', 'SPKS G', 'SPKS H', 'SPKS I', 'SPKS J', 
        'ANTAN A', 'ANTAN B', 'AGR A', 'AGR B'
    ])[1 + ((g - 1) % 14)] AS kelas,
    NULL AS registered_at
FROM generate_series(1, 420) g
ON CONFLICT (nim) DO UPDATE SET
    nama = EXCLUDED.nama,
    kelas = EXCLUDED.kelas,
    registered_at = NULL;

-- Juga sediakan 70 mahasiswa uji seri lama (2110211001-2110211070) jika diperlukan
INSERT INTO public.students (nim, nama, kelas, registered_at)
SELECT 
    '2110211' || lpad(g::text, 3, '0') AS nim,
    'Mahasiswa Uji ' || g AS nama,
    (ARRAY['AGR A', 'AGR B', 'SPKS A'])[1 + (g % 3)] AS kelas,
    NULL AS registered_at
FROM generate_series(1, 70) g
ON CONFLICT (nim) DO UPDATE SET
    nama = EXCLUDED.nama,
    kelas = EXCLUDED.kelas,
    registered_at = NULL;

COMMIT;

-- ==============================================================================
-- Kueri Verifikasi Kesiapan (Total students harus 420 + 70 = 490, lainnya 0):
-- ==============================================================================
SELECT 'students_2410' AS tabel, count(*) AS total FROM public.students WHERE nim BETWEEN '2410211001' AND '2410211420'
UNION ALL
SELECT 'registrations', count(*) FROM public.registrations
UNION ALL
SELECT 'queue', count(*) FROM public.queue
UNION ALL
SELECT 'offerings', count(*) FROM public.offerings;
