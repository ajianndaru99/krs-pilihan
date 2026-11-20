// components/student/EmailSetelahDaftarModal.tsx
// Modal pop up pengisian email setelah pendaftaran mata kuliah resmi berhasil tersimpan di database
"use client";

import { useState, useEffect } from "react";

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
    return nim ? `${nim.trim()}@gmail.com` : "";
  });
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && nim) {
      setEmail((prev) => {
        if (!prev || prev.includes("@mhs.instiperjogja.ac.id")) {
          return `${nim.trim()}@gmail.com`;
        }
        return prev;
      });
    }
  }, [isOpen, nim]);

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
        <div style={{ textAlign: "center", marginBottom: "1.15rem" }}>
          <h3
            style={{
              fontSize: "1.25rem",
              fontWeight: 900,
              color: "#166534",
              margin: "0 0 0.35rem 0",
              lineHeight: 1.3,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "0.45rem",
            }}
          >
            <svg
              viewBox="0 0 24 24"
              width={26}
              height={26}
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              style={{ flexShrink: 0 }}
              aria-hidden="true"
            >
              <path
                d="M12 2L4 5.5V11.5C4 16.5 7.4 21.1 12 22.5C16.6 21.1 20 16.5 20 11.5V5.5L12 2Z"
                fill="#15803d"
                stroke="#166534"
                strokeWidth="1.2"
                strokeLinejoin="round"
              />
              <path
                d="M12 3.8L5.8 6.5V11.5C5.8 15.5 8.4 19.3 12 20.6C15.6 19.3 18.2 15.5 18.2 11.5V6.5L12 3.8Z"
                fill="#16a34a"
              />
              <path
                d="M9.2 11.8L11 13.6L15 9.4"
                stroke="#ffffff"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span>DATA SUDAH TERSIMPAN</span>
          </h3>
          <p
            style={{
              fontSize: "0.925rem",
              fontWeight: 700,
              color: "#334155",
              margin: 0,
            }}
          >
            Wajib isi Gmail untuk Arsip data
          </p>
        </div>

        {/* Form Input Email */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1rem" }}>
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
              aria-label="Alamat Gmail Anda"
              style={{
                width: "100%",
                fontSize: "1rem",
                fontWeight: 600,
                padding: "0.75rem 0.85rem",
                textAlign: "center",
                borderColor: errorMsg ? "var(--danger)" : "#22c55e",
                borderRadius: "var(--radius-md)",
              }}
            />
            {errorMsg && (
              <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.35rem", fontWeight: 600, textAlign: "center" }}>
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
              {isSending ? "Mengirim ke Email..." : "Kirim Bukti ke Email & Buka Hasil"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
