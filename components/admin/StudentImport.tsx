"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { extractStudentFromRow, StudentImportRow } from "@/lib/excel-parser";

interface StudentImportProps {
  onImportStudents: (students: StudentImportRow[]) => Promise<{ inserted: number; updated: number }>;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
  kelasList?: string[];
}

export function StudentImport({ onImportStudents, onSuccess, onError, kelasList = [] }: StudentImportProps) {
  // Mode aktif: "manual" (1 Mahasiswa) atau "excel" (Impor Massal)
  const [activeMode, setActiveMode] = useState<"manual" | "excel">("manual");

  // State Form Manual (1 Mahasiswa)
  const [manualNim, setManualNim] = useState("");
  const [manualNama, setManualNama] = useState("");
  const [manualKelasSelect, setManualKelasSelect] = useState("");
  const [manualCustomKelas, setManualCustomKelas] = useState("");
  const [manualPin, setManualPin] = useState("");
  const [manualLoading, setManualLoading] = useState(false);

  // State Form Excel (Massal)
  const [excelLoading, setExcelLoading] = useState(false);
  const [defaultKelas, setDefaultKelas] = useState("");

  // Handler Submit Manual 1 Mahasiswa
  const handleSubmitManual = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNim = manualNim.trim();
    const cleanNama = manualNama.trim();
    const cleanKelas =
      manualKelasSelect === "CUSTOM"
        ? manualCustomKelas.trim()
        : manualKelasSelect.trim();
    const cleanPin = manualPin.trim();

    if (!cleanNim) {
      onError("NIM mahasiswa wajib diisi.");
      return;
    }
    if (!cleanNama) {
      onError("Nama lengkap mahasiswa wajib diisi.");
      return;
    }
    if (cleanNim.length < 5) {
      onError("NIM minimal harus terdiri dari 5 digit/karakter.");
      return;
    }

    setManualLoading(true);
    try {
      const studentData: StudentImportRow = {
        nim: cleanNim,
        nama: cleanNama,
        kelas: cleanKelas || undefined,
        pin: cleanPin || undefined,
      };

      const res = await onImportStudents([studentData]);

      if (res.inserted > 0) {
        onSuccess(
          `Mahasiswa baru "${cleanNama}" (NIM: ${cleanNim}) berhasil ditambahkan dan siap memilih KRS!`
        );
      } else if (res.updated > 0) {
        onSuccess(
          `Data mahasiswa "${cleanNama}" (NIM: ${cleanNim}) berhasil diperbarui!`
        );
      } else {
        onSuccess(`Data mahasiswa "${cleanNama}" berhasil diproses.`);
      }

      // Reset form input manual
      setManualNim("");
      setManualNama("");
      setManualKelasSelect("");
      setManualCustomKelas("");
      setManualPin("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal menyimpan data mahasiswa manual.";
      onError(msg);
    } finally {
      setManualLoading(false);
    }
  };

  // Handler Unduh Template Excel
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

  // Handler Unggah File Excel Massal
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setExcelLoading(true);
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
        onError("Tidak ada data mahasiswa valid (NIM 7-15 digit dan Nama) yang terdeteksi dalam berkas.");
        return;
      }

      const res = await onImportStudents(students);
      onSuccess(
        `Impor Berhasil! ${res.inserted} mahasiswa baru ditambahkan, ${res.updated} data diperbarui dari total ${students.length} baris terdeteksi.`
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memproses berkas mahasiswa.";
      onError(msg);
    } finally {
      setExcelLoading(false);
      e.target.value = "";
    }
  };

  return (
    <div className="card" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
      {/* Header Utama */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem", marginBottom: "1.5rem" }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "var(--radius-md)",
                backgroundColor: "#ecfdf5",
                color: "var(--primary)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <line x1="19" y1="8" x2="19" y2="14" />
                <line x1="22" y1="11" x2="16" y2="11" />
              </svg>
            </span>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "var(--text-title)" }}>
              Kelola & Tambah Mahasiswa
            </h3>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.35rem", marginBottom: 0 }}>
            Input satu mahasiswa secara instan tanpa unggah berkas, atau gunakan impor massal Excel.
          </p>
        </div>

        {/* Segmented Control / Pill Mode */}
        <div
          style={{
            display: "inline-flex",
            backgroundColor: "var(--bg-subtle)",
            padding: "4px",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-color)",
          }}
        >
          <button
            type="button"
            onClick={() => setActiveMode("manual")}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.825rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeMode === "manual" ? "#ffffff" : "transparent",
              color: activeMode === "manual" ? "var(--primary)" : "var(--text-muted)",
              boxShadow: activeMode === "manual" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            Input Manual (1 Orang)
          </button>
          <button
            type="button"
            onClick={() => setActiveMode("excel")}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.825rem",
              fontWeight: 700,
              cursor: "pointer",
              transition: "all 0.15s ease",
              backgroundColor: activeMode === "excel" ? "#ffffff" : "transparent",
              color: activeMode === "excel" ? "var(--primary)" : "var(--text-muted)",
              boxShadow: activeMode === "excel" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
              display: "flex",
              alignItems: "center",
              gap: "6px",
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
              <line x1="16" y1="13" x2="8" y2="13" />
              <line x1="16" y1="17" x2="8" y2="17" />
              <polyline points="10 9 9 9 8 9" />
            </svg>
            Impor Massal (Excel)
          </button>
        </div>
      </div>

      {/* MODE 1: INPUT MANUAL (1 MAHASISWA) */}
      {activeMode === "manual" && (
        <div
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            padding: "1.5rem",
          }}
        >
          <div style={{ marginBottom: "1.25rem" }}>
            <h4 style={{ fontSize: "1rem", fontWeight: 700, margin: 0, color: "var(--text-title)" }}>
              Form Input Manual Mahasiswa
            </h4>
            <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "0.25rem 0 0" }}>
              Data langsung disimpan ke database Supabase. Mahasiswa yang dimasukkan dapat langsung login tanpa perlu reload sistem.
            </p>
          </div>

          <form onSubmit={handleSubmitManual}>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
                gap: "1.25rem",
                marginBottom: "1.25rem",
              }}
            >
              {/* Kolom 1: NIM */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-body)" }}>
                  Nomor Induk Mahasiswa (NIM) <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Contoh: 2110211001"
                  value={manualNim}
                  onChange={(e) => setManualNim(e.target.value)}
                  disabled={manualLoading}
                  required
                  style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                  Harus unik. Jika NIM sudah ada, data nama dan kelas akan diperbarui.
                </span>
              </div>

              {/* Kolom 2: Nama Lengkap */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-body)" }}>
                  Nama Lengkap Mahasiswa <span style={{ color: "var(--danger)" }}>*</span>
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Contoh: Ahmad Fauzan Pratama"
                  value={manualNama}
                  onChange={(e) => setManualNama(e.target.value)}
                  disabled={manualLoading}
                  required
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                  Sesuai data resmi akademik/KTP mahasiswa.
                </span>
              </div>

              {/* Kolom 3: Kelas Mahasiswa */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-body)" }}>
                  Kelas Mahasiswa (Opsional)
                </label>
                <select
                  className="form-control"
                  value={manualKelasSelect}
                  onChange={(e) => setManualKelasSelect(e.target.value)}
                  disabled={manualLoading}
                >
                  <option value="">-- Tanpa Kelas Khusus / Belum Ditentukan --</option>
                  {kelasList.map((k) => (
                    <option key={k} value={k}>
                      Kelas {k}
                    </option>
                  ))}
                  <option value="CUSTOM">+ Ketik Kelas Baru / Lainnya...</option>
                </select>

                {manualKelasSelect === "CUSTOM" && (
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ketik kode kelas, misal: SPKS G"
                    value={manualCustomKelas}
                    onChange={(e) => setManualCustomKelas(e.target.value)}
                    disabled={manualLoading}
                    style={{ marginTop: "0.5rem" }}
                    autoFocus
                  />
                )}
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                  Digunakan untuk validasi bentrok jadwal kuliah tetap kelas.
                </span>
              </div>

              {/* Kolom 4: PIN Khusus (Opsional) */}
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label" style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-body)" }}>
                  PIN Masuk (Opsional)
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Kosongkan untuk default 4 digit terakhir NIM"
                  value={manualPin}
                  onChange={(e) => setManualPin(e.target.value)}
                  disabled={manualLoading}
                  maxLength={10}
                />
                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
                  Jika dikosongkan, PIN otomatis diset ke 4 digit terakhir NIM.
                </span>
              </div>
            </div>

            {/* Tombol Aksi */}
            <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="btn btn-secondary"
                disabled={manualLoading}
                onClick={() => {
                  setManualNim("");
                  setManualNama("");
                  setManualKelasSelect("");
                  setManualCustomKelas("");
                  setManualPin("");
                }}
                style={{ fontSize: "0.85rem" }}
              >
                Kosongkan Form
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                disabled={manualLoading || !manualNim.trim() || !manualNama.trim()}
                style={{ fontSize: "0.85rem", minWidth: 160 }}
              >
                {manualLoading ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    <span>Menyimpan...</span>
                  </>
                ) : (
                  <span>+ Simpan Mahasiswa</span>
                )}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODE 2: IMPOR MASSAL EXCEL */}
      {activeMode === "excel" && (
        <div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
              padding: "1rem 1.25rem",
              backgroundColor: "var(--bg-subtle)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.25rem",
            }}
          >
            <div>
              <div style={{ fontSize: "0.85rem", fontWeight: 700, color: "var(--text-title)" }}>
                Template Format Excel
              </div>
              <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Kolom yang didukung: NIM, Nama, dan Kelas (sistem otomatis mendeteksi format tabel acak).
              </div>
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleDownloadTemplate}
              style={{ fontSize: "0.825rem", padding: "0.45rem 0.85rem" }}
            >
              Unduh Template (.xlsx)
            </button>
          </div>

          <div style={{ marginBottom: "1.25rem", maxWidth: 420 }}>
            <label className="form-label" style={{ fontSize: "0.825rem", fontWeight: 700 }}>
              Kelas Tetap Default (Opsional):
            </label>
            <input
              type="text"
              className="form-control"
              placeholder="Contoh: SPKS G (diisi jika Excel tidak memuat kolom kelas)"
              value={defaultKelas}
              onChange={(e) => setDefaultKelas(e.target.value)}
            />
          </div>

          <div
            style={{
              padding: "2rem 1.5rem",
              border: "2px dashed var(--border-color)",
              borderRadius: "var(--radius-lg)",
              textAlign: "center",
              backgroundColor: "#fbfcfd",
              transition: "border-color 0.15s ease",
            }}
          >
            <input
              type="file"
              id="studentInput"
              accept=".xlsx, .xls"
              onChange={handleFileUpload}
              style={{ display: "none" }}
              disabled={excelLoading}
            />
            <label
              htmlFor="studentInput"
              className="btn btn-primary"
              style={{ cursor: excelLoading ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: "8px" }}
            >
              {excelLoading ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  <span>Memproses Berkas Excel...</span>
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="17 8 12 3 7 8" />
                    <line x1="12" y1="3" x2="12" y2="15" />
                  </svg>
                  <span>Pilih Berkas Excel Mahasiswa</span>
                </>
              )}
            </label>
            <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.75rem", marginBottom: 0 }}>
              Format yang didukung: Excel biasa (.xlsx, .xls) maupun hasil konversi PDF presensi / DHS fakultas.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
