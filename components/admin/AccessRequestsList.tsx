"use client";

import { useState } from "react";
import { AdminPengajuanItem } from "@/lib/types";

interface AccessRequestsListProps {
  requests: AdminPengajuanItem[];
  onApprove: (id: number, catatan?: string) => Promise<void>;
  onReject: (id: number, catatan: string) => Promise<void>;
  onReply: (id: number, catatan: string) => Promise<void>;
}

export function AccessRequestsList({
  requests,
  onApprove,
  onReject,
  onReply,
}: AccessRequestsListProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [activeModal, setActiveModal] = useState<{
    isOpen: boolean;
    type: "approve" | "reject" | "reply";
    item: AdminPengajuanItem | null;
  }>({
    isOpen: false,
    type: "reply",
    item: null,
  });
  const [catatanInput, setCatatanInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const filteredRequests = requests.filter((r) => {
    const matchStatus = filterStatus === "all" || r.status === filterStatus;
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      r.nim.toLowerCase().includes(q) ||
      r.nama.toLowerCase().includes(q) ||
      (r.alasan || "").toLowerCase().includes(q) ||
      (r.catatan_admin || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;

  const openModal = (type: "approve" | "reject" | "reply", item: AdminPengajuanItem) => {
    setActiveModal({ isOpen: true, type, item });
    setCatatanInput(
      type === "reply"
        ? item.catatan_admin || ""
        : type === "approve"
        ? item.catatan_admin || "Pengajuan akses Anda telah disetujui oleh Admin Akademik. Silakan masuk ke antrian untuk memilih mata kuliah."
        : "Pengajuan akses ditolak. Silakan datang langsung ke Loket Admin FAPERTA."
    );
    setErrorMsg("");
  };

  const closeModal = () => {
    setActiveModal({ isOpen: false, type: "reply", item: null });
    setCatatanInput("");
    setErrorMsg("");
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeModal.item) return;

    if (activeModal.type === "reject" && !catatanInput.trim()) {
      setErrorMsg("Alasan penolakan wajib diisi agar mahasiswa mengetahui kendalanya.");
      return;
    }
    if (activeModal.type === "reply" && !catatanInput.trim()) {
      setErrorMsg("Pesan balasan admin tidak boleh kosong.");
      return;
    }

    setSubmitting(true);
    setErrorMsg("");
    try {
      if (activeModal.type === "approve") {
        await onApprove(activeModal.item.id, catatanInput.trim() || undefined);
      } else if (activeModal.type === "reject") {
        await onReject(activeModal.item.id, catatanInput.trim());
      } else if (activeModal.type === "reply") {
        await onReply(activeModal.item.id, catatanInput.trim());
      }
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setErrorMsg(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="card" style={{ padding: "1.5rem", marginBottom: "1.5rem" }}>
      {/* Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          flexWrap: "wrap",
          gap: "1rem",
          marginBottom: "1.25rem",
        }}
      >
        <div>
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0, color: "var(--text-main)" }}>
            Verifikasi Pengajuan Akses Mahasiswa ({pendingCount} Menunggu)
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            Mahasiswa yang belum terdaftar di master data dapat mengajukan akses. Admin dapat menyetujui, menolak, atau memberikan balasan pesan.
          </p>
        </div>

        {/* Filter Pills Status */}
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "pending" ? "btn-warning" : "btn-secondary"}`}
            onClick={() => setFilterStatus("pending")}
            style={{ fontWeight: 600, fontSize: "0.75rem" }}
          >
            Menunggu ({pendingCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "approved" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilterStatus("approved")}
            style={{ fontWeight: 600, fontSize: "0.75rem" }}
          >
            Disetujui ({approvedCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "rejected" ? "btn-danger" : "btn-secondary"}`}
            onClick={() => setFilterStatus("rejected")}
            style={{ fontWeight: 600, fontSize: "0.75rem" }}
          >
            Ditolak ({rejectedCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "all" ? "btn-dark" : "btn-secondary"}`}
            onClick={() => setFilterStatus("all")}
            style={{ fontWeight: 600, fontSize: "0.75rem" }}
          >
            Semua ({requests.length})
          </button>
        </div>
      </div>

      {/* Search Input */}
      <div style={{ marginBottom: "1rem" }}>
        <input
          type="text"
          className="form-control"
          placeholder="Cari berdasarkan NIM, Nama, alasan, atau pesan admin..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: "0.85rem", padding: "0.5rem 0.85rem" }}
        />
      </div>

      {/* Tabel Data */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "8px 10px", width: 45 }}>No</th>
              <th style={{ padding: "8px 10px", width: 110 }}>NIM</th>
              <th style={{ padding: "8px 10px", width: 140 }}>Nama Lengkap</th>
              <th style={{ padding: "8px 10px", width: 80 }}>Kelas</th>
              <th style={{ padding: "8px 10px", minWidth: 160 }}>Alasan Mahasiswa</th>
              <th style={{ padding: "8px 10px", minWidth: 180 }}>Pesan Balasan Admin</th>
              <th style={{ padding: "8px 10px", width: 95 }}>Status</th>
              <th style={{ padding: "8px 10px", width: 150 }}>Aksi Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {filteredRequests.length > 0 ? (
              filteredRequests.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "8px 10px", textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ padding: "8px 10px", fontWeight: 700 }}>{item.nim}</td>
                  <td style={{ padding: "8px 10px" }}>{item.nama}</td>
                  <td style={{ padding: "8px 10px" }}>{item.kelas || "-"}</td>
                  <td style={{ padding: "8px 10px", fontSize: "0.8rem", color: "var(--text-main)" }}>
                    <div>{item.alasan}</div>
                    {item.kontak && item.kontak !== "-" && (
                      <div style={{ fontSize: "0.725rem", color: "var(--text-muted)", marginTop: "2px" }}>
                        Kontak: {item.kontak}
                      </div>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px", fontSize: "0.8rem" }}>
                    {item.status !== "pending" && item.catatan_admin ? (
                      <div
                        style={{
                          backgroundColor: "#f8fafc",
                          border: "1px solid var(--border-color)",
                          borderRadius: "var(--radius-sm)",
                          padding: "4px 8px",
                          color: "#334155",
                          lineHeight: 1.35,
                        }}
                      >
                        {item.catatan_admin}
                      </div>
                    ) : (
                      <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                        {item.status === "pending" ? "Menunggu tindakan (Setujui / Tolak)" : "Belum ada balasan"}
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <span
                      style={{
                        fontSize: "0.725rem",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        fontWeight: 700,
                        backgroundColor:
                          item.status === "approved"
                            ? "var(--success-light, #dcfce7)"
                            : item.status === "pending"
                            ? "var(--warning-light, #fef3c7)"
                            : "var(--danger-light, #fee2e2)",
                        color:
                          item.status === "approved"
                            ? "var(--success, #16a34a)"
                            : item.status === "pending"
                            ? "var(--warning, #d97706)"
                            : "var(--danger, #dc2626)",
                      }}
                    >
                      {item.status === "approved"
                        ? "DISETUJUI"
                        : item.status === "pending"
                        ? "MENUNGGU"
                        : "DITOLAK"}
                    </span>
                  </td>
                  <td style={{ padding: "8px 10px" }}>
                    <div style={{ display: "flex", gap: "4px", flexWrap: "wrap" }}>
                      {item.status === "pending" && (
                        <>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: "0.725rem", padding: "3px 7px" }}
                            onClick={() => openModal("approve", item)}
                            title="Setujui dan masukkan mahasiswa ke sistem"
                          >
                            ✓ Setujui
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger"
                            style={{ fontSize: "0.725rem", padding: "3px 7px" }}
                            onClick={() => openModal("reject", item)}
                            title="Tolak pengajuan akses mahasiswa"
                          >
                            ✕ Tolak
                          </button>
                        </>
                      )}
                      {item.status === "rejected" && (
                        <>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ fontSize: "0.725rem", padding: "3px 7px" }}
                            onClick={() => openModal("reply", item)}
                            title="Ubah pesan balasan ke mahasiswa"
                          >
                            💬 Ubah Pesan
                          </button>
                          <button
                            type="button"
                            className="btn btn-primary"
                            style={{ fontSize: "0.725rem", padding: "3px 7px" }}
                            onClick={() => openModal("approve", item)}
                            title="Setujui pengajuan ini sekarang"
                          >
                            ✓ Setujui
                          </button>
                        </>
                      )}
                      {item.status === "approved" && (
                        <span style={{ fontSize: "0.75rem", color: "var(--success)", fontWeight: 600 }}>
                          ✓ Aktif di Sistem
                        </span>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                  Tidak ada data pengajuan akses yang sesuai kriteria filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog Input Pesan Admin */}
      {activeModal.isOpen && activeModal.item && (
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
              maxWidth: 480,
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-lg)",
              padding: "1.5rem",
              boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.25)",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 700, margin: 0 }}>
                {activeModal.type === "approve"
                  ? "Setujui Pengajuan Akses (ACC)"
                  : activeModal.type === "reject"
                  ? "Tolak Pengajuan Akses"
                  : "Kirim Balasan Pesan Admin"}
              </h3>
              <button
                type="button"
                onClick={closeModal}
                disabled={submitting}
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

            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              Mahasiswa: <strong>{activeModal.item.nama}</strong> ({activeModal.item.nim}) — Kelas: {activeModal.item.kelas || "-"}
            </p>

            {errorMsg && (
              <div
                style={{
                  padding: "0.6rem 0.85rem",
                  backgroundColor: "#fee2e2",
                  border: "1px solid #f87171",
                  borderRadius: "var(--radius-md)",
                  color: "#b91c1c",
                  fontSize: "0.8rem",
                  marginBottom: "0.85rem",
                }}
              >
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmitModal}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label" style={{ fontSize: "0.825rem", fontWeight: 700 }}>
                  {activeModal.type === "approve"
                    ? "Catatan Admin untuk Mahasiswa (Opsional):"
                    : activeModal.type === "reject"
                    ? "Alasan Penolakan untuk Mahasiswa (Wajib):"
                    : "Pesan Balasan Admin (Akan Tampil Saat Mahasiswa Input NIM):"}
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder={
                    activeModal.type === "approve"
                      ? "Contoh: Pengajuan disetujui, silakan langsung login dan memilih KRS."
                      : activeModal.type === "reject"
                      ? "Contoh: Data belum terverifikasi di SIAKAD. Mohon bawa bukti KRS ke Loket Admin FAPERTA."
                      : "Tulis pesan balasan atau petunjuk bagi mahasiswa..."
                  }
                  value={catatanInput}
                  onChange={(e) => setCatatanInput(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  style={{ fontSize: "0.85rem" }}
                />
                <small style={{ color: "var(--text-muted)", fontSize: "0.75rem", display: "block", marginTop: "4px" }}>
                  Pesan ini akan otomatis tampil dalam Banner Alert saat mahasiswa memasukkan NIM di halaman login.
                </small>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.6rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={closeModal}
                  disabled={submitting}
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className={`btn ${
                    activeModal.type === "approve"
                      ? "btn-primary"
                      : activeModal.type === "reject"
                      ? "btn-danger"
                      : "btn-primary"
                  }`}
                  disabled={submitting}
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
                >
                  {submitting ? (
                    "Menyimpan..."
                  ) : activeModal.type === "approve" ? (
                    "Setujui & Daftarkan"
                  ) : activeModal.type === "reject" ? (
                    "Tolak Pengajuan"
                  ) : (
                    "Simpan Pesan Balasan"
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
