-- ==============================================================================
-- PATCH 20: PERBAIKAN TEMUAN KRITIS REVIEWER (OCTOBER 2026)
-- ==============================================================================
-- 1. KRITIS 1: PENCEGAHAN KUOTA JEBOL DI daftar()
--    Mengunci baris offerings secara deterministik (FOR UPDATE) pada statement terpisah
--    sebelum menghitung kuota terisi. Transaksi konkuren yang menunggu kunci dijamin
--    akan membaca snapshot terbaru yang sudah dicommit oleh transaksi sebelumnya.
-- 2. KRITIS 2: PENUTUPAN CELAH HAK AKSES is_admin()
--    Menghapus pencocokan username/prefix email. HANYA mencocokkan email lengkap
--    yang terdaftar secara persis di tabel public.admins.
-- 3. KRITIS 3: PERBAIKAN queue_status(), ajukan_akses(), dan admin_import_students()
--    - queue_status(): menggunakan kolom `nomor` dan `token` (bukan id/queue_number).
--    - ajukan_akses(): menyimpan ke kolom `catatan`, mendukung 4 dan 5 parameter.
--    - admin_import_students(): menyertakan `extensions` di search_path agar `digest()`
--      dari pgcrypto dapat ditemukan tanpa error.
-- 4. PENYEMPURNAAN join_queue():
--    Mengunci baris `settings` (FOR UPDATE) untuk alokasi slot aktif atomik sehingga
--    batas 30 slot aktif tidak terlampaui saat serbuan konkuren.
-- ==============================================================================

-- Pastikan ekstensi pgcrypto tersedia di schema extensions atau public
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

-- ------------------------------------------------------------------------------
-- 1. PERBAIKAN is_admin(): HANYA EMAIL LENGKAP YANG TERDAFTAR
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.admins
    WHERE lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, anon;

