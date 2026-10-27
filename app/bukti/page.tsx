"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";

interface BuktiData {
  mahasiswa: {
    nim: string;
    nama: string;
    kelas?: string;
  };
  pendaftaran: {
    waktu_daftar: string;
    pilihan: Array<{
      id: number;
      nama: string;
      jenis: string;
      topik: string;
      jadwal?: Array<{
        hari: string;
        jam_mulai: string;
        jam_selesai: string;
        ruang?: string;
      }>;
    }>;
  };
}

export default function BuktiPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BuktiData | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasSession, setHasSession] = useState(true);

  useEffect(() => {
    let isMounted = true;

    const fetchBukti = async () => {
      const nim = typeof window !== "undefined" ? sessionStorage.getItem("nim") : null;
      const token = typeof window !== "undefined" ? sessionStorage.getItem("token") : null;

      if (!nim || !token) {
        if (isMounted) {
          setHasSession(false);
          setLoading(false);
        }
        return;
      }

      try {
        const { data: resData, error } = await supabase.rpc("hasil_saya", {
          p_nim: nim,
          p_token: token,
        });

        if (!isMounted) return;

        if (error) {
          setErrorMessage(error.message || "Gagal memuat bukti pendaftaran.");
          return;
        }

        const res = (resData as (BuktiData & { ok?: boolean; error?: string }) | null) || null;
        if (!res || res.ok === false) {
          setErrorMessage(res?.error || "Data pendaftaran tidak ditemukan.");
          return;
        }

        setData(res);
      } catch (err: unknown) {
        if (!isMounted) return;
        const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat memuat data.";
        setErrorMessage(msg);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchBukti();

    return () => {
      isMounted = false;
    };
  }, []);

  const handlePrint = () => {
    if (typeof window !== "undefined") {
      window.print();
    }
  };

  const handleBackToHome = () => {
    if (typeof window !== "undefined") {
      sessionStorage.clear();
    }
    router.replace("/");
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <div className="spinner spinner-primary spinner-lg" style={{ marginBottom: "1rem" }} />
        <p style={{ color: "var(--text-muted)" }}>Memuat bukti pendaftaran...</p>
      </div>
    );
  }

  if (!hasSession) {
    return (
      <div className="container" style={{ maxWidth: 540, marginTop: "4rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <h2 className="card-title" style={{ justifyContent: "center", color: "var(--danger)" }}>
            Sesi Tidak Ditemukan
          </h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "1.5rem" }}>
            Data sesi tidak ditemukan di peramban ini. Pastikan Anda telah melakukan verifikasi NIM dan mendaftar di
            halaman utama.
          </p>
          <button type="button" className="btn btn-primary btn-block" onClick={handleBackToHome}>
            Kembali ke Halaman Awal
          </button>
        </div>
      </div>
    );
  }

  if (errorMessage) {
    return (
      <div className="container" style={{ maxWidth: 540, marginTop: "4rem" }}>
        <div className="card" style={{ textAlign: "center" }}>
          <h2 className="card-title" style={{ justifyContent: "center", color: "var(--danger)" }}>
            Peringatan
          </h2>
          <div className="alert alert-danger" style={{ textAlign: "left" }}>
            <span>{errorMessage}</span>
          </div>
          <button type="button" className="btn btn-primary btn-block" onClick={handleBackToHome}>
            Kembali ke Halaman Awal
          </button>
        </div>
      </div>
    );
  }

  const { mahasiswa, pendaftaran } = data || {
    mahasiswa: { nim: "-", nama: "-", kelas: "-" },
    pendaftaran: { waktu_daftar: "-", pilihan: [] },
  };

  return (
    <div className="container" style={{ maxWidth: 850, paddingBottom: "2rem" }}>
      {/* Tombol Navigasi Layar (disembunyikan saat dicetak) */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.25rem",
          gap: "0.75rem",
          flexWrap: "wrap",
        }}
      >
        <button type="button" className="btn btn-secondary" onClick={handleBackToHome}>
          Halaman Awal
        </button>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-primary" onClick={handlePrint} style={{ fontWeight: 600 }}>
            📄 Cetak Bukti (A4 / PDF)
          </button>
          <button type="button" className="btn btn-danger" onClick={handleBackToHome}>
            Keluar
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAMPILAN KHUSUS LAYAR HP (Layar <= 640px)
          Dioptimalkan agar pas di layar tanpa horizontal scrolling dan nyaman dibaca.
          Saat tombol Cetak ditekan, bagian ini disembunyikan dan sheet formal yang dicetak.
          ========================================================================= */}
      <div className="mobile-screen-summary no-print">
        <div
          className="card"
          style={{
            padding: "1.25rem",
            backgroundColor: "#ffffff",
            border: "1px solid var(--border-color)",
            borderRadius: "var(--radius-lg)",
            boxShadow: "var(--shadow-card)",
            marginBottom: "1.25rem",
          }}
        >
          {/* Header Status Sukses */}
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem" }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: "50%",
                backgroundColor: "#ecfdf5",
                color: "#059669",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontWeight: 800,
                fontSize: "1.1rem",
                flexShrink: 0,
              }}
            >
              ✓
            </div>
            <div>
              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, margin: 0, color: "#0f172a" }}>
                Bukti Registrasi KRS Sah
              </h3>
              <p style={{ fontSize: "0.775rem", color: "#64748b", margin: 0 }}>
                Tercatat secara elektronik di sistem akademik
              </p>
            </div>
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
              <span style={{ color: "var(--text-muted)" }}>Kelas Tetap</span>
              <span style={{ fontWeight: 600 }}>{mahasiswa.kelas || "-"}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between" }}>
              <span style={{ color: "var(--text-muted)" }}>Waktu Daftar</span>
              <span style={{ fontSize: "0.8rem", color: "#475569" }}>
                {pendaftaran.waktu_daftar ? new Date(pendaftaran.waktu_daftar).toLocaleString("id-ID") : "-"}
              </span>
            </div>
          </div>

          {/* Daftar Kartu Pilihan Terpilih */}
          <h4 style={{ fontSize: "0.9rem", fontWeight: 700, marginBottom: "0.75rem", color: "#1e293b" }}>
            Mata Kuliah / Proyek Terpilih:
          </h4>
          <div style={{ display: "grid", gap: "0.75rem" }}>
            {pendaftaran.pilihan && pendaftaran.pilihan.length > 0 ? (
              pendaftaran.pilihan.map((item, idx) => (
                <div
                  key={item.id}
                  style={{
                    border: "1px solid #cbd5e1",
                    borderRadius: "var(--radius-md)",
                    padding: "0.85rem",
                    backgroundColor: "#ffffff",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.35rem" }}>
                    <span
                      style={{
                        backgroundColor: "#e0f2fe",
                        color: "#0284c7",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        padding: "2px 7px",
                        borderRadius: "4px",
                        flexShrink: 0,
                      }}
                    >
                      #{idx + 1}
                    </span>
                    <strong style={{ fontSize: "0.9rem", color: "#0f172a", flex: 1, lineHeight: 1.35 }}>
                      {item.nama}
                    </strong>
                  </div>

                  <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", margin: "0.4rem 0" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "100px",
                        backgroundColor: "#f1f5f9",
                        color: "#475569",
                        textTransform: "capitalize",
                        fontWeight: 600,
                      }}
                    >
                      {item.jenis}
                    </span>
                    {item.topik && (
                      <span
                        style={{
                          fontSize: "0.75rem",
                          padding: "2px 8px",
                          borderRadius: "100px",
                          backgroundColor: "#fef3c7",
                          color: "#b45309",
                          fontWeight: 600,
                        }}
                      >
                        Topik: {item.topik}
                      </span>
                    )}
                  </div>

                  <div
                    style={{
                      fontSize: "0.8rem",
                      color: "#334155",
                      backgroundColor: "#f8fafc",
                      padding: "0.5rem 0.65rem",
                      borderRadius: "4px",
                      marginTop: "0.4rem",
                    }}
                  >
                    <span style={{ fontWeight: 600 }}>🕒 Jadwal:</span>{" "}
                    {item.jadwal && item.jadwal.length > 0
                      ? item.jadwal
                          .map(
                            (j) =>
                              `${j.hari}, ${j.jam_mulai} - ${j.jam_selesai}${j.ruang ? ` (${j.ruang})` : ""}`
                          )
                          .join("; ")
                      : "Jadwal belum ditentukan"}
                  </div>
                </div>
              ))
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", textAlign: "center" }}>
                Belum ada data mata kuliah yang tersimpan.
              </p>
            )}
          </div>

          {/* Tombol Cetak Bawah untuk HP */}
          <div style={{ marginTop: "1.25rem", display: "grid", gap: "0.5rem" }}>
            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={handlePrint}
              style={{ fontWeight: 700, padding: "0.75rem" }}
            >
              📄 Cetak / Unduh PDF (A4 Formal)
            </button>
            <p style={{ fontSize: "0.725rem", color: "#64748b", textAlign: "center", margin: 0 }}>
              * Tombol di atas akan membuka cetak PDF resmi format A4 1 halaman.
            </p>
          </div>
        </div>
      </div>

      {/* =========================================================================
          LEMBAR FORMAL A4 (Desktop Preview & Khusus Cetak Print PDF)
          Dipadatkan secara proporsional agar 100% pas dalam 1 halaman A4 tanpa meluap.
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
            <span style={{ color: "#64748b", display: "inline-block", width: 110 }}>Kelas Tetap:</span>
            <strong>{mahasiswa.kelas || "-"}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "inline-block", width: 110 }}>Nama:</span>
            <strong>{mahasiswa.nama}</strong>
          </div>
          <div>
            <span style={{ color: "#64748b", display: "inline-block", width: 110 }}>Waktu Terdaftar:</span>
            <span>{pendaftaran.waktu_daftar ? new Date(pendaftaran.waktu_daftar).toLocaleString("id-ID") : "-"}</span>
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
                <th style={{ padding: "6px 8px", width: 120 }}>Topik</th>
                <th style={{ padding: "6px 8px" }}>Jadwal & Ruang</th>
              </tr>
            </thead>
            <tbody>
              {pendaftaran.pilihan && pendaftaran.pilihan.length > 0 ? (
                pendaftaran.pilihan.map((item, index) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "5px 8px", textAlign: "center" }}>{index + 1}</td>
                    <td style={{ padding: "5px 8px", fontWeight: 600 }}>{item.nama}</td>
                    <td style={{ padding: "5px 8px", textTransform: "capitalize" }}>{item.jenis}</td>
                    <td style={{ padding: "5px 8px" }}>{item.topik || "-"}</td>
                    <td style={{ padding: "5px 8px", fontSize: "0.8rem" }}>
                      {item.jadwal && item.jadwal.length > 0
                        ? item.jadwal
                            .map(
                              (j) =>
                                `${j.hari}, ${j.jam_mulai} - ${j.jam_selesai}${j.ruang ? ` (${j.ruang})` : ""}`
                            )
                            .join("; ")
                        : "-"}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: "10px", textAlign: "center", color: "#64748b" }}>
                    Belum ada mata kuliah yang dipilih.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pernyataan & Tanda Tangan Kompak (Avoid Page Break) */}
        <div
          style={{
            fontSize: "0.75rem",
            color: "#475569",
            marginTop: "0.85rem",
            borderTop: "1px dashed #cbd5e1",
            paddingTop: "0.65rem",
            pageBreakInside: "avoid",
            breakInside: "avoid",
          }}
        >
          <p style={{ margin: "0 0 0.75rem 0", lineHeight: 1.35 }}>
            * Dokumen ini adalah bukti sah registrasi mata kuliah pilihan yang dicatat secara elektronik oleh sistem.
            Simpan atau cetak berkas ini sebagai bukti registrasi Anda.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "0.75rem",
              textAlign: "center",
            }}
          >
            <div style={{ width: 220 }}>
              <p style={{ margin: 0 }}>Mengetahui,</p>
              <p style={{ margin: "2px 0 0 0" }}>Dosen Pembimbing Akademik / Admin</p>
              <div style={{ height: 35 }}></div>
              <p style={{ margin: 0 }}>( .................................................... )</p>
            </div>

            <div style={{ width: 220 }}>
              <p style={{ margin: 0 }}>
                Yogyakarta, {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}
              </p>
              <p style={{ margin: "2px 0 0 0" }}>Mahasiswa Bersangkutan,</p>
              <div style={{ height: 35 }}></div>
              <p style={{ margin: 0 }}>
                <strong>( {mahasiswa.nama} )</strong>
              </p>
              <p style={{ fontSize: "0.725rem", margin: "2px 0 0 0" }}>NIM. {mahasiswa.nim}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
