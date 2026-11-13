"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { QrCode } from "@/lib/qr-generator";

interface PilihanItem {
  id: number;
  nama: string;
  jenis: string;
  kelas?: string;
  topik?: string;
  jadwal: {
    hari: string;
    jam_mulai: string;
    jam_selesai: string;
    ruang?: string;
  }[];
}

interface BuktiData {
  mahasiswa: {
    nim: string;
    nama: string;
    kelas?: string;
  };
  pendaftaran: {
    waktu_daftar: string | null;
    pilihan: PilihanItem[];
  };
}

export default function BuktiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BuktiData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  
  // State verifikasi QR Code & scan
  const [isVerifiedScan, setIsVerifiedScan] = useState(false);
  const [qrUrl, setQrUrl] = useState("");

  // State pencarian mandiri (Self-healing jika sesi kosong)
  const [showLookupInput, setShowLookupInput] = useState(false);
  const [searchNim, setSearchNim] = useState("");
  const [searching, setSearching] = useState(false);

  // Fungsi muat data bukti pendaftaran
  const fetchBuktiWithNim = useCallback(async (targetNim: string, targetToken?: string | null) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data: resData, error } = await supabase.rpc("hasil_saya", {
        p_nim: targetNim.trim(),
        p_token: targetToken ? targetToken.trim() : null,
      });

      if (error) {
        setErrorMessage(error.message || "Gagal memuat bukti pendaftaran.");
        setShowLookupInput(true);
        return;
      }

      const res = (resData as (BuktiData & { ok?: boolean; error?: string }) | null) || null;
      if (!res || res.ok === false) {
        setErrorMessage(res?.error || "Data pendaftaran tidak ditemukan untuk NIM tersebut.");
        setShowLookupInput(true);
        return;
      }

      // Simpan NIM untuk ketahanan refresh di halaman bukti, namun bersihkan token antrian
      // agar kembali ke halaman utama selalu masuk ke form input NIM
      if (typeof window !== "undefined") {
        sessionStorage.setItem("nim", targetNim.trim());
        sessionStorage.removeItem("token");
        sessionStorage.removeItem("krs_selected_ids");
        localStorage.setItem("krs_saved_nim", targetNim.trim());
      }

      setData(res);
      setShowLookupInput(false);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
      setErrorMessage(msg);
      setShowLookupInput(true);
    } finally {
      setLoading(false);
      setSearching(false);
    }
  }, []);

  useEffect(() => {
    let urlNim: string | null = null;
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      urlNim = params.get("nim");
    }

    const sessionNim = typeof window !== "undefined" ? sessionStorage.getItem("nim") : null;
    const localNim = typeof window !== "undefined" ? localStorage.getItem("krs_saved_nim") : null;
    const token = typeof window !== "undefined" ? sessionStorage.getItem("token") : null;

    // Prioritas: URL param (mode scan QR ponsel dosen) > sessionStorage > localStorage
    const targetNim = (urlNim && urlNim.trim()) || sessionNim || localNim;

    if (urlNim && urlNim.trim()) {
      setIsVerifiedScan(true);
    }

    if (!targetNim) {
      const timer = setTimeout(() => {
        setLoading(false);
        setShowLookupInput(true);
      }, 0);
      return () => clearTimeout(timer);
    }

    const timer = setTimeout(() => {
      void fetchBuktiWithNim(targetNim, token);
    }, 0);
    return () => clearTimeout(timer);
  }, [fetchBuktiWithNim]);

  // Siapkan tautan verifikasi resmi untuk QR Code
  useEffect(() => {
    if (typeof window !== "undefined" && data?.mahasiswa?.nim) {
      const origin = window.location.origin;
      setQrUrl(`${origin}/bukti?nim=${encodeURIComponent(data.mahasiswa.nim)}`);
    }
  }, [data?.mahasiswa?.nim]);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleBackToHome = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("nim");
      sessionStorage.removeItem("token");
      sessionStorage.removeItem("krs_selected_ids");
      localStorage.removeItem("krs_saved_nim");
    }
    router.replace("/");
  };

  const handleManualSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchNim.trim()) return;
    setSearching(true);
    fetchBuktiWithNim(searchNim.trim());
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <div className="spinner spinner-primary spinner-lg" style={{ marginBottom: "1rem" }} />
        <p style={{ color: "var(--text-muted)" }}>Memuat bukti pendaftaran...</p>
      </div>
    );
  }

  // JIKA SESI KOSONG / PENCARIAN MANDIRI (Self-healing, bebas dari layar buntu)
  if (showLookupInput || (!data && !loading)) {
    return (
      <div className="container" style={{ maxWidth: 500, marginTop: "3.5rem", padding: "0 1rem" }}>
        <div className="card" style={{ textAlign: "center", padding: "2rem 1.75rem" }}>
          <div style={{ marginBottom: "1rem" }}>
            <Image
              src="/logo-instiper.png"
              alt="Logo INSTIPER"
              width={56}
              height={56}
              priority
              style={{ objectFit: "contain", display: "block", margin: "0 auto" }}
            />
          </div>

          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: "0 0 0.4rem 0", color: "var(--text-main)" }}>
            Lihat Bukti Pendaftaran
          </h2>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem", lineHeight: 1.5 }}>
            Masukkan NIM Anda untuk memuat dan mencetak lembar Tanda Bukti Pemilihan Mata Kuliah resmi.
          </p>

          {errorMessage && (
            <div className="alert alert-danger" style={{ textAlign: "left", marginBottom: "1.25rem" }}>
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleManualSearch} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <input
                type="text"
                className="input input-lg"
                placeholder="Contoh: 2110211002"
                value={searchNim}
                onChange={(e) => setSearchNim(e.target.value)}
                autoFocus
                style={{
                  textAlign: "center",
                  fontSize: "1.1rem",
                  fontWeight: 700,
                  letterSpacing: "0.05em",
                }}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={searching || !searchNim.trim()}
              style={{ padding: "0.85rem", fontWeight: 700, fontSize: "0.95rem" }}
            >
              {searching ? "Memeriksa Data..." : "🔍 Tampilkan Bukti Pendaftaran"}
            </button>

            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={handleBackToHome}
              style={{ padding: "0.75rem", fontSize: "0.875rem" }}
            >
              Kembali ke Halaman Utama
            </button>
          </form>
        </div>
      </div>
    );
  }

  const { mahasiswa, pendaftaran } = data || {
    mahasiswa: { nim: "-", nama: "-", kelas: "-" },
    pendaftaran: { waktu_daftar: "-", pilihan: [] },
  };

  const hasPilihan = Boolean(pendaftaran.pilihan && pendaftaran.pilihan.length > 0);

  return (
    <div className="container" style={{ maxWidth: 850, paddingBottom: "3rem" }}>
      {/* Banner Notifikasi Mode Verifikasi Scan Ponsel */}
      {isVerifiedScan && (
        <div className="no-print" style={{ marginBottom: "1.1rem" }}>
          <div
            style={{
              backgroundColor: "#f0fdf4",
              border: "1.5px solid #22c55e",
              borderRadius: "var(--radius-lg)",
              padding: "0.65rem 1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.75rem",
              boxShadow: "0 2px 8px rgba(34, 197, 94, 0.12)",
            }}
          >
            {/* Vektor Shield Check Sesuai Referensi Foto */}
            <svg
              viewBox="0 0 24 24"
              width={34}
              height={34}
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
            <div>
              <div style={{ fontWeight: 800, fontSize: "0.925rem", color: "#166534", lineHeight: 1.25 }}>
                Dokumen Terverifikasi Asli
              </div>
              <div style={{ fontSize: "0.775rem", color: "#15803d", marginTop: 2 }}>
                Tercatat sah di sistem akademik FAPERTA INSTIPER
              </div>
            </div>
          </div>

          {/* Kalimat petunjuk verifikasi di bawah kotak banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.4rem",
              marginTop: "0.4rem",
              padding: "0 0.4rem",
              fontSize: "0.75rem",
              color: "#64748b",
            }}
          >
            <span>ℹ️</span>
            <span>Cocokkan data di layar ini dengan lembar fisik yang diberikan mahasiswa.</span>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAMPILAN KHUSUS LAYAR HP (Layar <= 640px)
          ========================================================================= */}
      <div className="mobile-screen-summary no-print">
        <div
          className="card"
          style={{
            padding: "1.35rem 1.25rem",
            backgroundColor: "#ffffff",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            marginBottom: "1rem",
          }}
        >
          {/* Logo Kampus & Header Status */}
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              textAlign: "center",
              marginBottom: "1.15rem",
            }}
          >
            <div style={{ marginBottom: "0.6rem" }}>
              <Image
                src="/logo-instiper.png"
                alt="Logo INSTIPER"
                width={52}
                height={52}
                priority
                style={{ objectFit: "contain", display: "block", margin: "0 auto" }}
              />
            </div>

            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "#0f172a" }}>
              Bukti Registrasi Mata Kuliah Pilihan
            </h3>
            <p style={{ fontSize: "0.775rem", color: "#64748b", margin: "3px 0 0" }}>
              Tercatat secara elektronik di sistem akademik FAPERTA
            </p>
          </div>

          {/* Kartu Profil Mahasiswa Ringkas */}
          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: "var(--radius-md)",
              padding: "0.875rem",
              fontSize: "0.85rem",
              display: "grid",
              gap: "0.4rem",
              marginBottom: "1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>NIM</span>
              <strong style={{ color: "#0f172a" }}>{mahasiswa.nim}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Nama</span>
              <strong style={{ color: "#0f172a", textAlign: "right" }}>{mahasiswa.nama}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Kelas</span>
              <strong style={{ color: "#0f172a" }}>{mahasiswa.kelas || "-"}</strong>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Waktu Daftar</span>
              <span suppressHydrationWarning style={{ color: "#0f172a", fontWeight: 600 }}>
                {pendaftaran.waktu_daftar ? new Date(pendaftaran.waktu_daftar).toLocaleString("id-ID") : "-"}
              </span>
            </div>
          </div>

          {/* Tombol Cetak / Pemilihan */}
          <div style={{ marginBottom: "1.25rem" }}>
            {hasPilihan ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrint}
                style={{
                  width: "100%",
                  fontWeight: 700,
                  padding: "0.75rem 1rem",
                  minHeight: 46,
                  fontSize: "0.9rem",
                  justifyContent: "center",
                }}
              >
                📄 Cetak Bukti (A4 / PDF)
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleBackToHome}
                style={{
                  width: "100%",
                  fontWeight: 800,
                  padding: "0.75rem 1rem",
                  minHeight: 46,
                  fontSize: "0.925rem",
                  justifyContent: "center",
                  backgroundColor: "#059669",
                  boxShadow: "0 4px 12px rgba(5, 150, 105, 0.3)",
                }}
              >
                📝 Masuk ke Ruang Pemilihan Mata Kuliah
              </button>
            )}
          </div>

          {/* Daftar Kartu Pilihan Terpilih */}
          <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ fontWeight: 700, fontSize: "0.85rem", color: "#334155" }}>
              Mata Kuliah / Proyek Terpilih:
            </div>

            {hasPilihan ? (
              pendaftaran.pilihan.map((item, index) => {
                const isProyek = item.jenis === "proyek";
                return (
                  <div
                    key={item.id}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: "var(--radius-md)",
                      padding: "0.75rem",
                      backgroundColor: "#ffffff",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "flex-start",
                        gap: "0.5rem",
                        marginBottom: "0.35rem",
                      }}
                    >
                      <strong style={{ fontSize: "0.875rem", color: "#0f172a" }}>
                        {index + 1}. {item.nama}
                      </strong>
                      <span
                        style={{
                          fontSize: "0.725rem",
                          fontWeight: 700,
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: "#f0fdf4",
                          color: "#166534",
                          border: "1px solid #bbf7d0",
                          whiteSpace: "nowrap",
                        }}
                      >
                        Kelas {item.kelas || (isProyek ? "Semua" : "A")}
                      </span>
                    </div>

                    <div
                      style={{
                        display: "flex",
                        gap: "0.4rem",
                        flexWrap: "wrap",
                        fontSize: "0.75rem",
                        color: "#64748b",
                        marginBottom: "0.35rem",
                      }}
                    >
                      <span
                        style={{
                          backgroundColor: "#f1f5f9",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontWeight: 600,
                        }}
                      >
                        {isProyek ? "Proyek Terapan" : "Mata Kuliah"}
                      </span>
                      {item.topik && (
                        <span style={{ fontStyle: "italic", color: "#475569" }}>
                          Topik: {item.topik}
                        </span>
                      )}
                    </div>

                    <div
                      style={{
                        fontSize: "0.75rem",
                        color: "#334155",
                        backgroundColor: "#f8fafc",
                        padding: "0.45rem 0.65rem",
                        borderRadius: "4px",
                        marginTop: "0.35rem",
                      }}
                    >
                      <span style={{ fontWeight: 600 }}>🕒 Jadwal:</span>{" "}
                      {item.jadwal && item.jadwal.length > 0
                        ? item.jadwal
                            .map(
                              (j) =>
                                `${j.hari}, ${j.jam_mulai}–${j.jam_selesai}${j.ruang ? ` (${j.ruang})` : ""}`
                            )
                            .join("; ")
                        : "Jadwal belum ditentukan"}
                    </div>
                  </div>
                );
              })
            ) : (
              <div
                style={{
                  textAlign: "center",
                  padding: "1.75rem 1rem",
                  backgroundColor: "#fefce8",
                  borderRadius: "var(--radius-md)",
                  border: "1px dashed #ca8a04",
                }}
              >
                <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>⚠️</div>
                <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "#854d0e", marginBottom: "0.35rem" }}>
                  Belum Ada Mata Kuliah yang Tersimpan
                </div>
                <p style={{ fontSize: "0.825rem", color: "#713f12", margin: "0 0 1rem 0", lineHeight: 1.45 }}>
                  Anda belum menyelesaikan pemilihan mata kuliah atau transaksi sebelumnya belum tersimpan.
                </p>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleBackToHome}
                  style={{
                    fontWeight: 700,
                    fontSize: "0.85rem",
                    padding: "0.6rem 1.25rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "#059669",
                  }}
                >
                  Masuk ke Ruang Pemilihan Mata Kuliah
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* =========================================================================
          LEMBAR FORMAL A4 (Desktop Preview & Khusus Cetak Print PDF)
          ========================================================================= */}
      <div
        className="card desktop-formal-preview print-formal-sheet"
        style={{
          padding: "1.5rem 1.75rem",
          backgroundColor: "#ffffff",
          border: "1.5px solid var(--border-color)",
          borderRadius: "var(--radius-lg)",
          color: "#0f172a",
        }}
      >
        {/* Kop Surat Resmi Institusi (Kompak) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1rem",
            borderBottom: "2.5px double #0f172a",
            paddingBottom: "0.75rem",
            marginBottom: "1rem",
          }}
        >
          <Image
            src="/logo-instiper.png"
            alt="Logo INSTIPER"
            width={68}
            height={68}
            priority
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, textAlign: "center" }}>
            <h2
              style={{
                fontSize: "1.05rem",
                fontWeight: 800,
                textTransform: "uppercase",
                letterSpacing: "0.03em",
                margin: 0,
                color: "#0f172a",
                lineHeight: 1.25,
              }}
            >
              INSTITUT PERTANIAN STIPER YOGYAKARTA
            </h2>
            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "var(--primary)",
                textTransform: "uppercase",
                margin: "0.15rem 0",
              }}
            >
              FAKULTAS PERTANIAN
            </h3>
            <h4 style={{ fontSize: "0.875rem", fontWeight: 700, color: "#334155", margin: 0 }}>
              TANDA BUKTI PEMILIHAN MATA KULIAH PILIHAN DAN PROYEK
            </h4>
            <p style={{ fontSize: "0.75rem", color: "#64748b", margin: "0.2rem 0 0 0" }}>
              Tahun Akademik Berjalan — Dokumen Registrasi Elektronik Sah
            </p>
          </div>
        </div>

        {/* Data Mahasiswa (Grid Kompak) */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.35rem 1.5rem",
            marginBottom: "0.85rem",
            fontSize: "0.85rem",
          }}
        >
          <div>
            <span style={{ color: "#64748b", display: "inline-block", width: 110 }}>NIM:</span>
            <strong>{mahasiswa.nim}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "inline-block", width: 110 }}>Kelas:</span>
            <strong>{mahasiswa.kelas || "-"}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "inline-block", width: 110 }}>Nama:</span>
            <strong>{mahasiswa.nama}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "inline-block", width: 110 }}>Waktu Terdaftar:</span>
            <span suppressHydrationWarning>{pendaftaran.waktu_daftar ? new Date(pendaftaran.waktu_daftar).toLocaleString("id-ID") : "-"}</span>
          </div>
        </div>

        {/* Tabel Mata Kuliah Terpilih */}
        <div style={{ marginBottom: "1rem" }}>
          <h4 style={{ fontSize: "0.85rem", fontWeight: 700, marginBottom: "0.4rem", color: "#1e293b" }}>
            Daftar Mata Kuliah & Proyek Terpilih:
          </h4>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.825rem",
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9", borderBottom: "1.5px solid #cbd5e1" }}>
                <th style={{ padding: "6px 8px", width: 36, textAlign: "center" }}>No</th>
                <th style={{ padding: "6px 8px" }}>Mata Kuliah / Proyek</th>
                <th style={{ padding: "6px 8px", width: 80 }}>Jenis</th>
                <th style={{ padding: "6px 8px", width: 80 }}>Kelas</th>
                <th style={{ padding: "6px 8px" }}>Jadwal & Ruang</th>
              </tr>
            </thead>
            <tbody>
              {hasPilihan ? (
                pendaftaran.pilihan.map((item, index) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}>{index + 1}</td>
                    <td style={{ padding: "5px 8px", fontWeight: 600 }}>{item.nama}</td>
                    <td style={{ padding: "5px 8px", textTransform: "capitalize" }}>{item.jenis}</td>
                    <td style={{ padding: "5px 8px", fontWeight: 700 }}>
                      {item.kelas || (item.jenis === "proyek" ? "Semua" : "A")}
                    </td>
                    <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>
                      {item.jadwal && item.jadwal.length > 0
                        ? item.jadwal
                            .map(
                              (j) =>
                                `${j.hari}, ${j.jam_mulai}–${j.jam_selesai}${j.ruang ? ` (${j.ruang})` : ""}`
                            )
                            .join("; ")
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: "14px", textAlign: "center", color: "#b45309", backgroundColor: "#fffbeb" }}>
                    ⚠️ Belum ada mata kuliah yang terpilih atau tersimpan di sistem.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Area Tanda Tangan */}
        <div
          style={{
            fontSize: "0.75rem",
            color: "#475569",
            marginTop: "0.85rem",
            borderTop: "1px dashed #cbd5e1",
            paddingTop: "0.75rem",
            pageBreakInside: "avoid",
            breakInside: "avoid",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
              textAlign: "center",
            }}
          >
            <div style={{ width: 220 }}>
              <p style={{ margin: 0 }}>Mengetahui,</p>
              <p style={{ margin: "2px 0 0 0" }}>Dosen Pembimbing Akademik / Admin</p>
              <div style={{ height: 60 }}></div>
              <p style={{ margin: 0 }}>( .................................................... )</p>
            </div>

            {/* QR Code Barcode Keaslian Digital */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                padding: "0 0.5rem",
              }}
            >
              <div
                style={{
                  padding: 4,
                  backgroundColor: "#ffffff",
                  border: "1px solid #cbd5e1",
                  borderRadius: 4,
                  display: "inline-block",
                }}
              >
                <QrCode
                  value={
                    qrUrl ||
                    (mahasiswa.nim
                      ? `${typeof window !== "undefined" ? window.location.origin : ""}/bukti?nim=${encodeURIComponent(mahasiswa.nim)}`
                      : "")
                  }
                  size={105}
                />
              </div>
            </div>

            <div style={{ width: 220 }}>
              <p style={{ margin: 0 }}>
                Yogyakarta, {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p style={{ margin: "2px 0 0 0" }}>Mahasiswa Bersangkutan,</p>
              <div style={{ height: 60 }}></div>
              <p style={{ margin: 0 }}>
                <strong>( {mahasiswa.nama} )</strong>
              </p>
              <p style={{ fontSize: "0.725rem", margin: "2px 0 0 0" }}>NIM. {mahasiswa.nim}</p>
            </div>
          </div>

          {/* Footer Formal Akademik */}
          <div
            className="print-formal-footer"
            style={{
              marginTop: "1.15rem",
              paddingTop: "0.5rem",
              borderTop: "1px solid #e2e8f0",
              fontSize: "0.7rem",
              color: "#64748b",
              pageBreakInside: "avoid",
              lineHeight: 1.45,
            }}
          >
            <div>
              * Dokumen ini adalah bukti sah registrasi yang dicatat dan diterbitkan secara elektronik melalui Portal KRS Fakultas Pertanian INSTIPER Yogyakarta.
            </div>
            <div style={{ marginTop: "3px", fontSize: "0.65rem", color: "#94a3b8" }}>
              Dicetak: {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" })} • Lembar 1/1
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          KARTU BARCODE BESAR UNTUK SCAN DARI HP LAIN
          ========================================================================= */}
      {hasPilihan && (
        <div
          className="no-print"
          style={{
            marginTop: "1.75rem",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 380,
              padding: "1.5rem 1.25rem",
              textAlign: "center",
              backgroundColor: "#ffffff",
              border: "1.5px solid var(--border-color)",
              borderRadius: "var(--radius-lg)",
              boxShadow: "var(--shadow-card)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem" }}>
              <span style={{ fontSize: "1.25rem" }}>📱</span>
              <strong style={{ fontSize: "1rem", color: "#0f172a" }}>
                QR Code Verifikasi Keaslian
              </strong>
            </div>

            <p style={{ fontSize: "0.8rem", color: "#64748b", margin: "0 0 1.15rem 0", lineHeight: 1.45, maxWidth: 320 }}>
              Tunjukkan QR Code ini kepada Dosen Pembimbing / Admin untuk dipindai langsung dari kamera HP lain.
            </p>

            <div
              style={{
                padding: "0.75rem",
                backgroundColor: "#ffffff",
                border: "2px solid #e2e8f0",
                borderRadius: "var(--radius-md)",
                display: "inline-block",
                boxShadow: "0 4px 12px rgba(0, 0, 0, 0.06)",
              }}
            >
              <QrCode
                value={
                  qrUrl ||
                  (mahasiswa.nim
                    ? `${typeof window !== "undefined" ? window.location.origin : ""}/bukti?nim=${encodeURIComponent(mahasiswa.nim)}`
                    : "")
                }
                size={180}
              />
            </div>

            <div style={{ marginTop: "0.75rem" }}>
              <span
                style={{
                  display: "inline-block",
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "#166534",
                  backgroundColor: "#f0fdf4",
                  border: "1px solid #bbf7d0",
                  padding: "3px 12px",
                  borderRadius: "var(--radius-full)",
                  fontFamily: "monospace",
                  letterSpacing: "0.04em",
                }}
              >
                KRS-{mahasiswa.nim}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* =========================================================================
          TOMBOL NAVIGASI BAWAH
          ========================================================================= */}
      <div
        className="no-print"
        style={{
          marginTop: "1.75rem",
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
        }}
      >
        <button
          type="button"
          className="btn btn-secondary"
          onClick={handleBackToHome}
          style={{
            fontWeight: 700,
            padding: "0.75rem 2rem",
            minHeight: 46,
            fontSize: "0.9rem",
            width: "100%",
            maxWidth: 280,
            justifyContent: "center",
          }}
        >
          Kembali ke Halaman Utama
        </button>
      </div>
    </div>
  );
}
