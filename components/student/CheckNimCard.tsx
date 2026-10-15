"use client";

import { StudentInfo } from "@/lib/types";

interface CheckNimCardProps {
  nim: string;
  setNim: (val: string) => void;
  pin: string;
  setPin: (val: string) => void;
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
  pin,
  setPin,
  studentInfo,
  loading,
  onCheckNim,
  onJoinQueue,
  onResetVerification,
  onOpenAjukanModal,
}: CheckNimCardProps) {
  return (
    <div className="card" style={{ maxWidth: 540, margin: "2rem auto" }}>
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <h2 className="card-title" style={{ justifyContent: "center", fontSize: "1.35rem" }}>
          Verifikasi Mahasiswa
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          Masukkan Nomor Induk Mahasiswa (NIM) Anda untuk masuk ke sistem pemilihan KRS.
        </p>
      </div>

      {!studentInfo ? (
        <form onSubmit={onCheckNim}>
          <div className="form-group">
            <label className="form-label">Nomor Induk Mahasiswa (NIM)</label>
            <input
              type="text"
              className="form-control"
              placeholder="Contoh: 2110211001"
              value={nim}
              onChange={(e) => setNim(e.target.value)}
              disabled={loading}
              autoFocus
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading || !nim.trim()}>
            {loading ? "Memeriksa NIM..." : "Verifikasi Identitas →"}
          </button>

          <div style={{ textAlign: "center", marginTop: "1.25rem" }}>
            <button
              type="button"
              onClick={onOpenAjukanModal}
              style={{
                background: "none",
                border: "none",
                color: "var(--primary)",
                fontSize: "0.875rem",
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
              borderRadius: "var(--radius-md)",
              padding: "1rem",
              marginBottom: "1.25rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>NIM:</span>
              <strong style={{ fontSize: "0.95rem" }}>{nim}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Nama:</span>
              <strong style={{ fontSize: "0.95rem" }}>{studentInfo.nama_samar || "-"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Kelas Tetap:</span>
              <strong style={{ fontSize: "0.95rem" }}>{studentInfo.kelas || "-"}</strong>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">PIN Masuk Mahasiswa</label>
            <input
              type="password"
              className="form-control"
              placeholder="Masukkan 4 digit terakhir NIM Anda"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              disabled={loading}
              autoFocus
              required
            />
            <span style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "0.25rem", display: "block" }}>
              * Default PIN adalah 4 digit terakhir NIM Anda (kecuali telah diubah oleh admin).
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onResetVerification}
              disabled={loading}
            >
              ← Ganti NIM
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              style={{ flex: 1 }}
              disabled={loading || !pin.trim()}
            >
              {loading ? "Memproses Antrian..." : "Masuk ke Antrian →"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
