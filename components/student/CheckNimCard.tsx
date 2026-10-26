"use client";

import Image from "next/image";
import { StudentInfo } from "@/lib/types";

interface CheckNimCardProps {
  nim: string;
  setNim: (val: string) => void;
  studentInfo: StudentInfo | null;
  loading: boolean;
  onCheckNim: (e: React.FormEvent) => void;
  onJoinQueue: (e: React.FormEvent) => void;
  onResetVerification: () => void;
  onOpenAjukanModal: () => void;
}

export function CheckNimCard({
  nim,
  setNim,
  studentInfo,
  loading,
  onCheckNim,
  onJoinQueue,
  onResetVerification,
  onOpenAjukanModal,
}: CheckNimCardProps) {
  return (
    <div style={{ maxWidth: 460, margin: "2rem auto" }}>
      {/* Header Branding — Reference Gambar 2 */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          marginBottom: "1.75rem",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            marginBottom: "1.25rem",
          }}
        >
          <Image
            src="/logo-instiper.png"
            alt="Logo INSTIPER"
            width={150}
            height={135}
            priority
            style={{
              objectFit: "contain",
              display: "block",
              margin: "0 auto",
            }}
          />
        </div>
        <h1
          style={{
            fontSize: "2rem",
            fontWeight: 800,
            color: "var(--primary)",
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
            margin: "0 0 0.35rem",
            textAlign: "center",
            width: "100%",
          }}
        >
          Portal KRS Pilihan
        </h1>
        <p
          style={{
            fontSize: "0.875rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            margin: 0,
            textAlign: "center",
            width: "100%",
          }}
        >
          Faperta INSTIPER Yogyakarta
        </p>
      </div>

      {/* Main Card — Soft Rounded 24px */}
      <div
        className="card"
        style={{
          padding: "2.25rem 2rem",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {!studentInfo ? (
          <form onSubmit={onCheckNim}>
            <div className="form-group">
              <label
                className="form-label"
                style={{
                  fontSize: "0.85rem",
                  fontWeight: 700,
                  color: "#334155",
                  marginBottom: "0.5rem",
                }}
              >
                NIM
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="form-control"
                  placeholder="Masukkan NIM kamu (contoh: 2110211001)"
                  value={nim}
                  onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))}
                  disabled={loading}
                  autoFocus
                  required
                  style={{ paddingLeft: "2.6rem" }}
                />
                <span
                  style={{
                    position: "absolute",
                    left: "0.95rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "#94a3b8",
                    display: "flex",
                  }}
                >
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M22 10v6M2 10l10-5 10 5-10 5z" />
                    <path d="M6 12v5c3 3 9 3 12 0v-5" />
                  </svg>
                </span>
              </div>
            </div>

            {/* Soft Notice Box — Identik Gambar 2 */}
            <div className="notice-box-soft">
              <div style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                Petunjuk Pemilihan KRS
              </div>
              <div>
                Pastikan menggunakan koneksi internet yang stabil. Sesi pemilihan Anda
                dilindungi sistem antrian otomatis untuk keadilan alokasi kuota.
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading || !nim.trim()}
              style={{ padding: "0.9rem", fontSize: "0.95rem" }}
            >
              {loading ? (
                <>
                  <span className="spinner" style={{ width: 16, height: 16 }} />
                  <span>Memeriksa Identitas...</span>
                </>
              ) : (
                <span>Periksa NIM</span>
              )}
            </button>

            <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
              <button
                type="button"
                onClick={onOpenAjukanModal}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--primary)",
                  fontSize: "0.85rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  textDecoration: "underline",
                }}
              >
                NIM tidak terdaftar? Ajukan akses di sini
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={onJoinQueue}>
            <div
              style={{
                backgroundColor: "var(--primary-light)",
                border: "1px solid var(--primary-border)",
                borderRadius: "var(--radius-lg)",
                padding: "1.25rem",
                marginBottom: "1.5rem",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                  color: "var(--primary)",
                  marginBottom: "0.75rem",
                }}
              >
                Data Mahasiswa Terverifikasi
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.45rem" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>NIM:</span>
                <strong style={{ fontSize: "0.95rem" }}>{nim}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.45rem" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Nama:</span>
                <strong style={{ fontSize: "0.95rem", textAlign: "right" }}>
                  {studentInfo.nama || studentInfo.nama_samar || "-"}
                </strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Kelas Tetap:</span>
                <strong style={{ fontSize: "0.95rem" }}>{studentInfo.kelas || "-"}</strong>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onResetVerification}
                disabled={loading}
                style={{ padding: "0.85rem 1.15rem" }}
              >
                Ganti NIM
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1, padding: "0.85rem", fontSize: "0.95rem" }}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <span className="spinner" style={{ width: 14, height: 14 }} />
                    <span>Menghubungkan ke Antrian...</span>
                  </>
                ) : (
                  <span>Masuk Antrian</span>
                )}
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Footer Text — Identik Gambar 2 */}
      <div
        style={{
          textAlign: "center",
          marginTop: "1.5rem",
          color: "var(--text-muted)",
          fontSize: "0.85rem",
          lineHeight: 1.5,
        }}
      >
        Gunakan perangkat yang stabil serta jika ada kendala hubungi Admin Faperta
      </div>
    </div>
  );
}
