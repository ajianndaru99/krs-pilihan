# AGENTS.md: krs-pilihan

Berkas ini mengatur pembagian kerja antar agent AI di repo ini. Baca seluruhnya sebelum menyentuh apa pun. Spesifikasi sistem ada di `SPEC_matkul_pilihan_antigravity.md`; berkas ini mengatur cara bekerja, spesifikasi itu mengatur apa yang dibangun.

---

## 1. PEMETAAN PERAN

| Peran | Siapa | Wewenang |
|---|---|---|
| **REVIEWER** | Claude Opus dan Claude Sonnet, tidak ada yang lain | HANYA membaca, menginspeksi, dan melaporkan temuan. Tidak menulis atau mengubah kode. |
| **EXECUTOR** | Semua agent selain Claude Opus/Sonnet | Merencanakan, menulis kode, SQL, test, refactor, membersihkan dead code, dokumentasi, menjalankan perintah, memperbaiki bug. Bekerja penuh dan mandiri. |

Opus dan Sonnet dipakai hemat, hanya untuk menilai. Executor menanggung seluruh volume kerja. Jika tidak yakin sedang berperan sebagai apa, tanyakan ke pengguna.

**Pembagian di antara reviewer.** Sonnet untuk inspeksi rutin. Opus untuk fase berisiko tinggi: fungsi database yang menjaga kuota dan antrian, hak akses (RLS, `grant`, fungsi admin), dan inspeksi ulang setelah temuan Kritis.

---

## 2. ATURAN EXECUTOR: BEKERJA ALL OUT, TAPI BERSIH

### Sikap kerja
- Tuntas, teliti, mandiri. Jangan menahan diri karena khawatir token habis.
- Jangan meninggalkan `TODO`, placeholder, atau fungsi kosong tanpa melaporkannya.
- Ambil keputusan teknis sendiri dan catat asumsinya. Bertanya hanya bila buntu, atau bila dua jalan memberi hasil yang berbeda jauh bagi pengguna (mis. jumlah wajib pilihan, kuota cadangan).
- Tulis, jalankan, tes, lalu perbaiki sendiri sebelum menyatakan selesai. Jangan menyerahkan kode yang belum pernah dijalankan.
- Bug di kode sebelumnya diperbaiki sekalian dan dilaporkan.
- **Kode Next.js bawaan belum pernah dijalankan.** Anggap mungkin ada galat dan periksa dulu sebelum menambah fitur. Skrip SQL bawaan sudah diuji di Postgres 16 lokal.

### Gerbang kualitas (wajib sebelum lapor selesai)

| # | Perintah | Syarat lulus |
|---|---|---|
| 1 | `npx tsc --noEmit` | Nol error (mode `strict`). |
| 2 | `npm run build` | Lulus, bila menyentuh `app/`, `lib/`, atau konfigurasi. |
| 3 | `npm run test:db` | Uji database lulus, bila menyentuh `supabase/` atau fungsi RPC. |

`npm run test:db` belum ada. Membuatnya adalah bagian tugas T7 di spesifikasi: skrip yang memuat skrip SQL berurutan ke Postgres lokal atau proyek Supabase percobaan, lalu menjalankan skenario uji di bawah. Sebelum skrip itu ada, jalankan skenario secara manual dan cantumkan hasilnya.

Tambahan ringan: `grep -rn "service_role" app lib scripts docs` harus kosong, dan tidak ada `console.log` sisa debug.

### Test standar (hanya yang wajib, tanpa kerangka uji besar)
Skenario database, masing-masing harus punya hasil yang diharapkan dan benar-benar dijalankan:
- pendaftaran valid; jumlah pilihan salah; topik kembar; pendaftaran ganda; token salah
- satu pilihan penuh membatalkan seluruh pendaftaran (kuota pilihan lain tidak berubah)
- 100 pendaftar paralel berebut satu kursi: tepat satu berhasil
- bentrok antar pilihan; bentrok dengan jadwal kelas; kelas kosong atau tanpa jadwal ditolak
- fungsi `admin_*` ditolak untuk non-admin; akses langsung tabel dari `anon` ditolak
- jumlah `terisi` selalu sama dengan jumlah baris `enrollments` per pilihan

