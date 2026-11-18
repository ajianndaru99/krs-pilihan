// lib/email-template.ts
// Generator template HTML email resmi FAPERTA INSTIPER
// Semua styling inline CSS agar kompatibel dengan Gmail App, Apple Mail, Outlook

export interface JadwalItem {
  hari: string;
  jam_mulai: string;
  jam_selesai: string;
  ruang?: string;
}

export interface PilihanEmailItem {
  nama: string;
  jenis: string;
  kelas?: string;
  jadwal: JadwalItem[];
}

export interface BuktiEmailData {
  nim: string;
  nama: string;
  kelas?: string;
  waktu_daftar: string | null;
  pilihan: PilihanEmailItem[];
  bukti_url: string;
}

// Memotong detik dari format HH:MM:SS → HH:MM
function formatJam(jam: string): string {
  if (!jam) return "";
  const parts = jam.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : jam;
}

// Merapikan nama matkul agar tidak redundan dengan kolom Jenis & Kelas
function formatNama(nama: string, kelas?: string): string {
  if (!nama) return "";
  let clean = nama.replace(/^Proyek\s+/i, "");
  if (kelas) {
    clean = clean.replace(new RegExp(`\\s+${kelas}$`, "i"), "");
  } else {
    clean = clean.replace(/\s+[A-D]$/i, "");
  }
  clean = clean.trim();
  return clean.length > 0 ? clean.charAt(0).toUpperCase() + clean.slice(1) : clean;
}

