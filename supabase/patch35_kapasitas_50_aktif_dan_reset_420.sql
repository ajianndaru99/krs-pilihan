-- ==============================================================================
-- PATCH 35: PENINGKATAN KAPASITAS RUANG AKTIF KE 50 MAHASISWA & RESET UJI 420 MHS
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Mengubah max_active di tabel settings menjadi 50 (50 mahasiswa mengisi bersamaan).
-- 2. Memperbarui fallback v_max_active di fungsi queue_status() dan daftar() menjadi 50.
-- 3. Mereset bersih transaksi registrasi, antrian, dan log uji coba.
-- 4. Mereset registered_at = NULL untuk seluruh 420 mahasiswa dari 14 kelas.
-- ==============================================================================

BEGIN;

-- 1. Bersihkan seluruh transaksi uji coba lama
DELETE FROM public.registrations;
DELETE FROM public.queue;
DELETE FROM public.access_requests;
DELETE FROM public.student_complaints;
DELETE FROM public.system_logs;

-- 2. Update Pengaturan: Kapasitas Ruang Aktif = 50 Mahasiswa
UPDATE public.settings
SET portal_open = true,
    max_active = 50,
    session_duration_minutes = 5,
    need_matkul = 3,
    need_proyek = 1
WHERE id = 1;

-- 3. Reset Status 420 Mahasiswa Menjadi Belum Terdaftar
UPDATE public.students
SET registered_at = NULL
WHERE nim BETWEEN '2410211001' AND '2410211420';