UI: cek sekilas di viewport HP, termasuk keadaan memuat, kosong, dan galat. Jangan menulis test tanpa assertion bermakna. Perbaikan bug disertai skenario yang mengunci bug itu.

### Pembersihan dead code (wajib, setiap fase)
Hapus impor, variabel, fungsi, komponen, dan tipe yang tidak direferensikan; kode yang dikomentari; sisa debug; berkas duplikat atau cadangan; artefak build.

1. Sebelum menghapus, `grep -rn "namaSimbol" app lib scripts supabase`, termasuk path berbentuk string.
2. Hapus dalam commit terpisah dari fitur, atau dipisah jelas di laporan.
3. `npx tsc --noEmit --noUnusedLocals --noUnusedParameters` membantu untuk `app/` dan `lib/`.
4. Jalankan ulang gerbang kualitas setelah penghapusan.
5. Jika ragu, masukkan ke daftar "kandidat dead code", jangan dihapus diam-diam.

Skrip SQL yang sudah dijalankan di proyek Supabase **tidak diedit**; perubahan skema dibuat sebagai patch baru bernomor berikutnya (`patch5_...sql`).

### Standar kode rapi
- Satu berkas satu tanggung jawab; pecah berkas lebih dari kira-kira 300 baris dan fungsi lebih dari kira-kira 40 baris.
- Pisahkan logika murni (aturan tampilan, format jam, hitung bentrok sisi klien), akses data (`supabase.rpc`), dan UI.
- Nama menjelaskan isi; alur datar dengan early return; maksimal tiga tingkat nesting.
- Tipe ketat: tanpa `any`, tanpa `@ts-ignore`, kecuali ada komentar alasan.
- Tanpa magic value: status antrian (`waiting`, `active`, `done`, `expired`), jumlah wajib pilihan, dan interval polling dijadikan konstanta bernama.
- Dilarang `catch` kosong; setiap `rpc` memeriksa `error` dan `ok`.
- Komentar menjelaskan alasan, bukan isi; singkat, berbahasa Indonesia.
- Diff kecil dan terfokus; refactor tidak dicampur diam-diam dengan fitur.

### Definisi SELESAI
1. Tiga gerbang kualitas lulus dengan hasil nyata di laporan.
2. Skenario uji yang relevan dijalankan dan lulus.
3. Fitur dicoba nyata (alur lengkap di HP dan desktop untuk perubahan UI).
4. Keadaan kosong dan galat tertangani; pesan untuk pengguna ramah dan berbahasa Indonesia.
5. Dead code dibersihkan, dan daftar penghapusan tercatat.
6. Tidak ada rahasia di kode atau `docs/`.
7. Laporan fase ditulis sesuai bagian 5.

### Aturan teknis proyek
- Stack: Next.js App Router + TypeScript, Supabase (PostgreSQL, Auth), deploy Vercel. **Basis data PostgreSQL, bukan MySQL.** Dependensi hanya `@supabase/supabase-js` dan `xlsx`, kecuali disetujui pengguna.
- UI berbahasa Indonesia. Zona waktu Asia/Jakarta. Hari 1 = Senin. Jam disimpan sebagai `time`, dikirim server berformat `HH:MM:SS`.
- **Aturan bisnis hidup di fungsi database** (kuota, antrian, bentrok, satu NIM satu pendaftaran). Frontend hanya memanggil `supabase.rpc` dan menampilkan hasil; jangan memindahkan pengecekan ke frontend.
- Pembaruan kuota hanya lewat pembaruan bersyarat `terisi < kuota` di dalam fungsi `daftar`; jangan membaca lalu menulis dari klien.
- Status antrian lewat polling 10 detik. **Dilarang Supabase Realtime** (batas 200 koneksi di paket gratis).
- Logika antrian dan pendaftaran langsung ke Supabase, bukan lewat API route Vercel (menjaga kuota Vercel Hobby).
- Gagal tertutup: bila kelas atau jadwal kelas tidak ada, pendaftaran ditolak, bukan diloloskan.
- Token sesi dan NIM disimpan di `sessionStorage` (kunci `nim`, `token`); akses hanya di sisi klien.

