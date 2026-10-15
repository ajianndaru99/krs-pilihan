# KRS Pilihan — UI/UX Design System & Style Reference
> Academic workbench on crisp hairline surfaces & frosted glass

**Theme:** Light (High-Legibility Academic Portal)  
**Target Platform:** Web (Desktop & Mobile Viewport HP, responsive 360px–1200px) + A4 Print

---

## 1. Filosofi & Karakter Visual

Sistem Pemilihan Mata Kuliah Pilihan dirancang dengan pendekatan *developer workbench* yang disiplin dan tenang: kanvas putih bersih (*pure white canvas*), pemisah garis setipis rambut (*hairline borders* 1px `#e2e8f0`), tipografi yang tegas dan terstruktur, serta satu aksen utama **Prism Teal** (`#14b8a6`) yang memandu aksi pengguna tanpa menciptakan kebisingan visual (*visual clutter*).

Dalam konteks pemilihan matkul berkecepatan tinggi (*rush hour* saat portal dibuka), antarmuka harus memberikan ketenangan, kejelasan informasi, dan kepastian status seketika:
- **Zero Ambiguity:** Status kuota, sisa waktu sesi aktif, dan posisi antrian disajikan dengan angka presisi (*tabular figures*).
- **Hairline Layering:** Kedalaman visual diciptakan melalui garis tepi 1px `#e2e8f0`, bukan bayangan tebal atau gradien warna-warni yang mengaburkan teks.
- **Micro-Animations yang Fungsional:** Indikator denyut (*pulse dot*) menandakan polling antrian aktif tanpa mengalihkan konsentrasi.
- **Fail-Safe Feedback:** State galat, peringatan kuota menipis, dan konfirmasi pendaftaran memiliki kode warna yang tegas (Emerald, Amber, Crimson).

---

## 2. Token Warna (Color Tokens)

| Nama Token | Nilai Hex / CSS | CSS Variable | Peran & Penggunaan |
|---|---|---|---|
| **Prism Teal** | `#14b8a6` | `--color-prism-teal` | Aksen aksi utama, border kartu terpilih, tombol CTA primer, sorotan baris aktif |
| **Deep Teal** | `#0d9488` | `--color-deep-teal` | State hover tombol CTA primer, badge penekanan tinggi |
| **Teal Light** | `#f0fdfa` | `--color-teal-light` | Latar belakang kartu matkul yang dipilih, hero banner wash lembut |
| **Teal Border** | `#ccfbf1` | `--color-teal-border` | Border penegas kartu/badge pilihan |
| **Carbon Ink** | `#1d242f` | `--color-carbon-ink` | Judul utama, heading, logo mark, teks dengan penekanan terberat |
| **Graphite** | `#111827` | `--color-graphite` | Teks isi (*body copy*), nilai input form, label tombol |
| **Slate** | `#6b7280` | `--color-slate` | Teks sekunder, deskripsi bantuan, label jadwal, waktu countdown |
| **Steel** | `#718096` | `--color-steel` | Teks tersier, label nonaktif (*disabled*), ikon metadata |
| **Fog** | `#9ca3af` | `--color-fog` | Placeholder form input, garis pemisah halus |
| **Mist** | `#e2e8f0` | `--color-mist` | Border hairline 1px pada kartu, tabel, tab navigasi, dan input |
| **Bone** | `#f3f4f6` | `--color-bone` | Latar selang-seling tabel, background tombol sekunder, pill filter |
| **Paper** | `#ffffff` | `--color-paper` | Latar belakang dasar kanvas aplikasi dan kartu utama |
| **Crimson Danger** | `#dc2626` / `#fef2f2` | `--color-danger` / `--bg-danger` | Pesan galat, kuota habis / kritis, sesi kedaluwarsa, tombol batal |
| **Amber Warning** | `#d97706` / `#fffbeb` | `--color-warning` / `--bg-warning` | Notifikasi bentrok jadwal, peringatan kuota tersisa sedikit (≤ 5) |
| **Emerald Success** | `#059669` / `#ecfdf5` | `--color-success` / `--bg-success` | Pendaftaran berhasil, indikator antrian aktif, lencana selesai |

