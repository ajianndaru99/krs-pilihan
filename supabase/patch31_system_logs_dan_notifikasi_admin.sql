-- ==============================================================================
-- PATCH 31: SISTEM LOG AKTIVITAS DATABASE, POP-UP DATA MENTAL, & HASIL SAYA
-- Sistem Pemilihan Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Membuat tabel public.system_logs untuk mencatat seluruh kejadian database.
-- 2. Memperbarui public.daftar() agar setiap kali pendaftaran mental / gagal,
--    kejadian dicatat otomatis ke system_logs dengan rincian penyebab error.
-- 3. Memperbarui public.hasil_saya() agar mahasiswa yang sudah terdaftar
--    selalu dapat melihat bukti sah tanpa terhambat token antrian sementara.
-- 4. Menambahkan RPC admin_list_logs dan admin_get_latest_alerts untuk
--    menyalurkan pop-up alert notifikasi real-time ke panel admin.
-- ==============================================================================

BEGIN;

-- ------------------------------------------------------------------------------
-- 1. TABEL SYSTEM_LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.system_logs (
    id BIGSERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    level VARCHAR(10) NOT NULL CHECK (level IN ('info', 'success', 'warning', 'error')),
    event_type VARCHAR(50) NOT NULL,
    nim VARCHAR(30),
    nama TEXT,
    pesan TEXT NOT NULL,
    detail JSONB DEFAULT '{}'::JSONB
);

CREATE INDEX IF NOT EXISTS idx_system_logs_created_at ON public.system_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_logs_level ON public.system_logs (level);
CREATE INDEX IF NOT EXISTS idx_system_logs_nim ON public.system_logs (nim);