-- ------------------------------------------------------------------------------
-- 2. PERBAIKAN daftar(): CEGAH KUOTA JEBOL DENGAN ROW-LOCK DETERMINISTIK TERPISAH
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_off_id INT;
    v_matkul_count INT := 0;
    v_proyek_count INT := 0;
    v_topik_arr TEXT[] := ARRAY[]::TEXT[];
    v_current_terisi INT;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pendaftaran saat ini ditutup.');
    END IF;

    -- 1. Kunci baris mahasiswa eksklusif (mencegah pendaftaran ganda dari NIM yang sama)
    SELECT * INTO v_student FROM public.students 
    WHERE nim = trim(p_nim) 
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa tidak ditemukan.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    -- 2. Kunci baris sesi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = v_student.nim AND state = 'active' AND expires_at >= now()
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid.');
    END IF;

    -- 3. Validasi komposisi jumlah pilihan
    IF p_offering_ids IS NULL OR array_length(p_offering_ids, 1) <> (v_settings.need_matkul + v_settings.need_proyek) THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Jumlah pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- 4. KUNCI BARIS OFFERINGS TERPISAH SECARA DETERMINISTIK (urut ID ASC)
    -- Ini menjamin transaksi konkuren pada offering yang sama mengantri di sini.
    -- Ketika transaksi unblock, statement baru di bawah akan melihat data snapshot terbaru (Read Committed)
    -- yang sudah dicommit oleh pendaftar sebelumnya.
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    -- 5. Periksa kuota dan aturan bisnis pada snapshot segar setelah kunci dipegang
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        -- Hitung pendaftar terisi terkini secara presisi dari registrations
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Kuota untuk mata kuliah "%s" sudah penuh (%s/%s). Silakan pilih mata kuliah lain.', v_off.nama, v_current_terisi, v_off.kuota)
            );
        END IF;

        IF v_off.jenis = 'matkul' THEN
            v_matkul_count := v_matkul_count + 1;
        ELSIF v_off.jenis = 'proyek' THEN
            v_proyek_count := v_proyek_count + 1;
        END IF;

        IF v_off.topik IS NOT NULL AND v_off.topik <> '' THEN
            IF v_off.topik = ANY(v_topik_arr) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Topik mata kuliah kembar terdeteksi: %s.', v_off.topik));
            END IF;
            v_topik_arr := array_append(v_topik_arr, v_off.topik);
        END IF;

        -- Cek bentrok dengan jadwal kelas tetap mahasiswa
        IF v_student.kelas IS NOT NULL AND trim(v_student.kelas) <> '' THEN
            IF EXISTS (
                SELECT 1
                FROM public.schedules s
                JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
                WHERE s.offering_id = v_off.id
                  AND lower(trim(s.hari)) = lower(trim(cs.hari))
                  AND s.jam_mulai < cs.jam_selesai
                  AND cs.jam_mulai < s.jam_selesai
            ) THEN
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s bentrok dengan jadwal kelas tetap Anda.', v_off.nama));
            END IF;
        END IF;
    END LOOP;

    IF v_matkul_count <> v_settings.need_matkul OR v_proyek_count <> v_settings.need_proyek THEN
        RETURN jsonb_build_object('ok', false, 'error', format('Komposisi pilihan harus tepat %s matkul dan %s proyek.', v_settings.need_matkul, v_settings.need_proyek));
    END IF;

    -- Cek bentrok jadwal antar mata kuliah pilihan yang dipilih
    IF EXISTS (
        SELECT 1
        FROM public.schedules s1
        JOIN public.schedules s2 ON s1.id <> s2.id AND s1.offering_id <> s2.offering_id
        WHERE s1.offering_id = ANY(p_offering_ids)
          AND s2.offering_id = ANY(p_offering_ids)
          AND lower(trim(s1.hari)) = lower(trim(s2.hari))
          AND s1.jam_mulai < s2.jam_selesai
          AND s2.jam_mulai < s1.jam_selesai
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat bentrok jadwal antar mata kuliah pilihan yang Anda pilih.');
    END IF;

    -- 6. Simpan pendaftaran secara atomik
    UPDATE public.students 
    SET registered_at = now() 
    WHERE nim = v_student.nim AND registered_at IS NULL;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah pernah menyelesaikan pendaftaran.');
    END IF;

    FOREACH v_off_id IN ARRAY p_offering_ids LOOP
        INSERT INTO public.registrations (nim, offering_id)
        VALUES (v_student.nim, v_off_id);
    END LOOP;

    UPDATE public.queue SET state = 'done' WHERE token = p_token;

    RETURN jsonb_build_object('ok', true, 'message', 'Pendaftaran berhasil disimpan.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. PERBAIKAN queue_status(): MENGGUNAKAN KOLOM NOMOR & TOKEN (BUKAN ID)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.queue_status(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state TEXT;
    v_nomor INT;
    v_expires_at TIMESTAMPTZ;
    v_posisi INT := 0;
    v_active_count INT := 0;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_sisa_detik INT := 0;
    v_est_menit INT := 0;
    v_now TIMESTAMPTZ := now();
    v_next_token TEXT;
BEGIN
    SELECT max_active, session_duration_minutes INTO v_max_active, v_session_min FROM public.settings WHERE id = 1;

    -- Update sesi yang sudah lewat batas waktu
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    SELECT state, nomor, expires_at INTO v_state, v_nomor, v_expires_at
    FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak ditemukan.');
    END IF;

    IF v_state = 'active' THEN
        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_state := 'expired';
        END IF;
    ELSIF v_state = 'waiting' THEN
        -- Promosikan antrian teratas jika ada slot active yang kosong
        SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
        IF v_active_count < v_max_active THEN
            -- Ambil nomor antrian waiting paling awal dengan SKIP LOCKED untuk mencegah race condition
            SELECT token INTO v_next_token 
            FROM public.queue 
            WHERE state = 'waiting' 
            ORDER BY nomor ASC 
            LIMIT 1
            FOR UPDATE SKIP LOCKED;

            IF v_next_token = p_token THEN
                UPDATE public.queue
                SET state = 'active', 
                    activated_at = v_now, 
                    expires_at = v_now + (v_session_min || ' minutes')::interval
                WHERE token = p_token;
                
                v_state := 'active';
                v_sisa_detik := v_session_min * 60;
            END IF;
        END IF;

        IF v_state = 'waiting' THEN
            SELECT count(*) INTO v_posisi FROM public.queue WHERE state = 'waiting' AND nomor < v_nomor;
            v_est_menit := CEIL((v_posisi + 1)::FLOAT / GREATEST(1, v_max_active)::FLOAT * 1.5)::INT;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'ok', true,
        'state', v_state,
        'token', p_token,
        'nomor', v_nomor,
        'posisi', CASE WHEN v_state = 'waiting' THEN v_posisi + 1 ELSE 0 END,
        'estimasi_menit', v_est_menit,
        'sisa_detik', v_sisa_detik
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 4. PERBAIKAN ajukan_akses(): MENYIMPAN KE KOLOM CATATAN (4 & 5 PARAMETER)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ajukan_akses(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT,
    p_catatan TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_nim TEXT := trim(p_nim);
    v_nama TEXT := trim(p_nama);
    v_kelas TEXT := trim(p_kelas);
    v_catatan TEXT := trim(p_catatan);
    v_id INT;
BEGIN
    IF v_nim = '' OR length(v_nim) < 5 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi dengan benar.');
    END IF;

    IF v_nama = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nama lengkap wajib diisi.');
    END IF;

    IF v_catatan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Catatan / alasan pengajuan wajib diisi.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.access_requests
        WHERE nim = v_nim AND status = 'pending'
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Anda sudah memiliki pengajuan akses yang sedang menunggu verifikasi admin.');
    END IF;

    IF EXISTS (
        SELECT 1 FROM public.students WHERE nim = v_nim
    ) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM Anda sudah terdaftar di sistem. Silakan login langsung.');
    END IF;

    INSERT INTO public.access_requests (nim, nama, kelas, catatan, status)
    VALUES (v_nim, v_nama, NULLIF(v_kelas, ''), v_catatan, 'pending')
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'message', 'Pengajuan akses berhasil dikirim.', 'id', v_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.ajukan_akses(
    p_nim TEXT,
    p_nama TEXT,
    p_kelas TEXT,
    p_alasan TEXT,
    p_kontak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_gabungan TEXT;
BEGIN
    v_gabungan := CASE 
        WHEN NULLIF(trim(p_kontak), '') IS NOT NULL THEN trim(p_alasan) || ' (Kontak: ' || trim(p_kontak) || ')'
        ELSE trim(p_alasan)
    END;
    RETURN public.ajukan_akses(p_nim, p_nama, p_kelas, v_gabungan);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ajukan_akses(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. PERBAIKAN admin_import_students(): TAMBAHKAN extensions KE search_path
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_import_students(p_students JSONB)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_item JSONB;
    v_inserted INT := 0;
    v_updated INT := 0;
    v_nim TEXT;
    v_nama TEXT;
    v_kelas TEXT;
    v_pin TEXT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_students) LOOP
        v_nim := trim(v_item->>'nim');
        v_nama := trim(v_item->>'nama');
        v_kelas := NULLIF(trim(v_item->>'kelas'), '');
        v_pin := COALESCE(NULLIF(trim(v_item->>'pin'), ''), right(v_nim, 4));

        CONTINUE WHEN v_nim = '' OR v_nama = '';

        IF EXISTS (SELECT 1 FROM public.students WHERE nim = v_nim) THEN
            UPDATE public.students
            SET nama = v_nama,
                kelas = COALESCE(v_kelas, kelas),
                pin_hash = encode(digest(v_pin, 'sha256'), 'hex')
            WHERE nim = v_nim;
            v_updated := v_updated + 1;
        ELSE
            INSERT INTO public.students (nim, nama, kelas, pin_hash)
            VALUES (v_nim, v_nama, v_kelas, encode(digest(v_pin, 'sha256'), 'hex'));
            v_inserted := v_inserted + 1;
        END IF;
    END LOOP;

    RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'updated', v_updated);
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_import_students(JSONB) TO authenticated;

-- ------------------------------------------------------------------------------
-- 6. PENYEMPURNAAN join_queue(): LOCK SETTINGS UNTUK ALOKASI ATOMIK SLOT AKTIF
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.join_queue(p_nim TEXT, p_pin TEXT DEFAULT NULL)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
    v_student RECORD;
    v_settings RECORD;
    v_cur_token TEXT;
    v_cur_state TEXT;
    v_cur_expires_at TIMESTAMPTZ;
    v_cur_entered_at TIMESTAMPTZ;
    v_cur_nomor INT;
    v_token TEXT;
    v_nomor INT;
    v_expires_at TIMESTAMPTZ;
    v_active_count INT;
    v_waiting_count INT;
    v_waiting_pos INT;
    v_est_minutes INT;
    v_now TIMESTAMPTZ := now();
    v_sisa_detik INT := 0;
    v_last_expired_at TIMESTAMPTZ;
    v_cooldown_seconds INT := 120;
    v_sisa_cooldown INT := 0;
BEGIN
    -- Kunci baris settings secara eksklusif untuk serialisasi alokasi slot antrian
    SELECT * INTO v_settings FROM public.settings WHERE id = 1 FOR UPDATE;
    IF NOT v_settings.portal_open THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Portal pemilihan saat ini sedang DITUTUP oleh administrator prodi.');
    END IF;

    SELECT * INTO v_student FROM public.students WHERE nim = trim(p_nim);
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar.');
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Mahasiswa dengan NIM ini sudah menyelesaikan pendaftaran.');
    END IF;

    -- Update sesi usang sebelum menghitung slot aktif
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    -- Periksa antrian yang sedang berjalan untuk mahasiswa ini
    SELECT token, state, expires_at, entered_at, nomor
    INTO v_cur_token, v_cur_state, v_cur_expires_at, v_cur_entered_at, v_cur_nomor
    FROM public.queue
    WHERE nim = v_student.nim AND state IN ('waiting', 'active', 'menunggu_undian')
    ORDER BY entered_at DESC LIMIT 1;

    IF FOUND THEN
        IF v_cur_state = 'active' THEN
            v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_cur_expires_at - v_now))::INT);
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'active',
                'token', v_cur_token,
                'sisa_detik', v_sisa_detik
            );
        ELSIF v_cur_state = 'waiting' THEN
            SELECT count(*) INTO v_waiting_pos FROM public.queue WHERE state = 'waiting' AND entered_at <= v_cur_entered_at;
            v_est_minutes := CEIL(v_waiting_pos::FLOAT / GREATEST(1, v_settings.max_active)::FLOAT * 1.5)::INT;
            RETURN jsonb_build_object(
                'ok', true,
                'state', 'waiting',
                'token', v_cur_token,
                'nomor', v_cur_nomor,
                'posisi', v_waiting_pos,
                'estimasi_menit', v_est_minutes
            );
        END IF;
    END IF;

    SELECT count(*) INTO v_active_count FROM public.queue WHERE state = 'active' AND expires_at >= v_now;
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    -- Periksa cooldown bila baru saja kedaluwarsa saat portal padat
    SELECT expires_at INTO v_last_expired_at
    FROM public.queue
    WHERE nim = v_student.nim AND state = 'expired'
    ORDER BY entered_at DESC LIMIT 1;

    IF (v_active_count >= v_settings.max_active OR v_waiting_count > 0) AND v_last_expired_at IS NOT NULL THEN
        v_sisa_cooldown := v_cooldown_seconds - EXTRACT(EPOCH FROM (v_now - v_last_expired_at))::INT;
        IF v_sisa_cooldown > 0 THEN
            RETURN jsonb_build_object(
                'ok', false,
                'error', format('Sesi Anda sebelumnya berakhir. Karena antrian saat ini sedang padat, silakan tunggu %s detik lagi sebelum mencoba antri kembali.', v_sisa_cooldown),
                'cooldown', true,
                'sisa_detik', v_sisa_cooldown
            );
        END IF;
    END IF;

    v_token := gen_random_uuid()::TEXT;

    IF v_active_count < v_settings.max_active AND v_waiting_count = 0 THEN
        v_expires_at := v_now + (v_settings.session_duration_minutes || ' minutes')::INTERVAL;
        v_sisa_detik := v_settings.session_duration_minutes * 60;
        
        INSERT INTO public.queue (token, nim, state, activated_at, expires_at)
        VALUES (v_token, v_student.nim, 'active', v_now, v_expires_at);

        RETURN jsonb_build_object(
            'ok', true,
            'token', v_token,
            'state', 'active',
            'sisa_detik', v_sisa_detik
        );
    ELSE
        INSERT INTO public.queue (token, nim, state)
        VALUES (v_token, v_student.nim, 'waiting');

        SELECT count(*) INTO v_waiting_pos FROM public.queue WHERE state = 'waiting';
        v_est_minutes := CEIL(v_waiting_pos::FLOAT / GREATEST(1, v_settings.max_active)::FLOAT * 1.5)::INT;

        SELECT nomor INTO v_nomor FROM public.queue WHERE token = v_token;

        RETURN jsonb_build_object(
            'ok', true,
            'token', v_token,
            'state', 'waiting',
            'nomor', v_nomor,
            'posisi', v_waiting_pos,
            'estimasi_menit', v_est_minutes
        );
    END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.join_queue(TEXT, TEXT) TO anon, authenticated;
