-- ============================================================================
-- 3. patch2_kelas_opsional.sql
-- Kelas opsional pada tabel students, impor mahasiswa Excel, dan daftar_kelas
-- ============================================================================

-- 3.1 Pastikan kolom kelas bersifat opsional (nullable)
ALTER TABLE public.students ALTER COLUMN kelas DROP NOT NULL;

-- 3.2 Fungsi daftar_kelas
CREATE OR REPLACE FUNCTION public.daftar_kelas()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN (
        SELECT COALESCE(jsonb_agg(k), '[]'::jsonb)
        FROM (
            SELECT DISTINCT kelas AS k
            FROM public.students
            WHERE kelas IS NOT NULL AND trim(kelas) <> ''
            ORDER BY kelas
        ) sub
    );
END;
$$;

-- 3.3 Fungsi Admin: Impor Data Mahasiswa
CREATE OR REPLACE FUNCTION public.admin_import_students(p_students JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_item JSONB;
    v_nim TEXT;
    v_nama TEXT;
    v_kelas TEXT;
    v_count INT := 0;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    IF jsonb_typeof(p_students) <> 'array' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Format data tidak valid, harus berupa array JSON.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_students) LOOP
        v_nim := trim(v_item ->> 'nim');
        v_nama := trim(v_item ->> 'nama');
        v_kelas := trim(v_item ->> 'kelas');
        IF v_kelas = '' THEN
            v_kelas := NULL;
        END IF;

        IF v_nim IS NOT NULL AND v_nim <> '' AND v_nama IS NOT NULL AND v_nama <> '' THEN
            INSERT INTO public.students (nim, nama, kelas)
            VALUES (v_nim, v_nama, v_kelas)
            ON CONFLICT (nim) DO UPDATE
            SET nama = EXCLUDED.nama,
                kelas = COALESCE(EXCLUDED.kelas, students.kelas);
            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'imported_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar_kelas() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_import_students(JSONB) TO authenticated;
