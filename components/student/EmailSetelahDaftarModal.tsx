// components/student/EmailSetelahDaftarModal.tsx
// Modal pop up pengisian email setelah pendaftaran mata kuliah resmi berhasil tersimpan di database
"use client";

import { useState } from "react";

interface EmailSetelahDaftarModalProps {
  isOpen: boolean;
  nim: string;
  nama?: string;
  onKirimEmail: (email: string) => Promise<void>;
  isSending: boolean;
}

export function EmailSetelahDaftarModal({
  isOpen,
  nim,
  nama,
  onKirimEmail,
  isSending,
}: EmailSetelahDaftarModalProps) {
  const [email, setEmail] = useState<string>(() => {
    return nim ? `${nim.trim()}@mhs.instiperjogja.ac.id` : "";
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setErrorMsg("Alamat email wajib diisi jika ingin menerima bukti pendaftaran.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setErrorMsg("Format email tidak valid (contoh: nama@gmail.com).");
      return;
    }

    setErrorMsg(null);
    await onKirimEmail(cleanEmail);
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 100060,
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
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.3)",
          borderRadius: "var(--radius-xl)",
          padding: "1.75rem 1.75rem 1.5rem",
          border: "2px solid #22c55e",
          textAlign: "left",
        }}
      >
        {/* Header Status Sukses */}
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: "0.725rem",
              fontWeight: 800,
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "#f0fdf4",
              color: "#166534",
              border: "1px solid #bbf7d0",
              letterSpacing: "0.04em",
            }}
          >
            ✓ DATA SUDAH MASUK &amp; RESMI TERSIMPAN
          </span>
        </div>

        <h3
          style={{
            fontSize: "1.25rem",
            fontWeight: 800,
            color: "#0f172a",
            margin: "0 0 0.4rem 0",
            lineHeight: 1.3,
          }}
        >
          Kirim Arsip Bukti ke Email Anda
        </h3>

        <p style={{ fontSize: "0.85rem", color: "#475569", margin: "0 0 1.25rem 0", lineHeight: 1.5 }}>
          Selamat <strong>{nama || nim}</strong>, pilihan mata kuliah Anda telah aman tersimpan di sistem. Masukkan email aktif Anda untuk menerima salinan bukti pendaftaran elektronik.
        </p>

        {/* Form Input Email */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
            <label
              htmlFor="student-email-after-submit"
              style={{
                display: "block",
                fontWeight: 700,
                fontSize: "0.875rem",
                color: "#1e293b",
                marginBottom: "0.35rem",
              }}
            >
              ✉️ Alamat Email Anda
            </label>
            <input
              id="student-email-after-submit"
              type="email"
              className="input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (errorMsg) setErrorMsg(null);
              }}
              placeholder="contoh: nama@gmail.com"
              disabled={isSending}
              autoFocus
              required
              style={{
                width: "100%",
                fontSize: "0.95rem",
                padding: "0.7rem 0.85rem",
                borderColor: errorMsg ? "var(--danger)" : undefined,
              }}
            />
            {errorMsg && (
              <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.35rem", fontWeight: 600 }}>
                ⚠ {errorMsg}
              </div>
            )}
          </div>

          {/* Kotak Pengingat Penting SPAM / PROMO */}
          <div
            style={{
              backgroundColor: "#fefce8",
              border: "1px solid #fef08a",
              borderRadius: "var(--radius-md)",
              padding: "0.65rem 0.85rem",
              fontSize: "0.775rem",
              color: "#854d0e",
              lineHeight: 1.45,
              marginBottom: "1.25rem",
            }}
          >
            ⚠️ <strong>Perhatian:</strong> Wajib periksa folder <strong>SPAM</strong> atau <strong>PROMOSI</strong> pada aplikasi email Anda jika bukti pendaftaran tidak muncul di Kotak Masuk (Inbox).
          </div>

          {/* Tombol Aksi Wajib Kirim */}
          <div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSending || !email.trim()}
              style={{
                width: "100%",
                padding: "0.85rem 1rem",
                fontWeight: 800,
                fontSize: "0.95rem",
                backgroundColor: "#059669",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.25)",
                justifyContent: "center",
                minHeight: 48,
              }}
            >
              {isSending ? "Mengirim ke Email..." : "✉️ Kirim Bukti ke Email & Buka Hasil"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
