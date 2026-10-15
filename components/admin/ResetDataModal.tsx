"use client";

import { useState } from "react";

interface ResetDataModalProps {
  portalOpen: boolean;
  onBatalDaftar: (nim: string) => Promise<void>;
  onResetDataUji: (confirmCode: string) => Promise<void>;
}

export function ResetDataModal({
  portalOpen,
  onBatalDaftar,
  onResetDataUji,
}: ResetDataModalProps) {
  const [batalNim, setBatalNim] = useState("");
  const [loadingBatal, setLoadingBatal] = useState(false);
  const [loadingReset, setLoadingReset] = useState(false);
  const [confirmInput, setConfirmInput] = useState("");
  const [resetError, setResetError] = useState<string | null>(null);
  const [showConfirmReset, setShowConfirmReset] = useState(false);
  const [showConfirmBatal, setShowConfirmBatal] = useState(false);

  const handleBatalClick = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batalNim.trim()) return;
    setShowConfirmBatal(true);
  };

  const handleExecuteBatal = async () => {
    setShowConfirmBatal(false);
    setLoadingBatal(true);
    try {
      await onBatalDaftar(batalNim.trim());
      setBatalNim("");
    } finally {
      setLoadingBatal(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError(null);
    if (confirmInput.trim() !== "RESET-DATA-UJI-SEKARANG") {
      setResetError("Kode konfirmasi salah. Ketik persis 'RESET-DATA-UJI-SEKARANG'.");
      return;
    }
    setLoadingReset(true);
    try {
      await onResetDataUji(confirmInput.trim());
      setShowConfirmReset(false);
      setConfirmInput("");
    } finally {
      setLoadingReset(false);
    }
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(360px, 1fr))", gap: "1.5rem" }}>
      {/* Kartu 1: Batalkan Pendaftaran NIM Tertentu */}
      <div className="card" style={{ padding: "1.75rem" }}>
        <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-body)" }}>
          🔄 Batalkan Pendaftaran Per NIM
        </h3>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem", marginBottom: "1.25rem" }}>
          Batalkan pendaftaran untuk satu mahasiswa jika ada kesalahan pemilihan. Kursi kuota akan otomatis kembali.
        </p>

        <form onSubmit={handleBatalClick}>
          <div className="form-group">
            <label className="form-label">Masukkan NIM Mahasiswa</label>
            <input
              type="text"
              className="form-control"
              placeholder="Contoh: 2110211001"
              value={batalNim}
              onChange={(e) => setBatalNim(e.target.value)}
              disabled={loadingBatal}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-secondary"
            style={{ width: "100%", color: "var(--danger)", display: "flex", justifyContent: "center", alignItems: "center", gap: "0.5rem" }}
            disabled={loadingBatal || !batalNim.trim()}
          >
            {loadingBatal ? (
              <>
                <span className="spinner spinner-primary" />
                <span>Membatalkan...</span>
              </>
            ) : (
              "Batalkan Pendaftaran Mahasiswa"
            )}
          </button>
        </form>
      </div>

      {/* Kartu 2: Bersihkan Data Uji Coba Sebelum Hari-H */}
      <div
        className="card"
        style={{
          padding: "1.75rem",
          border: "2px solid #fecaca",
          backgroundColor: "#fff5f5",
        }}
      >
        <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--danger)" }}>
          ⚠️ Pembersihan Data Uji Coba (Pra-Hari H)
        </h3>
        <p style={{ color: "#7f1d1d", fontSize: "0.85rem", marginTop: "0.25rem", marginBottom: "1rem" }}>
          Gunakan tombol ini setelah simulasi selesai untuk membersihkan transaksi uji coba:
        </p>

        <ul style={{ fontSize: "0.8rem", color: "#991b1b", paddingLeft: "1.25rem", marginBottom: "1.25rem" }}>
          <li>Menghapus semua pendaftaran & antrian uji coba</li>
          <li>Menghapus semua pengajuan akses uji coba</li>
          <li>Menghapus HANYA mahasiswa dummy (NIM 2110211001 s.d 2110211020 atau DUMMY)</li>
          <li>Mengunci portal ke status TUTUP</li>
        </ul>

        {portalOpen ? (
          <div className="alert alert-warning" style={{ fontSize: "0.8rem" }}>
            <span>Portal sedang DIBUKA. Anda wajib MENUTUP portal terlebih dahulu sebelum reset data uji.</span>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-danger"
            style={{ width: "100%" }}
            onClick={() => {
              setResetError(null);
              setConfirmInput("");
              setShowConfirmReset(true);
            }}
          >
            Bersihkan Seluruh Data Uji Coba →
          </button>
        )}
      </div>

      {/* Modal Konfirmasi Batal NIM */}
      {showConfirmBatal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 440, padding: "1.75rem", backgroundColor: "#fff" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--danger)", marginBottom: "0.5rem" }}>
              ❓ Konfirmasi Pembatalan
            </h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-main)", marginBottom: "1.25rem" }}>
              Apakah Anda yakin ingin membatalkan pendaftaran untuk NIM <strong>{batalNim.trim()}</strong>? Kursi kuota
              akan otomatis dikembalikan ke mata kuliah terkait.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowConfirmBatal(false)}>
                Batal
              </button>
              <button type="button" className="btn btn-danger" onClick={handleExecuteBatal}>
                Ya, Batalkan Pendaftaran
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Dialog Konfirmasi Reset Data Uji */}
      {showConfirmReset && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 480, padding: "2rem", backgroundColor: "#fff" }}>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 700, color: "var(--danger)", marginBottom: "0.5rem" }}>
              ⛔ Konfirmasi Reset Bersih Data Uji
            </h3>
            <p style={{ fontSize: "0.875rem", color: "var(--text-body)", marginBottom: "1rem" }}>
              Tindakan ini tidak dapat dibatalkan. Seluruh pendaftaran simulasi akan dihapus, dan kuota akan kembali
              penuh.
            </p>

            {resetError && (
              <div className="alert alert-danger" style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
                <span>⚠️ {resetError}</span>
              </div>
            )}

            <form onSubmit={handleResetSubmit}>
              <div className="form-group">
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Ketik persis <code>RESET-DATA-UJI-SEKARANG</code> untuk konfirmasi:
                </label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="RESET-DATA-UJI-SEKARANG"
                  value={confirmInput}
                  onChange={(e) => setConfirmInput(e.target.value)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowConfirmReset(false)}
                  disabled={loadingReset}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-danger"
                  disabled={loadingReset || confirmInput.trim() !== "RESET-DATA-UJI-SEKARANG"}
                  style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
                >
                  {loadingReset ? (
                    <>
                      <span className="spinner" />
                      <span>Membersihkan...</span>
                    </>
                  ) : (
                    "Konfirmasi Reset Bersih"
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
