"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

interface EditEmailModalProps {
  isOpen: boolean;
  onClose: () => void;
  nim: string;
  nama: string;
  kelas?: string;
  currentEmail?: string;
  onSuccess: (newEmail: string, emailTerkirim: boolean) => void;
}

export function EditEmailModal({
  isOpen,
  onClose,
  nim,
  nama,
  kelas,
  currentEmail,
  onSuccess,
}: EditEmailModalProps) {
  const [email, setEmail] = useState("");
  const [resetStatus, setResetStatus] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const initial = currentEmail && currentEmail !== "-" ? currentEmail : "";
      setEmail(initial);
      setResetStatus(true);
      setErrorMessage(null);
    }
  }, [isOpen, currentEmail]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const cleanEmail = email.trim();

    // Validasi format jika diisi
    if (cleanEmail !== "") {
      const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
      if (!emailRegex.test(cleanEmail)) {
        setErrorMessage("Format email tidak valid. Pastikan penulisan lengkap (contoh: mahasiswa@gmail.com).");
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("admin_update_email_mahasiswa", {
        p_nim: nim,
        p_email: cleanEmail,
        p_reset_status: resetStatus,
      });

      if (error) {
        throw new Error(error.message || "Gagal memperbarui email mahasiswa.");
      }

      interface UpdateEmailResponse {
        ok?: boolean;
        error?: string;
        email?: string;
        email_terkirim?: boolean;
      }

      const res = (data as UpdateEmailResponse) || {};
      if (res.ok === false) {
        throw new Error(res.error || "Gagal memperbarui email mahasiswa.");
      }

      const updatedEmail = res.email || cleanEmail || "-";
      const updatedTerkirim = res.email_terkirim ?? (resetStatus ? false : false);

      onSuccess(updatedEmail, updatedTerkirim);
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat menyimpan data.";
      setErrorMessage(msg);
    } finally {
      setIsSubmitting(false);
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
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: "480px",
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-xl)",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.15), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
          border: "1px solid var(--border-color)",
          padding: "1.75rem",
        }}
      >
        {/* Header Modal */}
        <div style={{ marginBottom: "1.25rem", borderBottom: "1px solid var(--border-color)", paddingBottom: "0.85rem" }}>
          <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: 800, color: "var(--text-color)" }}>
            Edit Email Mahasiswa
          </h3>
          <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Perbaiki alamat email mahasiswa jika terjadi salah ketik atau belum terisi.
          </p>
        </div>

        {/* Info Mahasiswa */}
        <div
          style={{
            padding: "0.85rem 1rem",
            backgroundColor: "#f8fafc",
            borderRadius: "var(--radius-md)",
            border: "1px solid #e2e8f0",
            marginBottom: "1.25rem",
            fontSize: "0.875rem",
          }}
        >
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "0.35rem", marginBottom: "0.25rem" }}>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>NIM</span>
            <span style={{ fontWeight: 800, fontFamily: "monospace", fontSize: "0.925rem" }}>{nim}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "0.35rem", marginBottom: "0.25rem" }}>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Nama</span>
            <span style={{ fontWeight: 700, color: "var(--text-color)" }}>{nama}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: "0.35rem" }}>
            <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>Kelas</span>
            <span style={{ fontWeight: 700, color: "var(--text-muted)" }}>{kelas || "-"}</span>
          </div>
        </div>

        {/* Form Edit Email */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1.15rem" }}>
            <label
              htmlFor="emailInput"
              style={{
                display: "block",
                fontSize: "0.875rem",
                fontWeight: 700,
                color: "var(--text-color)",
                marginBottom: "0.45rem",
              }}
            >
              Alamat Email Mahasiswa
            </label>
            <input
              id="emailInput"
              type="text"
              autoFocus
              className="form-control"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="contoh: nama.mahasiswa@gmail.com"
              style={{
                width: "100%",
                padding: "0.65rem 0.85rem",
                fontSize: "0.925rem",
                borderRadius: "var(--radius-md)",
                border: "1.5px solid var(--border-color)",
              }}
            />
            <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.775rem", color: "var(--text-muted)" }}>
              Kosongkan jika ingin menghapus email mahasiswa ini.
            </p>
          </div>

          {/* Opsi Reset Status Terkirim */}
          <div
            style={{
              padding: "0.75rem 0.85rem",
              backgroundColor: "#fffbeb",
              borderRadius: "var(--radius-md)",
              border: "1px solid #fde68a",
              marginBottom: "1.25rem",
              display: "flex",
              alignItems: "flex-start",
              gap: "0.6rem",
            }}
          >
            <input
              id="resetStatusCheckbox"
              type="checkbox"
              checked={resetStatus}
              onChange={(e) => setResetStatus(e.target.checked)}
              style={{ marginTop: "3px", width: 16, height: 16, cursor: "pointer" }}
            />
            <label
              htmlFor="resetStatusCheckbox"
              style={{ fontSize: "0.825rem", color: "#92400e", fontWeight: 600, cursor: "pointer", lineHeight: 1.35 }}
            >
              Reset status ke &quot;Belum Terkirim&quot; agar bukti KRS siap dikirimkan ke alamat email baru ini.
            </label>
          </div>

          {/* Error Message */}
          {errorMessage && (
            <div
              style={{
                padding: "0.65rem 0.85rem",
                backgroundColor: "#fef2f2",
                borderRadius: "var(--radius-md)",
                border: "1px solid #fecaca",
                color: "#b91c1c",
                fontSize: "0.825rem",
                fontWeight: 600,
                marginBottom: "1.15rem",
              }}
            >
              {errorMessage}
            </div>
          )}

          {/* Tombol Aksi */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.65rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ fontSize: "0.875rem", padding: "0.55rem 1.15rem", fontWeight: 700 }}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{
                fontSize: "0.875rem",
                padding: "0.55rem 1.25rem",
                fontWeight: 700,
              }}
            >
              {isSubmitting ? "Menyimpan..." : "Simpan Perubahan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