export function generateKrsEmailHtml(data: BuktiEmailData): string {
  const { nim, nama, kelas, waktu_daftar, pilihan, bukti_url } = data;

  const waktuFormatted = waktu_daftar
    ? new Date(waktu_daftar).toLocaleString("id-ID", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Asia/Jakarta",
      }) + " WIB"
    : "-";

  const barisMatkulHtml = pilihan
    .map((item, i) => {
      const jadwalStr =
        item.jadwal && item.jadwal.length > 0
          ? item.jadwal
              .map(
                (j) =>
                  `${j.hari}, ${formatJam(j.jam_mulai)}–${formatJam(j.jam_selesai)}${j.ruang ? ` (${j.ruang})` : ""}`
              )
              .join("<br/>")
          : "Belum ditentukan";

      const bgRow = i % 2 === 0 ? "#ffffff" : "#f8fafc";
      return `
        <tr style="background-color:${bgRow};">
          <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:600;color:#334155;">${i + 1}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;font-weight:700;color:#0f172a;">${formatNama(item.nama, item.kelas)}</td>
          <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #e2e8f0;text-transform:capitalize;color:#334155;">${item.jenis === "proyek" ? "Proyek" : "Matkul"}</td>
          <td style="padding:8px 10px;text-align:center;border-bottom:1px solid #e2e8f0;font-weight:700;color:#166534;">${item.kelas || (item.jenis === "proyek" ? "Semua" : "-")}</td>
          <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;color:#334155;font-size:13px;">${jadwalStr}</td>
        </tr>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Bukti Pemilihan KRS FAPERTA INSTIPER</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:Arial,Helvetica,sans-serif;">
  <table cellpadding="0" cellspacing="0" width="100%" style="background-color:#f1f5f9;padding:24px 0;">
    <tr>
      <td align="center">
        <table cellpadding="0" cellspacing="0" width="600" style="max-width:600px;width:100%;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- HEADER KOP SURAT -->
          <tr>
            <td style="background-color:#14532d;padding:28px 32px 24px;text-align:center;">
              <div style="font-size:11px;font-weight:600;color:#bbf7d0;letter-spacing:1.5px;text-transform:uppercase;margin-bottom:4px;">Institut Pertanian Stiper Yogyakarta</div>
              <div style="font-size:22px;font-weight:800;color:#ffffff;margin:0 0 2px 0;letter-spacing:0.5px;">FAKULTAS PERTANIAN</div>
              <div style="font-size:12px;color:#a7f3d0;font-weight:500;">Portal KRS Mata Kuliah Pilihan</div>
            </td>
          </tr>

          <!-- BADGE STATUS TERVERIFIKASI -->
          <tr>
            <td style="background-color:#f0fdf4;padding:16px 32px;text-align:center;border-bottom:1px solid #d1fae5;">
              <div style="display:inline-block;background-color:#166534;color:#ffffff;padding:8px 20px;border-radius:999px;font-size:12px;font-weight:800;letter-spacing:0.5px;">
                ✓&nbsp; DOKUMEN TERVERIFIKASI ASLI — REGISTRASI ELEKTRONIK SAH
              </div>
            </td>
          </tr>

          <!-- RINCIAN MAHASISWA -->
          <tr>
            <td style="padding:28px 32px 20px;">
              <table cellpadding="0" cellspacing="0" width="100%" style="background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
                <tr style="background-color:#f1f5f9;">
                  <td colspan="2" style="padding:10px 16px;font-weight:800;font-size:13px;color:#1e293b;border-bottom:1px solid #e2e8f0;">Data Mahasiswa</td>
                </tr>
                <tr>
                  <td style="padding:9px 16px;font-size:13px;color:#64748b;width:120px;border-bottom:1px solid #f1f5f9;">NIM</td>
                  <td style="padding:9px 16px;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #f1f5f9;">${nim}</td>
                </tr>
                <tr>
                  <td style="padding:9px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Nama Lengkap</td>
                  <td style="padding:9px 16px;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #f1f5f9;">${nama}</td>
                </tr>
                <tr>
                  <td style="padding:9px 16px;font-size:13px;color:#64748b;border-bottom:1px solid #f1f5f9;">Kelas</td>
                  <td style="padding:9px 16px;font-size:13px;font-weight:700;color:#0f172a;border-bottom:1px solid #f1f5f9;">${kelas || "-"}</td>
                </tr>
                <tr>
                  <td style="padding:9px 16px;font-size:13px;color:#64748b;">Waktu Registrasi</td>
                  <td style="padding:9px 16px;font-size:13px;font-weight:700;color:#166534;">${waktuFormatted}</td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- TABEL MATA KULIAH TERPILIH -->
          <tr>
            <td style="padding:0 32px 28px;">
              <div style="font-weight:800;font-size:14px;color:#1e293b;margin-bottom:12px;">Mata Kuliah &amp; Proyek Terpilih</div>
              <table cellpadding="0" cellspacing="0" width="100%" style="border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;font-size:13px;">
                <thead>
                  <tr style="background-color:#f1f5f9;">
                    <th style="padding:9px 10px;text-align:center;border-bottom:1.5px solid #cbd5e1;color:#334155;font-weight:700;width:32px;">No</th>
                    <th style="padding:9px 10px;text-align:left;border-bottom:1.5px solid #cbd5e1;color:#334155;font-weight:700;">Nama</th>
                    <th style="padding:9px 10px;text-align:center;border-bottom:1.5px solid #cbd5e1;color:#334155;font-weight:700;width:60px;">Jenis</th>
                    <th style="padding:9px 10px;text-align:center;border-bottom:1.5px solid #cbd5e1;color:#334155;font-weight:700;width:48px;">Kelas</th>
                    <th style="padding:9px 10px;text-align:left;border-bottom:1.5px solid #cbd5e1;color:#334155;font-weight:700;">Jadwal</th>
                  </tr>
                </thead>
                <tbody>
                  ${barisMatkulHtml}
                </tbody>
              </table>
            </td>
          </tr>

          <!-- TOMBOL VERIFIKASI -->
          <tr>
            <td style="padding:0 32px 32px;text-align:center;">
              <a href="${bukti_url}" style="display:inline-block;background-color:#166534;color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:800;font-size:14px;letter-spacing:0.3px;">
                🔗 Buka Lembar Verifikasi Online
              </a>
              <div style="margin-top:10px;font-size:11px;color:#94a3b8;">
                Pindai QR Code pada lembar fisik atau buka tautan di atas untuk memverifikasi keaslian dokumen ini.
              </div>
            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#f8fafc;border-top:1px solid #e2e8f0;padding:18px 32px;text-align:center;">
              <div style="font-size:11px;color:#94a3b8;line-height:1.6;">
                Email ini dikirim secara otomatis oleh sistem Portal KRS Fakultas Pertanian INSTIPER Yogyakarta.<br/>
                Dokumen ini sah secara elektronik dan tidak memerlukan tanda tangan basah.<br/>
                <strong style="color:#64748b;">Jangan balas email ini.</strong>
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
