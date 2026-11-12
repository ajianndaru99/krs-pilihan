-- ==============================================================================
-- VERIFIKASI INTEGRITAS DATABASE & PENGUKURAN LATENSI (EXPLAIN ANALYZE)
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Jalankan di SQL Editor Supabase Dashboard:
-- https://supabase.com/dashboard/project/vkoaezphrfojzkbpyfyw/sql
-- ==============================================================================

-- 1. UJI KUOTA JEBOL (Hasil harus 0 baris — membuktikan tidak ada over-quota)
SELECT o.id, o.nama, o.kelas, o.kuota, count(r.id) AS terisi, 
       GREATEST(0, count(r.id) - o.kuota) AS selisih_jebol
FROM public.offerings o
LEFT JOIN public.registrations r ON r.offering_id = o.id
GROUP BY o.id, o.nama, o.kelas, o.kuota
HAVING count(r.id) > o.kuota;

-- 2. UJI PENDAFTARAN GANDA / DUPLIKASI MATKUL PER MAHASISWA (Hasil harus 0 baris)
SELECT nim, offering_id, count(*) AS duplikasi
FROM public.registrations
GROUP BY nim, offering_id
HAVING count(*) > 1;

-- 3. UJI BATAS PILIHAN RESMI (Minimal 1, Maksimal 4) (Hasil harus 0 baris)
SELECT nim, count(*) AS total_pilihan
FROM public.registrations
GROUP BY nim
HAVING count(*) NOT BETWEEN 1 AND 4;

-- 4. STATUS SESI ANTRIAN PASCA UJI
SELECT state, count(*) AS jumlah_sesi
FROM public.queue
GROUP BY state;

-- 5. KONSISTENSI STATUS MAHASISWA & TABEL PENDAFTARAN
SELECT 
    (SELECT count(*) FROM public.students WHERE registered_at IS NOT NULL AND nim LIKE '2110211%') AS mahasiswa_selesai,
    (SELECT count(DISTINCT nim) FROM public.registrations WHERE nim LIKE '2110211%') AS mahasiswa_punya_krs;

-- 6. PENGUKURAN LATENSI INTERNAL DATABASE PADA cek_nim (Bandingkan waktu Execution Time dengan latensi jaringan HTTP)
EXPLAIN (ANALYZE, BUFFERS) SELECT public.cek_nim('2110211001');