---

## 3. Tipografi & Skala Teks

Tipografi mengutamakan kejelasan keterbacaan pada ukuran kecil (HP) dan ketegasan hierarki pada layar lebar:

```css
--font-sans: 'Inter', var(--font-geist-sans), -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
--font-mono: var(--font-geist-mono), 'Mona Sans Mono VF', ui-monospace, Menlo, Consolas, monospace;
```

### Skala Hierarki Tipografi

| Level | Ukuran | Line Height | Letter Spacing | Berat (*Weight*) | Penggunaan |
|---|---|---|---|---|---|
| **Display / Hero** | `32px` – `36px` | 1.15 | `-0.025em` | 700 / 800 | Judul Header Banner Portal |
| **Heading 1 / Title** | `24px` – `28px` | 1.25 | `-0.02em` | 700 | Judul kartu identifikasi, judul bukti cetak |
| **Heading 2 / Sub** | `18px` – `20px` | 1.3 | `-0.01em` | 600 | Judul kelompok matkul/proyek, subjudul admin |
| **Body Primary** | `15px` – `16px` | 1.5 | `0` | 400 / 500 | Deskripsi, teks nama matkul, instruksi |
| **Body Small** | `13px` – `14px` | 1.45 | `0.01em` | 400 | Label form, jadwal kuliah, rincian kuota |
| **Micro / Caption** | `11px` – `12px` | 1.4 | `0.02em` | 600 | Lencana (*badge*), topik pill, status jadwal |
| **Tabular Numbers** | `14px` – `54px` | 1.0 | `0` (tnum) | 700 / 800 | Nomor antrian, sisa kuota, countdown timer |

---

## 4. Spasi, Bentuk, dan Elevasi (Elevation)

- **Base Grid:** `4px` kelipatan (`8px`, `12px`, `16px`, `24px`, `32px`).
- **Border Radius:**
  - `6px`: Tombol (*buttons*), form input, lencana (*badge pills*), tab nav.
  - `10px`: Kartu konten (*cards*), panel antrian (*queue box*), jendela modal.
- **Elevasi (Shadows):**
  - **Subtle Surface:** `rgba(0, 0, 0, 0.04) 0px 1px 2px 0px` (dipakai bersama border 1px `#e2e8f0`).
  - **Floating Active Bar:** `0 10px 15px -3px rgba(0, 0, 0, 0.06), 0 4px 6px -4px rgba(0, 0, 0, 0.03)` (untuk sticky session bar saat memilih matkul).

---

## 5. Anatomi Komponen Antarmuka (Components)

### 5.1. Header Banner & Navigasi
- Latar belakang gradasi halus vertikal dari `#f0fdfa` (Teal Wash) ke `#ffffff` dengan border bawah hairline 1px `#e2e8f0`.
- Judul utama dalam Carbon Ink (`#1d242f`) dengan aksen label fakultas/portal dalam Prism Teal (`#14b8a6`).
- Bersih, ringkas, dan tidak menghabiskan ruang vertikal viewport HP.

### 5.2. Form Identifikasi NIM & Modal Pengajuan
- Kartu berada di posisi tengah (*centered card*, lebar maksimal `540px`).
- Input teks dengan border 1px `#e2e8f0`, radius `6px`, transisi fokus ke border `#14b8a6` dengan ring bayangan lembut `rgba(20, 184, 166, 0.15)`.
- Tombol aksi utama (*CTA button*) warna solid `#14b8a6` dengan teks putih, hover ke `#0d9488`.

