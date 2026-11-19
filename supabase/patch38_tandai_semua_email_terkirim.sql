-- ==============================================================================
-- PATCH 38: RPC TANDAI SEMUA EMAIL SEBAGAI TERKIRIM
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Kegunaan:
--   Menandai seluruh mahasiswa yang telah mendaftar dan memiliki email sebagai
--   sudah terkirim (email_terkirim = TRUE). Berguna untuk sinkronisasi awal data
--   yang telah terkirim sebelum patch 37 diterapkan.
-- ==============================================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.admin_tandai_semua_email_terkirim()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_updated INT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
  END IF;

  UPDATE public.students
  SET email_terkirim = TRUE
  WHERE registered_at IS NOT NULL
    AND email IS NOT NULL
    AND trim(email) <> ''
    AND trim(email) <> '-'
    AND email_terkirim = FALSE;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok', true,
    'updated', v_updated
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_tandai_semua_email_terkirim() TO authenticated;

COMMIT;
