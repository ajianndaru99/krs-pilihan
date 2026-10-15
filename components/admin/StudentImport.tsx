"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { extractStudentFromRow, StudentImportRow } from "@/lib/excel-parser";

interface StudentImportProps {
  onImportStudents: (students: StudentImportRow[]) => Promise<{ inserted: number; updated: number }>;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}

export function StudentImport({ onImportStudents, onSuccess, onError }: StudentImportProps) {
  const [loading, setLoading] = useState(false);
  const [defaultKelas, setDefaultKelas] = useState("");

  const handleDownloadTemplate = () => {
    const sampleData = [
      { NIM: "2110211001", Nama: "Ahmad Fauzi", Kelas: "SPKS G" },
      { NIM: "2110211002", Nama: "Siti Nurhaliza", Kelas: "SPKS P" },
      { NIM: "2110211003", Nama: "Budi Santoso", Kelas: "ANTAN A" },
      { NIM: "2110211004", Nama: "Dewi Lestari", Kelas: "SPKS I" },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mahasiswa");
    XLSX.writeFile(wb, "template_data_mahasiswa.xlsx");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const studentMap = new Map<string, StudentImportRow>();

      for (const sheetName of wb.SheetNames) {
        const sheet = wb.Sheets[sheetName];
        const rawRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });

        for (const row of rawRows) {
          const student = extractStudentFromRow(row, defaultKelas.trim() || undefined);
          if (student && !studentMap.has(student.nim)) {
            studentMap.set(student.nim, student);
          }
        }
      }

      const students = Array.from(studentMap.values());
      if (students.length === 0) {
        onError("Tidak ada data mahasiswa valid (NIM 7-15 digit dan Nama) yang terdeteksi.");
        return;
      }

      const res = await onImportStudents(students);
      onSuccess(
        `Impor Mahasiswa Berhasil! ${res.inserted} mahasiswa baru ditambahkan, ${res.updated} data diperbarui dari total ${students.length} baris terdeteksi.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses berkas mahasiswa.";
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
            Impor Data Mahasiswa
          </h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            Sistem secara cerdas mendeteksi kolom NIM dan Nama dari berkas Excel apa pun (termasuk hasil konversi PDF
            yang tata letaknya acak).
          </p>
        </div>

        <button type="button" className="btn btn-secondary" onClick={handleDownloadTemplate} style={{ fontSize: "0.85rem" }}>
          Unduh Template (.xlsx)
        </button>
      </div>

      <div style={{ marginTop: "1rem", maxWidth: 380 }}>
        <label className="form-label" style={{ fontSize: "0.85rem" }}>
          Kelas Tetap Default (Opsional, jika berkas Excel tidak memuat kolom kelas):
        </label>
        <input
          type="text"
          className="form-control"
          placeholder="Contoh: SPKS G (opsional)"
          value={defaultKelas}
          onChange={(e) => setDefaultKelas(e.target.value)}
        />
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
          id="studentInput"
          accept=".xlsx, .xls"
          onChange={handleFileUpload}
          style={{ display: "none" }}
          disabled={loading}
        />
        <label
          htmlFor="studentInput"
          className="btn btn-primary"
          style={{ cursor: loading ? "not-allowed" : "pointer", display: "inline-block" }}
        >
          {loading ? "Memproses Data Mahasiswa..." : "Pilih Berkas Excel Mahasiswa"}
        </label>
        <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem" }}>
          Format yang didukung: Excel biasa maupun Excel hasil convert dari PDF absensi/DHS.
        </p>
      </div>
    </div>
  );
}