-- 4. PERBARUI queue_status() DENGAN DEFAULT 50 MAHASISWA AKTIF
CREATE OR REPLACE FUNCTION public.queue_status(p_nim TEXT, p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_state VARCHAR(20);
    v_nomor INT;
    v_expires_at TIMESTAMPTZ;
    v_sisa_detik INT := 0;
    v_posisi INT := 0;
    v_est_menit INT := 0;
    v_max_active INT := 50;
    v_active_count INT := 0;
    v_waiting_count INT := 0;
    v_vacant_slots INT := 0;
    v_session_min INT := 5;
    v_settings RECORD;
    v_now TIMESTAMPTZ := now();
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF v_settings.max_active IS NOT NULL THEN
        v_max_active := v_settings.max_active;
    END IF;
    IF v_settings.session_duration_minutes IS NOT NULL THEN
        v_session_min := v_settings.session_duration_minutes;
    END IF;

    -- 1. Tandai expired sesi aktif yang sudah melewati batas waktu
    UPDATE public.queue
    SET state = 'expired'
    WHERE state = 'active' AND expires_at < v_now;

    -- 2. Ambil data sesi pemanggil
    SELECT state, nomor, expires_at INTO v_state, v_nomor, v_expires_at
    FROM public.queue
    WHERE token = p_token AND nim = trim(p_nim);

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Sesi antrian tidak ditemukan.');
    END IF;

    -- 3. Hitung jumlah antrian yang sedang menunggu giliran
    SELECT count(*) INTO v_waiting_count FROM public.queue WHERE state = 'waiting';

    -- 4. Jika user dalam status active, periksa sisa waktu dan pangkas jika ada antrean
    IF v_state = 'active' THEN
        IF v_waiting_count > 0 AND v_expires_at > (v_now + (v_session_min || ' minutes')::interval) THEN
            UPDATE public.queue
            SET expires_at = v_now + (v_session_min || ' minutes')::interval
            WHERE token = p_token;
            v_expires_at := v_now + (v_session_min || ' minutes')::interval;
        END IF;

        v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
        IF v_sisa_detik = 0 THEN
            UPDATE public.queue SET state = 'expired' WHERE token = p_token;
            v_state := 'expired';
        END IF;

    ELSIF v_state = 'waiting' THEN
        -- 5. PROMOSI BATCH ANTREAN JIKA TERSEDIA SLOT KOSONG DI RUANG AKTIF (KAPASITAS 50)
        SELECT count(*) INTO v_active_count 
        FROM public.queue 
        WHERE state = 'active' AND expires_at >= v_now;

        v_vacant_slots := v_max_active - v_active_count;

        IF v_vacant_slots > 0 THEN
            UPDATE public.queue
            SET state = 'active',
                activated_at = v_now,
                expires_at = v_now + (v_session_min || ' minutes')::interval
            WHERE token IN (
                SELECT token FROM public.queue
                WHERE state = 'waiting'
                ORDER BY nomor ASC
                LIMIT v_vacant_slots
                FOR UPDATE SKIP LOCKED
            );

            SELECT state, expires_at INTO v_state, v_expires_at
            FROM public.queue
            WHERE token = p_token AND nim = trim(p_nim);

            IF v_state = 'active' THEN
                v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
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
        'sisa_detik', v_sisa_detik,
        'ada_antrian', (v_waiting_count > 0)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.queue_status(TEXT, TEXT) TO anon, authenticated;

-- 5. PERBARUI daftar() DENGAN DEFAULT 50 MAHASISWA AKTIF
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
    v_max_active INT := 50;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
    v_err_msg TEXT;
    v_has_conflict BOOLEAN := false;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT COALESCE(v_settings.portal_open, false) THEN
        v_err_msg := 'Portal pemilihan saat ini sedang ditutup.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_clean_nim, '-', v_err_msg, jsonb_build_object('alasan', 'portal_closed'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    v_max_active := COALESCE(v_settings.max_active, 50);
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

    -- Pemulihan sesi jika slot masih ada (< 50) dan tidak ada antrean menunggu
    IF v_q.state <> 'active' OR v_q.expires_at < v_now THEN
        SELECT count(*)::INT INTO v_active_count
        FROM public.queue
        WHERE state = 'active' AND expires_at >= v_now;

        SELECT count(*)::INT INTO v_waiting_count
        FROM public.queue
        WHERE state = 'waiting' AND token <> v_clean_token;

        IF v_active_count < v_max_active AND v_waiting_count = 0 THEN
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

    -- 3. Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah / Proyek
    v_count := array_length(p_offering_ids, 1);
    IF p_offering_ids IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 4 THEN
        v_err_msg := 'Pilihan harus berjumlah minimal 1 dan maksimal 4 mata kuliah / proyek.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'invalid_count', 'count', v_count));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    SELECT count(DISTINCT x)::INT INTO v_unique_count
    FROM unnest(p_offering_ids) AS x
    WHERE x IS NOT NULL;

    IF v_unique_count <> v_count THEN
        v_err_msg := 'Mental: Terdapat duplikasi ID mata kuliah dalam daftar pilihan.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'duplicate_offering_id', 'offering_ids', p_offering_ids));
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat duplikasi pilihan yang tidak valid. Silakan pilih ulang mata kuliah Anda.');
    END IF;

    -- 4. KUNCI BARIS OFFERINGS SECARA DETERMINISTIK
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

    GET DIAGNOSTICS v_found_offerings = ROW_COUNT;
    IF v_found_offerings <> v_count THEN
        v_err_msg := 'Mental: Salah satu pilihan yang dipilih sudah tidak tersedia atau telah diperbarui admin.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
            'alasan', 'offering_not_found',
            'offering_ids', p_offering_ids,
            'expected_count', v_count,
            'found_count', v_found_offerings
        ));
        RETURN jsonb_build_object('ok', false, 'error', 'Salah satu pilihan yang Anda pilih telah diperbarui oleh admin. Silakan muat ulang halaman dan pilih kembali.');
    END IF;

    -- 5. Periksa kuota dan anti-duplikasi topik/base name
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
            v_err_msg := format('Mental: Kuota untuk "%s" (Kelas %s) sudah penuh (%s/%s).', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
                'alasan', 'kuota_penuh', 
                'offering_id', v_off.id, 
                'nama', v_off.nama, 
                'kelas', v_off.kelas, 
                'kuota', v_off.kuota, 
                'terisi', v_current_terisi
            ));
            RETURN jsonb_build_object('ok', false, 'error', format('Kuota untuk "%s" (Kelas %s) sudah penuh (%s/%s). Silakan pilih kelas atau mata kuliah lain.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_current_terisi, v_off.kuota));
        END IF;

        v_base_name := lower(trim(regexp_replace(v_off.nama, '(\s+|-|/)+[A-Za-z]$', '')));

        IF v_off.nama = ANY(v_nama_arr) OR (v_base_name <> '' AND v_base_name = ANY(v_base_arr)) THEN
            v_err_msg := format('Mental: Mata kuliah / proyek "%s" dipilih lebih dari satu kali di kelas berbeda.', v_off.nama);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'duplicate_course', 'offering_id', v_off.id));
            RETURN jsonb_build_object('ok', false, 'error', format('Pilihan "%s" dipilih lebih dari satu kali di kelas berbeda. Setiap pilihan mata kuliah / proyek harus berbeda topik.', v_off.nama));
        END IF;

        v_nama_arr := array_append(v_nama_arr, v_off.nama);
        IF v_base_name <> '' THEN
            v_base_arr := array_append(v_base_arr, v_base_name);
        END IF;
    END LOOP;

    -- 6. SIMPAN PENDAFTARAN RESMI KE TABEL REGISTRATIONS
    BEGIN
        INSERT INTO public.registrations (nim, offering_id)
        SELECT v_student.nim, unnest(p_offering_ids);

        UPDATE public.students
        SET registered_at = v_now
        WHERE nim = v_student.nim;

        UPDATE public.queue
        SET state = 'done'
        WHERE token = v_clean_token AND nim = v_student.nim;

        -- Promosikan antrian berikutnya jika kapasitas slot masih tersedia (< 50)
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

    INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
    VALUES (
        'success', 
        'DAFTAR_SUKSES', 
        v_student.nim, 
        v_student.nama, 
        format('Mahasiswa %s (%s) sukses mendaftar %s pilihan.', v_student.nama, v_student.nim, v_count), 
        jsonb_build_object('count', v_count, 'offering_ids', p_offering_ids)
    );

    RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

COMMIT;

-- Kueri Verifikasi:
SELECT 'max_active' AS setting, max_active::text AS nilai FROM public.settings WHERE id = 1
UNION ALL
SELECT 'registrations', count(*)::text FROM public.registrations
UNION ALL
SELECT 'queue', count(*)::text FROM public.queue
UNION ALL
SELECT 'students_siap', count(*)::text FROM public.students WHERE registered_at IS NULL AND nim BETWEEN '2410211001' AND '2410211420';