### Aturan keamanan
- RLS aktif di SEMUA tabel **tanpa policy**; akses hanya lewat fungsi `security definer` yang diberi `grant` eksplisit. Jangan menambah policy atau membuka akses langsung tabel.
- Browser hanya memakai kunci `anon`. `service_role` tidak pernah ada di klien atau repo.
- Fungsi `admin_*` hanya untuk email di tabel `admins`; sign-up publik Supabase Auth dimatikan.
- Semua rahasia lewat env; sediakan `.env.example` berisi nilai contoh; `.env*` masuk `.gitignore`.
- Data mahasiswa (NIM, nama) tidak masuk ke log produksi dan tidak dicommit; berkas Excel uji memakai data palsu.

### Izin: longgar, dengan pengecualian
Executor bertindak mandiri dan cukup melaporkan: menjalankan perintah lokal, memasang atau mengganti dependensi, membuat dan mengubah berkas, merombak struktur kode, menambah patch SQL baru.

**Wajib bertanya dulu ke pengguna** untuk:
- mengubah nama atau tanda tangan fungsi RPC (jika disetujui, perbarui semua pemanggilnya dan laporkan)
- menambah policy RLS atau mengubah `grant`
- perintah destruktif (`truncate`, `drop`, `delete` massal) di proyek Supabase yang dipakai mahasiswa sungguhan, atau kapan pun `status` portal = BUKA. Di proyek percobaan dengan data uji, bebas.
- mengubah aturan bisnis (jumlah wajib pilihan, aturan undian, aturan bentrok)

Sebelum menghapus data nyata, ingatkan pengguna untuk mengekspor cadangan (paket gratis tidak punya backup otomatis).

---

## 3. ATURAN REVIEWER (OPUS / SONNET): INSPEKTUR SAJA, HEMAT TOKEN

### Larangan keras
- Jangan membuat, mengedit, atau menghapus berkas.
- Jangan menulis ulang kode sebagai perbaikan; tunjukkan masalah dan arah solusi dalam kalimat atau potongan kecil.
- Jangan menjalankan perintah yang mengubah state (migrasi ke Supabase, deploy, install, git commit/push). Boleh: membaca berkas dan diff, `npx tsc --noEmit`, `grep`, dan uji baca-saja.

### Aturan hemat token
1. Mulai dari Laporan Fase dan `git diff --stat`; baca diff, bukan seluruh repo.
2. Buka berkas penuh hanya bila diff kekurangan konteks, dan hanya rentang baris yang relevan.
3. Gunakan `grep` untuk pola berbahaya: `service_role`, `any`, `catch {}`, `console.log`, `TODO`, `realtime`, `.from(` (akses tabel langsung dari klien).
4. Verifikasi cepat dengan `npx tsc --noEmit | tail -n 20`; jangan membanjiri konteks.
5. Satu temuan satu atau dua kalimat beserta lokasi. Inspeksi ulang hanya memeriksa temuan sebelumnya dan diff baru.
6. Jangan membuat temuan demi terlihat teliti.

### Fokus inspeksi (urut prioritas)
1. **Keamanan:** RLS tetap tanpa policy, tidak ada akses tabel langsung dari klien, `grant` hanya untuk fungsi yang dimaksud, `is_admin()` menjaga seluruh fungsi admin, tidak ada `service_role` atau rahasia di kode.
2. **Integritas kuota dan data:** pendaftaran transaksional (gagal sebagian berarti batal semua), pembaruan bersyarat, `terisi` cocok dengan `enrollments`, satu NIM satu pendaftaran, tidak ada deadlock (pilihan diproses urut id).
3. **Kebenaran aturan:** cek bentrok (irisan jam pada hari yang sama), gagal tertutup untuk kelas tanpa jadwal, topik tidak kembar, jumlah wajib sesuai pengaturan, antrian (undian sekali, batas aktif, kedaluwarsa, antri ulang maksimal dua kali).
4. **Bukti test:** hasil tiga gerbang kualitas dan skenario uji ada dan masuk akal; laporan tanpa hasil adalah temuan Penting; uji yang gagal adalah temuan Kritis.
5. **Ketahanan dan kapasitas:** penanganan galat `rpc`, keadaan kosong, polling tidak lebih rapat dari 10 detik, tidak ada pola yang menghabiskan kuota gratis Vercel atau Supabase.
6. **Kerapian dan dead code:** sisa impor atau fungsi mati, kode dikomentari, berkas duplikat, berkas terlalu besar, pelanggaran standar kode rapi, fitur di luar lingkup fase.

