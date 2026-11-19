"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { AdminEmailRingkasan, AdminEmailQueueItem } from "@/lib/types";
import { parsePendaftarData } from "@/lib/admin-adapter";
import { supabase } from "@/lib/supabase";
import { EditEmailModal } from "./EditEmailModal";

type EmailFilterTab = "all" | "terkirim" | "belum_terkirim" | "tanpa_email";

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
  const [students, setStudents] = useState<AdminEmailQueueItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<EmailFilterTab>("all");
  const [processingNim, setProcessingNim] = useState<string | null>(null);
  const [sendingSingleNim, setSendingSingleNim] = useState<string | null>(null);
  const [isMarkingAll, setIsMarkingAll] = useState(false);
  const [editingStudent, setEditingStudent] = useState<AdminEmailQueueItem | null>(null);
  const [lastBatchResult, setLastBatchResult] = useState<{
    pesan: string;
    isError?: boolean;
  } | null>(null);

  // Callback setelah admin berhasil mengedit email mahasiswa
  const handleEditSuccess = (newEmail: string, emailTerkirim: boolean) => {
    if (!editingStudent) return;
    const targetNim = editingStudent.nim;
    const targetNama = editingStudent.nama;

    setStudents((prev) =>
      prev.map((s) =>
        s.nim === targetNim
          ? {
              ...s,
              email: newEmail,
              email_terkirim: emailTerkirim,
            }
          : s
      )
    );

    setLastBatchResult({
      pesan: `Alamat email mahasiswa ${targetNama} (${targetNim}) berhasil diperbarui menjadi "${newEmail}".`,
      isError: false,
    });

    onRefresh();
  };

  // Muat data mahasiswa beserta status email
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Coba RPC admin_daftar_status_email (Patch 39)
      const { data, error } = await supabase.rpc("admin_daftar_status_email", { p_filter: "all" });
      if (!error && data) {
        const res = data as { ok?: boolean; data?: AdminEmailQueueItem[] };
        if (res.ok && Array.isArray(res.data)) {
          setStudents(res.data);
          return;
        }
      }

      // 2. Fallback: ambil dari admin_list_pendaftar
      const { data: pendData, error: pendErr } = await supabase.rpc("admin_list_pendaftar");
      if (!pendErr && pendData) {
        const pList = parsePendaftarData(pendData);
        if (pList.length > 0) {
          setStudents(
            pList.map((p) => ({
              nim: p.nim,
              nama: p.nama,
              kelas: p.kelas || "-",
              email: p.email || "-",
              email_terkirim: p.email_terkirim || false,
              registered_at: p.registered_at || "-",
            }))
          );
          return;
        }
      }

      // 3. Fallback antrian email belum terkirim
      const { data: qData } = await supabase.rpc("admin_daftar_email_belum_terkirim");
      if (qData) {
        const qRes = qData as { ok?: boolean; antrian?: AdminEmailQueueItem[] };
        if (qRes.ok && Array.isArray(qRes.antrian)) {
          setStudents(
            qRes.antrian.map((item) => ({
              ...item,
              email_terkirim: false,
            }))
          );
        }
      }
    } catch {
      // Abaikan jika RPC belum dieksekusi di database
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData, ringkasan?.belum_terkirim, ringkasan?.terkirim]);

  const handleKirimBatchClick = async () => {
    setLastBatchResult(null);
    try {
      await onKirimUlang();
      await loadData();
    } catch {
      // Error ditangani oleh parent admin page popup
    }
  };

  const handleManualRefresh = async () => {
    await onRefresh();
    await loadData();
  };

  // Kirim satu email spesifik (bisa untuk kirim pertama kali atau kirim ulang)
  const handleKirimSingle = async (nim: string, nama: string) => {
    setSendingSingleNim(nim);
    setLastBatchResult(null);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      const token = session?.access_token;
      if (!token) throw new Error("Sesi admin tidak ditemukan. Silakan login kembali.");

      const res = await fetch("/api/admin-kirim-email", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ target_nim: nim }),
      });

      const json = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) {
        throw new Error(json.error || "Gagal mengirimkan email.");
      }

      setLastBatchResult({
        pesan: `Bukti KRS berhasil dikirimkan ke email ${nama} (${nim}).`,
      });
      await onRefresh();
      await loadData();
    } catch (err) {
      setLastBatchResult({
        pesan: err instanceof Error ? err.message : "Gagal mengirimkan email.",
        isError: true,
      });
    } finally {
      setSendingSingleNim(null);
    }
  };

  // Tandai status sebagai sudah terkirim secara manual tanpa mengirim ke Brevo
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
      await loadData();
    } catch (err) {
      setLastBatchResult({
        pesan: err instanceof Error ? err.message : "Gagal menandai status email.",
        isError: true,
      });
    } finally {
      setProcessingNim(null);
    }
  };

  // Tandai semua mahasiswa antrian sebagai sudah terkirim
  const handleTandaiSemuaTerkirim = async () => {
    const belumCount = ringkasan?.belum_terkirim ?? 0;
    if (
      !confirm(
        `Tandai seluruh ${belumCount} mahasiswa dalam antrian sebagai SUDAH TERKIRIM (tanpa mengirim email)?`
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
        // Fallback: tandai satu per satu dari data lokal yang belum terkirim
        const pendingItems = students.filter(
          (s) => s.email && s.email !== "-" && !s.email_terkirim
        );
        for (const item of pendingItems) {
          await supabase.rpc("admin_tandai_email_terkirim", { p_nim: item.nim });
        }
      }
      setLastBatchResult({
        pesan: "Seluruh antrian email berhasil ditandai sebagai SUDAH TERKIRIM.",
      });
      await onRefresh();
      await loadData();
    } catch (err) {
      setLastBatchResult({
        pesan: err instanceof Error ? err.message : "Gagal menandai semua email.",
        isError: true,
      });
    } finally {
      setIsMarkingAll(false);
    }
  };

  // Filter data berdasarkan tab aktif & pencarian
  const filteredStudents = useMemo(() => {
    return students.filter((item) => {
      const hasEmail = Boolean(item.email && item.email.trim() !== "" && item.email.trim() !== "-");
      const isSent = Boolean(item.email_terkirim);

      // Filter Tab
      let matchTab = true;
      if (activeFilter === "terkirim") {
        matchTab = hasEmail && isSent;
      } else if (activeFilter === "belum_terkirim") {
        matchTab = hasEmail && !isSent;
      } else if (activeFilter === "tanpa_email") {
        matchTab = !hasEmail;
      }

      // Filter Search
      const q = search.toLowerCase().trim();
      const matchSearch =
        !q ||
        item.nim.toLowerCase().includes(q) ||
        item.nama.toLowerCase().includes(q) ||
        (item.email || "").toLowerCase().includes(q) ||
        (item.kelas || "").toLowerCase().includes(q);

      return matchTab && matchSearch;
    });
  }, [students, activeFilter, search]);

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
          padding: "1.65rem",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
          border: "1px solid var(--border-color)",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexWrap: "wrap", gap: "1.25rem" }}>
          <div>
            <h2 style={{ fontSize: "1.45rem", fontWeight: 800, margin: 0, color: "var(--text-color)", letterSpacing: "-0.01em" }}>
              Pemantauan & Pengiriman Email Bukti KRS
            </h2>
            <p style={{ margin: "0.45rem 0 0 0", fontSize: "0.925rem", color: "var(--text-muted)", maxWidth: 800, lineHeight: 1.55 }}>
              Status pengiriman bukti KRS seluruh mahasiswa. Anda dapat memeriksa pendaftar yang sudah menerima email, yang masih dalam antrian, maupun yang tidak mengisi email.
            </p>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleManualRefresh}
              disabled={isSending || loading}
              style={{ fontSize: "0.9rem", padding: "0.65rem 1.15rem", fontWeight: 700 }}
            >
              Refresh Status
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleKirimBatchClick}
              disabled={isSending || belumTerkirim === 0}
              style={{
                fontSize: "0.9rem",
                padding: "0.65rem 1.35rem",
                fontWeight: 700,
                backgroundColor: belumTerkirim === 0 ? "var(--text-light)" : "var(--primary)",
                borderColor: belumTerkirim === 0 ? "var(--border-color)" : "var(--primary-dark)",
                cursor: belumTerkirim === 0 ? "not-allowed" : "pointer",
              }}
            >
              {isSending
                ? "Mengirim Batch (maks 50)..."
                : `Kirim Ulang Antrian (${belumTerkirim > 50 ? "50 dari " + belumTerkirim : belumTerkirim})`}
            </button>
          </div>
        </div>

        {/* Notifikasi Hasil Aksi Terakhir */}
        {lastBatchResult && (
          <div
            className={`alert ${lastBatchResult.isError ? "alert-danger" : "alert-success"}`}
            style={{ marginTop: "1.25rem", marginBottom: 0, fontSize: "0.9rem", display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0.85rem 1.15rem" }}
          >
            <span style={{ fontWeight: 600 }}>{lastBatchResult.pesan}</span>
            <button
              type="button"
              onClick={() => setLastBatchResult(null)}
              style={{ background: "none", border: "none", fontSize: "1.1rem", cursor: "pointer", color: "inherit", padding: "0 0.5rem" }}
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 4 Kartu Statistik Interaktif (Besar, Jelas, Profesional) */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "1rem",
        }}
      >
        {/* Card 1: Total Terdaftar */}
        <div
          onClick={() => setActiveFilter("all")}
          className="card"
          style={{
            padding: "1.35rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: "#ffffff",
            border: activeFilter === "all" ? "2.5px solid var(--primary)" : "1px solid var(--border-color)",
            boxShadow: activeFilter === "all" ? "0 4px 14px rgba(16, 185, 129, 0.18)" : "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Klik untuk menampilkan seluruh pendaftar"
        >
          <div style={{ fontSize: "0.825rem", fontWeight: 800, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", justifyContent: "space-between" }}>
            <span>Total Terdaftar</span>
            {activeFilter === "all" && <span style={{ color: "var(--primary)", fontWeight: 800, textTransform: "none" }}>Aktif</span>}
          </div>
          <div style={{ fontSize: "2.35rem", fontWeight: 800, color: "var(--text-color)", marginTop: "0.4rem", lineHeight: 1.1 }}>
            {totalDaftar}
          </div>
          <div style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
            Seluruh mahasiswa yang telah mendaftar
          </div>
        </div>

        {/* Card 2: Sudah Terkirim */}
        <div
          onClick={() => setActiveFilter("terkirim")}
          className="card"
          style={{
            padding: "1.35rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: activeFilter === "terkirim" ? "#dcfce7" : "#f0fdf4",
            border: activeFilter === "terkirim" ? "2.5px solid #16a34a" : "1px solid #bbf7d0",
            boxShadow: activeFilter === "terkirim" ? "0 4px 14px rgba(22, 163, 74, 0.2)" : "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Klik untuk menampilkan mahasiswa yang emailnya sudah terkirim"
        >
          <div style={{ fontSize: "0.825rem", fontWeight: 800, color: "#166534", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", justifyContent: "space-between" }}>
            <span>Sudah Terkirim</span>
            {activeFilter === "terkirim" && <span style={{ color: "#15803d", fontWeight: 800, textTransform: "none" }}>Aktif</span>}
          </div>
          <div style={{ fontSize: "2.35rem", fontWeight: 800, color: "#15803d", marginTop: "0.4rem", lineHeight: 1.1 }}>
            {sudahTerkirim}
          </div>
          <div style={{ fontSize: "0.825rem", color: "#166534", marginTop: "0.35rem" }}>
            {totalDaftar > 0 ? Math.round((sudahTerkirim / totalDaftar) * 100) : 0}% dari seluruh pendaftar
          </div>
        </div>

        {/* Card 3: Belum Terkirim / Antrian */}
        <div
          onClick={() => setActiveFilter("belum_terkirim")}
          className="card"
          style={{
            padding: "1.35rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: activeFilter === "belum_terkirim" ? "#fef3c7" : belumTerkirim > 0 ? "#fffbeb" : "#ffffff",
            border: activeFilter === "belum_terkirim" ? "2.5px solid #d97706" : belumTerkirim > 0 ? "1px solid #fde68a" : "1px solid var(--border-color)",
            boxShadow: activeFilter === "belum_terkirim" ? "0 4px 14px rgba(217, 119, 6, 0.2)" : "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Klik untuk menampilkan mahasiswa yang emailnya belum terkirim"
        >
          <div style={{ fontSize: "0.825rem", fontWeight: 800, color: belumTerkirim > 0 ? "#b45309" : "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", justifyContent: "space-between" }}>
            <span>Belum Terkirim</span>
            {activeFilter === "belum_terkirim" && <span style={{ color: "#d97706", fontWeight: 800, textTransform: "none" }}>Aktif</span>}
          </div>
          <div style={{ fontSize: "2.35rem", fontWeight: 800, color: belumTerkirim > 0 ? "#d97706" : "var(--text-color)", marginTop: "0.4rem", lineHeight: 1.1 }}>
            {belumTerkirim}
          </div>
          <div style={{ fontSize: "0.825rem", color: belumTerkirim > 0 ? "#92400e" : "var(--text-muted)", marginTop: "0.35rem" }}>
            {belumTerkirim > 0 ? "Menunggu kirim ulang" : "Tidak ada antrian tertunda"}
          </div>
        </div>

        {/* Card 4: Tanpa Email */}
        <div
          onClick={() => setActiveFilter("tanpa_email")}
          className="card"
          style={{
            padding: "1.35rem",
            borderRadius: "var(--radius-lg)",
            backgroundColor: activeFilter === "tanpa_email" ? "#f1f5f9" : "#ffffff",
            border: activeFilter === "tanpa_email" ? "2.5px solid #64748b" : "1px solid var(--border-color)",
            boxShadow: activeFilter === "tanpa_email" ? "0 4px 14px rgba(100, 116, 139, 0.18)" : "none",
            cursor: "pointer",
            transition: "all 0.15s ease",
          }}
          title="Klik untuk menampilkan mahasiswa yang tidak mengisi email"
        >
          <div style={{ fontSize: "0.825rem", fontWeight: 800, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", justifyContent: "space-between" }}>
            <span>Tidak Mengisi Email</span>
            {activeFilter === "tanpa_email" && <span style={{ color: "#475569", fontWeight: 800, textTransform: "none" }}>Aktif</span>}
          </div>
          <div style={{ fontSize: "2.35rem", fontWeight: 800, color: "var(--text-muted)", marginTop: "0.4rem", lineHeight: 1.1 }}>
            {tanpaEmail}
          </div>
          <div style={{ fontSize: "0.825rem", color: "var(--text-muted)", marginTop: "0.35rem" }}>
            Hanya mengunduh bukti PDF / QR
          </div>
        </div>
      </div>

      {/* Tabel Data Mahasiswa & Status Pengiriman Email */}
      <div
        className="card"
        style={{
          padding: "1.65rem",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
          border: "1px solid var(--border-color)",
        }}
      >
        {/* Toolbar Atas: Filter Tabs + Search + Tombol Batch Tandai */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "1rem",
            marginBottom: "1.35rem",
            paddingBottom: "1.35rem",
            borderBottom: "1px solid var(--border-color)",
          }}
        >
          {/* Filter Tabs (Tanpa Icon, Tulisan Jelas & Lebih Besar) */}
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn ${activeFilter === "all" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveFilter("all")}
              style={{ fontSize: "0.875rem", padding: "0.5rem 1rem", fontWeight: 700 }}
            >
              Semua Mahasiswa ({totalDaftar})
            </button>
            <button
              type="button"
              className={`btn ${activeFilter === "terkirim" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveFilter("terkirim")}
              style={{
                fontSize: "0.875rem",
                padding: "0.5rem 1rem",
                fontWeight: 700,
                backgroundColor: activeFilter === "terkirim" ? "#16a34a" : undefined,
                borderColor: activeFilter === "terkirim" ? "#15803d" : undefined,
              }}
            >
              Sudah Terkirim ({sudahTerkirim})
            </button>
            <button
              type="button"
              className={`btn ${activeFilter === "belum_terkirim" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveFilter("belum_terkirim")}
              style={{
                fontSize: "0.875rem",
                padding: "0.5rem 1rem",
                fontWeight: 700,
                backgroundColor: activeFilter === "belum_terkirim" ? "#d97706" : undefined,
                borderColor: activeFilter === "belum_terkirim" ? "#b45309" : undefined,
              }}
            >
              Belum Terkirim ({belumTerkirim})
            </button>
            <button
              type="button"
              className={`btn ${activeFilter === "tanpa_email" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setActiveFilter("tanpa_email")}
              style={{ fontSize: "0.875rem", padding: "0.5rem 1rem", fontWeight: 700 }}
            >
              Tanpa Email ({tanpaEmail})
            </button>
          </div>

          {/* Search Box & Tombol Tandai Semua */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            {belumTerkirim > 0 && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleTandaiSemuaTerkirim}
                disabled={isMarkingAll || isSending || loading}
                style={{
                  fontSize: "0.85rem",
                  padding: "0.55rem 0.95rem",
                  fontWeight: 700,
                  whiteSpace: "nowrap",
                  backgroundColor: "#f8fafc",
                  borderColor: "var(--border-color)",
                }}
                title="Tandai seluruh mahasiswa yang belum terkirim sebagai sudah terkirim tanpa kirim email ke Brevo"
              >
                {isMarkingAll ? "Memproses..." : "Tandai Semua Sudah Terkirim"}
              </button>
            )}

            <div style={{ width: "100%", maxWidth: 300 }}>
              <input
                type="text"
                placeholder="Cari NIM, Nama, Email, Kelas..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: "100%",
                  padding: "0.55rem 0.95rem",
                  fontSize: "0.875rem",
                  borderRadius: "var(--radius-md)",
                  border: "1px solid var(--border-color)",
                  outline: "none",
                }}
              />
            </div>
          </div>
        </div>

        {/* Tabel Mahasiswa */}
        {loading ? (
          <div style={{ textAlign: "center", padding: "3.5rem 1rem" }}>
            <div className="spinner spinner-primary spinner-md" style={{ marginBottom: "0.75rem" }} />
            <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>Memuat data status email mahasiswa...</p>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div
            style={{
              textAlign: "center",
              padding: "3.5rem 1.5rem",
              backgroundColor: "#f8fafc",
              borderRadius: "var(--radius-lg)",
              border: "1px dashed var(--border-color)",
            }}
          >
            <h4 style={{ margin: 0, fontSize: "1.15rem", fontWeight: 700, color: "var(--text-color)" }}>
              {search.trim() ? "Tidak ada mahasiswa yang cocok dengan pencarian." : "Tidak Ada Data pada Kategori Ini"}
            </h4>
            <p style={{ margin: "0.4rem 0 0 0", fontSize: "0.9rem", color: "var(--text-muted)" }}>
              {search.trim()
                ? "Silakan coba kata kunci pencarian yang lain."
                : `Tidak ditemukan mahasiswa dengan status "${activeFilter.replace("_", " ")}".`}
            </p>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="table" style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ backgroundColor: "#f8fafc", borderBottom: "2px solid var(--border-color)", textAlign: "left" }}>
                  <th style={{ padding: "0.85rem 1rem", width: 50 }}>No</th>
                  <th style={{ padding: "0.85rem 1rem" }}>NIM</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Nama Mahasiswa</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Kelas</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Email Tujuan</th>
                  <th style={{ padding: "0.85rem 1rem" }}>Waktu Registrasi</th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "center" }}>Status Email</th>
                  <th style={{ padding: "0.85rem 1rem", textAlign: "center", minWidth: 170 }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((item, idx) => {
                  const hasEmail = Boolean(item.email && item.email.trim() !== "" && item.email.trim() !== "-");
                  const isSent = Boolean(item.email_terkirim);
                  const isProcessingThis = processingNim === item.nim || sendingSingleNim === item.nim;

                  return (
                    <tr
                      key={item.nim}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        backgroundColor: idx % 2 === 0 ? "#ffffff" : "#fdfefe",
                      }}
                    >
                      <td style={{ padding: "0.85rem 1rem", color: "var(--text-muted)" }}>{idx + 1}</td>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 700, fontFamily: "monospace", fontSize: "0.9rem" }}>{item.nim}</td>
                      <td style={{ padding: "0.85rem 1rem", fontWeight: 600 }}>{item.nama}</td>
                      <td style={{ padding: "0.85rem 1rem", color: "var(--text-muted)" }}>{item.kelas || "-"}</td>
                      <td style={{ padding: "0.85rem 1rem" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                          {hasEmail ? (
                            <span style={{ color: "var(--primary-dark)", fontWeight: 600 }}>{item.email}</span>
                          ) : (
                            <span style={{ color: "var(--text-light)", fontStyle: "italic" }}>Tidak ada email</span>
                          )}
                          <button
                            type="button"
                            onClick={() => setEditingStudent(item)}
                            className="btn btn-secondary"
                            style={{
                              fontSize: "0.75rem",
                              padding: "0.2rem 0.55rem",
                              fontWeight: 700,
                              lineHeight: 1.1,
                            }}
                            title="Edit alamat email mahasiswa ini"
                          >
                            Edit
                          </button>
                        </div>
                      </td>
                      <td style={{ padding: "0.85rem 1rem", color: "var(--text-muted)", fontSize: "0.825rem", whiteSpace: "nowrap" }}>
                        {item.registered_at || "-"}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
                        {isSent ? (
                          <span
                            className="badge badge-success"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem", fontWeight: 700 }}
                          >
                            Sudah Terkirim
                          </span>
                        ) : hasEmail ? (
                          <span
                            className="badge badge-warning"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem", fontWeight: 700 }}
                          >
                            Belum Terkirim
                          </span>
                        ) : (
                          <span
                            className="badge badge-secondary"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.75rem" }}
                          >
                            Tanpa Email
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "0.85rem 1rem", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "0.45rem", justifyContent: "center", flexWrap: "wrap" }}>
                          {hasEmail ? (
                            <>
                              {/* Tombol Kirim / Kirim Ulang */}
                              <button
                                type="button"
                                onClick={() => handleKirimSingle(item.nim, item.nama)}
                                disabled={isProcessingThis || isSending || isMarkingAll}
                                className="btn btn-secondary"
                                style={{
                                  fontSize: "0.8rem",
                                  padding: "0.3rem 0.75rem",
                                  fontWeight: 700,
                                  whiteSpace: "nowrap",
                                }}
                                title={isSent ? "Kirim ulang bukti KRS ke email ini" : "Kirimkan bukti KRS sekarang"}
                              >
                                {sendingSingleNim === item.nim ? "Mengirim..." : isSent ? "Kirim Ulang" : "Kirim Email"}
                              </button>

                              {/* Tombol Tandai Terkirim Manual jika belum */}
                              {!isSent && (
                                <button
                                  type="button"
                                  onClick={() => handleTandaiTerkirim(item.nim, item.nama)}
                                  disabled={isProcessingThis || isSending || isMarkingAll}
                                  className="btn btn-secondary"
                                  style={{
                                    fontSize: "0.8rem",
                                    padding: "0.3rem 0.75rem",
                                    backgroundColor: "#f0fdf4",
                                    borderColor: "#86efac",
                                    color: "#166534",
                                    fontWeight: 700,
                                    whiteSpace: "nowrap",
                                  }}
                                  title="Tandai status sebagai sudah terkirim tanpa mengirim email ke Brevo"
                                >
                                  {processingNim === item.nim ? "..." : "Tandai Terkirim"}
                                </button>
                              )}
                            </>
                          ) : (
                            /* Tombol Input Email jika mahasiswa belum mengisi email */
                            <button
                              type="button"
                              onClick={() => setEditingStudent(item)}
                              disabled={isProcessingThis || isSending || isMarkingAll}
                              className="btn btn-secondary"
                              style={{
                                fontSize: "0.8rem",
                                padding: "0.3rem 0.75rem",
                                fontWeight: 700,
                                whiteSpace: "nowrap",
                              }}
                              title="Masukkan email untuk mahasiswa ini agar bukti KRS dapat dikirimkan"
                            >
                              Input Email
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal Edit Email Mahasiswa */}
      {editingStudent && (
        <EditEmailModal
          isOpen={Boolean(editingStudent)}
          onClose={() => setEditingStudent(null)}
          nim={editingStudent.nim}
          nama={editingStudent.nama}
          kelas={editingStudent.kelas}
          currentEmail={editingStudent.email}
          onSuccess={handleEditSuccess}
        />
      )}
    </div>
  );
}
