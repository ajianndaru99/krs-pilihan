-- ==============================================================================
-- PATCH 8: Perbaikan join_queue (Expired Pre-Check & sisa_detik) + admin_list_pendaftar
-- ==============================================================================

-- 1. Perbarui join_queue agar tidak mengembalikan sesi kedaluwarsa dan mengembalikan sisa_detik
CREATE OR REPLACE FUNCTION public.join_queue(p_nim TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_token TEXT;
    v_state TEXT;
    v_expires_at TIMESTAMPTZ;
    v_portal_open BOOLEAN;
    v_active_count INT;
    v_max_active INT;
    v_session_min INT;
    v_sisa_detik INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT portal_open, max_active, session_duration_minutes
    INTO v_portal_open, v_max_active, v_session_min
    FROM public.settings WHERE id = 1;

    IF NOT v_portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang DITUTUP oleh administrator prodi.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar.');
    END IF;

    IF v_student.pin IS NOT NULL AND v_student.pin <> '' THEN
        IF p_pin IS NULL OR trim(p_pin) <> v_student.pin THEN
            RETURN jsonb_build_object('ok', false, 'error', 'PIN yang Anda masukkan salah.');
        END IF;
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    -- Update sesi usang sebelum mengecek status antrian aktif
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    -- Cari antrian yang masih aktif atau waiting
    SELECT token, state, expires_at INTO v_token, v_state, v_expires_at
    FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    IF FOUND THEN
        v_sisa_detik := CASE WHEN v_state = 'active' AND v_expires_at IS NOT NULL
            THEN GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT)
            ELSE 0 END;
        RETURN jsonb_build_object('ok', true, 'token', v_token, 'state', v_state, 'sisa_detik', v_sisa_detik);
    END IF;

    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;

    v_token := gen_random_uuid()::text;

    IF v_active_count < v_max_active THEN
        v_state := 'active';
        v_sisa_detik := v_session_min * 60;
        INSERT INTO public.queue (token, nim, state, activated_at, expires_at)
        VALUES (v_token, v_student.nim, 'active', v_now, v_now + (v_session_min || ' minutes')::interval);
    ELSE
        v_state := 'waiting';
        v_sisa_detik := 0;
        INSERT INTO public.queue (token, nim, state)
        VALUES (v_token, v_student.nim, 'waiting');
    END IF;

    RETURN jsonb_build_object('ok', true, 'token', v_token, 'state', v_state, 'sisa_detik', v_sisa_detik);
END;
$$;

-- 2. Fungsi Admin: Daftar Mahasiswa yang Sudah Masuk / Selesai Mendaftar
CREATE OR REPLACE FUNCTION public.admin_list_pendaftar()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk admin.');
    END IF;

    RETURN (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'nim', s.nim,
                'nama', s.nama,
                'kelas', s.kelas,
                'registered_at', s.registered_at,
                'pilihan', COALESCE((
                    SELECT jsonb_agg(
                        jsonb_build_object(
                            'id', o.id,
                            'nama', o.nama,
                            'jenis', o.jenis,
                            'topik', o.topik,
                            'jadwal', COALESCE((
                                SELECT jsonb_agg(
                                    jsonb_build_object(
                                        'hari', sc.hari,
                                        'jam_mulai', sc.jam_mulai::text,
                                        'jam_selesai', sc.jam_selesai::text,
                                        'ruang', sc.ruang
                                    )
                                ) FROM public.schedules sc WHERE sc.offering_id = o.id
                            ), '[]'::jsonb)
                        ) ORDER BY o.jenis, o.nama
                    )
                    FROM public.registrations r
                    JOIN public.offerings o ON o.id = r.offering_id
                    WHERE r.nim = s.nim
                ), '[]'::jsonb)
            ) ORDER BY s.registered_at DESC NULLS LAST, s.nim ASC
        ), '[]'::jsonb)
        FROM public.students s
        WHERE s.registered_at IS NOT NULL
           OR EXISTS (SELECT 1 FROM public.registrations r WHERE r.nim = s.nim)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_pendaftar() TO authenticated;
