"use client";

import { useState } from "react";
import { MasterStudentItem } from "@/lib/types";

interface EditStudentModalProps {
  student: MasterStudentItem | null;
  kelasList: string[];
  isOpen: boolean;
  onClose: () => void;
  onSave: (nim: string, nama: string, kelas: string) => Promise<void>;
}

export function EditStudentModal({
  student,
  kelasList,
  isOpen,
  onClose,
  onSave,
}: EditStudentModalProps) {
  if (!isOpen || !student) return null;

  return (
    <EditStudentModalContent
      key={student.nim}
      student={student}
      kelasList={kelasList}
      onClose={onClose}
      onSave={onSave}
    />
  );
}

function EditStudentModalContent({
  student,
  kelasList,
  onClose,
  onSave,
}: {
  student: MasterStudentItem;
  kelasList: string[];
  onClose: () => void;
  onSave: (nim: string, nama: string, kelas: string) => Promise<void>;
}) {
  const initialKelas = (student.kelas || "").trim();
  const isPredefined = kelasList.includes(initialKelas);
  const isNone = !initialKelas || initialKelas === "-";

  const [nama, setNama] = useState(student.nama || "");
  const [kelasSelect, setKelasSelect] = useState(() => {
    if (isNone) return "";
    if (isPredefined) return initialKelas;
    return "CUSTOM";
  });
  const [customKelas, setCustomKelas] = useState(() => {
    if (!isNone && !isPredefined) return initialKelas;
    return "";
  });
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNama = nama.trim();
    const cleanKelas =
      kelasSelect === "CUSTOM" ? customKelas.trim() : kelasSelect.trim();

    if (!cleanNama) {
      setErrorMsg("Nama lengkap mahasiswa tidak boleh kosong.");
      return;
    }

    setIsSaving(true);
    setErrorMsg(null);
    try {
      await onSave(student.nim, cleanNama, cleanKelas);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memperbarui data mahasiswa.";
      setErrorMsg(msg);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "1rem",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 480,
          backgroundColor: "#ffffff",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          borderRadius: "var(--radius-xl)",
          padding: "2rem",
          border: "1px solid var(--border-color)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1.25rem" }}>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--primary-light)",
              color: "var(--primary)",
              border: "1px solid var(--primary-border)",
              letterSpacing: "0.06em",
            }}
          >
            EDIT DATA MAHASISWA
          </span>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
            Ubah Data Mahasiswa
          </h3>
        </div>

        {errorMsg && (
          <div
            style={{
              padding: "0.75rem 1rem",
              backgroundColor: "var(--danger-light)",
              color: "var(--danger)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.825rem",
              marginBottom: "1rem",
              border: "1px solid var(--danger-border)",
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          {/* NIM (Read-Only) */}
          <div className="form-group">
            <label className="form-label">Nomor Induk Mahasiswa (NIM)</label>
            <input
              type="text"
              className="form-control"
              value={student.nim}
              disabled
              style={{
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-muted)",
                cursor: "not-allowed",
                fontFamily: "var(--font-mono)",
                fontWeight: 600,
              }}
            />
            <span style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
              NIM adalah identitas kunci dan tidak dapat diubah langsung.
            </span>
          </div>

          {/* Nama Mahasiswa */}
          <div className="form-group">
            <label className="form-label">
              Nama Lengkap Mahasiswa <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="text"
              className="form-control"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              placeholder="Contoh: Ahmad Fauzan Pratama"
              required
              disabled={isSaving}
              autoFocus
            />
          </div>

          {/* Kelas Mahasiswa */}
          <div className="form-group">
            <label className="form-label">Kelas Tetap Mahasiswa</label>
            <select
              className="form-control"
              value={kelasSelect}
              onChange={(e) => setKelasSelect(e.target.value)}
              disabled={isSaving}
            >
              <option value="">-- Tanpa Kelas Khusus / Belum Ditentukan --</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  Kelas {k}
                </option>
              ))}
              <option value="CUSTOM">+ Ketik Kelas Lainnya...</option>
            </select>

            {kelasSelect === "CUSTOM" && (
              <input
                type="text"
                className="form-control"
                placeholder="Ketik kode kelas, misal: SPKS G"
                value={customKelas}
                onChange={(e) => setCustomKelas(e.target.value)}
                disabled={isSaving}
                style={{ marginTop: "0.5rem" }}
              />
            )}
          </div>

          {/* Actions */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.75rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSaving}
              style={{ padding: "0.6rem 1.25rem" }}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSaving}
              style={{ padding: "0.6rem 1.4rem" }}
            >
              {isSaving ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
