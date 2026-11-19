-- ==============================================================================
-- PATCH 37: LACAK STATUS EMAIL TERKIRIM & RPC KIRIM ULANG BATCH ADMIN
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Strategi bebas biaya:
--   1. Tambah kolom email_terkirim (bool) agar status pengiriman tercatat permanen.
--   2. Fungsi admin_daftar_email_belum_terkirim() → daftar mahasiswa yang email
--      tersimpan tapi belum berhasil dikirim (untuk panel admin).
--   3. Fungsi admin_tandai_email_terkirim(p_nim) → dipanggil route handler setelah
--      Brevo berhasil merespons 2xx, menandai email sudah terkirim.
--   4. Fungsi admin_daftar_antrian_email(p_batas) → ambil maks p_batas baris
--      (default 50) yang belum terkirim, dipakai tombol "Kirim Ulang" di admin.
-- ==============================================================================

BEGIN;

-- 1. Tambah kolom email_terkirim ke tabel students
ALTER TABLE public.students
  ADD COLUMN IF NOT EXISTS email_terkirim BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. Daftar mahasiswa yang email tersimpan tapi belum terkirim
CREATE OR REPLACE FUNCTION public.admin_daftar_email_belum_terkirim()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'nim', s.nim,
      'nama', s.nama,
      'kelas', COALESCE(s.kelas, '-'),
      'email', s.email,
      'registered_at', to_char(s.registered_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
    ) ORDER BY s.registered_at ASC
  ) INTO v_rows
  FROM public.students s
  WHERE s.email IS NOT NULL
    AND trim(s.email) <> ''
    AND trim(s.email) <> '-'
    AND s.registered_at IS NOT NULL
    AND s.email_terkirim = FALSE;

  RETURN jsonb_build_object(
    'ok', true,
    'antrian', COALESCE(v_rows, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_daftar_email_belum_terkirim() TO authenticated;

-- 3. Tandai email sudah terkirim (dipanggil server-side setelah Brevo 2xx)
CREATE OR REPLACE FUNCTION public.admin_tandai_email_terkirim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Fungsi ini dipanggil oleh route handler server-side (anon key) setelah Brevo sukses.
  -- Tidak perlu is_admin() karena dipanggil dari server dengan konteks terpercaya.
  UPDATE public.students
  SET email_terkirim = TRUE
  WHERE nim = trim(p_nim);

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak ditemukan.');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Izinkan anon (dipanggil route handler /api/send-email via anon key)
GRANT EXECUTE ON FUNCTION public.admin_tandai_email_terkirim(TEXT) TO anon, authenticated;

-- 4. Ambil batch antrian email belum terkirim (maks p_batas baris; default 50)
CREATE OR REPLACE FUNCTION public.admin_ambil_antrian_email(p_batas INT DEFAULT 50)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows JSONB;
  v_batas INT := LEAST(COALESCE(p_batas, 50), 100); -- batas keras 100 per batch
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'nim', s.nim,
      'nama', s.nama,
      'email', s.email
    ) ORDER BY s.registered_at ASC
  ) INTO v_rows
  FROM (
    SELECT nim, nama, email, registered_at
    FROM public.students
    WHERE email IS NOT NULL
      AND trim(email) <> ''
      AND trim(email) <> '-'
      AND registered_at IS NOT NULL
      AND email_terkirim = FALSE
    ORDER BY registered_at ASC
    LIMIT v_batas
  ) s;

  RETURN jsonb_build_object(
    'ok', true,
    'antrian', COALESCE(v_rows, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ambil_antrian_email(INT) TO authenticated;

-- 5. Ringkasan status email untuk widget dashboard admin
CREATE OR REPLACE FUNCTION public.admin_ringkasan_email()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_total_daftar   INT;
  v_punya_email    INT;
  v_terkirim       INT;
  v_belum_terkirim INT;
  v_tanpa_email    INT;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
  END IF;

  SELECT count(*)::INT INTO v_total_daftar
  FROM public.students WHERE registered_at IS NOT NULL;

  SELECT count(*)::INT INTO v_punya_email
  FROM public.students
  WHERE registered_at IS NOT NULL
    AND email IS NOT NULL AND trim(email) <> '' AND trim(email) <> '-';

  SELECT count(*)::INT INTO v_terkirim
  FROM public.students
  WHERE registered_at IS NOT NULL AND email_terkirim = TRUE;

  SELECT count(*)::INT INTO v_belum_terkirim
  FROM public.students
  WHERE registered_at IS NOT NULL
    AND email IS NOT NULL AND trim(email) <> '' AND trim(email) <> '-'
    AND email_terkirim = FALSE;

  v_tanpa_email := v_total_daftar - v_punya_email;

  RETURN jsonb_build_object(
    'ok', true,
    'total_daftar',    v_total_daftar,
    'punya_email',     v_punya_email,
    'terkirim',        v_terkirim,
    'belum_terkirim',  v_belum_terkirim,
    'tanpa_email',     v_tanpa_email
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_ringkasan_email() TO authenticated;

COMMIT;
