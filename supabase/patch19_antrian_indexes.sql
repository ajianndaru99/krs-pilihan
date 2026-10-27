-- ==============================================================================
-- PATCH 19: OPTIMASI INDEKS PARSIAL ANTRIAN (PERFORMANCE HARDENING)
-- ==============================================================================
-- Menambahkan partial index pada baris antrian aktif dan tunggu untuk
-- memangkas overhead pemindaian tabel pada fungsi FOR UPDATE SKIP LOCKED
-- dan pengecekan sesi kedaluwarsa saat beban padat.
-- ==============================================================================

CREATE INDEX IF NOT EXISTS idx_queue_waiting_fifo 
ON public.queue(id ASC) 
WHERE state = 'waiting';

CREATE INDEX IF NOT EXISTS idx_queue_active_exp 
ON public.queue(expires_at) 
WHERE state = 'active';
