-- ==============================================================================
-- VERIFIKASI INTEGRITAS DATABASE & PENGUKURAN LATENSI (EXPLAIN ANALYZE)
-- Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
-- ==============================================================================
-- Jalankan di SQL Editor Supabase Dashboard:
-- https://supabase.com/dashboard/project/vkoaezphrfojzkbpyfyw/sql
-- ==============================================================================

-- ==============================================================================
-- TABEL RINGKASAN INTEGRITAS DATABASE (KUERI 1 s/d 4 DALAM SATU TAMPILAN GRID)
-- ==============================================================================
SELECT 
    '1. Kuota Jebol (harus 0)' AS uji,
    COALESCE(count(*), 0) AS jumlah_pelanggaran,
    CASE WHEN count(*) = 0 THEN '✅ AMAN (Nol kuota jebol)' ELSE '❌ ADA KUOTA JEBOL' END AS status
FROM (
    SELECT o.id FROM public.offerings o 
    JOIN public.registrations r ON r.offering_id = o.id 
    GROUP BY o.id, o.kuota HAVING count(r.id) > o.kuota
) q1

UNION ALL

SELECT 
    '2. Duplikasi Matkul Per NIM (harus 0)' AS uji,
    COALESCE(count(*), 0) AS jumlah_pelanggaran,
    CASE WHEN count(*) = 0 THEN '✅ AMAN (Nol duplikasi)' ELSE '❌ ADA DUPLIKASI' END AS status
FROM (
    SELECT nim, offering_id FROM public.registrations 
    GROUP BY nim, offering_id HAVING count(*) > 1
) q2

UNION ALL

SELECT 
    '3. Batas Pilihan di Luar 1-4 (harus 0)' AS uji,
    COALESCE(count(*), 0) AS jumlah_pelanggaran,
    CASE WHEN count(*) = 0 THEN '✅ AMAN (Semua 1-4 matkul)' ELSE '❌ JUMLAH PILIHAN TIDAK VALID' END AS status
FROM (
    SELECT nim FROM public.registrations 
    GROUP BY nim HAVING count(*) NOT BETWEEN 1 AND 4
) q3

UNION ALL

SELECT 
    '4. Konsistensi Mahasiswa Selesai vs Registrations' AS uji,
    ABS(
        (SELECT count(*) FROM public.students WHERE registered_at IS NOT NULL AND nim BETWEEN '2110211001' AND '2110211070') - 
        (SELECT count(DISTINCT nim) FROM public.registrations WHERE nim BETWEEN '2110211001' AND '2110211070')
    ) AS jumlah_pelanggaran,
    CASE WHEN (SELECT count(*) FROM public.students WHERE registered_at IS NOT NULL AND nim BETWEEN '2110211001' AND '2110211070') = 
              (SELECT count(DISTINCT nim) FROM public.registrations WHERE nim BETWEEN '2110211001' AND '2110211070')
         THEN format('✅ COCOK (%s mahasiswa)', (SELECT count(*) FROM public.students WHERE registered_at IS NOT NULL AND nim BETWEEN '2110211001' AND '2110211070'))
         ELSE '❌ TIDAK COCOK' 
    END AS status;

-- ==============================================================================
-- RINCIAN STATUS KUOTA PER MATA KULIAH (MEMBUKTIKAN EKONOMI A TEPAT 23/23)
-- ==============================================================================
-- SELECT o.id, o.nama, o.kelas, o.kuota, count(r.id) AS terisi, 
--        o.kuota - count(r.id) AS sisa_kursi
-- FROM public.offerings o
-- LEFT JOIN public.registrations r ON r.offering_id = o.id
-- GROUP BY o.id, o.nama, o.kelas, o.kuota
-- ORDER BY terisi DESC, o.id ASC;