### Format laporan temuan (wajib)

    ## Hasil Inspeksi: Fase X
    Verdict: LULUS | LULUS DENGAN CATATAN | DITOLAK

    ### Kritis (harus diperbaiki sebelum lanjut)
    - [file:baris] masalah, dampak, arah perbaikan

    ### Penting
    - ...

    ### Dead code dan kerapian
    - [file:baris] apa yang mati atau berantakan, mengapa menyulitkan pencarian bug

    ### Saran
    - ...

    ### Hal yang sudah baik
    - (singkat, paling banyak empat butir)

    ### Tidak bisa diverifikasi
    - (hal yang perlu bukti tambahan, mis. belum dites nyata)

Sebut berkas dan baris spesifik. Bedakan fakta dari dugaan. Verdict DITOLAK jika ada temuan Kritis.

---

## 4. ALUR KERJA

1. **Executor** mengerjakan satu fase penuh.
2. Executor menjalankan gerbang kualitas, membersihkan dead code, menulis **Laporan Fase**, lalu berhenti.
3. **Reviewer** menginspeksi sesuai bagian 3 dan mengeluarkan verdict.
4. Jika ada temuan Kritis atau Penting, executor memperbaiki lalu kembali ke langkah 2.
5. Setelah LULUS dan **pengguna menyetujui**, baru lanjut ke fase berikutnya.

Urutan fase (merujuk tugas T1–T10 di spesifikasi):

| Fase | Isi | Tugas |
|---|---|---|
| 0 | Scaffold proyek, build lulus | T1 |
| 1 | Database: skrip SQL berurutan di proyek percobaan, data awal, akun admin | T2 |
| 2 | Halaman mahasiswa dan bukti cetak | T3, T5 |
| 3 | Dashboard admin dan impor Excel | T4 |
| 4 | Kerapian tampilan, uji beban, pemeriksaan keamanan | T6, T7, T8 |
| 5 | Deploy dan runbook hari H | T9, T10 |

---

## 5. FORMAT LAPORAN FASE (EXECUTOR)

    ## Laporan Fase X
    - Yang dibangun: ...
    - File dibuat/diubah: ...
    - Cara menjalankan: ...
    - Cara memverifikasi (perintah + hasil yang diharapkan): ...
    - Hasil gerbang kualitas: tsc, build, test:db (hasil nyata)
    - Skenario uji yang dijalankan: ...
    - Dead code dibersihkan: (daftar, atau "tidak ada")
    - Kandidat dead code yang belum dihapus: (daftar + alasan ragu, atau "tidak ada")
    - Refactor kerapian: (berkas dipecah atau diganti nama, atau "tidak ada")
    - Asumsi yang diambil: ...
    - Keterbatasan / hal yang belum dikerjakan: ...

---

## 6. KETENTUAN BERSAMA
- Bahasa komunikasi: Indonesia. Kode dan nama variabel: Inggris. Komentar penting: Indonesia singkat.
- Jujur soal ketidakpastian. Jangan mengklaim sudah dites jika belum, dan jangan mencantumkan hasil test yang tidak benar-benar dijalankan.
- Hormati lingkup: tidak ada fitur di luar fase aktif tanpa persetujuan pengguna.
- Pertanyaan terbuka di bagian 8 spesifikasi diputuskan pengguna, bukan agen.

### Gaya penulisan (dokumentasi, README, laporan, balasan)
- Hindari kata pengisi khas AI (delve, tapestry, testament, beacon, paramount, robust, crucial, foster, underscore, elevate, navigate, vibrant, seamless, furthermore, moreover, in conclusion, it is worth noting, merevolusi, menavigasi, rajutan).
- Jangan default ke kelompok tiga. Variasikan panjang kalimat.
- Sambungkan gagasan yang berkaitan dengan konjungsi, titik koma, atau anak kalimat.
- Nada langsung, membumi, dan presisi secara teknis. Maksimal satu tanda pisah (em dash) per 500 kata dan satu tanda seru per 1.000 kata.
- Terapkan aturan ini tanpa menyebutkannya.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
