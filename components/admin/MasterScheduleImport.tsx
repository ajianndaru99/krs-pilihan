"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { normalizeHari, parseJamRange } from "@/lib/excel-parser";

interface MasterScheduleImportProps {
  onImportOfferings: (offerings: unknown[]) => Promise<{ inserted: number; updated: number }>;
  onImportClassSchedules: (jadwal: unknown[]) => Promise<{ inserted: number }>;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}

export function MasterScheduleImport({
  onImportOfferings,
  onImportClassSchedules,
  onSuccess,
  onError,
}: MasterScheduleImportProps) {
  const [loading, setLoading] = useState(false);

  const handleDownloadTemplate = () => {
    const sampleData = [
      {
        HARI: "Senin",
        JAM: "07.30-08.50",
        MATKUL: "Bioteknologi Tanaman",
        KELAS: "Pilihan",
        KUOTA: 30,
        JENIS: "matkul",
        RUANG: "R. Sidang 1",
      },
      {
        HARI: "Selasa",
        JAM: "09.00-10.40",
        MATKUL: "Dasar Agronomi",
        KELAS: "SPKS G",
        KUOTA: "",
        JENIS: "",
        RUANG: "R. Kuliah 201",
      },
      {
        HARI: "Rabu",
        JAM: "13.00-14.40",
        MATKUL: "Proyek Mandiri Inovasi Agroteknologi",
        KELAS: "Pilihan",
        KUOTA: 150,
        JENIS: "proyek",
        RUANG: "Laboratorium Terpadu",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master Jadwal");
    XLSX.writeFile(wb, "template_master_jadwal_keseluruhan.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const sheetName = wb.SheetNames[0];
      const sheet = wb.Sheets[sheetName];
      const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

      if (rawRows.length === 0) {
        onError("Berkas Excel master jadwal kosong.");
        return;
      }

      interface OfferingPayload {
        nama: string;
        topik: string;
        jenis: "matkul" | "proyek";
        kuota: number;
        jadwal: Array<{
          hari: string;
          jam_mulai: string;
          jam_selesai: string;
          ruang: string;
        }>;
      }

      const offeringMap = new Map<string, OfferingPayload>();
      const classScheduleList: Array<{
        kelas: string;
        nama_matkul: string;
        hari: string;
        jam_mulai: string;
        jam_selesai: string;
        ruang: string;
      }> = [];

      for (const row of rawRows) {
        let rawHari = "";
        let rawJam = "";
        let rawMatkul = "";
        let rawKelas = "";
        let rawRuang = "";
        let rawKuota: number | undefined = undefined;
        let rawJenis: "matkul" | "proyek" = "matkul";

        for (const [k, v] of Object.entries(row)) {
          const keyLower = k.toLowerCase().replace(/[^a-z0-9]/g, "");
          const valStr = String(v).trim();

          if (keyLower === "hari") rawHari = valStr;
          else if (keyLower === "jam" || keyLower === "waktu") rawJam = valStr;
          else if (keyLower === "matkul" || keyLower === "namamatkul" || keyLower === "matakuliah") rawMatkul = valStr;
          else if (keyLower === "kelas" || keyLower === "rombel") rawKelas = valStr;
          else if (keyLower === "ruang" || keyLower === "ruangan") rawRuang = valStr;
          else if (keyLower === "kuota" || keyLower === "kapasitas") {
            const num = parseInt(valStr, 10);
            if (!isNaN(num) && num > 0) rawKuota = num;
          } else if (keyLower === "jenis" || keyLower === "tipe") {
            if (valStr.toLowerCase().includes("proyek")) rawJenis = "proyek";
          }
        }

        if (!rawMatkul) continue;

        const parsedTime = parseJamRange(rawJam);
        const hariNormalized = normalizeHari(rawHari);
        const jamMulai = parsedTime.jamMulai || "08:00:00";
        const jamSelesai = parsedTime.jamSelesai || "09:40:00";

        const isPilihan =
          rawKuota !== undefined ||
          rawKelas.toLowerCase().includes("pilihan") ||
          rawJenis === "proyek";

        if (isPilihan) {
          const key = rawMatkul.toLowerCase();
          if (!offeringMap.has(key)) {
            offeringMap.set(key, {
              nama: rawMatkul,
              topik: "",
              jenis: rawJenis,
              kuota: rawKuota || (rawJenis === "proyek" ? 150 : 30),
              jadwal: [],
            });
          }
          if (rawHari && parsedTime.jamMulai) {
            offeringMap.get(key)!.jadwal.push({
              hari: hariNormalized,
              jam_mulai: jamMulai,
              jam_selesai: jamSelesai,
              ruang: rawRuang,
            });
          }
        }

        if (rawKelas && !rawKelas.toLowerCase().includes("pilihan")) {
          classScheduleList.push({
            kelas: rawKelas,
            nama_matkul: rawMatkul,
            hari: hariNormalized,
            jam_mulai: jamMulai,
            jam_selesai: jamSelesai,
            ruang: rawRuang,
          });
        }
      }

      let resOfferings = { inserted: 0, updated: 0 };
      if (offeringMap.size > 0) {
        resOfferings = await onImportOfferings(Array.from(offeringMap.values()));
      }

      let resClasses = { inserted: 0 };
      if (classScheduleList.length > 0) {
        resClasses = await onImportClassSchedules(classScheduleList);
      }

      onSuccess(
        `Impor Master Jadwal Sukses: ${resOfferings.inserted + resOfferings.updated} matkul pilihan diproses & ${resClasses.inserted} slot jadwal kelas tetap dipetakan.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memproses berkas master jadwal.";
      onError(msg);
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="card" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
        <div>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0 }}>
            🏛️ Impor Master Jadwal Fakultas (1 Pintu)
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            Cukup unggah 1 berkas master jadwal semesteran fakultas. Sistem akan otomatis memetakan jadwal kelas tetap
            dan mendaftarkan jadwal pilihan.
          </p>
        </div>

        <button type="button" className="btn btn-secondary" onClick={handleDownloadTemplate} style={{ fontSize: "0.85rem" }}>
          📄 Unduh Template Master Jadwal (.xlsx)
        </button>
      </div>

      <div
        style={{
          marginTop: "1.25rem",
          padding: "1.5rem",
          border: "2px dashed var(--border-color)",
          borderRadius: "var(--radius-md)",
          textAlign: "center",
          backgroundColor: "var(--bg-subtle)",
        }}
      >
        <input
          type="file"
          id="masterScheduleInput"
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
          style={{ display: "none" }}
          disabled={loading}
        />
        <label
          htmlFor="masterScheduleInput"
          className="btn btn-primary"
          style={{ cursor: loading ? "not-allowed" : "pointer", display: "inline-block" }}
        >
          {loading ? "Memproses Master Jadwal..." : "📁 Pilih Berkas Master Jadwal Excel"}
        </label>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
          Mendukung format kolom: <strong>HARI, JAM (07.30-08.50), MATKUL, KELAS, RUANG, KUOTA</strong>
        </p>
      </div>
    </div>
  );
}
