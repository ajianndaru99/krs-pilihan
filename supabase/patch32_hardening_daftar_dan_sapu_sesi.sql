-- ==============================================================================
-- PATCH 32: HARDENING FUNGSI DAFTAR (VALIDASI ID, PEMULIHAN SESI, & LOG EXCEPTION)
--           SERTA AUDIT LOG ADMIN_SAPU_SESI
-- Sistem Pemilihan Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Memperkuat public.daftar():
--    - Menolak dan mencatat log jika p_offering_ids mengandung ID duplikat/NULL
--      atau ID mata kuliah usang yang sudah tidak ada di public.offerings.
--    - Memulihkan sesi otomatis saat mahasiswa menekan Simpan Pilihan apabila
--      token antrian miliknya sempat tersapu admin_sapu_sesi / baru saja habis,
--      SELAMA kuota ruang aktif masih longgar (active < max_active) dan tidak
--      ada antrian waiting yang sedang menunggu.
--    - Menambahkan blok EXCEPTION WHEN OTHERS agar jika terjadi kegagalan
--      tak terduga di level constraint PostgreSQL, perubahan data dibatalkan
--      (rollback) namun pesan error tetap tercatat di public.system_logs.
-- 2. Memperbarui public.admin_sapu_sesi():
--    - Membersihkan sesi aktif tertahan, mempromosikan antrian waiting jika ada,
--      dan mencatat aktivitas sapu sesi ke public.system_logs.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PERBARUI FUNGSI daftar() DENGAN VALIDASI PENAWARAN & PEMULIHAN SESI AMAN
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(30) := trim(COALESCE(p_nim, ''));
    v_clean_token TEXT := trim(COALESCE(p_token, ''));
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_count INT;
    v_unique_count INT;
    v_found_offerings INT;
    v_nama_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_name TEXT;
    v_current_terisi INT;
    v_active_count INT := 0;
    v_waiting_count INT := 0;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
    v_err_msg TEXT;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT COALESCE(v_settings.portal_open, false) THEN
        v_err_msg := 'Portal pemilihan saat ini sedang ditutup.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_clean_nim, '-', v_err_msg, jsonb_build_object('alasan', 'portal_closed'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    v_max_active := COALESCE(v_settings.max_active, 30);
    v_session_min := COALESCE(v_settings.session_duration_minutes, 5);

    -- 1. Kunci baris mahasiswa eksklusif
    SELECT * INTO v_student FROM public.students 
    WHERE nim = v_clean_nim 
    FOR UPDATE;

    IF NOT FOUND THEN
        v_err_msg := 'Mahasiswa tidak ditemukan dalam sistem.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_clean_nim, '-', v_err_msg, jsonb_build_object('alasan', 'student_not_found'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    IF v_student.registered_at IS NOT NULL OR EXISTS (SELECT 1 FROM public.registrations WHERE nim = v_student.nim) THEN
        v_err_msg := 'Anda sudah pernah menyelesaikan pendaftaran pemilihan mata kuliah.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('warning', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'already_registered'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    -- 2. Kunci baris sesi antrian milik mahasiswa
    SELECT * INTO v_q FROM public.queue
    WHERE token = v_clean_token AND nim = v_student.nim
    FOR UPDATE;

    IF NOT FOUND THEN
        v_err_msg := 'Sesi pemilihan Anda tidak ditemukan atau token tidak valid. Silakan masuk antrian kembali.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'token_not_found', 'token', v_clean_token));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    -- Jika sesi tercatat expired / bukan active (misal tersapu admin_sapu_sesi atau baru saja lewat batas waktu),
    -- periksa apakah ruang pemilihan masih memiliki slot kosong dan tidak ada antrian menunggu.
    IF v_q.state <> 'active' OR v_q.expires_at < v_now THEN
        SELECT count(*)::INT INTO v_active_count
        FROM public.queue
        WHERE state = 'active' AND expires_at >= v_now;

        SELECT count(*)::INT INTO v_waiting_count
        FROM public.queue
        WHERE state = 'waiting' AND token <> v_clean_token;

        IF v_active_count < v_max_active AND v_waiting_count = 0 THEN
            -- Pulihkan sesi secara transparan karena slot masih longgar dan tidak merugikan antrian lain
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES (
                'info',
                'SESI_DIPULIHKAN',
                v_student.nim,
                v_student.nama,
                format('Sesi mahasiswa %s (%s) dipulihkan otomatis saat submit karena slot aktif masih tersedia.', v_student.nama, v_student.nim),
                jsonb_build_object('prev_state', v_q.state, 'token', v_clean_token, 'active_count', v_active_count)
            );
        ELSE
            v_err_msg := 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid. Silakan masuk antrian kembali.';
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
                'alasan', 'session_expired',
                'token', v_clean_token,
                'state', v_q.state,
                'active_count', v_active_count,
                'waiting_count', v_waiting_count
            ));
            RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
        END IF;
    END IF;

    -- 3. Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah
    v_count := array_length(p_offering_ids, 1);
    IF p_offering_ids IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 4 THEN
        v_err_msg := 'Pilihan harus berjumlah minimal 1 dan maksimal 4 mata kuliah.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'invalid_count', 'count', v_count));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    -- Pastikan tidak ada ID duplikat atau elemen NULL di dalam array p_offering_ids
    SELECT count(DISTINCT x)::INT INTO v_unique_count
    FROM unnest(p_offering_ids) AS x
    WHERE x IS NOT NULL;

    IF v_unique_count <> v_count THEN
        v_err_msg := 'Mental: Terdapat duplikasi ID mata kuliah dalam daftar pilihan.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'duplicate_offering_id', 'offering_ids', p_offering_ids));
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat duplikasi pilihan mata kuliah yang tidak valid. Silakan pilih ulang mata kuliah Anda.');
    END IF;

    -- 4. KUNCI BARIS OFFERINGS SECARA DETERMINISTIK (urut ID ASC untuk mencegah deadlock)
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    GET DIAGNOSTICS v_found_offerings = ROW_COUNT;
    IF v_found_offerings <> v_count THEN
        v_err_msg := 'Mental: Salah satu mata kuliah yang dipilih sudah tidak tersedia atau telah diperbarui admin.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
            'alasan', 'offering_not_found',
            'offering_ids', p_offering_ids,
            'expected_count', v_count,
            'found_count', v_found_offerings
        ));
        RETURN jsonb_build_object('ok', false, 'error', 'Salah satu mata kuliah yang Anda pilih telah diperbarui oleh admin. Silakan muat ulang halaman dan pilih kembali.');
    END IF;

    -- 5. Periksa kuota, anti-duplikasi, dan bentrok jadwal kelas tetap
    FOR v_off IN
        SELECT o.*
        FROM public.offerings o
        WHERE o.id = ANY(p_offering_ids)
        ORDER BY o.id ASC
    LOOP
        SELECT count(*)::INT INTO v_current_terisi
        FROM public.registrations
        WHERE offering_id = v_off.id;

        IF v_current_terisi >= v_off.kuota THEN
            v_err_msg := format('Mental: Kuota untuk mata kuliah "%s" (Kelas %s) sudah penuh (%s/%s).', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
                'alasan', 'kuota_penuh', 
                'offering_id', v_off.id, 
                'nama', v_off.nama, 
                'kelas', v_off.kelas, 
                'kuota', v_off.kuota, 
                'terisi', v_current_terisi
            ));
            RETURN jsonb_build_object('ok', false, 'error', format('Kuota untuk mata kuliah "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih mata kuliah atau kelas lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota));
        END IF;

        v_base_name := lower(trim(regexp_replace(v_off.nama, '(\s+|-|/)+[A-Za-z]$', '')));

        IF v_off.nama = ANY(v_nama_arr) OR (v_base_name <> '' AND v_base_name = ANY(v_base_arr)) THEN
            v_err_msg := format('Mental: Mata kuliah "%s" dipilih lebih dari satu kali di kelas berbeda.', v_off.nama);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'duplicate_course', 'offering_id', v_off.id));
            RETURN jsonb_build_object('ok', false, 'error', format('Mata kuliah "%s" dipilih lebih dari satu kali di kelas berbeda. Setiap pilihan mata kuliah harus berbeda.', v_off.nama));
        END IF;

        v_nama_arr := array_append(v_nama_arr, v_off.nama);
        IF v_base_name <> '' THEN
            v_base_arr := array_append(v_base_arr, v_base_name);
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
                v_err_msg := format('Mental: Pilihan %s (Kelas %s) bentrok dengan jadwal kelas tetap Anda (%s).', v_off.nama, COALESCE(v_off.kelas, 'A'), v_student.kelas);
                INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
                VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'jadwal_kelas_bentrok', 'offering_id', v_off.id, 'kelas_tetap', v_student.kelas));
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s (Kelas %s) bentrok dengan jadwal kuliah tetap kelas Anda (%s).', v_off.nama, COALESCE(v_off.kelas, 'A'), v_student.kelas));
            END IF;
        END IF;
    END LOOP;

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
        v_err_msg := 'Mental: Terdapat bentrok jadwal antar mata kuliah pilihan yang dipilih.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'inter_course_conflict', 'offering_ids', p_offering_ids));
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat bentrok jadwal antar mata kuliah pilihan yang Anda pilih.');
    END IF;

    -- 6. SIMPAN PENDAFTARAN RESMI KE TABEL REGISTRATIONS (DALAM SUBTRANSAKSI TERPROTEKSI)
    BEGIN
        INSERT INTO public.registrations (nim, offering_id)
        SELECT v_student.nim, unnest(p_offering_ids);

        -- Tandai profil mahasiswa sudah menyelesaikan pendaftaran
        UPDATE public.students
        SET registered_at = v_now
        WHERE nim = v_student.nim;

        -- Tandai sesi antrian mahasiswa selesai
        UPDATE public.queue
        SET state = 'done'
        WHERE token = v_clean_token AND nim = v_student.nim;

        -- Promosikan antrian berikutnya jika kapasitas slot masih tersedia
        IF (SELECT count(*) FROM public.queue WHERE state = 'active' AND expires_at >= v_now) < v_max_active THEN
            UPDATE public.queue
            SET state = 'active', 
                activated_at = v_now, 
                expires_at = v_now + (v_session_min || ' minutes')::interval
            WHERE token = (
                SELECT token FROM public.queue 
                WHERE state = 'waiting' 
                ORDER BY nomor ASC 
                LIMIT 1 
                FOR UPDATE SKIP LOCKED
            );
        END IF;
    EXCEPTION WHEN OTHERS THEN
        v_err_msg := format('Mental: Kegagalan sistem saat menyimpan pendaftaran (%s).', SQLERRM);
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES (
            'error',
            'DAFTAR_EXCEPTION',
            v_student.nim,
            v_student.nama,
            v_err_msg,
            jsonb_build_object('alasan', 'sql_exception', 'sqlstate', SQLSTATE, 'sqlerrm', SQLERRM, 'offering_ids', p_offering_ids)
        );
        RETURN jsonb_build_object('ok', false, 'error', 'Terjadi kendala saat menyimpan pendaftaran Anda. Silakan coba simpan kembali.');
    END;

    -- CATAT LOG KEBERHASILAN PENDAFTARAN
    INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
    VALUES (
        'success', 
        'DAFTAR_SUKSES', 
        v_student.nim, 
        v_student.nama, 
        format('Mahasiswa %s (%s) sukses mendaftar %s mata kuliah pilihan.', v_student.nama, v_student.nim, v_count), 
        jsonb_build_object('count', v_count, 'offering_ids', p_offering_ids)
    );

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Pendaftaran mata kuliah pilihan berhasil disimpan secara resmi.'
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 2. PERBARUI RPC admin_sapu_sesi() DENGAN PROMOSI ANTRIAN & AUDIT LOG
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_sapu_sesi()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_cleaned INT := 0;
    v_promoted INT := 0;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT COALESCE(max_active, 30), COALESCE(session_duration_minutes, 5)
    INTO v_max_active, v_session_min
    FROM public.settings
    WHERE id = 1;

    -- Bersihkan seluruh sesi aktif yang menggantung
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active';

    GET DIAGNOSTICS v_cleaned = ROW_COUNT;

    -- Jika ada antrian waiting yang menunggu, promosikan sesuai kapasitas slot
    WITH next_waiting AS (
        SELECT token
        FROM public.queue
        WHERE state = 'waiting'
        ORDER BY nomor ASC
        LIMIT v_max_active
        FOR UPDATE SKIP LOCKED
    )
    UPDATE public.queue q
    SET state = 'active',
        activated_at = v_now,
        expires_at = v_now + (v_session_min || ' minutes')::interval
    FROM next_waiting nw
    WHERE q.token = nw.token;

    GET DIAGNOSTICS v_promoted = ROW_COUNT;

    INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
    VALUES (
        'info',
        'ADMIN_SAPU_SESI',
        '-',
        'Administrator',
        format('Admin membersihkan %s sesi aktif tertahan (%s antrian dipromosikan).', v_cleaned, v_promoted),
        jsonb_build_object('cleaned', v_cleaned, 'promoted', v_promoted)
    );

    RETURN jsonb_build_object(
        'ok', true, 
        'message', format('%s sesi aktif berhasil dibersihkan.', v_cleaned),
        'cleaned', v_cleaned,
        'promoted', v_promoted
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_sapu_sesi() TO authenticated;

COMMIT;

