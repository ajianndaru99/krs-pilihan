# RUNBOOK OPERASIONAL HARI H: SISTEM KRS PILIHAN

Panduan teknis dan operasional untuk tim administrator dan operator program studi dalam mengelola sistem pemilihan mata kuliah pilihan.

---

## 1. Persiapan Pra-Hari H (H-3 sampai H-1)

### 1.1 Verifikasi Data Master
Pastikan seluruh data awal telah masuk dan tidak ada peringatan kuning pada halaman dashboard admin (`/admin`):
1. **Daftar Mahasiswa**: Seluruh mahasiswa aktif semester berjalan sudah diimpor. Kolom kelas terisi sesuai pembagian kelas mahasiswa.
2. **Jadwal Kuliah Tetap**: Jadwal mata kuliah wajib per kelas sudah diunggah untuk mencegah bentrok jadwal otomatis.
3. **Mata Kuliah & Proyek Pilihan**:
   - Seluruh mata kuliah pilihan dan proyek terdaftar dengan kuota masing-masing.
   - Setiap pilihan telah memiliki jadwal (Hari, Jam Mulai, Jam Selesai, Ruang).
   - Pastikan indikator "⚠️ Belum ada jadwal" bernilai 0 di tabel kuota.

### 1.2 Pencadangan Data Awal
Supabase tier gratis tidak menyediakan fitur backup otomatis harian. Lakukan pencadangan mandiri:
1. Buka dashboard Supabase -> **SQL Editor**.
2. Jalankan ekspor atau simpan salinan file Excel master mahasiswa dan penawaran mata kuliah di penyimpanan lokal yang aman.

### 1.3 Simulasi Uji Coba Pendaftaran
1. Masukkan 1–2 baris data mahasiswa uji coba.
2. Buka portal di tab incognito, login dengan NIM mahasiswa uji, lalu pilih kombinasi 3 matkul + 1 proyek.
3. Pastikan bukti pendaftaran tercetak dengan benar dan kuota berkurang 1.
4. Buka tab **Batalkan Pendaftaran NIM** di `/admin`, batalkan NIM uji coba tersebut, lalu pastikan kuota kembali utuh.
5. Pastikan status portal dikunci kembali ke status **TUTUP** (`portal_open = false`).

---

## 2. Prosedur Hari H

### 2.1 Fase Persiapan (30 Menit Sebelum Pembukaan)
1. Buka halaman admin di peramban utama dan login dengan username admin.
2. Pastikan koneksi internet stabil.
3. Buka tab Supabase Dashboard pada menu **Table Editor** atau **Database Health** sebagai pemantau cadangan.
4. Periksa ringkasan statistik:
   - Status Portal: **DITUTUP** (Merah).
   - Total Mahasiswa Terdaftar: 0 (atau sesuai sisa pendaftaran resmi).
   - Antrian Aktif: 0.

### 2.2 Pembukaan Portal (Tepat Jam H)
1. Klik tombol **"🟢 Buka Portal"** pada dashboard `/admin`.
2. Konfirmasi kotak dialog pembukaan.
3. Status portal akan berubah menjadi hijau **DIBUKA**. Mahasiswa yang mengakses halaman utama kini dapat memasukkan NIM dan masuk antrian.

### 2.3 Pemantauan Selama Pemilihan Berlangsung
Operator memantau metrik berikut secara berkala dari dashboard admin:
- **Total Mahasiswa Terdaftar**: Angka ini bertambah seiring mahasiswa menyelesaikan pendaftaran.
- **Antrian Aktif**: Jumlah mahasiswa yang sedang berada di ruang pemilihan (maksimum 30 orang bersamaan dengan durasi 5 menit per sesi).
- **Sisa Kuota Per Mata Kuliah**: Perhatikan mata kuliah dengan sisa kuota 0 (habis).

---

## 3. Penanganan Insiden & Kasus Khusus

