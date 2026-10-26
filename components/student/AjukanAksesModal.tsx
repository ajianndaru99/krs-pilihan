"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface AjukanAksesModalProps {
  isOpen: boolean;
  onClose: () => void;
  kelasList: string[];
  initialNim?: string;
  onSuccess: (msg: string) => void;
  onError: (err: string) => void;
}

export function AjukanAksesModal({
  isOpen,
  onClose,
  kelasList,
  initialNim = "",
  onSuccess,
  onError,
}: AjukanAksesModalProps) {
  const [nim, setNim] = useState(initialNim);
  const [nama, setNama] = useState("");
  const [kelas, setKelas] = useState("");
  const [alasan, setAlasan] = useState("");
  const [kontak, setKontak] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nim.trim() || !nama.trim() || !alasan.trim()) {
      onError("Mohon lengkapi NIM, Nama Lengkap, dan Alasan pengajuan.");
      return;
    }

    setSubmitting(true);
    try {
      const fullCatatan = kontak.trim()
        ? `${alasan.trim()} (Kontak: ${kontak.trim()})`
        : alasan.trim();

      // Coba panggil versi 4 parameter terlebih dahulu (sesuai schema yang aktif di database Supabase)
      let { data, error } = await supabase.rpc("ajukan_akses", {
        p_nim: nim.trim(),
        p_nama: nama.trim(),
        p_kelas: kelas.trim(),
        p_catatan: fullCatatan,
      });

      // Jika error not found / signature mismatch, coba fallback ke versi 5 parameter
      if (error && (error.code === "PGRST202" || error.message.includes("function"))) {
        const fallbackRes = await supabase.rpc("ajukan_akses", {
          p_nim: nim.trim(),
          p_nama: nama.trim(),
          p_kelas: kelas.trim(),
          p_alasan: alasan.trim(),
          p_kontak: kontak.trim(),
        });
        data = fallbackRes.data;
        error = fallbackRes.error;
      }

      if (error) {
        onError(error.message || "Gagal mengirim pengajuan akses.");
        return;
      }

      const res = data as { ok?: boolean; error?: string; message?: string } | null;
      if (res?.ok) {
        onSuccess(res.message || "Pengajuan akses berhasil dikirim! Admin akan segera memverifikasi.");
        onClose();
      } else {
        onError(res?.error || "Pengajuan tidak dapat diproses.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan koneksi.";
      onError(msg);
    } finally {
      setSubmitting(false);
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
        zIndex: 9999,
        padding: "1rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 500,
          maxHeight: "min(84vh, 580px)",
          overflowY: "auto",
          margin: "auto 0",
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-lg)",
          padding: "1.25rem 1.5rem",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, margin: 0, color: "var(--text-body)" }}>
            Pengajuan Akses Mahasiswa
          </h3>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.25rem" }}>
          Jika NIM Anda belum terdaftar di sistem KRS, silakan ajukan verifikasi dengan mengisi formulir di bawah ini.
        </p>

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label">Nomor Induk Mahasiswa (NIM)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="form-control"
              placeholder="Contoh: 2110211001"
              value={nim}
              onChange={(e) => setNim(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Nama Lengkap</label>
            <input
              type="text"
              className="form-control"
              placeholder="Sesuai Kartu Tanda Mahasiswa"
              value={nama}
              onChange={(e) => setNama(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Kelas Tetap (Opsional)</label>
            <select
              className="form-control"
              value={kelas}
              onChange={(e) => setKelas(e.target.value)}
            >
              <option value="">-- Pilih Kelas Tetap (jika ada) --</option>
              {kelasList.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label className="form-label">Alasan Pengajuan</label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Jelaskan alasan pengajuan (misal: mahasiswa pindahan, mahasiswa susulan, perbaikan data)..."
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              required
            />
          </div>

          <div className="form-group">
            <label className="form-label">Kontak WhatsApp / No. HP (Opsional)</label>
            <input
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              className="form-control"
              placeholder="08xxxxxxxxxx"
              value={kontak}
              onChange={(e) => setKontak(e.target.value.replace(/\D/g, ""))}
            />
          </div>

          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={submitting}>
              Batal
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? "Mengirim..." : "Kirim Pengajuan"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
