-- ==============================================================================
-- PATCH 41: HAK EDIT EMAIL MAHASISWA OLEH ADMINISTRATOR
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Kegunaan:
--   Memberikan fungsi RPC kepada admin untuk memperbaiki/mengubah alamat email
--   mahasiswa yang salah ketik (typo) atau belum terisi saat pendaftaran KRS.
--   Fitur ini juga menyediakan opsi untuk otomatis mereset status email_terkirim
--   menjadi FALSE agar bukti KRS siap dikirimkan ke alamat email yang baru.
-- ==============================================================================

BEGIN;

-- 1. Fungsi RPC admin untuk memperbarui alamat email mahasiswa
CREATE OR REPLACE FUNCTION public.admin_update_email_mahasiswa(
    p_nim TEXT,
    p_email TEXT,
    p_reset_status BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim TEXT := trim(COALESCE(p_nim, ''));
    v_clean_email TEXT := trim(COALESCE(p_email, ''));
    v_student RECORD;
    v_new_terkirim BOOLEAN;
    v_log_msg TEXT;
BEGIN
    -- 1. Validasi hak akses administrator
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'Akses ditolak: Hanya untuk akun administrator.'
        );
    END IF;

    -- 2. Validasi NIM
    IF v_clean_nim = '' THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', 'NIM mahasiswa tidak boleh kosong.'
        );
    END IF;

    -- 3. Cari data mahasiswa
    SELECT * INTO v_student
    FROM public.students
    WHERE nim = v_clean_nim;

    IF NOT FOUND THEN
        RETURN jsonb_build_object(
            'ok', false,
            'error', format('Mahasiswa dengan NIM %s tidak ditemukan.', v_clean_nim)
        );
    END IF;

    -- 4. Normalisasi format email
    IF v_clean_email = '' OR v_clean_email = '-' THEN
        v_clean_email := NULL;
        v_new_terkirim := FALSE;
    ELSE
        -- Validasi sederhana struktur email (mengandung @ dan .)
        IF v_clean_email !~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$' THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', 'Format alamat email tidak valid. Pastikan penulisan domain benar (contoh: nama@domain.com).'
            );
        END IF;

        IF COALESCE(p_reset_status, TRUE) THEN
            v_new_terkirim := FALSE;
        ELSE
            v_new_terkirim := COALESCE(v_student.email_terkirim, FALSE);
        END IF;
    END IF;

    -- 5. Lakukan pembaruan pada tabel students
    UPDATE public.students
    SET 
        email = v_clean_email,
        email_terkirim = v_new_terkirim
    WHERE nim = v_clean_nim;

    -- 6. Catat riwayat perubahan ke system_logs
    v_log_msg := format(
        'Admin memperbarui email mahasiswa %s (%s). Email lama: "%s", Email baru: "%s", Status terkirim direset: %s',
        v_student.nama,
        v_clean_nim,
        COALESCE(v_student.email, '-'),
        COALESCE(v_clean_email, '(dikosongkan)'),
        CASE WHEN v_new_terkirim = FALSE THEN 'YA' ELSE 'TIDAK' END
    );

    INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
    VALUES (
        'info',
        'ADMIN_UPDATE_EMAIL',
        v_clean_nim,
        v_student.nama,
        v_log_msg,
        jsonb_build_object(
            'email_lama', v_student.email,
            'email_baru', v_clean_email,
            'email_terkirim', v_new_terkirim,
            'reset_status', p_reset_status
        )
    );

    RETURN jsonb_build_object(
        'ok', true,
        'message', format('Email mahasiswa %s (%s) berhasil diperbarui.', v_student.nama, v_clean_nim),
        'nim', v_clean_nim,
        'nama', v_student.nama,
        'email', COALESCE(v_clean_email, '-'),
        'email_terkirim', v_new_terkirim
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_update_email_mahasiswa(TEXT, TEXT, BOOLEAN) TO authenticated;

COMMIT;