### 3.1 Mahasiswa Mengajukan Koreksi / NIM Belum Terdaftar
Jika ada mahasiswa yang tidak bisa masuk dengan pesan "NIM tidak terdaftar":
1. Arahkan mahasiswa untuk menekan tombol **"Ajukan Akses / Bantuan NIM"** di halaman login.
2. Mahasiswa mengisi NIM, Nama Lengkap, Kelas, dan Catatan.
3. Operator membuka tab **Pengajuan Akses** di `/admin`.
4. Periksa kebenaran data mahasiswa dengan data resmi akademik.
5. Klik **"Setujui"**. Data mahasiswa langsung masuk ke database dan mahasiswa bersangkutan dapat langsung login tanpa perlu reload penuh.

### 3.2 Mahasiswa Meminta Pembatalan / Salah Pilih Mata Kuliah
Aturan sistem hanya mengizinkan satu kali pendaftaran per NIM. Jika pendaftaran perlu diulang karena alasan resmi kaprodi:
1. Buka tab **Batalkan Pendaftaran NIM** di dashboard `/admin`.
2. Masukkan NIM mahasiswa yang bersangkutan.
3. Klik **"Batalkan Pendaftaran NIM Ini"**.
4. Sistem menghapus pendaftaran lama, mengembalikan kuota ke masing-masing pilihan secara atomik, dan menghapus sesi antrian lama.
5. Mahasiswa dapat login kembali dari awal untuk memilih ulang.

### 3.3 Penambahan Kuota Darurat
Jika kaprodi memutuskan untuk menambah kapasitas pada mata kuliah yang sudah penuh:
1. Cari mata kuliah tersebut di tab **Kelola Kuota & Pilihan**.
2. Klik tombol **"✏️ Edit"**.
3. Naikkan angka pada kolom **Kuota Maksimal** (misal dari 30 menjadi 35).
4. Klik **"Simpan Pilihan"**. Mahasiswa yang sedang aktif memilih langsung dapat mengambil kursi tambahan tersebut pada refresh berikutnya.

### 3.4 Sesi Mahasiswa Kedaluwarsa (Expired)
Jika durasi 5 menit mahasiswa habis sebelum menekan tombol simpan:
- Status antrian mahasiswa berubah menjadi `expired`.
- Mahasiswa diberi kesempatan antri ulang hingga maksimal 2 kali.
- Bila jatah antri ulang habis, mahasiswa diminta menunggu putaran berikutnya saat antrian mereda.

---

## 4. Penutupan Portal & Pasca Hari H

### 4.1 Penutupan Portal
1. Setelah batas waktu pemilihan berakhir atau seluruh mahasiswa selesai mendaftar, klik tombol **"🛑 Tutup Portal"**.
2. Mahasiswa yang belum mendaftar tidak dapat lagi masuk antrian.

### 4.2 Ekspor Data Final Pendaftaran
1. Di dashboard `/admin`, klik tombol **"📥 Ekspor Excel"**.
2. Berkas `.xlsx` akan terunduh otomatis berisi daftar lengkap:
   - NIM
   - Nama Mahasiswa
   - Kelas
   - Mata Kuliah / Proyek yang Dipilih
   - Jenis (matkul/proyek)
   - Topik
   - Waktu Pendaftaran (Timestamp Asia/Jakarta)
3. Simpan berkas hasil unduhan di Google Drive akademik / arsip program studi.

---

## 5. Ringkasan Parameter Sistem

| Parameter | Nilai Default | Keterangan |
|---|---|---|
| `need_matkul` | 3 | Jumlah mata kuliah pilihan yang wajib dipilih mahasiswa |
| `need_proyek` | 1 | Jumlah proyek pilihan yang wajib dipilih mahasiswa |
| `max_active` | 30 | Kuota mahasiswa aktif memilih secara bersamaan |
| `session_duration` | 5 menit | Batas waktu pemilihan per mahasiswa |
| `poll_interval` | 10 detik | Frekuensi pengecekan status antrian sisi klien |
| Zona Waktu | Asia/Jakarta (WIB) | Format waktu log dan pendaftaran |
