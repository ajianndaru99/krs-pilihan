-- ==============================================================================
-- PATCH 18: PEMBERSIHAN FUNGSI RESET ANTRIAN ADMIN
-- ==============================================================================
-- Sesuai penerapan Opsi 4 (Antrian Fleksibel), mahasiswa kini dapat mencoba antri
-- secara mandiri tanpa terkena batas mati antri ulang.
-- Maka fungsi reset antrian admin tidak lagi dibutuhkan dan dihapus dari database.
-- ==============================================================================

DROP FUNCTION IF EXISTS public.admin_reset_queue_student(TEXT);
DROP FUNCTION IF EXISTS public.admin_reset_all_expired_queue();
