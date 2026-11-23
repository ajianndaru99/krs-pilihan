-- ==============================================================================
-- PATCH 45: OPTIMASI INDEKS DAN EFISIENSI BEBAN SERVER (KAPASITAS 350-450 MAHASISWA)
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Kegunaan:
--   1. Mempercepat pengecekan bentrok jadwal di list_offerings() dan daftar()
--      dengan indeks komposit pada tabel schedules & class_schedules.
--   2. Mempercepat promosi antrean (ORDER BY nomor ASC) dengan partial index
--      pada tabel queue WHERE state = 'waiting'.
--   3. Mempercepat validasi sesi aktif (token & expires_at) dengan partial index
--      pada tabel queue WHERE state = 'active'.
--   4. Mempercepat pengecekan duplikasi pendaftaran mahasiswa di registrations.
-- ==============================================================================

BEGIN;

-- 1. Indeks komposit jadwal mata kuliah pilihan untuk pengecekan bentrok cepat
CREATE INDEX IF NOT EXISTS idx_schedules_offering_hari_jam 
ON public.schedules (offering_id, hari, jam_mulai, jam_selesai);

-- 2. Indeks komposit jadwal kelas tetap untuk perbandingan jam bentrok per kelas
CREATE INDEX IF NOT EXISTS idx_class_schedules_kelas_hari_jam 
ON public.class_schedules (kelas, hari, jam_mulai, jam_selesai);

-- 3. Partial index antrian FIFO berbasis nomor urut (mempercepat FOR UPDATE SKIP LOCKED)
CREATE INDEX IF NOT EXISTS idx_queue_waiting_nomor_fifo 
ON public.queue (nomor ASC) 
WHERE state = 'waiting';

-- 4. Partial index sesi aktif antrian untuk validasi sisa waktu dan expired check
CREATE INDEX IF NOT EXISTS idx_queue_active_token_exp 
ON public.queue (token, expires_at) 
WHERE state = 'active';

-- 5. Indeks gabungan pendaftaran untuk lookup cepat krs mahasiswa
CREATE INDEX IF NOT EXISTS idx_registrations_nim_offering 
ON public.registrations (nim, offering_id);

COMMIT;
