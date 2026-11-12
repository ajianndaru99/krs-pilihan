-- ==============================================================================
-- PATCH 34: SKEMA RIIL 49 MATKUL & PROYEK, JADWAL SEBAGAI INFORMASI, DAN PROMOSI ANTREAN BATCH
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Menyelaraskan seluruh kuota 34 Mata Kuliah Pilihan menjadi masing-masing 23 kursi (Total 782 kursi).
-- 2. Mengganti proyek dummy tunggal dengan 15 Proyek Ketrampilan riil masing-masing 25 kursi (Total 375 kursi).
--    Total keseluruhan penawaran: 49 pilihan dengan total 1.157 kursi (sangat cukup untuk 14 kelas / ~420 mhs).
-- 3. Memasukkan jadwal perkuliahan & ruang praktikum untuk ke-15 proyek sebagai data informasi bagi mahasiswa.
-- 4. Memperbaiki fungsi daftar(): Jadwal dan ruang tetap dicatat dan ditampilkan sebagai informasi,
--    namun bentrok jadwal TIDAK membatalkan/menolak pendaftaran (mengakomodasi mahasiswa yang mengulang).
--    Jika terjadi bentrok, sistem mencatat log audit DAFTAR_BENTROK_DIIZINKAN secara transparan.
-- 5. Memperbaiki fungsi queue_status(): Promosi antrean dilakukan secara BATCH untuk seluruh slot aktif
--    yang kosong (v_max_active - v_active_count) tanpa bergantung pada polling user urutan #1 saja.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. PENYESUAIAN KUOTA 34 MATA KULIAH PILIHAN (SEMUA 23 KURSI)
-- ------------------------------------------------------------------------------
UPDATE public.offerings
SET kuota = 23
WHERE id BETWEEN 1 AND 34;

-- ------------------------------------------------------------------------------
-- 2. HAPUS PROYEK DUMMY LAMA & INSERT 15 PROYEK KETRAMPILAN RIIL (@25 KURSI)
-- ------------------------------------------------------------------------------
-- Hapus data dummy ID 35 jika masih bernama lama
DELETE FROM public.schedules WHERE offering_id = 35;
DELETE FROM public.registrations WHERE offering_id = 35;
DELETE FROM public.offerings WHERE id = 35;

-- Masukkan 15 Proyek Ketrampilan sesuai skema asli fakultas
INSERT INTO public.offerings (id, nama, kelas, jenis, kuota) VALUES
(35, 'Proyek Ketrampilan Produksi Bibit & Bahan Tanam A', 'A', 'proyek', 25),
(36, 'Proyek Ketrampilan Produksi Bibit & Bahan Tanam B', 'B', 'proyek', 25),
(37, 'Proyek Ketrampilan Budidaya Palawija A', 'A', 'proyek', 25),
(38, 'Proyek Ketrampilan Budidaya Palawija B', 'B', 'proyek', 25),
(39, 'Proyek Ketrampilan budidaya sayuran B', 'B', 'proyek', 25),
(40, 'Proyek Ketrampilan budidaya sayuran A', 'A', 'proyek', 25),
(41, 'Proyek ketrampilan kultur jaringan', 'A', 'proyek', 25),
(42, 'Proyek Ketrampilan Biakan masal Mikrobia berguna A', 'A', 'proyek', 25),
(43, 'Proyek Ketrampilan Biakan masal Mikrobia berguna B', 'B', 'proyek', 25),
(44, 'Proyek Ketrampilan hidroponik A', 'A', 'proyek', 25),
(45, 'Proyek Ketrampilan hidroponik B', 'B', 'proyek', 25),
(46, 'Proyek Biakan Serangga Berguna A', 'A', 'proyek', 25),
(47, 'Proyek Biakan Serangga Berguna B', 'B', 'proyek', 25),
(48, 'Proyek Ketrampilan budidaya jamur pangan A', 'A', 'proyek', 25),
(49, 'Proyek Ketrampilan budidaya jamur pangan B', 'B', 'proyek', 25)
ON CONFLICT (id) DO UPDATE SET
    nama = EXCLUDED.nama,
    kelas = EXCLUDED.kelas,
    jenis = EXCLUDED.jenis,
    kuota = EXCLUDED.kuota;

-- ------------------------------------------------------------------------------
-- 3. JADWAL WAKTU & RUANG UNTUK KE-15 PROYEK KETRAMPILAN (SEBAGAI INFORMASI)
-- ------------------------------------------------------------------------------
DELETE FROM public.schedules WHERE offering_id BETWEEN 35 AND 49;

INSERT INTO public.schedules (offering_id, hari, jam_mulai, jam_selesai, ruang) VALUES
(35, 'Senin', '08:00:00', '09:40:00', 'Kebun Percobaan & Pembibitan'),
(36, 'Selasa', '10:00:00', '11:40:00', 'Kebun Percobaan & Pembibitan'),
(37, 'Rabu', '08:00:00', '09:40:00', 'Lahan Percobaan Palawija'),
(38, 'Kamis', '10:00:00', '11:40:00', 'Lahan Percobaan Palawija'),
(39, 'Selasa', '13:00:00', '14:40:00', 'Green House Hortikultura'),
(40, 'Senin', '13:00:00', '14:40:00', 'Green House Hortikultura'),
(41, 'Rabu', '10:00:00', '11:40:00', 'Lab. Kultur Jaringan'),
(42, 'Kamis', '08:00:00', '09:40:00', 'Lab. Mikrobiologi Terapan'),
(43, 'Jumat', '08:00:00', '09:40:00', 'Lab. Mikrobiologi Terapan'),
(44, 'Senin', '15:00:00', '16:40:00', 'Rumah Kasa Hidroponik'),
(45, 'Rabu', '15:00:00', '16:40:00', 'Rumah Kasa Hidroponik'),
(46, 'Selasa', '08:00:00', '09:40:00', 'Lab. Proteksi Tanaman'),
(47, 'Kamis', '13:00:00', '14:40:00', 'Lab. Proteksi Tanaman'),
(48, 'Selasa', '15:00:00', '16:40:00', 'Kumbung Jamur Tiram'),
(49, 'Jumat', '13:30:00', '15:10:00', 'Kumbung Jamur Tiram');

