-- ============================================================================
-- 2. patch_admin_nim_only.sql
-- Login NIM saja, cek_nim, antrian dasar, dan fungsi admin dengan tabel admins
-- ============================================================================

-- 2.1 Tabel Admin
CREATE TABLE IF NOT EXISTS public.admins (
    email TEXT PRIMARY KEY,
    role TEXT NOT NULL DEFAULT 'admin',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.admins ENABLE ROW LEVEL SECURITY;

-- Helper untuk verifikasi admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE email = auth.jwt() ->> 'email'
  );
$$;

-- 2.2 Fungsi cek_nim (Login NIM saja dengan penyamaran nama)
CREATE OR REPLACE FUNCTION public.cek_nim(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_sudah_daftar BOOLEAN;
    v_nama_parts TEXT[];
    v_samar TEXT := '';
    v_part TEXT;
    v_idx INT;
    v_portal_open BOOLEAN;
BEGIN
    SELECT portal_open INTO v_portal_open FROM public.settings WHERE id = 1;
    
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar dalam database mahasiswa.');
    END IF;

    -- Periksa apakah sudah terdaftar
    v_sudah_daftar := (v_student.registered_at IS NOT NULL) OR EXISTS (
        SELECT 1 FROM public.registrations WHERE nim = v_student.nim
    );

    -- Samarkan nama: misal 'BUDI PRASETYO' -> 'B*** P***'
    v_nama_parts := string_to_array(trim(v_student.nama), ' ');
    FOR v_idx IN 1..array_length(v_nama_parts, 1) LOOP
        v_part := v_nama_parts[v_idx];
        IF length(v_part) > 1 THEN
            v_samar := v_samar || left(v_part, 1) || repeat('*', length(v_part) - 1) || ' ';
        ELSE
            v_samar := v_samar || v_part || ' ';
        END IF;
    END LOOP;
    v_samar := trim(v_samar);

    RETURN jsonb_build_object(
        'ok', true,
        'nama_samar', v_samar,
        'kelas', v_student.kelas,
        'butuh_pin', (v_student.pin IS NOT NULL AND v_student.pin <> ''),
        'sudah_terdaftar', v_sudah_daftar,
        'portal_open', v_portal_open
    );
END;
$$;

-- 2.3 Fungsi join_queue
CREATE OR REPLACE FUNCTION public.join_queue(p_nim TEXT, p_pin TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_token TEXT;
    v_state TEXT;
    v_portal_open BOOLEAN;
    v_active_count INT;
    v_max_active INT;
    v_session_min INT;
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

    -- Validasi PIN jika disyaratkan
    IF v_student.pin IS NOT NULL AND v_student.pin <> '' THEN
        IF p_pin IS NULL OR trim(p_pin) <> v_student.pin THEN
            RETURN jsonb_build_object('ok', false, 'error', 'PIN yang Anda masukkan salah.');
        END IF;
    END IF;

    -- Cek jika sudah pernah mendaftar
    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    -- Periksa antrian aktif yang ada untuk NIM ini
    SELECT token, state INTO v_token, v_state
    FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    IF FOUND THEN
        RETURN jsonb_build_object('ok', true, 'token', v_token, 'state', v_state);
    END IF;

    -- Cek jumlah active saat ini
    -- Bersihkan yang expired terlebih dahulu
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;

    v_token := gen_random_uuid()::text;

    IF v_active_count < v_max_active THEN
        v_state := 'active';
        INSERT INTO public.queue (token, nim, state, activated_at, expires_at)
        VALUES (v_token, v_student.nim, 'active', v_now, v_now + (v_session_min || ' minutes')::interval);
    ELSE
        v_state := 'waiting';
        INSERT INTO public.queue (token, nim, state)
        VALUES (v_token, v_student.nim, 'waiting');
    END IF;

    RETURN jsonb_build_object('ok', true, 'token', v_token, 'state', v_state);
END;
$$;

-- 2.4 Fungsi queue_status (Polling 10s)
CREATE OR REPLACE FUNCTION public.queue_status(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_q RECORD;
    v_posisi INT := 0;
    v_active_count INT := 0;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_sisa_detik INT := 0;
    v_est_menit INT := 0;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT max_active, session_duration_minutes INTO v_max_active, v_session_min FROM public.settings WHERE id = 1;

    -- Update yang sudah lewat batas waktu
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT * INTO v_q FROM public.queue WHERE token = p_token AND nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak ditemukan.');
    END IF;

    IF v_q.state = 'active' THEN
        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_q.expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_q.state := 'expired';
        END IF;
    ELSIF v_q.state = 'waiting' THEN
        -- Promosikan jika ada slot active kosong
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_max_active THEN
            -- Ambil nomor terkecil di antrian waiting
            IF (SELECT token FROM public.queue WHERE state = 'waiting' ORDER BY nomor ASC LIMIT 1) = p_token THEN
                UPDATE public.queue
                SET state = 'active', activated_at = v_now, expires_at = v_now + (v_session_min || ' minutes')::interval
                WHERE token = p_token;
                v_q.state := 'active';
                v_sisa_detik := v_session_min * 60;
            END IF;
        END IF;

        IF v_q.state = 'waiting' THEN
            SELECT count(*) INTO v_posisi FROM public.queue WHERE state = 'waiting' AND nomor < v_q.nomor;
            v_posisi := v_posisi + 1;
            v_est_menit := CEIL((v_posisi::NUMERIC / GREATEST(1, v_max_active)) * v_session_min);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'state', v_q.state,
        'nomor', v_q.nomor,
        'posisi', v_posisi,
        'estimasi_menit', v_est_menit,
        'sisa_detik', v_sisa_detik,
        'bisa_antri_lagi', true
    );
END;
$$;

-- 2.5 Fungsi hasil_saya (Bukti Pendaftaran)
CREATE OR REPLACE FUNCTION public.hasil_saya(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_pilihan JSONB;
BEGIN
    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    SELECT COALESCE(jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'jenis', o.jenis,
            'topik', o.topik,
            'jadwal', COALESCE((
                SELECT jsonb_agg(
                    jsonb_build_object('hari', s.hari, 'jam_mulai', s.jam_mulai::text, 'jam_selesai', s.jam_selesai::text, 'ruang', s.ruang)
                ) FROM public.schedules s WHERE s.offering_id = o.id
            ), '[]'::jsonb)
        )
    ), '[]'::jsonb)
    INTO v_pilihan
    FROM public.registrations r
    JOIN public.offerings o ON o.id = r.offering_id
    WHERE r.nim = v_student.nim;

    RETURN jsonb_build_object(
        'ok', true,
        'mahasiswa', jsonb_build_object(
            'nim', v_student.nim,
            'nama', v_student.nama,
            'kelas', v_student.kelas
        ),
        'pendaftaran', jsonb_build_object(
            'waktu_daftar', v_student.registered_at,
            'pilihan', v_pilihan
        )
    );
END;
$$;

-- 2.6 Fungsi Admin: Status & Kontrol Portal
CREATE OR REPLACE FUNCTION public.admin_status()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_portal BOOLEAN;
    v_tot_stud INT;
    v_tot_reg INT;
    v_act_q INT;
    v_no_sched_off INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT portal_open INTO v_portal FROM public.settings WHERE id = 1;
    SELECT count(*) INTO v_tot_stud FROM public.students;
    SELECT count(DISTINCT nim) INTO v_tot_reg FROM public.registrations;
    SELECT count(*) INTO v_act_q FROM public.queue WHERE state = 'active' AND expires_at >= now();
    SELECT count(*) INTO v_no_sched_off FROM public.offerings o WHERE NOT EXISTS (SELECT 1 FROM public.schedules s WHERE s.offering_id = o.id);

    RETURN jsonb_build_object(
        'ok', true,
        'portal_open', v_portal,
        'total_students', v_tot_stud,
        'total_registered', v_tot_reg,
        'active_queue', v_act_q,
        'offerings_without_schedule', v_no_sched_off,
        'classes_without_schedule', 0
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_toggle_portal(p_buka BOOLEAN)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    UPDATE public.settings SET portal_open = p_buka WHERE id = 1;
    RETURN jsonb_build_object('ok', true, 'portal_open', p_buka);
END;
$$;

-- 2.7 Fungsi Admin: Kelola Kuota & Pilihan
CREATE OR REPLACE FUNCTION public.admin_list_offerings()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    RETURN (
        SELECT jsonb_agg(
            jsonb_build_object(
                'id', o.id,
                'nama', o.nama,
                'jenis', o.jenis,
                'topik', o.topik,
                'kuota', o.kuota,
                'terisi', (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id),
                'sisa', GREATEST(0, o.kuota - (SELECT count(*) FROM public.registrations r WHERE r.offering_id = o.id))::INT
            ) ORDER BY o.jenis, o.nama
        ) FROM public.offerings o
    );
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_update_kuota(p_offering_id INT, p_kuota INT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    UPDATE public.offerings SET kuota = p_kuota WHERE id = p_offering_id;
    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_batal_daftar(p_nim TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    DELETE FROM public.registrations WHERE nim = trim(p_nim);
    UPDATE public.students SET registered_at = NULL WHERE nim = trim(p_nim);
    DELETE FROM public.queue WHERE nim = trim(p_nim);

    RETURN jsonb_build_object('ok', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.admin_export_pendaftaran()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak.');
    END IF;

    RETURN (
        SELECT COALESCE(jsonb_agg(
            jsonb_build_object(
                'NIM', s.nim,
                'Nama', s.nama,
                'Kelas', s.kelas,
                'Mata Kuliah / Proyek', o.nama,
                'Jenis', o.jenis,
                'Topik', o.topik,
                'Waktu Registrasi', r.created_at
            ) ORDER BY s.nim, o.jenis, o.nama
        ), '[]'::jsonb)
        FROM public.registrations r
        JOIN public.students s ON s.nim = r.nim
        JOIN public.offerings o ON o.id = r.offering_id
    );
END;
$$;

-- Grant EXECUTE to anon dan authenticated
GRANT EXECUTE ON FUNCTION public.cek_nim(TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.hasil_saya(TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_status() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_toggle_portal(BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_offerings() TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_kuota(INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_batal_daftar(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_export_pendaftaran() TO authenticated;
