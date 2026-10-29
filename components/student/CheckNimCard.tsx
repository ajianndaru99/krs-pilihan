"use client";

import { useState } from "react";
import Image from "next/image";
import { StudentInfo } from "@/lib/types";
import { ScheduleOverviewModal } from "./ScheduleOverviewModal";

export interface AdminNotice {
  type: "pending" | "rejected" | "info";
  title: string;
  message: string;
  instruction?: string;
}

interface CheckNimCardProps {
  nim: string;
  setNim: (val: string) => void;
  studentInfo: StudentInfo | null;
  loading: boolean;
  adminNotice?: AdminNotice | null;
  onClearNotice?: () => void;
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
  adminNotice,
  onClearNotice,
  onCheckNim,
  onJoinQueue,
  onResetVerification,
  onOpenAjukanModal,
}: CheckNimCardProps) {
  const [showScheduleModal, setShowScheduleModal] = useState(false);

  return (
    <div style={{ maxWidth: 460, margin: "2rem auto" }}>
      {/* Header Branding — Clean & Professional */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          textAlign: "center",
          marginBottom: "1.25rem",
          width: "100%",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            width: "100%",
            marginBottom: "0.85rem",
          }}
        >
          <Image
            src="/logo-instiper.png"
            alt="Logo INSTIPER"
            width={56}
            height={52}
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
            fontSize: "1.45rem",
            fontWeight: 800,
            color: "var(--primary)",
            letterSpacing: "-0.025em",
            textTransform: "uppercase",
            margin: "0 0 0.25rem",
            textAlign: "center",
            width: "100%",
          }}
        >
          Portal Mata Kuliah Pilihan
        </h1>
        <p
          style={{
            fontSize: "0.8rem",
            fontWeight: 700,
            color: "var(--text-muted)",
            letterSpacing: "0.06em",
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
          padding: "clamp(1.5rem, 5vw, 2.25rem) clamp(1.15rem, 4vw, 2rem)",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--border-subtle)",
        }}
      >
        {!studentInfo ? (
          <form onSubmit={onCheckNim}>
            {/* Banner Alert Pesan Admin (Muncul jika ada status pending / penolakan dengan catatan admin) */}
            {adminNotice && (
              <div
                style={{
                  padding: "0.95rem 1.15rem",
                  borderRadius: "var(--radius-lg)",
                  marginBottom: "1.25rem",
                  backgroundColor:
                    adminNotice.type === "rejected"
                      ? "#fef2f2"
                      : adminNotice.type === "pending"
                      ? "#fffbeb"
                      : "#eff6ff",
                  border:
                    adminNotice.type === "rejected"
                      ? "1.5px solid #f87171"
                      : adminNotice.type === "pending"
                      ? "1.5px solid #fcd34d"
                      : "1.5px solid #93c5fd",
                  color:
                    adminNotice.type === "rejected"
                      ? "#991b1b"
                      : adminNotice.type === "pending"
                      ? "#92400e"
                      : "#1e40af",
                  boxShadow: "0 2px 6px -1px rgba(0, 0, 0, 0.05)",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", fontWeight: 800, fontSize: "0.9rem" }}>
                    <span>{adminNotice.type === "rejected" ? "⛔" : adminNotice.type === "pending" ? "⏳" : "💬"}</span>
                    <span>{adminNotice.title}</span>
                  </div>
                  {onClearNotice && (
                    <button
                      type="button"
                      onClick={onClearNotice}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "inherit",
                        opacity: 0.6,
                        fontSize: "0.9rem",
                        padding: 0,
                        lineHeight: 1,
                      }}
                      title="Tutup pesan"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div style={{ fontSize: "0.85rem", marginTop: "0.45rem", lineHeight: 1.45, fontWeight: 500 }}>
                  {adminNotice.message}
                </div>

                {adminNotice.instruction && (
                  <div
                    style={{
                      fontSize: "0.8rem",
                      marginTop: "0.55rem",
                      paddingTop: "0.45rem",
                      borderTop: "1px dashed currentColor",
                      opacity: 0.95,
                      fontWeight: 700,
                    }}
                  >
                    {adminNotice.instruction}
                  </div>
                )}
              </div>
            )}

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
                Petunjuk Pemilihan Mata Kuliah Pilihan
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
              style={{ padding: "0.9rem", fontSize: "0.95rem", minHeight: 48 }}
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
                <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Kelas:</span>
                <strong style={{ fontSize: "0.95rem" }}>{studentInfo.kelas || "-"}</strong>
              </div>
            </div>

            {/* Peringatan Waktu & Jadwal Merah Jelas */}
            <div
              style={{
                backgroundColor: "#fef2f2",
                border: "1.5px solid #ef4444",
                borderRadius: "var(--radius-lg)",
                padding: "0.85rem 1rem",
                marginBottom: "1rem",
                fontSize: "0.825rem",
                color: "#991b1b",
                lineHeight: 1.5,
              }}
            >
              <div style={{ fontWeight: 800, marginBottom: "0.25rem", display: "flex", alignItems: "center", gap: "0.35rem", color: "#dc2626" }}>
                <span>⚠️</span>
                <span>PERHATIAN!</span>
              </div>
              <div>
                Dimohon tidak lama dalam memilih, jika sudah ada antrian sistem akan ada maksimal waktu 5 MENIT!, silakan cek{" "}
                <button
                  type="button"
                  onClick={() => setShowScheduleModal(true)}
                  style={{
                    background: "none",
                    border: "none",
                    padding: 0,
                    margin: 0,
                    color: "#dc2626",
                    fontWeight: 800,
                    textDecoration: "underline",
                    cursor: "pointer",
                    display: "inline",
                    fontSize: "inherit",
                  }}
                >
                  Jadwal & Kuota
                </button>{" "}
                terlebih dahulu!
              </div>
            </div>

            {/* Status & Balasan Kendala dari Admin (Reset KRS / Ditolak / Menunggu) */}
            {studentInfo.status_kendala === "resolved" && studentInfo.pesan_admin && (
              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: "#ecfdf5",
                  border: "1.5px solid #6ee7b7",
                  color: "#065f46",
                  fontSize: "0.825rem",
                  marginBottom: "1.25rem",
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "0.3rem", display: "flex", alignItems: "center", gap: "6px", color: "#047857" }}>
                  <span>✅</span>
                  <span>Pendaftaran KRS Telah Direset Admin</span>
                </div>
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #a7f3d0",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.5rem 0.7rem",
                    fontWeight: 600,
                    color: "#064e3b",
                    marginBottom: "0.3rem",
                  }}
                >
                  💬 Balasan Admin: &ldquo;{studentInfo.pesan_admin}&rdquo;
                </div>
                <div style={{ fontSize: "0.75rem", color: "#047857" }}>
                  Silakan tekan tombol <strong>Masuk Antrian</strong> di bawah untuk memilih ulang mata kuliah.
                </div>
              </div>
            )}

            {studentInfo.status_kendala === "rejected" && studentInfo.pesan_admin && (
              <div
                style={{
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: "#fef2f2",
                  border: "1.5px solid #f87171",
                  color: "#991b1b",
                  fontSize: "0.825rem",
                  marginBottom: "1.25rem",
                  lineHeight: 1.45,
                }}
              >
                <div style={{ fontWeight: 800, marginBottom: "0.3rem", display: "flex", alignItems: "center", gap: "6px", color: "#b91c1c" }}>
                  <span>⛔</span>
                  <span>Laporan Kendala Ditolak Admin</span>
                </div>
                <div
                  style={{
                    backgroundColor: "#ffffff",
                    border: "1px solid #fecaca",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.5rem 0.7rem",
                    fontWeight: 600,
                    color: "#7f1d1d",
                  }}
                >
                  💬 Balasan Admin: &ldquo;{studentInfo.pesan_admin}&rdquo;
                </div>
              </div>
            )}

            {studentInfo.status_kendala === "pending" && (
              <div
                style={{
                  padding: "0.75rem 1rem",
                  borderRadius: "var(--radius-lg)",
                  backgroundColor: "#fffbeb",
                  border: "1.5px dashed #f59e0b",
                  color: "#92400e",
                  fontSize: "0.825rem",
                  textAlign: "center",
                  fontWeight: 700,
                  marginBottom: "1.25rem",
                  lineHeight: 1.4,
                }}
              >
                <span>⏳ Laporan Kendala Anda Sedang Ditinjau Admin</span>
                <div style={{ fontSize: "0.75rem", fontWeight: 500, marginTop: "2px", opacity: 0.9 }}>
                  Mohon menunggu tanggapan admin sebelum mengirim laporan baru.
                </div>
              </div>
            )}

            <ScheduleOverviewModal
              isOpen={showScheduleModal}
              onClose={() => setShowScheduleModal(false)}
            />

            <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.25rem", flexWrap: "wrap" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onResetVerification}
                disabled={loading}
                style={{ padding: "0.85rem 1.15rem", minHeight: 48 }}
              >
                Ganti NIM
              </button>
              <button
                type="submit"
                className="btn btn-primary"
                style={{ flex: 1, padding: "0.85rem", fontSize: "0.95rem", minHeight: 48 }}
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
