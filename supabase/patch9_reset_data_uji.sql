-- ==============================================================================
-- PATCH 9: Fungsi Reset Data Uji Coba / Dummy Sebelum Hari-H
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.admin_reset_data_uji()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_deleted_reg INT;
    v_deleted_queue INT;
    v_deleted_req INT;
    v_deleted_students INT;
BEGIN
    IF NOT public.is_admin() THEN
        RETURN jsonb_build_object('ok', false, 'error', 'Akses ditolak: Hanya untuk akun administrator.');
    END IF;

    -- 1. Hapus seluruh data pendaftaran pemilihan uji coba
    WITH del_reg AS (
        DELETE FROM public.registrations RETURNING 1
    )
    SELECT count(*) INTO v_deleted_reg FROM del_reg;

    -- 2. Hapus seluruh antrian dan token sesi uji coba
    WITH del_q AS (
        DELETE FROM public.queue RETURNING 1
    )
    SELECT count(*) INTO v_deleted_queue FROM del_q;

    -- 3. Hapus seluruh pengajuan akses uji coba
    WITH del_req AS (
        DELETE FROM public.access_requests RETURNING 1
    )
    SELECT count(*) INTO v_deleted_req FROM del_req;

    -- 4. Hapus mahasiswa dummy uji coba (NIM berawalan 21102110.. atau dummy)
    WITH del_stud AS (
        DELETE FROM public.students
        WHERE nim ~ '^21102110[0-9]{2}$'
           OR nim LIKE 'DUMMY%'
           OR nama ILIKE '%dummy%'
           OR nama ILIKE '%test%'
        RETURNING 1
    )
    SELECT count(*) INTO v_deleted_students FROM del_stud;

    -- 5. Kunci kembali portal pemilihan ke status TUTUP
    UPDATE public.settings
    SET portal_open = false
    WHERE id = 1;

    RETURN jsonb_build_object(
        'ok', true,
        'message', 'Data uji coba berhasil dibersihkan dengan sukses.',
        'pendaftaran_dihapus', v_deleted_reg,
        'antrian_dihapus', v_deleted_queue,
        'pengajuan_dihapus', v_deleted_req,
        'mahasiswa_dummy_dihapus', v_deleted_students
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_reset_data_uji() TO authenticated;