-- Sinkronkan sequence ID
SELECT setval('public.offerings_id_seq', 49);
SELECT setval('public.schedules_id_seq', (SELECT max(id) FROM public.schedules));

-- ------------------------------------------------------------------------------
-- 4. PERBAIKAN queue_status(): PROMOSI BATCH ANTREAN (TIDAK BOLEH MACET)
-- ------------------------------------------------------------------------------
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
    v_max_active INT := 30;
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
        -- 5. PROMOSI BATCH ANTREAN JIKA TERSEDIA SLOT KOSONG DI RUANG AKTIF
        SELECT count(*) INTO v_active_count 
        FROM public.queue 
        WHERE state = 'active' AND expires_at >= v_now;

        v_vacant_slots := v_max_active - v_active_count;

        IF v_vacant_slots > 0 THEN
            -- Promosikan sejumlah slot kosong sekaligus tanpa macet
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

            -- Periksa apakah user pemanggil termasuk yang baru dipromosikan
            SELECT state, expires_at INTO v_state, v_expires_at
            FROM public.queue
            WHERE token = p_token AND nim = trim(p_nim);

            IF v_state = 'active' THEN
                v_sisa_detik := GREATEST(0, EXTRACT(EPOCH FROM (v_expires_at - v_now))::INT);
            END IF;
        END IF;

        -- Jika masih menunggu, hitung posisi antrean dan estimasi waktu
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

-- ------------------------------------------------------------------------------
-- 5. PERBAIKAN daftar(): JADWAL SEBAGAI INFORMASI, TIDAK MEMBATALKAN MAHASISWA MENGULANG
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
    v_has_conflict BOOLEAN := false;
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

    -- Pemulihan sesi aman jika slot masih ada dan tidak ada antrean menunggu
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

    -- Pastikan tidak ada ID duplikat atau elemen NULL di dalam array p_offering_ids
    SELECT count(DISTINCT x)::INT INTO v_unique_count
    FROM unnest(p_offering_ids) AS x
    WHERE x IS NOT NULL;

    IF v_unique_count <> v_count THEN
        v_err_msg := 'Mental: Terdapat duplikasi ID mata kuliah dalam daftar pilihan.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'duplicate_offering_id', 'offering_ids', p_offering_ids));
        RETURN jsonb_build_object('ok', false, 'error', 'Terdapat duplikasi pilihan yang tidak valid. Silakan pilih ulang mata kuliah Anda.');
    END IF;

    -- 4. KUNCI BARIS OFFERINGS SECARA DETERMINISTIK (urut ID ASC untuk mencegah deadlock)
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

    -- 6. AUDIT INFORMASI JADWAL BERSAMAAN (TIDAK MEMBATALKAN PENDAFTARAN MAHASISWA MENGULANG)
    IF (v_student.kelas IS NOT NULL AND trim(v_student.kelas) <> '' AND EXISTS (
        SELECT 1
        FROM public.schedules s
        JOIN public.class_schedules cs ON cs.kelas = v_student.kelas
        WHERE s.offering_id = ANY(p_offering_ids)
          AND lower(trim(s.hari)) = lower(trim(cs.hari))
          AND s.jam_mulai < cs.jam_selesai
          AND cs.jam_mulai < s.jam_selesai
    )) OR EXISTS (
        SELECT 1
        FROM public.schedules s1
        JOIN public.schedules s2 ON s1.id <> s2.id AND s1.offering_id <> s2.offering_id
        WHERE s1.offering_id = ANY(p_offering_ids)
          AND s2.offering_id = ANY(p_offering_ids)
          AND lower(trim(s1.hari)) = lower(trim(s2.hari))
          AND s1.jam_mulai < s2.jam_selesai
          AND s2.jam_mulai < s1.jam_selesai
    ) THEN
        v_has_conflict := true;
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES (
            'info',
            'DAFTAR_BENTROK_DIIZINKAN',
            v_student.nim,
            v_student.nama,
            format('Mahasiswa %s (%s) mendaftar dengan jadwal bersamaan (diizinkan khusus mengulang).', v_student.nama, v_student.nim),
            jsonb_build_object('offering_ids', p_offering_ids, 'kelas_tetap', v_student.kelas)
        );
    END IF;

    -- 7. SIMPAN PENDAFTARAN RESMI KE TABEL REGISTRATIONS
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
        format('Mahasiswa %s (%s) sukses mendaftar %s pilihan.', v_student.nama, v_student.nim, v_count), 
        jsonb_build_object('count', v_count, 'offering_ids', p_offering_ids, 'has_conflict', v_has_conflict)
    );

    RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

COMMIT;
