// components/student/KonfirmasiDaftarModal.tsx
// Modal konfirmasi simpan pilihan sekaligus input email aktif mahasiswa
"use client";

import { useState } from "react";
import { Offering } from "@/lib/types";

interface KonfirmasiDaftarModalProps {
  isOpen: boolean;
  onClose: () => void;
  nim: string;
  nama?: string;
  selectedOfferings: Offering[];
  onConfirm: (email: string) => Promise<void>;
  isSubmitting: boolean;
}

// Helper: memotong detik pada format jam
function formatJam(jam: string): string {
  if (!jam) return "";
  const parts = jam.split(":");
  return parts.length >= 2 ? `${parts[0]}:${parts[1]}` : jam;
}

// Helper: membersihkan nama matkul
function formatOfferingName(nama: string, kelas?: string): string {
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

export function KonfirmasiDaftarModal({
  isOpen,
  onClose,
  nim,
  nama,
  selectedOfferings,
  onConfirm,
  isSubmitting,
}: KonfirmasiDaftarModalProps) {
  // Default email: bisa email kampus atau kosong untuk diketik mahasiswa
  const [email, setEmail] = useState<string>(() => {
    return nim ? `${nim.trim()}@mhs.instiperjogja.ac.id` : "";
  });
  const [emailError, setEmailError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim();

    if (!cleanEmail) {
      setEmailError("Alamat email wajib diisi untuk menerima bukti pendaftaran.");
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(cleanEmail)) {
      setEmailError("Format alamat email tidak valid (contoh: nama@gmail.com).");
      return;
    }

    setEmailError(null);
    await onConfirm(cleanEmail);
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
        zIndex: 100050,
        padding: "1rem",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "min(90vh, 680px)",
          overflowY: "auto",
          margin: "auto 0",
          backgroundColor: "#ffffff",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          borderRadius: "var(--radius-xl)",
          padding: "1.5rem 1.75rem",
          border: "1.5px solid var(--primary)",
        }}
      >
        {/* Header Modal */}
        <div style={{ marginBottom: "1rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: "0.68rem",
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--primary-light)",
              color: "var(--primary)",
              border: "1px solid var(--primary)",
              letterSpacing: "0.06em",
              lineHeight: 1.2,
              marginBottom: "0.4rem",
            }}
          >
            KONFIRMASI AKHIR
          </span>
          <h3
            style={{
              fontSize: "1.2rem",
              fontWeight: 800,
              color: "var(--text-main)",
              margin: "0 0 0.35rem 0",
              lineHeight: 1.3,
            }}
          >
            Simpan Pilihan &amp; Kirim Bukti
          </h3>
          <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: 0, lineHeight: 1.45 }}>
            Mahasiswa <strong>{nama || nim}</strong> ({nim}), pastikan mata kuliah pilihan Anda sudah sesuai. Pilihan tidak dapat diubah setelah disimpan.
          </p>
        </div>

        {/* Ringkasan Pilihan Mata Kuliah */}
        <div
          style={{
            backgroundColor: "#f8fafc",
            border: "1px solid #e2e8f0",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem",
            marginBottom: "1.15rem",
            maxHeight: 200,
            overflowY: "auto",
          }}
        >
          <div style={{ fontSize: "0.75rem", fontWeight: 700, color: "#475569", marginBottom: "0.4rem" }}>
            Daftar Mata Kuliah Terpilih ({selectedOfferings.length}):
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
            {selectedOfferings.map((item, idx) => (
              <div
                key={item.id}
                style={{
                  backgroundColor: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: "6px",
                  padding: "0.45rem 0.65rem",
                  fontSize: "0.8rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <strong style={{ color: "#0f172a" }}>
                    {idx + 1}. {formatOfferingName(item.nama, item.kelas)}
                  </strong>
                  <span
                    style={{
                      fontSize: "0.7rem",
                      fontWeight: 700,
                      backgroundColor: "#f0fdf4",
                      color: "#166534",
                      border: "1px solid #bbf7d0",
                      padding: "1px 6px",
                      borderRadius: "4px",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Kelas {item.kelas || (item.jenis === "proyek" ? "Semua" : "A")}
                  </span>
                </div>
                <div style={{ fontSize: "0.725rem", color: "#64748b", marginTop: "2px" }}>
                  {item.jadwal && item.jadwal.length > 0
                    ? item.jadwal
                        .map((j) => `${j.hari}, ${formatJam(j.jam_mulai)}–${formatJam(j.jam_selesai)}${j.ruang ? ` (${j.ruang})` : ""}`)
                        .join("; ")
                    : "Jadwal belum ditentukan"}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Form Input Email Wajib */}
        <form onSubmit={handleSubmit}>
          <div style={{ marginBottom: "1.25rem" }}>
            <label
              htmlFor="student-email-input"
              style={{
                display: "block",
                fontWeight: 700,
                fontSize: "0.875rem",
                color: "#0f172a",
                marginBottom: "0.3rem",
              }}
            >
              ✉️ Alamat Email Aktif <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <p style={{ fontSize: "0.775rem", color: "#64748b", margin: "0 0 0.5rem 0", lineHeight: 1.4 }}>
              Salinan Tanda Bukti Registrasi resmi dan jadwal perkuliahan akan otomatis dikirimkan ke email ini. Anda dapat menggunakan email Gmail pribadi atau email kampus.
            </p>
            <input
              id="student-email-input"
              type="email"
              className="input"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (emailError) setEmailError(null);
              }}
              placeholder="contoh: nama@gmail.com"
              disabled={isSubmitting}
              required
              style={{
                width: "100%",
                fontSize: "0.95rem",
                padding: "0.65rem 0.85rem",
                borderColor: emailError ? "var(--danger)" : undefined,
              }}
            />
            {emailError && (
              <div style={{ color: "var(--danger)", fontSize: "0.75rem", marginTop: "0.35rem", fontWeight: 600 }}>
                ⚠ {emailError}
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: "0.65rem 1.25rem",
                fontWeight: 600,
                fontSize: "0.875rem",
              }}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting || !email.trim()}
              style={{
                padding: "0.65rem 1.5rem",
                fontWeight: 800,
                fontSize: "0.875rem",
                backgroundColor: "#059669",
                boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
              }}
            >
              {isSubmitting ? "Menyimpan & Mengirim..." : "✓ Simpan & Kirim Bukti"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