### 5.3. Kotak Antrian (Queue Waiting Box)
- Menampilkan nomor antrian dalam ukuran besar (`48px`–`54px`) dengan `font-variant-numeric: tabular-nums`.
- Indikator denyut (*pulse dot*) warna `#059669` yang berdenyut lembut setiap 1.5 detik sebagai sinyal koneksi aktif.
- Estimasi waktu dan posisi antrian disajikan dalam format dua kolom yang seimbang di atas latar `#f8fafc`.

### 5.4. Kartu Mata Kuliah Pilihan (Offering Cards)
- **Normal State:** Background putih `#ffffff`, border 1px `#e2e8f0`, radius `10px`, padding `16px`. Hover menghasilkan translasi ringan `-1px` dan border `#cbd5e1`.
- **Selected State:** Border 2px solid `#14b8a6`, background `#f0fdfa`, lencana centang aktif di kanan atas.
- **Disabled State (Penuh / Bentrok):** Opasitas 55%, kursor `not-allowed`, latar `#f3f4f6`, border `#e2e8f0`.
- **Indikator Kuota Kritis:** Lencana oranye/merah menyala jika kuota tersisa `≤ 5` kursi untuk urgensi yang jelas.
- **Jadwal Badge:** Ditampilkan dalam bentuk pill kecil monospaced (`Senin, 08:00 - 09:40 @ R.301`).

### 5.5. Sticky Session Bar (Pemilihan Aktif)
- Menempel di bagian atas layar (`position: sticky; top: 12px; z-index: 100`).
- Background putih dengan border 1px `#14b8a6`, radius `10px`, dan bayangan mengambang lembut.
- Memuat ringkasan pilihan `3/3 Matkul | 1/1 Proyek`, jam hitung mundur `04:32` (berubah merah saat `< 60s`), dan tombol submit pendaftaran.

### 5.6. Workbench Admin (Dashboard Pengelola)
- Metrik kartu statistik dengan border 1px `#e2e8f0`, angka besar `24px` tebal.
- Tab navigasi minimalis tanpa garis vertikal pemisah; tab aktif ditandai garis bawah 2px `#14b8a6` dan teks tebal Carbon Ink.
- Tabel data dengan header `#f8fafc` tebal, border horizontal halus `#e2e8f0`, dan sel yang ramah sentuhan.

### 5.7. Lembar Bukti Cetak (A4 Official Document)
- Pada media cetak (`@media print`), semua tombol, navigasi, dan elemen interaktif disembunyikan total.
- Kop surat resmi di bagian atas, tabel pendaftaran bergaris hitam/abu tegas (`#000000`), font hitam legibel, serta kolom tanda tangan dosen PA / mahasiswa.

---

## 6. Aturan Desain (Do's and Don'ts)

### Wajib Dilakukan (Do)
1. **Gunakan Prism Teal `#14b8a6` khusus untuk elemen bermakna aksi** (tombol primer, status antrian aktif, border pilihan terpilih).
2. **Gunakan font monospaced atau tabular figures** untuk nomor antrian, sisa kuota, dan waktu kuliah agar tata letak tidak bergeser saat angka berubah.
3. **Patuhi radius 6px untuk tombol dan input, serta 10px untuk kartu/modal** agar antarmuka terlihat presisi dan terkalibrasi.
4. **Berikan umpan balik instan pada sentuhan HP:** target sentuh minimal `44px` untuk kartu dan tombol pendaftaran.

### Dilarang (Don't)
1. **Jangan menggunakan warna biru tua atau ungu jenuh** yang bertabrakan dengan palet monokrom-teal.
2. **Jangan memakai gradien tebal atau drop-shadow berlapis-lapis** yang membuat antarmuka terasa berat.
3. **Jangan menyembunyikan status kuota atau sisa waktu**; kepastian status adalah prioritas utama pengguna.
4. **Jangan biarkan teks bertumpuk di layar HP 360px**; seluruh teks panjang dan tombol harus membungkus (*wrap*) dengan rapi.
