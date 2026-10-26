"use client";

import { useState } from "react";
import { StudentComplaintItem } from "@/lib/types";
import { formatWIBDateTime } from "@/lib/admin-adapter";
import { AdminModal, AdminModalState } from "./AdminModal";

interface ComplaintManagerProps {
  complaints: StudentComplaintItem[];
  onResolveComplaint: (id: number, action: "reset_and_batal" | "reject", catatan?: string) => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function ComplaintManager({
  complaints,
  onResolveComplaint,
  onSuccess,
  onError,
}: ComplaintManagerProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "resolved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [modal, setModal] = useState<AdminModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  const filtered = complaints.filter((c) => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchSearch =
      c.nim.toLowerCase().includes(search.toLowerCase()) ||
      c.nama.toLowerCase().includes(search.toLowerCase()) ||
      c.alasan.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const pendingCount = complaints.filter((c) => c.status === "pending").length;
  const resolvedCount = complaints.filter((c) => c.status === "resolved").length;
  const rejectedCount = complaints.filter((c) => c.status === "rejected").length;

  const formatWhatsAppLink = (phone: string, nama: string, nim: string) => {
    let clean = phone.replace(/[^0-9]/g, "");
    if (clean.startsWith("0")) {
      clean = "62" + clean.slice(1);
    }
    const text = encodeURIComponent(
      `Halo ${nama} (${nim}), kami dari Tim Administrator KRS FAPERTA INSTIPER menindaklanjuti laporan kendala pemilihan Anda.`
    );
    return `https://wa.me/${clean}?text=${text}`;
  };

  const handleAction = (item: StudentComplaintItem, action: "reset_and_batal" | "reject") => {
    if (action === "reset_and_batal") {
      setModal({
        isOpen: true,
        type: "confirm",
        title: "Setujui & Reset Pendaftaran Mahasiswa",
        message: `Apakah Anda yakin ingin menyetujui pengaduan dan membatalkan pendaftaran untuk ${item.nama} (${item.nim})? Seluruh kuota mata kuliah yang dipilih mahasiswa ini akan dikembalikan ke sistem dan mahasiswa dapat langsung memilih ulang.`,
        confirmText: "Ya, Reset & Batalkan KRS",
        cancelText: "Batal",
        onConfirm: async () => {
          setModal((prev) => ({ ...prev, isOpen: false }));
          try {
            await onResolveComplaint(item.id, "reset_and_batal");
            onSuccess(`Pendaftaran untuk ${item.nama} (${item.nim}) berhasil direset. Mahasiswa kini dapat memilih ulang.`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Gagal mereset pendaftaran.";
            onError(msg);
          }
        },
      });
    } else {
      setModal({
        isOpen: true,
        type: "danger",
        title: "Tolak Pengaduan Mahasiswa",
        message: `Tolak laporan kendala untuk ${item.nama} (${item.nim})? Status pendaftaran mahasiswa saat ini akan tetap dipertahankan.`,
        confirmText: "Ya, Tolak Laporan",
        cancelText: "Batal",
        onConfirm: async () => {
          setModal((prev) => ({ ...prev, isOpen: false }));
          try {
            await onResolveComplaint(item.id, "reject");
            onSuccess(`Laporan untuk ${item.nama} (${item.nim}) telah ditandai ditolak.`);
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : "Gagal menolak laporan.";
            onError(msg);
          }
        },
      });
    }
  };

  return (
    <div className="card" style={{ padding: "1.75rem", marginBottom: "1.5rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                width: 32,
                height: 32,
                borderRadius: "var(--radius-md)",
                backgroundColor: "#fef3c7",
                color: "var(--warning)",
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </span>
            <h3 style={{ fontSize: "1.2rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
              Laporan Kendala & Reset Mahasiswa
            </h3>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.35rem", marginBottom: 0 }}>
            Daftar pengaduan dari mahasiswa yang sudah mendaftar namun mengalami salah pilih atau kendala teknis.
          </p>
        </div>

        {/* Filter Pills */}
        <div
          style={{
            display: "inline-flex",
            backgroundColor: "var(--bg-subtle)",
            padding: "4px",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-color)",
            flexWrap: "wrap",
            gap: "2px",
          }}
        >
          <button
            type="button"
            onClick={() => setFilterStatus("pending")}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.825rem",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: filterStatus === "pending" ? "#ffffff" : "transparent",
              color: filterStatus === "pending" ? "var(--warning)" : "var(--text-muted)",
              boxShadow: filterStatus === "pending" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Menunggu ({pendingCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("resolved")}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.825rem",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: filterStatus === "resolved" ? "#ffffff" : "transparent",
              color: filterStatus === "resolved" ? "var(--success)" : "var(--text-muted)",
              boxShadow: filterStatus === "resolved" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Selesai / Direset ({resolvedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("rejected")}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.825rem",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: filterStatus === "rejected" ? "#ffffff" : "transparent",
              color: filterStatus === "rejected" ? "var(--danger)" : "var(--text-muted)",
              boxShadow: filterStatus === "rejected" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Ditolak ({rejectedCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterStatus("all")}
            style={{
              padding: "0.45rem 1rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.825rem",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: filterStatus === "all" ? "#ffffff" : "transparent",
              color: filterStatus === "all" ? "var(--text-main)" : "var(--text-muted)",
              boxShadow: filterStatus === "all" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
            }}
          >
            Semua ({complaints.length})
          </button>
        </div>
      </div>

      {/* Search Bar */}
      <div style={{ marginBottom: "1.25rem" }}>
        <input
          type="text"
          className="form-control"
          placeholder="Cari berdasarkan NIM, Nama, atau isi alasan kendala..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "10px 12px", width: 50, textAlign: "center" }}>No</th>
              <th style={{ padding: "10px 12px", width: 140 }}>Waktu Lapor</th>
              <th style={{ padding: "10px 12px", width: 130 }}>NIM</th>
              <th style={{ padding: "10px 12px" }}>Nama Mahasiswa</th>
              <th style={{ padding: "10px 12px" }}>Kategori & Alasan Kendala</th>
              <th style={{ padding: "10px 12px", width: 160 }}>Kontak Mahasiswa</th>
              <th style={{ padding: "10px 12px", width: 110, textAlign: "center" }}>Status</th>
              <th style={{ padding: "10px 12px", width: 160, textAlign: "center" }}>Aksi Admin</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((item, idx) => {
                const timeObj = formatWIBDateTime(item.created_at);
                const isPending = item.status === "pending";
                const isResolved = item.status === "resolved";

                return (
                  <tr key={item.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-muted)" }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "10px 12px", fontSize: "0.8rem", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{timeObj.date}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {timeObj.time}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                      {item.nim}
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ fontWeight: 700, color: "var(--text-main)" }}>{item.nama}</div>
                      <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Kelas: {item.kelas || "-"}</div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      <div style={{ marginBottom: "0.25rem" }}>
                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 700,
                            padding: "2px 8px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: "#fef3c7",
                            color: "#b45309",
                          }}
                        >
                          {item.kategori === "salah_pilih"
                            ? "Salah Pilih Matkul"
                            : item.kategori === "tidak_sengaja_submit"
                            ? "Tidak Sengaja Submit"
                            : item.kategori === "bentrok_kegiatan"
                            ? "Bentrok Jadwal Wajib"
                            : item.kategori === "dibajak_orang_lain"
                            ? "Dipilihkan Orang Lain"
                            : "Kendala Lainnya"}
                        </span>
                      </div>
                      <div style={{ fontSize: "0.85rem", color: "var(--text-body)", lineHeight: 1.4 }}>
                        {item.alasan}
                      </div>
                    </td>
                    <td style={{ padding: "10px 12px" }}>
                      {item.kontak ? (
                        <a
                          href={formatWhatsAppLink(item.kontak, item.nama, item.nim)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-secondary"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            padding: "4px 8px",
                            fontSize: "0.75rem",
                            textDecoration: "none",
                            color: "#059669",
                            borderColor: "#a7f3d0",
                            backgroundColor: "#ecfdf5",
                            fontWeight: 600,
                          }}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                          </svg>
                          <span>{item.kontak}</span>
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 9px",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.725rem",
                          fontWeight: 700,
                          backgroundColor: isPending
                            ? "var(--warning-light)"
                            : isResolved
                            ? "var(--success-light)"
                            : "var(--danger-light)",
                          color: isPending
                            ? "var(--warning)"
                            : isResolved
                            ? "var(--success)"
                            : "var(--danger)",
                          border: `1px solid ${
                            isPending
                              ? "var(--warning-border)"
                              : isResolved
                              ? "var(--success-border)"
                              : "var(--danger-border)"
                          }`,
                        }}
                      >
                        {isPending ? "Menunggu" : isResolved ? "Selesai" : "Ditolak"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 12px", textAlign: "center" }}>
                      {isPending ? (
                        <div style={{ display: "inline-flex", gap: "6px", alignItems: "center" }}>
                          <button
                            type="button"
                            className="btn btn-sm btn-primary"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.725rem",
                              borderRadius: "var(--radius-sm)",
                            }}
                            onClick={() => handleAction(item, "reset_and_batal")}
                          >
                            Reset KRS
                          </button>
                          <button
                            type="button"
                            className="btn btn-sm btn-outline-danger"
                            style={{
                              padding: "4px 8px",
                              fontSize: "0.725rem",
                              borderRadius: "var(--radius-sm)",
                            }}
                            onClick={() => handleAction(item, "reject")}
                          >
                            Tolak
                          </button>
                        </div>
                      ) : (
                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          {item.catatan_admin || "Telah diproses"}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 600 }}>Tidak ada laporan pengaduan ditemukan</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminModal modal={modal} onClose={() => setModal((prev) => ({ ...prev, isOpen: false }))} />
    </div>
  );
}
