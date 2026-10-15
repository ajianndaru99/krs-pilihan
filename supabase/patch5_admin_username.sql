-- ============================================================================
-- PATCH 5: Dukungan Login Admin Menggunakan Username & Password
-- Jalankan skrip ini jika database Supabase Anda sudah menjalankan skema sebelumnya.
-- ============================================================================

-- 1. Tambah kolom username pada tabel admins
ALTER TABLE public.admins ADD COLUMN IF NOT EXISTS username TEXT UNIQUE;

-- 2. Perbarui fungsi is_admin agar mengenali username dan domain admin.local
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE email = auth.jwt() ->> 'email'
       OR (username IS NOT NULL AND (
            username = auth.jwt() ->> 'email'
            OR username = split_part(auth.jwt() ->> 'email', '@', 1)
          ))
  );
$$;

-- 3. Daftarkan akun admin default (Username: admin)
INSERT INTO public.admins (email, username)
VALUES ('admin@admin.local', 'admin')
ON CONFLICT (email) DO UPDATE SET username = EXCLUDED.username;