-- Aktifkan RLS tanpa policy (akses hanya lewat RPC security definer)
ALTER TABLE public.system_logs ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2. PERBARUI FUNGSI hasil_saya() (BUKTI PENDAFTARAN RESMI ANTI-DEAD-END)
-- ------------------------------------------------------------------------------
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
            'kelas', COALESCE(v_student.kelas, '-')
        ),
        'pendaftaran', jsonb_build_object(
            'waktu_daftar', to_char(v_waktu_daftar AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'pilihan', COALESCE(v_pilihan, '[]'::JSONB)
        )
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.hasil_saya(TEXT, TEXT) TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 3. PERBARUI FUNGSI daftar() (LOGGING OTOMATIS SAAT MENTAL / BERHASIL)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.daftar(p_nim TEXT, p_token TEXT, p_offering_ids INT[])
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(30) := trim(p_nim);
    v_q RECORD;
    v_student RECORD;
    v_settings RECORD;
    v_off RECORD;
    v_count INT;
    v_nama_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_arr TEXT[] := ARRAY[]::TEXT[];
    v_base_name TEXT;
    v_current_terisi INT;
    v_max_active INT := 30;
    v_session_min INT := 5;
    v_now TIMESTAMPTZ := now();
    v_err_msg TEXT;
BEGIN
    SELECT * INTO v_settings FROM public.settings WHERE id = 1;
    IF NOT v_settings.portal_open THEN
        v_err_msg := 'Portal pemilihan saat ini sedang ditutup.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_clean_nim, '-', v_err_msg, jsonb_build_object('alasan', 'portal_closed'));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

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

    -- 2. Kunci baris sesi antrian aktif
    SELECT * INTO v_q FROM public.queue
    WHERE token = p_token AND nim = v_student.nim AND state = 'active' AND expires_at >= v_now
    FOR UPDATE;

    IF NOT FOUND THEN
        v_err_msg := 'Sesi pemilihan Anda sudah kedaluwarsa atau tidak valid. Silakan masuk antrian kembali.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('alasan', 'session_expired', 'token', p_token));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    -- 3. Validasi batas jumlah pilihan: Minimal 1 dan Maksimal 4 Mata Kuliah
    v_count := array_length(p_offering_ids, 1);
    IF p_offering_ids IS NULL OR v_count IS NULL OR v_count < 1 OR v_count > 4 THEN
        v_err_msg := 'Pilihan harus berjumlah minimal 1 dan maksimal 4 mata kuliah.';
        INSERT INTO public.system_logs (level, event_type, nim, nama, pesan, detail)
        VALUES ('error', 'DAFTAR_MENTAL', v_student.nim, v_student.nama, v_err_msg, jsonb_build_object('count', v_count));
        RETURN jsonb_build_object('ok', false, 'error', v_err_msg);
    END IF;

    -- 4. KUNCI BARIS OFFERINGS SECARA DETERMINISTIK (urut ID ASC untuk mencegah deadlock)
    PERFORM 1 FROM public.offerings 
    WHERE id = ANY(p_offering_ids) 
    ORDER BY id ASC 
    FOR UPDATE;

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

    -- 6. SIMPAN PENDAFTARAN RESMI KE TABEL REGISTRATIONS
    INSERT INTO public.registrations (nim, offering_id)
    SELECT v_student.nim, unnest(p_offering_ids);

    -- Tandai profil mahasiswa sudah menyelesaikan pendaftaran
    UPDATE public.students
    SET registered_at = v_now
    WHERE nim = v_student.nim;

    -- Tandai sesi antrian mahasiswa selesai
    UPDATE public.queue
    SET state = 'done'
    WHERE token = p_token AND nim = v_student.nim;

    -- Promosikan antrian berikutnya jika kapasitas slot masih tersedia
    v_max_active := COALESCE(v_settings.max_active, 30);
    v_session_min := COALESCE(v_settings.session_duration_minutes, 5);

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
-- 4. RPC MONITORING & ALERT ADMIN
-- ------------------------------------------------------------------------------

-- Ambil log aktivitas untuk tab admin
CREATE OR REPLACE FUNCTION public.admin_list_logs(
    p_limit INT DEFAULT 50,
    p_level TEXT DEFAULT NULL,
    p_search TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_logs JSONB;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', l.id,
            'created_at', to_char(l.created_at AT TIME ZONE 'Asia/Jakarta', 'YYYY-MM-DD HH24:MI:SS'),
            'level', l.level,
            'event_type', l.event_type,
            'nim', COALESCE(l.nim, '-'),
            'nama', COALESCE(l.nama, '-'),
            'pesan', l.pesan,
            'detail', l.detail
        )
    ) INTO v_logs
    FROM (
        SELECT *
        FROM public.system_logs
        WHERE (p_level IS NULL OR p_level = '' OR level = p_level)
          AND (
              p_search IS NULL OR p_search = '' OR 
              nim ILIKE '%' || p_search || '%' OR 
              nama ILIKE '%' || p_search || '%' OR 
              pesan ILIKE '%' || p_search || '%'
          )
        ORDER BY id DESC
        LIMIT LEAST(p_limit, 200)
    ) l;

    RETURN jsonb_build_object(
        'ok', true,
        'logs', COALESCE(v_logs, '[]'::JSONB)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_logs(INT, TEXT, TEXT) TO authenticated;

-- Ambil alert error / mental terbaru (polling realtime pop-up)
CREATE OR REPLACE FUNCTION public.admin_get_latest_alerts(p_after_id BIGINT DEFAULT 0)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_alerts JSONB;
    v_max_id BIGINT := p_after_id;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    SELECT COALESCE(MAX(id), p_after_id) INTO v_max_id FROM public.system_logs;

    SELECT jsonb_agg(
        jsonb_build_object(
            'id', l.id,
            'created_at', to_char(l.created_at AT TIME ZONE 'Asia/Jakarta', 'HH24:MI:SS'),
            'level', l.level,
            'event_type', l.event_type,
            'nim', COALESCE(l.nim, '-'),
            'nama', COALESCE(l.nama, '-'),
            'pesan', l.pesan
        )
    ) INTO v_alerts
    FROM (
        SELECT *
        FROM public.system_logs
        WHERE id > p_after_id 
          AND level IN ('error', 'warning')
        ORDER BY id DESC
        LIMIT 10
    ) l;

    RETURN jsonb_build_object(
        'ok', true,
        'latest_id', v_max_id,
        'alerts', COALESCE(v_alerts, '[]'::JSONB)
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_get_latest_alerts(BIGINT) TO authenticated;

-- Bersihkan riwayat log (opsional untuk pembersihan admin)
CREATE OR REPLACE FUNCTION public.admin_clear_logs()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    DELETE FROM public.system_logs;
    RETURN jsonb_build_object('ok', true, 'message', 'Seluruh riwayat log berhasil dibersihkan.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_clear_logs() TO authenticated;

COMMIT;
