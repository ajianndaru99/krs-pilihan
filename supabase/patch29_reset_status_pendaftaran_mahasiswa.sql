-- ==============================================================================
-- PATCH 29: RESET STATUS PENDAFTARAN MAHASISWA
-- Sistem Pemilihan Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- Me-reset status registered_at mahasiswa menjadi NULL agar seluruh mahasiswa
-- dapat langsung login dan memilih kelas pada data penawaran baru (multi-kelas).
-- ==============================================================================

BEGIN;

-- 1. Reset status pendaftaran mahasiswa
UPDATE public.students
SET registered_at = NULL;

-- 2. Pastikan transaksi pendaftaran dan antrian bersih
DELETE FROM public.registrations;
DELETE FROM public.queue;

-- 3. Pastikan portal terbuka
UPDATE public.settings
SET portal_open = true
WHERE id = 1;

COMMIT;
