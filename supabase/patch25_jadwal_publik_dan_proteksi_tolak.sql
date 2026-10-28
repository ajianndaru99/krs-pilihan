-- ==============================================================================
-- PATCH 25: JADWAL KULIAH PUBLIK & PROTEKSI LAPOR KENDALA DITOLAK
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Deskripsi:
-- 1. Membuat RPC jadwal_kuliah_publik() yang dapat diakses publik (anon & authenticated)
--    untuk menampilkan seluruh penawaran matkul pilihan, kelas, topik, kuota kapasitas
--    yang diberikan, dan jadwal kuliah secara lengkap tanpa beban server berlebih.
-- 2. Memperketat lapor_kendala_mahasiswa() agar menolak pengajuan jika mahasiswa telah
--    memiliki laporan yang berstatus 'pending' maupun 'rejected' (keputusan final admin).
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. RPC MAHASISWA & PUBLIK: jadwal_kuliah_publik()
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.jadwal_kuliah_publik()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_offerings JSONB;
BEGIN
    SELECT jsonb_agg(
        jsonb_build_object(
            'id', o.id,
            'nama', o.nama,
            'kelas', COALESCE(o.kelas, '-'),
            'topik', COALESCE(o.topik, ''),
            'jenis', o.jenis,
            'kuota', o.kuota,
            'jadwal', COALESCE(sched.arr, '[]'::JSONB)
        ) ORDER BY o.jenis DESC, o.kelas ASC, o.nama ASC
    ) INTO v_offerings
    FROM public.offerings o
    LEFT JOIN (
        SELECT s.offering_id, jsonb_agg(
            jsonb_build_object(
                'id', s.id,
                'hari', s.hari,
                'jam_mulai', to_char(s.jam_mulai, 'HH24:MI'),
                'jam_selesai', to_char(s.jam_selesai, 'HH24:MI'),
                'ruang', s.ruang
            ) ORDER BY s.hari, s.jam_mulai
        ) AS arr
        FROM public.schedules s
        GROUP BY s.offering_id
    ) sched ON sched.offering_id = o.id;

    RETURN jsonb_build_object(
        'ok', true,
        'offerings', COALESCE(v_offerings, '[]'::JSONB)
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 2. PERKETAT lapor_kendala_mahasiswa(): TOLAK PENDING & REJECTED
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.lapor_kendala_mahasiswa(
    p_nim TEXT,
    p_nama TEXT,
    p_kategori TEXT,
    p_alasan TEXT,
    p_kontak TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
    v_clean_nim VARCHAR(20) := trim(p_nim);
    v_clean_nama VARCHAR(100) := trim(p_nama);
    v_clean_kategori VARCHAR(50) := COALESCE(NULLIF(trim(p_kategori), ''), 'salah_pilih');
    v_clean_alasan TEXT := trim(p_alasan);
    v_clean_kontak VARCHAR(50) := trim(p_kontak);
    v_student RECORD;
    v_existing_complaint RECORD;
    v_id INT;
BEGIN
    IF v_clean_nim = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM wajib diisi.');
    END IF;

    IF v_clean_alasan = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Alasan kendala wajib diisi.');
    END IF;

    IF v_clean_kontak = '' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Nomor kontak WhatsApp/telepon aktif wajib diisi.');
    END IF;

    -- Periksa apakah mahasiswa terdaftar di master students
    SELECT * INTO v_student FROM public.students WHERE nim = v_clean_nim;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'NIM tidak terdaftar di sistem.');
    END IF;

    IF v_clean_nama = '' THEN
        v_clean_nama := v_student.nama;
    END IF;

    -- Periksa apakah mahasiswa memiliki laporan yang masih pending atau sudah ditolak
    SELECT * INTO v_existing_complaint
    FROM public.student_complaints
    WHERE nim = v_clean_nim
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND THEN
        IF v_existing_complaint.status = 'pending' THEN
            RETURN jsonb_build_object(
                'ok', false, 
                'error', 'Laporan kendala Anda sebelumnya masih dalam antrian peninjauan admin. Mohon menunggu tanggapan admin.'
            );
        ELSIF v_existing_complaint.status = 'rejected' THEN
            RETURN jsonb_build_object(
                'ok', false, 
                'error', 'Laporan kendala Anda sebelumnya telah ditolak oleh admin. Keputusan admin bersifat final dan tidak dapat mengajukan laporan baru.'
            );
        END IF;
    END IF;

    INSERT INTO public.student_complaints (
        nim, nama, kelas, kategori, alasan, kontak, status
    ) VALUES (
        v_clean_nim, v_clean_nama, v_student.kelas, v_clean_kategori, v_clean_alasan, v_clean_kontak, 'pending'
    )
    RETURNING id INTO v_id;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Laporan kendala berhasil dikirimkan. Silakan tunggu tanggapan dan arahan dari Admin Akademik.',
        'complaint_id', v_id
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 3. HAK AKSES EKSPLISIT
-- ------------------------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.jadwal_kuliah_publik() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lapor_kendala_mahasiswa(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
