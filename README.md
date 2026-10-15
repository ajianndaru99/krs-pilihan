# Sistem Pemilihan Mata Kuliah Pilihan (KRS Pilihan)

Aplikasi portal web pemilihan mata kuliah dan proyek pilihan berbasis Next.js App Router, PostgreSQL (Supabase), dan dideploy di Vercel.

---

## Fitur Utama

- **Antrian Mahasiswa**: Sistem antrian transaksi berbasis polling untuk menjaga integritas data saat mahasiswa mendaftar bersamaan.
- **Validasi Jadwal & Kuota Otomatis**: Deteksi bentrok jadwal antar mata kuliah pilihan serta bentrok terhadap jadwal kelas tetap mahasiswa.
- **Dashboard Administrator (`/admin`)**:
  - Login menggunakan username dan password.
  - Kontrol buka/tutup portal pemilihan.
  - Impor berkas Excel untuk mata kuliah, jadwal kuliah, dan data mahasiswa.
  - CRUD (Tambah, Ubah, Hapus) mata kuliah dan proyek pilihan langsung dari antarmuka.
  - Manajemen kuota dan persetujuan pengajuan akses bagi mahasiswa.
  - Ekspor hasil pendaftaran mahasiswa ke format Excel.
- **Bukti Pendaftaran (`/bukti`)**: Tampilan dan pencetakan bukti registrasi yang dioptimalkan untuk ukuran kertas cetak standar (A4).

---

## Arsitektur Teknis

- **Frontend**: Next.js 16 (App Router) + TypeScript + Vanilla CSS Design System.
- **Backend**: PostgreSQL di Supabase (Semua logika kuota, antrian, dan transaksi dienkapsulasi dalam fungsi Database `SECURITY DEFINER` dengan Row Level Security aktif tanpa policy publik).
- **Hosting**: Vercel (Front-end statis teroptimasi) + Supabase (Database & Auth).

---

## Persiapan & Menjalankan Lokal

### 1. Salin Pengaturan Lingkungan
Salin file `.env.example` menjadi `.env.local`:
```bash
cp .env.example .env.local
```
Lalu isi `NEXT_PUBLIC_SUPABASE_URL` dan `NEXT_PUBLIC_SUPABASE_ANON_KEY` dengan kredensial Supabase Anda.

### 2. Jalankan Skrip Database
Buka **SQL Editor** di dashboard Supabase dan jalankan isi dari:
- `supabase/full_schema.sql` (Skema awal lengkap)

### 3. Pasang Dependensi & Jalankan
```bash
npm install
npm run dev
```
Akses di browser pada `http://localhost:3000`.

---

## Perintah Pengujian & Verifikasi

| Perintah | Deskripsi |
|---|---|
| `npx tsc --noEmit` | Pemeriksaan tipe TypeScript mode strict |
| `npm run build` | Pengujian build produksi Next.js |
| `npm run test:db` | Suite uji otomatis database, keamanan RLS, dan aturan bisnis |

---

## Panduan Hari H
Untuk panduan langkah demi langkah saat hari pelaksanaan pemilihan mata kuliah, baca berkas [RUNBOOK.md](./RUNBOOK.md).
