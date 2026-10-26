"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";

interface LaporKendalaModalProps {
  nim: string;
  nama?: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function LaporKendalaModal({
  nim,
  nama = "",
  isOpen,
  onClose,
  onSuccess,
  onError,
}: LaporKendalaModalProps) {
  const [studentNama, setStudentNama] = useState(nama);
  const [kategori, setKategori] = useState("salah_pilih");
  const [alasan, setAlasan] = useState("");
  const [kontak, setKontak] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNim = nim.trim();
    const cleanNama = studentNama.trim() || nama.trim();
    const cleanAlasan = alasan.trim();
    const cleanKontak = kontak.trim();

    if (!cleanNim) {
      onError("NIM mahasiswa wajib terisi.");
      return;
    }
    if (!cleanAlasan) {
      onError("Alasan kendala atau perbaikan wajib diisi.");
      return;
    }
    if (!cleanKontak) {
      onError("Nomor WhatsApp atau telepon aktif wajib diisi.");
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("lapor_kendala_mahasiswa", {
        p_nim: cleanNim,
        p_nama: cleanNama,
        p_kategori: kategori,
        p_alasan: cleanAlasan,
        p_kontak: cleanKontak,
      });

      if (error) {
        throw new Error(error.message);
      }

      const res = data as { ok?: boolean; error?: string; message?: string } | null;
      if (res && res.ok === false) {
        throw new Error(res.error || "Gagal mengirimkan laporan kendala.");
      }

      onSuccess(
        res?.message ||
          "Laporan kendala berhasil dikirimkan ke Admin. Tim akademik akan memverifikasi dan mengabari Anda via WhatsApp."
      );
      setAlasan("");
      setKontak("");
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat mengirim laporan.";
      onError(msg);
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
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 500,
          backgroundColor: "#ffffff",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          borderRadius: "var(--radius-xl)",
          padding: "2rem",
          border: "1px solid var(--border-color)",
          maxHeight: "90vh",
          overflowY: "auto",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--warning-light)",
              color: "var(--warning)",
              border: "1px solid var(--warning-border)",
              letterSpacing: "0.06em",
            }}
          >
            LAPOR KENDALA KRS
          </span>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
            Pengaduan / Reset Pilihan
          </h3>
        </div>

        <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
          Jika Anda mengalami kesalahan pemilihan, salah kelas, atau kendala teknis, silakan laporkan ke Admin Akademik untuk diverifikasi dan direset.
        </p>

        <form onSubmit={handleSubmit}>
          {/* NIM */}
          <div className="form-group">
            <label className="form-label">Nomor Induk Mahasiswa (NIM)</label>
            <input
              type="text"
              className="form-control"
              value={nim}
              disabled
              style={{
                backgroundColor: "var(--bg-subtle)",
                color: "var(--text-muted)",
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                cursor: "not-allowed",
              }}
            />
          </div>

          {/* Nama Mahasiswa */}
          <div className="form-group">
            <label className="form-label">Nama Lengkap Mahasiswa</label>
            <input
              type="text"
              className="form-control"
              value={studentNama || nama}
              onChange={(e) => setStudentNama(e.target.value)}
              placeholder="Nama lengkap Anda..."
              disabled={isSubmitting}
            />
          </div>

          {/* Kategori Kendala */}
          <div className="form-group">
            <label className="form-label">Kategori Kendala</label>
            <select
              className="form-control"
              value={kategori}
              onChange={(e) => setKategori(e.target.value)}
              disabled={isSubmitting}
            >
              <option value="salah_pilih">Salah Memilih Mata Kuliah / Proyek</option>
              <option value="tidak_sengaja_submit">Tidak Sengaja Terkirim Sebelum Selesai</option>
              <option value="bentrok_kegiatan">Jadwal Bentrok dengan Kegiatan Penting / Kerja</option>
              <option value="dibajak_orang_lain">Dipilihkan Orang Lain Tanpa Persetujuan</option>
              <option value="lainnya">Kendala Teknis / Lainnya</option>
            </select>
          </div>

          {/* Alasan / Penjelasan Kendala */}
          <div className="form-group">
            <label className="form-label">
              Jelaskan Alasan & Perubahan yang Diinginkan <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <textarea
              className="form-control"
              rows={3}
              placeholder="Contoh: Saya keliru memilih kelas Proyek Mandiri A yang bentrok dengan jadwal praktikum, mohon izin direset agar bisa memilih kelas B..."
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              required
              disabled={isSubmitting}
              style={{ resize: "vertical" }}
            />
          </div>

          {/* Nomor WhatsApp / HP yang bisa dihubungi */}
          <div className="form-group">
            <label className="form-label">
              Nomor WhatsApp / HP Aktif <span style={{ color: "var(--danger)" }}>*</span>
            </label>
            <input
              type="tel"
              inputMode="numeric"
              pattern="[0-9]*"
              className="form-control"
              placeholder="Contoh: 081234567890"
              value={kontak}
              onChange={(e) => setKontak(e.target.value.replace(/\D/g, ""))}
              required
              disabled={isSubmitting}
            />
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.3rem", display: "block" }}>
              Admin akan menghubungi nomor ini untuk konfirmasi sebelum mereset pendaftaran Anda.
            </span>
          </div>

          {/* Tombol Aksi */}
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.5rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onClose}
              disabled={isSubmitting}
              style={{ padding: "0.65rem 1.25rem" }}
            >
              Batal
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={isSubmitting}
              style={{ padding: "0.65rem 1.4rem" }}
            >
              {isSubmitting ? "Mengirim Laporan..." : "Kirim Laporan ke Admin"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
