// ==============================================================================
// PARSER EXCEL: MAHASISWA (PDF-TO-EXCEL CERDAS) & MASTER JADWAL
// ==============================================================================

export interface StudentImportRow {
  nim: string;
  nama: string;
  kelas?: string;
  pin?: string;
}

export function normalizeHari(rawHari: unknown): string {
  if (!rawHari) return "Senin";
  const s = String(rawHari).trim().toLowerCase();
  if (s.includes("senin")) return "Senin";
  if (s.includes("selasa")) return "Selasa";
  if (s.includes("rabu")) return "Rabu";
  if (s.includes("kamis")) return "Kamis";
  if (s.includes("jumat") || s.includes("jum'at")) return "Jumat";
  if (s.includes("sabtu")) return "Sabtu";
  if (s.includes("minggu")) return "Minggu";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function parseJamRange(
  rawJam: unknown,
  rawJamMulai?: unknown,
  rawJamSelesai?: unknown
): { jamMulai?: string; jamSelesai?: string } {
  const formatTime = (t: string): string => {
    const clean = t.trim().replace(".", ":");
    if (/^\d{1,2}:\d{2}$/.test(clean)) {
      const [h, m] = clean.split(":");
      return `${h.padStart(2, "0")}:${m}:00`;
    }
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(clean)) {
      const [h, m, s] = clean.split(":");
      return `${h.padStart(2, "0")}:${m}:${s}`;
    }
    return clean;
  };

  if (rawJamMulai && rawJamSelesai) {
    return {
      jamMulai: formatTime(String(rawJamMulai)),
      jamSelesai: formatTime(String(rawJamSelesai)),
    };
  }

  if (rawJam) {
    const str = String(rawJam).trim();
    const parts = str.split(/[-–—]/);
    if (parts.length === 2) {
      return {
        jamMulai: formatTime(parts[0]),
        jamSelesai: formatTime(parts[1]),
      };
    }
  }

  return { jamMulai: undefined, jamSelesai: undefined };
}

/**
 * Ekstrak mahasiswa cerdas berbasis pola regex.
 * Menangani hasil konversi PDF acak yang header kolomnya tidak baku.
 */
export function extractStudentFromRow(
  rowObj: Record<string, unknown>,
  defaultKelas?: string
): StudentImportRow | null {
  const values = Object.values(rowObj).filter(
    (v) => v !== null && v !== undefined && String(v).trim() !== ""
  );
  if (values.length === 0) return null;

  let foundNim: string | null = null;
  let foundNama: string | null = null;
  let foundKelas: string | null = defaultKelas || null;

  // 1. Cek dulu apakah ada key eksplisit (NIM, Nama, dsb)
  for (const [k, v] of Object.entries(rowObj)) {
    const keyLower = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const valStr = String(v).trim();
    if (
      !foundNim &&
      (keyLower === "nim" ||
        keyLower === "npm" ||
        keyLower === "nomorinduk" ||
        keyLower === "nomhs" ||
        keyLower === "noinduk")
    ) {
      const digits = valStr.replace(/[^0-9]/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        foundNim = digits;
      }
    }
    if (
      !foundNama &&
      (keyLower === "nama" ||
        keyLower === "namamahasiswa" ||
        keyLower === "namalengkap" ||
        keyLower === "mahasiswa" ||
        keyLower === "peserta")
    ) {
      if (valStr.length >= 3 && !/^\d+$/.test(valStr.replace(/[^0-9]/g, ""))) {
        foundNama = valStr;
      }
    }
    if (
      !foundKelas &&
      (keyLower === "kelas" || keyLower === "rombel" || keyLower === "grup")
    ) {
      foundKelas = valStr;
    }
  }

  // 2. Jika belum ditemukan (misal convert PDF dengan header acak 'Col1', 'F2', dsb),
  // lakukan deteksi cerdas berdasarkan pola nilai sel:
  if (!foundNim || !foundNama) {
    for (const val of values) {
      const strVal = String(val).trim();
      const cleanDigits = strVal.replace(/[^0-9]/g, "");

      // Deteksi NIM: Angka berurutan 7 sampai 15 digit
      if (
        !foundNim &&
        cleanDigits.length >= 7 &&
        cleanDigits.length <= 15 &&
        /^\d+$/.test(strVal.replace(/[\s.-]/g, ""))
      ) {
        foundNim = cleanDigits;
        continue;
      }

      // Deteksi Nama: Teks dengan huruf latin, panjang >= 3, bukan tanggal, bukan keyword header
      if (
        !foundNama &&
        strVal.length >= 3 &&
        !/^\d+$/.test(cleanDigits) &&
        /[a-zA-Z]/.test(strVal)
      ) {
        const lower = strVal.toLowerCase();
        const isHeaderWord =
          lower === "nim" ||
          lower === "nama" ||
          lower === "npm" ||
          lower === "kelas" ||
          lower === "no" ||
          lower === "nomor" ||
          lower.includes("daftar") ||
          lower.includes("semester") ||
          lower.includes("halaman") ||
          lower.includes("presensi") ||
          lower.includes("universitas") ||
          lower.includes("fakultas") ||
          lower.includes("program studi");

        if (!isHeaderWord) {
          foundNama = strVal;
        }
      }
    }
  }

  if (foundNim && foundNama) {
    return {
      nim: foundNim,
      nama: foundNama,
      kelas: foundKelas ? foundKelas.trim() : undefined,
    };
  }

  return null;
}
