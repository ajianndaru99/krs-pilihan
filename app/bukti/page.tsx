"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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

  const handleLogout = () => {
    if (typeof window !== "undefined") {
      sessionStorage.removeItem("nim");
      sessionStorage.removeItem("token");
      router.push("/");
    }
  };

  if (loading) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <p>Memuat bukti pendaftaran...</p>
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
          <Link href="/" className="btn btn-primary btn-block">
            Kembali ke Halaman Utama
          </Link>
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
            <span>⚠️ {errorMessage}</span>
          </div>
          <Link href="/" className="btn btn-primary btn-block">
            Kembali ke Halaman Utama
          </Link>
        </div>
      </div>
    );
  }

  const { mahasiswa, pendaftaran } = data || {
    mahasiswa: { nim: "-", nama: "-", kelas: "-" },
    pendaftaran: { waktu_daftar: "-", pilihan: [] },
  };

  return (
    <div className="container" style={{ maxWidth: 850 }}>
      {/* Tombol Aksi (disembunyikan saat dicetak) */}
      <div
        className="no-print"
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          gap: "1rem",
        }}
      >
        <Link href="/" className="btn btn-secondary">
          ← Beranda
        </Link>
        <div style={{ display: "flex", gap: "0.5rem" }}>
          <button type="button" className="btn btn-primary" onClick={handlePrint}>
            🖨️ Cetak Bukti (A4 / PDF)
          </button>
          <button type="button" className="btn btn-danger" onClick={handleLogout}>
            Keluar
          </button>
        </div>
      </div>

      {/* Dokumen Bukti Resmi (Dioptimalkan untuk A4) */}
      <div
        className="card"
        style={{
          padding: "2.5rem",
          backgroundColor: "#ffffff",
          border: "2px solid #cbd5e1",
          borderRadius: 8,
        }}
      >
        {/* Kop Surat */}
        <div
          style={{
            textAlign: "center",
            borderBottom: "3px double #0f172a",
            paddingBottom: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          <h2 style={{ fontSize: "1.25rem", fontWeight: 800, textTransform: "uppercase", letterSpacing: "0.05em" }}>
            FAKULTAS PERTANIAN
          </h2>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, color: "#334155" }}>
            TANDA BUKTI PEMILIHAN MATA KULIAH PILIHAN DAN PROYEK
          </h3>
          <p style={{ fontSize: "0.8rem", color: "#64748b" }}>Tahun Akademik Berjalan</p>
        </div>

        {/* Data Mahasiswa */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1fr 1fr",
            gap: "0.75rem 2rem",
            marginBottom: "1.5rem",
            fontSize: "0.95rem",
          }}
        >
          <div>
            <span style={{ color: "var(--text-muted)", display: "inline-block", width: 120 }}>NIM:</span>
            <strong>{mahasiswa.nim}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", display: "inline-block", width: 120 }}>Kelas Tetap:</span>
            <strong>{mahasiswa.kelas || "-"}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", display: "inline-block", width: 120 }}>Nama:</span>
            <strong>{mahasiswa.nama}</strong>
          </div>
          <div>
            <span style={{ color: "var(--text-muted)", display: "inline-block", width: 120 }}>Waktu Terdaftar:</span>
            <span>{pendaftaran.waktu_daftar ? new Date(pendaftaran.waktu_daftar).toLocaleString("id-ID") : "-"}</span>
          </div>
        </div>

        {/* Tabel Mata Kuliah Terpilih */}
        <div style={{ marginBottom: "2rem" }}>
          <h4 style={{ fontSize: "0.95rem", fontWeight: 700, marginBottom: "0.5rem" }}>
            Daftar Mata Kuliah & Proyek Terpilih:
          </h4>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "0.9rem",
              textAlign: "left",
            }}
          >
            <thead>
              <tr style={{ backgroundColor: "#f1f5f9", borderBottom: "2px solid #cbd5e1" }}>
                <th style={{ padding: "8px 12px", width: 40 }}>No</th>
                <th style={{ padding: "8px 12px" }}>Mata Kuliah / Proyek</th>
                <th style={{ padding: "8px 12px", width: 90 }}>Jenis</th>
                <th style={{ padding: "8px 12px", width: 140 }}>Topik</th>
                <th style={{ padding: "8px 12px" }}>Jadwal</th>
              </tr>
            </thead>
            <tbody>
              {pendaftaran.pilihan && pendaftaran.pilihan.length > 0 ? (
                pendaftaran.pilihan.map((item, index) => (
                  <tr key={item.id} style={{ borderBottom: "1px solid #e2e8f0" }}>
                    <td style={{ padding: "8px 12px", textAlign: "center" }}>{index + 1}</td>
                    <td style={{ padding: "8px 12px", fontWeight: 600 }}>{item.nama}</td>
                    <td style={{ padding: "8px 12px", textTransform: "capitalize" }}>{item.jenis}</td>
                    <td style={{ padding: "8px 12px" }}>{item.topik || "-"}</td>
                    <td style={{ padding: "8px 12px", fontSize: "0.85rem" }}>
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
                  <td colSpan={5} style={{ padding: "12px", textAlign: "center", color: "#64748b" }}>
                    Belum ada mata kuliah yang dipilih.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pernyataan & Tanda Tangan */}
        <div style={{ fontSize: "0.8rem", color: "#475569", marginTop: "2rem", borderTop: "1px dashed #cbd5e1", paddingTop: "1rem" }}>
          <p>
            * Dokumen ini adalah bukti sah registrasi mata kuliah pilihan yang dicatat secara elektronik oleh sistem.
            Simpan atau cetak berkas ini sebagai bukti registrasi Anda.
          </p>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: "2.5rem",
              textAlign: "center",
            }}
          >
            <div style={{ width: 220 }}>
              <p>Mengetahui,</p>
              <p>Dosen Pembimbing Akademik / Admin</p>
              <div style={{ height: 60 }}></div>
              <p>( .................................................... )</p>
            </div>

            <div style={{ width: 220 }}>
              <p>Yogyakarta, {new Date().toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" })}</p>
              <p>Mahasiswa Bersangkutan,</p>
              <div style={{ height: 60 }}></div>
              <p>
                <strong>( {mahasiswa.nama} )</strong>
              </p>
              <p style={{ fontSize: "0.75rem" }}>NIM. {mahasiswa.nim}</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
