-- ==============================================================================
-- PATCH 39: FUNGSI CEK STATUS EMAIL MAHASISWA & PEMBARUAN LIST PENDAFTAR
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Kegunaan:
--   1. admin_daftar_status_email(p_filter) → menampilkan daftar mahasiswa
--      lengkap dengan status apakah email sudah terkirim, belum, atau tanpa email.
--   2. admin_list_pendaftar() diperbarui agar menyertakan kolom email_terkirim.
-- ==============================================================================

BEGIN;

-- 1. Fungsi untuk melihat status email seluruh pendaftar (dengan filter)
CREATE OR REPLACE FUNCTION public.admin_daftar_status_email(p_filter TEXT DEFAULT 'all')
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_rows JSONB;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'nim', s.nim,
      'nama', s.nama,
      'kelas', COALESCE(s.kelas, '-'),
      'email', COALESCE(s.email, '-'),
      'email_terkirim', COALESCE(s.email_terkirim, FALSE),
      'registered_at', to_char(s.registered_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
    ) ORDER BY
      CASE 
        WHEN p_filter = 'belum_terkirim' THEN 0
        WHEN s.email IS NOT NULL AND trim(s.email) <> '' AND trim(s.email) <> '-' AND s.email_terkirim = FALSE THEN 0
        ELSE 1
      END,
      s.registered_at DESC NULLS LAST,
      s.nim DESC
  ) INTO v_rows
  FROM public.students s
  WHERE s.registered_at IS NOT NULL
    AND (
      p_filter = 'all'
      OR (p_filter = 'terkirim' AND s.email_terkirim = TRUE)
      OR (p_filter = 'belum_terkirim' AND s.email_terkirim = FALSE AND s.email IS NOT NULL AND trim(s.email) <> '' AND trim(s.email) <> '-')
      OR (p_filter = 'tanpa_email' AND (s.email IS NULL OR trim(s.email) = '' OR trim(s.email) = '-'))
    );

  RETURN jsonb_build_object(
    'ok', true,
    'data', COALESCE(v_rows, '[]'::JSONB)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_daftar_status_email(TEXT) TO authenticated;

-- 2. Perbarui admin_list_pendaftar() agar menyertakan email_terkirim
CREATE OR REPLACE FUNCTION public.admin_list_pendaftar()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_pendaftar JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'nim', s.nim,
            'nama', s.nama,
            'kelas', COALESCE(s.kelas, '-'),
            'email', COALESCE(s.email, '-'),
            'email_terkirim', COALESCE(s.email_terkirim, FALSE),
            'registered_at', to_char(COALESCE(s.registered_at, now()) AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'pilihan', COALESCE(p.arr, '[]'::jsonb)
        ) ORDER BY s.registered_at DESC NULLS LAST, s.nim DESC
    ) INTO v_pendaftar
    FROM public.students s
    JOIN (
        SELECT r.nim, jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'nama', o.nama,
                'jenis', o.jenis,
                'topik', COALESCE(o.topik, '-')
            ) ORDER BY o.jenis, o.nama
        ) AS arr
        FROM public.registrations r
        JOIN public.offerings o ON o.id = r.offering_id
        GROUP BY r.nim
    ) p ON p.nim = s.nim;

    RETURN jsonb_build_object('ok', true, 'pendaftar', COALESCE(v_pendaftar, '[]'::jsonb));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_pendaftar() TO authenticated;

COMMIT;
