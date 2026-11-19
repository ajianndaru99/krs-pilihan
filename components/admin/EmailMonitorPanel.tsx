"use client";

import { useState, useEffect, useCallback } from "react";
import { AdminEmailRingkasan, AdminEmailQueueItem } from "@/lib/types";
import { supabase } from "@/lib/supabase";

interface EmailMonitorPanelProps {
  ringkasan: AdminEmailRingkasan | null;
  isSending: boolean;
  onKirimUlang: () => Promise<void>;
  onRefresh: () => Promise<void>;
}

export function EmailMonitorPanel({
  ringkasan,
  isSending,
  onKirimUlang,
  onRefresh,
}: EmailMonitorPanelProps) {
  const [queue, setQueue] = useState<AdminEmailQueueItem[]>([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [search, setSearch] = useState("");
  const [processingNim, setProcessingNim] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [lastBatchResult, setLastBatchResult] = useState<{
    terkirim?: number;
    gagal?: number;
    pesan?: string;
  } | null>(null);

  // Muat daftar detail mahasiswa yang belum menerima email
  const loadQueue = useCallback(async () => {
    setLoadingQueue(true);
    try {
      const { data, error } = await supabase.rpc("admin_daftar_email_belum_terkirim");
      if (!error && data) {
        const res = data as { ok?: boolean; antrian?: AdminEmailQueueItem[] };
        if (res.ok && Array.isArray(res.antrian)) {
          setQueue(res.antrian);
        }
      }
    } catch {
      // Abaikan jika RPC belum dieksekusi di database
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  useEffect(() => {
    loadQueue();
  }, [loadQueue, ringkasan?.belum_terkirim]);

  const handleKirimUlangClick = async () => {
    setLastBatchResult(null);
    try {
      await onKirimUlang();
      await loadQueue();
    } catch {
      // Error ditangani oleh parent admin page popup
    }
  };

  const handleManualRefresh = async () => {
    await onRefresh();
    await loadQueue();
  };

  const handleTandaiTerkirim = async (nim: string, nama: string) => {
    setProcessingNim(nim);
    setLastBatchResult(null);
    try {
      const { error } = await supabase.rpc("admin_tandai_email_terkirim", { p_nim: nim });
      if (error) throw error;
      setLastBatchResult({
        pesan: `Status email ${nama} (${nim}) berhasil ditandai sebagai SUDAH TERKIRIM.`,
      });
      await onRefresh();
      await loadQueue();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal menandai status email.");
    } finally {
      setProcessingNim(null);
    }
  };

  const handleTandaiSemuaTerkirim = async () => {
    if (
      !confirm(
        `Tandai seluruh ${queue.length} mahasiswa dalam antrian sebagai SUDAH TERKIRIM (tanpa mengirim ulang email)?`
      )
    ) {
      return;
    }
    setIsMarkingAll(true);
    setLastBatchResult(null);
    try {
      const { data, error } = await supabase.rpc("admin_tandai_semua_email_terkirim");
      const res = data as { ok?: boolean; updated?: number } | null;
      if (error || !res?.ok) {
        // Fallback: tandai satu per satu
        for (const item of queue) {
          await supabase.rpc("admin_tandai_email_terkirim", { p_nim: item.nim });
        }
      }
      setLastBatchResult({
        pesan: "Seluruh antrian email berhasil ditandai sebagai SUDAH TERKIRIM.",
      });
      await onRefresh();
      await loadQueue();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Gagal memproses.");
    } finally {
      setIsMarkingAll(false);
    }
  };

  const filteredQueue = queue.filter((item) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase().trim();
    return (
      item.nim.toLowerCase().includes(q) ||
      item.nama.toLowerCase().includes(q) ||
      item.email.toLowerCase().includes(q)
    );
  });

  const belumTerkirim = ringkasan?.belum_terkirim ?? 0;
  const sudahTerkirim = ringkasan?.terkirim ?? 0;
  const totalDaftar = ringkasan?.total_daftar ?? 0;
  const tanpaEmail = ringkasan?.tanpa_email ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
      {/* Header Panel */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
          border: "1px solid var(--border-color)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1rem" }}>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <span style={{ fontSize: "1.5rem" }}>📧</span>
              <h2 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--text-color)" }}>
                Pemantauan & Pengiriman Email Bukti KRS
              </h2>
            </div>
            <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.875rem", color: "var(--text-muted)", maxWidth: 750, lineHeight: 1.5 }}>
              Status pengiriman bukti KRS ke email mahasiswa dipantau secara otomatis. Karena layanan email (Brevo) bersifat <strong>100% Gratis</strong> dengan batas kuota 300 email/hari, sistem menyimpan email mahasiswa secara aman. Jika kuota harian habis, Anda dapat mengirimkannya kembali secara bertahap (batch 50 email) di hari berikutnya tanpa biaya apa pun.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleManualRefresh}
              disabled={isSending || loadingQueue}
              style={{ fontSize: "0.85rem", padding: "0.6rem 1rem", fontWeight: 600 }}
            >
              🔄 Refresh Status
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleKirimUlangClick}
              disabled={isSending || belumTerkirim === 0}
              style={{
                fontSize: "0.85rem",
                padding: "0.6rem 1.25rem",
                fontWeight: 700,
                backgroundColor: belumTerkirim === 0 ? "var(--text-light)" : "var(--primary)",
                borderColor: belumTerkirim === 0 ? "var(--border-color)" : "var(--primary-dark)",
                cursor: belumTerkirim === 0 ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              {isSending ? (
                <>
                  <span className="spinner spinner-sm" style={{ borderTopColor: "#fff" }} />
                  <span>Mengirim Batch (maks 50)...</span>
                </>
              ) : (
                <>
                  <span>🚀</span>
                  <span>Kirim Ulang Antrian ({belumTerkirim > 50 ? "50 dari " + belumTerkirim : belumTerkirim})</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Notifikasi Hasil Batch Terakhir */}
        {lastBatchResult && (
          <div
            className="alert alert-info"
            style={{ marginTop: "1.25rem", marginBottom: 0, fontSize: "0.85rem" }}
          >
            <span>{lastBatchResult.pesan}</span>
          </div>
        )}
      </div>

      {/* 4 Kartu Statistik */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Total Terdaftar */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "#ffffff",
            border: "1px solid var(--border-color)",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Total Mahasiswa Terdaftar
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-color)", marginTop: "0.35rem" }}>
            {totalDaftar}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Telah menyelesaikan pemilihan KRS
          </div>
        </div>

        {/* Sudah Terkirim */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "#166534", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span>✅</span>
            <span>Email Berhasil Terkirim</span>
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "#15803d", marginTop: "0.35rem" }}>
            {sudahTerkirim}
          </div>
          <div style={{ fontSize: "0.78rem", color: "#166534", marginTop: "0.25rem" }}>
            {totalDaftar > 0 ? Math.round((sudahTerkirim / totalDaftar) * 100) : 0}% dari seluruh pendaftar
          </div>
        </div>

        {/* Belum Terkirim (Pending) */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: belumTerkirim > 0 ? "#fffbeb" : "#ffffff",
            border: belumTerkirim > 0 ? "1px solid #fde68a" : "1px solid var(--border-color)",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: belumTerkirim > 0 ? "#b45309" : "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.05em", display: "flex", alignItems: "center", gap: "0.35rem" }}>
            <span>{belumTerkirim > 0 ? "⏳" : "👌"}</span>
            <span>Belum Terkirim / Antrian</span>
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: belumTerkirim > 0 ? "#d97706" : "var(--text-color)", marginTop: "0.35rem" }}>
            {belumTerkirim}
          </div>
          <div style={{ fontSize: "0.78rem", color: belumTerkirim > 0 ? "#92400e" : "var(--text-muted)", marginTop: "0.25rem" }}>
            {belumTerkirim > 0 ? "Siap dikirim via tombol di atas" : "Tidak ada antrian tertunda"}
          </div>
        </div>

        {/* Tanpa Email */}
        <div
          className="card"
          style={{
            padding: "1.25rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "#ffffff",
            border: "1px solid var(--border-color)",
          }}
        >
          <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            Tidak Mengisi Email
          </div>
          <div style={{ fontSize: "1.85rem", fontWeight: 800, color: "var(--text-muted)", marginTop: "0.35rem" }}>
            {tanpaEmail}
          </div>
          <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Hanya mengunduh bukti PDF / QR
          </div>
        </div>
      </div>

      {/* Informasi Penting Kuota & Solusi Bebas Biaya */}
      <div
        style={{
          backgroundColor: "#eff6ff",
          border: "1px solid #bfdbfe",
          borderRadius: "var(--radius-lg)",
          padding: "1.25rem 1.5rem",
          display: "flex",
          gap: "1rem",
          alignItems: "flex-start",
        }}
      >
        <span style={{ fontSize: "1.6rem", flexShrink: 0 }}>💡</span>
        <div style={{ fontSize: "0.85rem", color: "#1e40af", lineHeight: 1.6 }}>
          <strong>Panduan Pengoperasian Hemat & Bebas Biaya (Tanpa Upgrade Berbayar):</strong>
          <ul style={{ margin: "0.4rem 0 0 1.25rem", padding: 0 }}>
            <li>
              <strong>Batas Kuota Gratis:</strong> Akun Brevo Free memberikan jatah <strong>300 email per hari</strong> (reset otomatis setiap pukul 07.00 WIB / 00.00 UTC).
            </li>
            <li>
              <strong>Jika Mahasiswa 300–450 Orang:</strong> Mahasiswa ke-301 dan seterusnya tetap sukses mendaftar dan bukti KRS tersimpan di sistem serta dapat dicetak langsung.
            </li>
            <li>
              <strong>Kirim Ulang Keesokan Hari:</strong> Alamat email mahasiswa yang belum terkirim otomatis masuk antrian di atas. Cukup klik tombol <strong>"Kirim Ulang Antrian"</strong> keesokan paginya setelah pukul 07.00 WIB untuk mengirimkan sisa bukti KRS secara gratis.
            </li>
            <li>
              <strong>Pencarian Data:</strong> Anda dapat memeriksa apakah email mahasiswa tertentu sudah terkirim atau masih berada dalam antrian pada daftar di bawah.
            </li>
          </ul>
        </div>
      </div>

      {/* Daftar Antrian Mahasiswa Belum Terkirim */}
      <div
        className="card"
        style={{
          padding: "1.5rem",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
          border: "1px solid var(--border-color)",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1.25rem",
          }}
        >
          <div>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0, color: "var(--text-color)" }}>
              Daftar Antrian Email Belum Terkirim ({queue.length})
            </h3>
            <p style={{ margin: "0.2rem 0 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Mahasiswa yang telah mendaftar namun bukti emailnya belum terkirim karena kuota harian habis.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            {queue.length > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTandaiSemuaTerkirim}
                disabled={isMarkingAll || isSending || loadingQueue}
                style={{
                  fontSize: "0.8rem",
                  padding: "0.5rem 0.85rem",
                  fontWeight: 600,
                  whiteSpace: "nowrap",
                  backgroundColor: "#f8fafc",
                  borderColor: "var(--border-color)",
                }}
                title="Tandai seluruh mahasiswa di antrian sebagai sudah terkirim tanpa kirim email ke Brevo"
              >
                {isMarkingAll ? "Memproses..." : "✅ Tandai Semua Sudah Terkirim"}
              </button>
            )}

            <div style={{ width: "100%", maxWidth: 280 }}>
              <input
                type="text"
                placeholder="Cari NIM, Nama, atau Email..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.5rem 0.85rem",
                  fontSize: "0.85rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        {loadingQueue ? (
          <div style={{ textAlign: "center", padding: "2.5rem 1rem" }}>
            <div className="spinner spinner-primary spinner-md" style={{ marginBottom: "0.75rem" }} />
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem" }}>Memuat daftar antrian email...</p>
          </div>
        ) : filteredQueue.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "3rem 1.5rem",
              backgroundColor: "#f8fafc",
              borderRadius: "var(--radius-lg)",
              border: "1px dashed var(--border-color)",
            }}
          >
            <div style={{ fontSize: "2.5rem", marginBottom: "0.5rem" }}>🎉</div>
            <h4 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 700, color: "var(--text-color)" }}>
              {search.trim() ? "Tidak ada mahasiswa yang cocok dengan pencarian." : "Tidak Ada Antrian Email Tertunda"}
            </h4>
            <p style={{ margin: "0.35rem 0 0 0", fontSize: "0.85rem", color: "var(--text-muted)" }}>
              {search.trim()
                ? "Coba gunakan kata kunci pencarian yang lain."
                : "Semua pendaftar yang mencantumkan email telah berhasil menerima bukti pemilihan KRS."}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-color)", textAlign: "left" }}>
                  <th style={{ padding: "0.75rem 1rem", width: 50 }}>No</th>
                  <th style={{ padding: "0.75rem 1rem" }}>NIM</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Nama Mahasiswa</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Kelas</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Email Tujuan</th>
                  <th style={{ padding: "0.75rem 1rem" }}>Waktu Registrasi</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center" }}>Status</th>
                  <th style={{ padding: "0.75rem 1rem", textAlign: "center", width: 150 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredQueue.map((item, idx) => (
                  <tr
                    key={item.nim}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fdfefe",
                    }}
                  >
                    <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>{idx + 1}</td>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 700, fontFamily: "monospace" }}>{item.nim}</td>
                    <td style={{ padding: "0.75rem 1rem", fontWeight: 600 }}>{item.nama}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)" }}>{item.kelas || "-"}</td>
                    <td style={{ padding: "0.75rem 1rem", color: "var(--primary-dark)", fontWeight: 500 }}>
                      {item.email}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                      {item.registered_at || "-"}
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                      <span
                        className="badge badge-warning"
                        style={{ fontSize: "0.75rem", padding: "0.2rem 0.6rem" }}
                      >
                        Pending Kirim Ulang
                      </span>
                    </td>
                    <td style={{ padding: "0.75rem 1rem", textAlign: "center" }}>
                      <button
                        type="button"
                        onClick={() => handleTandaiTerkirim(item.nim, item.nama)}
                        disabled={processingNim === item.nim || isMarkingAll || isSending}
                        className="btn btn-secondary"
                        style={{
                          fontSize: "0.75rem",
                          padding: "0.25rem 0.65rem",
                          backgroundColor: "#f0fdf4",
                          borderColor: "#86efac",
                          color: "#166534",
                          fontWeight: 700,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        title="Tandai status sebagai sudah terkirim tanpa kirim ulang email"
                      >
                        {processingNim === item.nim ? "..." : "✅ Tandai Terkirim"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
