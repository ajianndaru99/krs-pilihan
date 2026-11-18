-- ==============================================================================
-- PATCH 36: PENYIMPANAN EMAIL MAHASISWA & INTEGRASI DASHBOARD ADMIN
-- ==============================================================================
-- 1. Tambahkan kolom email pada tabel public.students
-- 2. Fungsi RPC simpan_email_mahasiswa() untuk menyimpan email bukti pendaftaran
-- 3. Pembaruan admin_list_pendaftar() agar menyertakan email mahasiswa
-- 4. Pembaruan admin_export_pendaftaran() agar menyertakan email mahasiswa
-- 5. Pembaruan hasil_saya() agar memuat email yang tersimpan
-- ==============================================================================

-- 1. Tambah kolom email jika belum ada
ALTER TABLE public.students ADD COLUMN IF NOT EXISTS email TEXT;

-- 2. Fungsi RPC untuk menyimpan email mahasiswa (bisa dipanggil setelah pendaftaran sukses)
CREATE OR REPLACE FUNCTION public.simpan_email_mahasiswa(p_nim TEXT, p_email TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(p_nim);
    v_clean_email TEXT := trim(p_email);
BEGIN
    IF v_clean_nim IS NULL OR v_clean_nim = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi.');
    END IF;

    UPDATE public.students
    SET email = v_clean_email
    WHERE nim = v_clean_nim;

    RETURN jsonb_build_object('ok', true, 'message', 'Email mahasiswa berhasil disimpan.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.simpan_email_mahasiswa(TEXT, TEXT) TO anon, authenticated;

-- 3. Pembaruan admin_list_pendaftar()
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

-- 4. Pembaruan admin_export_pendaftaran()
CREATE OR REPLACE FUNCTION public.admin_export_pendaftaran()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_data JSONB;
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
            'offering_id', o.id,
            'nama_pilihan', o.nama,
            'jenis', o.jenis,
            'topik', COALESCE(o.topik, '-'),
            'waktu_daftar', to_char(r.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS')
        ) ORDER BY r.created_at ASC, s.nim ASC
    ) INTO v_data
    FROM public.registrations r
    JOIN public.students s ON s.nim = r.nim
    JOIN public.offerings o ON o.id = r.offering_id;

    RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_data, '[]'::JSONB));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_export_pendaftaran() TO authenticated;

-- 5. Pembaruan hasil_saya() agar menyertakan email
CREATE OR REPLACE FUNCTION public.hasil_saya(p_nim TEXT, p_token TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(30) := trim(p_nim);
    v_student RECORD;
    v_pilihan JSONB;
    v_waktu_daftar TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM tersebut tidak ditemukan.');
    END IF;

    -- Periksa apakah mahasiswa memiliki pendaftaran resmi di tabel registrations
    IF NOT EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object(
            'ok', false, 
            'error', 'Belum ada pendaftaran mata kuliah pilihan yang tersimpan untuk NIM ini.'
        );
    END IF;

    -- Ambil waktu daftar resmi dari tabel students atau created_at pendaftaran
    v_waktu_daftar := COALESCE(v_student.registered_at, (
        SELECT created_at FROM public.registrations WHERE nim = v_student.nim ORDER BY created_at ASC LIMIT 1
    ), now());

    -- Ambil daftar mata kuliah pilihan resmi beserta jadwalnya
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'kelas', COALESCE(o.kelas, 'A'),
            'topik', COALESCE(o.topik, ''),
            'jadwal', COALESCE(sched.arr, '[]'::JSONB)
        )
    ) INTO v_pilihan
    FROM public.registrations r
    JOIN public.offerings o ON o.id = r.offering_id
    LEFT JOIN (
        SELECT s.offering_id, jsonb_agg(
            jsonb_build_object(
                'hari', s.hari,
                'jam_mulai', to_char(s.jam_mulai, 'HH24:MI:SS'),
                'jam_selesai', to_char(s.jam_selesai, 'HH24:MI:SS'),
                'ruang', s.ruang
            ) ORDER BY s.hari, s.jam_mulai
        ) AS arr
        FROM public.schedules s
        GROUP BY s.offering_id
    ) sched ON sched.offering_id = o.id
    WHERE r.nim = v_student.nim;

    RETURN jsonb_build_object(
        'ok', true,
        'mahasiswa', jsonb_build_object(
            'nim', v_student.nim,
            'nama', v_student.nama,
            'kelas', COALESCE(v_student.kelas, '-'),
            'email', COALESCE(v_student.email, '')
        ),
        'pendaftaran', jsonb_build_object(
            'waktu_daftar', to_char(v_waktu_daftar AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'pilihan', COALESCE(v_pilihan, '[]'::JSONB)
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hasil_saya(TEXT, TEXT) TO anon, authenticated;
