-- ==============================================================================
-- PATCH 43: PERBAIKAN STRUKTUR PROMOSI ANTRIAN PADA FUNGSI DAFTAR()
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Masalah:
--   Pada fungsi daftar() Patch 40 & 42, blok promosi antrian menggunakan:
--     WHERE id = (SELECT id FROM queue ORDER BY lot_number, joined_at)
--   Padahal tabel public.queue menggunakan kolom 'token' (primary key) dan 'nomor' (urutan).
--   Akibatnya, saat mahasiswa menekan Simpan Pilihan, terjadi exception kolom tidak ada
--   sehingga pendaftaran ditolak dengan pesan:
--   "Terjadi kesalahan sistem saat menyimpan data pemilihan. Silakan coba kembali."
--
-- Solusi:
--   1. Perbaiki query promosi antrian agar menggunakan 'token' dan 'ORDER BY nomor ASC'.
--   2. Pertahankan seluruh validasi keamanan:
--      - Anti-duplikasi mata kuliah wajib kelas (Patch 40/42) dengan fallback COALESCE
--      - Anti-duplikasi topik/matkul di pilihan yang diajukan
--      - Pengecekan kuota real-time dan bentrok jam kelas
--      - Pemulihan sesi dinamis (< 50 aktif)
-- ==============================================================================

BEGIN;

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
BEGIN
    -- 1. Periksa status portal
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT COALESCE(v_settings.portal_open, false) THEN
        v_err_msg := 'Portal pemilihan saat ini sedang ditutup.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_clean_nim, '-', v_err_msg, jsonb_build_object('alasan', 'portal_closed'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    v_max_active := COALESCE(v_settings.max_active, 50);
    v_session_min := COALESCE(v_settings.session_duration_minutes, 5);

    -- 2. Kunci baris mahasiswa eksklusif
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

    -- 3. Kunci baris sesi antrian milik mahasiswa
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

    -- 4. Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah / Proyek
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

    -- 5. Kunci baris offerings secara deterministik (urut id)
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

    -- 6. Periksa kuota, anti-duplikasi topik, dan proteksi matkul kelas wajib
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

        -- Proteksi 1: Cek apakah mata kuliah pilihan ini sudah ada di jadwal kelas wajib mahasiswa
        IF v_student.kelas IS NOT NULL AND trim(v_student.kelas) <> '' THEN
            IF EXISTS (
                SELECT 1
                FROM public.class_schedules cs
                WHERE cs.kelas = v_student.kelas
                  AND COALESCE(NULLIF(trim(cs.nama_matkul), ''), trim(cs.matkul)) IS NOT NULL
                  AND (
                    public.normalize_course_name(v_off.nama) = public.normalize_course_name(COALESCE(NULLIF(trim(cs.nama_matkul), ''), cs.matkul))
                    OR lower(trim(v_off.nama)) = lower(trim(COALESCE(NULLIF(trim(cs.nama_matkul), ''), cs.matkul)))
                  )
            ) THEN
                v_err_msg := format('Mental: Mata kuliah "%s" tidak dapat dipilih karena sudah ada pada jadwal kuliah kelas %s.', v_off.nama, v_student.kelas);
                INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
                VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object(
                    'alasan', 'course_already_in_class_schedule',
                    'offering_id', v_off.id,
                    'kelas', v_student.kelas,
                    'nama', v_off.nama
                ));
                RETURN jsonb_build_object(
                    'ok', false,
                    'error', format('Mata kuliah "%s" tidak dapat dipilih karena sudah menjadi mata kuliah wajib kelas Anda (%s).', v_off.nama, v_student.kelas)
                );
            END IF;
        END IF;

        -- Proteksi 2: Cek bentrok jam kuliah dengan jadwal kelas tetap
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
                v_err_msg := format('Mental: Pilihan "%s" (Kelas %s) bentrok jam dengan jadwal kelas %s.', v_off.nama, COALESCE(v_off.kelas, 'A'), v_student.kelas);
                INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
                VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'clash_with_class', 'offering_id', v_off.id));
                RETURN jsonb_build_object('ok', false, 'error', format('Pilihan %s (Kelas %s) bentrok dengan jadwal kelas Anda.', v_off.nama, COALESCE(v_off.kelas, 'A')));
            END IF;
        END IF;

        -- Proteksi 3: Anti-duplikasi topik/mata kuliah di antara pilihan yang diajukan
        v_base_name := public.normalize_course_name(v_off.nama);

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

    -- 7. SIMPAN PENDAFTARAN RESMI KE TABEL REGISTRATIONS & PROMOSIKAN ANTRIAN
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
        -- Menggunakan token dan nomor urut antrian (nomor ASC)
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

        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES (
            'success', 
            'PENDAFTARAN_BERHASIL', 
            v_student.nim, 
            v_student.nama, 
            format('Mahasiswa %s (%s) berhasil mendaftar %s mata kuliah/proyek.', v_student.nama, v_student.nim, v_count), 
            jsonb_build_object('offering_ids', p_offering_ids)
        );

        RETURN jsonb_build_object(
            'ok', true,
            'message', 'Pendaftaran mata kuliah pilihan berhasil disimpan secara resmi.'
        );
    EXCEPTION
        WHEN OTHERS THEN
            v_err_msg := format('Mental: Terjadi kesalahan sistem saat menyimpan pendaftaran (%s - %s).', SQLERRM, SQLSTATE);
            INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
            VALUES (
                'error', 
                'DAFTAR_MENTAL', 
                v_student.nim, 
                v_student.nama, 
                v_err_msg, 
                jsonb_build_object('error', SQLERRM, 'sqlstate', SQLSTATE)
            );
            RETURN jsonb_build_object(
                'ok', false, 
                'error', format('Terjadi kesalahan sistem saat menyimpan data pemilihan: %s. Silakan coba kembali.', SQLERRM)
            );
    END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.daftar(TEXT, TEXT, INT[]) TO anon, authenticated;

COMMIT;
