"use client";

import { useState } from "react";
import { AdminPengajuanItem } from "@/lib/types";

interface AccessRequestsListProps {
  requests: AdminPengajuanItem[];
  onApprove: (id: number, catatan?: string) => Promise<void>;
  onReject: (id: number, catatan: string) => Promise<void>;
  onReply: (id: number, catatan: string) => Promise<void>;
  onBulkApprove?: (ids: number[], catatan?: string) => Promise<void>;
  onBulkReject?: (ids: number[], catatan: string) => Promise<void>;
}

export function AccessRequestsList({
  requests,
  onApprove,
  onReject,
  onReply,
  onBulkApprove,
  onBulkReject,
}: AccessRequestsListProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "approved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeModal, setActiveModal] = useState<{
    isOpen: boolean;
    type: "approve" | "reject" | "reply" | "bulk_approve" | "bulk_reject";
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

  const selectableIds = filteredRequests.filter((r) => r.status === "pending").map((r) => r.id);
  const validSelectedIds = selectedIds.filter((id) =>
    requests.some((r) => r.id === id && r.status === "pending")
  );
  const isAllSelected =
    selectableIds.length > 0 && selectableIds.every((id) => validSelectedIds.includes(id));

  const toggleSelectOne = (id: number) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleSelectAllVisible = () => {
    if (isAllSelected) {
      setSelectedIds((prev) => prev.filter((id) => !selectableIds.includes(id)));
    } else {
      setSelectedIds((prev) => Array.from(new Set([...prev, ...selectableIds])));
    }
  };

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

  const openBulkModal = (type: "bulk_approve" | "bulk_reject") => {
    if (validSelectedIds.length === 0) return;
    setActiveModal({ isOpen: true, type, item: null });
    setCatatanInput(
      type === "bulk_approve"
        ? "Pengajuan akses Anda telah disetujui oleh Admin Akademik. Silakan masuk ke antrian untuk memilih mata kuliah."
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

    const isBulk = activeModal.type === "bulk_approve" || activeModal.type === "bulk_reject";
    if (!isBulk && !activeModal.item) return;
    if (isBulk && validSelectedIds.length === 0) return;

    if (
      (activeModal.type === "reject" || activeModal.type === "bulk_reject") &&
      !catatanInput.trim()
    ) {
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
      if (activeModal.type === "approve" && activeModal.item) {
        await onApprove(activeModal.item.id, catatanInput.trim() || undefined);
        setSelectedIds((prev) => prev.filter((id) => id !== activeModal.item?.id));
      } else if (activeModal.type === "reject" && activeModal.item) {
        await onReject(activeModal.item.id, catatanInput.trim());
        setSelectedIds((prev) => prev.filter((id) => id !== activeModal.item?.id));
      } else if (activeModal.type === "reply" && activeModal.item) {
        await onReply(activeModal.item.id, catatanInput.trim());
      } else if (activeModal.type === "bulk_approve") {
        if (onBulkApprove) {
          await onBulkApprove(validSelectedIds, catatanInput.trim() || undefined);
        } else {
          for (const id of validSelectedIds) {
            await onApprove(id, catatanInput.trim() || undefined);
          }
        }
        setSelectedIds([]);
      } else if (activeModal.type === "bulk_reject") {
        if (onBulkReject) {
          await onBulkReject(validSelectedIds, catatanInput.trim());
        } else {
          for (const id of validSelectedIds) {
            await onReject(id, catatanInput.trim());
          }
        }
        setSelectedIds([]);
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
            Pilih 1 atau banyak mahasiswa sekaligus dengan mencentang kotak di kiri untuk menyetujui atau menolak pengajuan dengan cepat.
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

      {/* Search Input & Quick Select All */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <input
          type="text"
          className="form-control"
          placeholder="Cari berdasarkan NIM, Nama, alasan, atau pesan admin..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: "0.85rem", padding: "0.5rem 0.85rem", flex: "1 1 240px" }}
        />
        {selectableIds.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={toggleSelectAllVisible}
            style={{ fontSize: "0.775rem", padding: "0.45rem 0.85rem", fontWeight: 700 }}
          >
            {isAllSelected
              ? `Batal Pilih Semua (${selectableIds.length})`
              : `☑️ Pilih Semua Menunggu (${selectableIds.length})`}
          </button>
        )}
      </div>

      {/* Bulk Action Bar ketika ada mahasiswa yang dicentang */}
      {validSelectedIds.length > 0 && (
        <div
          style={{
            backgroundColor: "#ecfdf5",
            border: "1.5px solid #6ee7b7",
            borderRadius: "var(--radius-md)",
            padding: "0.75rem 1rem",
            marginBottom: "1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", fontWeight: 800, color: "#065f46", fontSize: "0.875rem" }}>
            <span>☑️</span>
            <span>{validSelectedIds.length} Pengajuan Mahasiswa Terpilih</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => openBulkModal("bulk_approve")}
              style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem", fontWeight: 700 }}
            >
              ✓ Setujui Terpilih ({validSelectedIds.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => openBulkModal("bulk_reject")}
              style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem", fontWeight: 700 }}
            >
              ✕ Tolak Terpilih ({validSelectedIds.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-secondary"
              onClick={() => setSelectedIds([])}
              style={{ fontSize: "0.775rem", padding: "0.45rem 0.75rem" }}
            >
              Batal Pilih
            </button>
          </div>
        </div>
      )}

      {/* Tabel Data */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "8px 10px", width: 40, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  disabled={selectableIds.length === 0}
                  onChange={toggleSelectAllVisible}
                  title="Pilih semua pengajuan yang menunggu"
                  style={{ width: 16, height: 16, cursor: selectableIds.length > 0 ? "pointer" : "default", accentColor: "var(--primary)" }}
                />
              </th>
              <th style={{ padding: "8px 10px", width: 45, textAlign: "center" }}>No</th>
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
              filteredRequests.map((item, idx) => {
                const isPending = item.status === "pending";
                const isSelected = validSelectedIds.includes(item.id);
                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      backgroundColor: isSelected ? "#f0fdf4" : undefined,
                    }}
                  >
                    <td style={{ padding: "8px 10px", textAlign: "center" }}>
                      {isPending ? (
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelectOne(item.id)}
                          style={{ width: 16, height: 16, cursor: "pointer", accentColor: "var(--primary)" }}
                        />
                      ) : (
                        <span style={{ color: "var(--text-light)", fontSize: "0.75rem" }}>—</span>
                      )}
                    </td>
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
                );
              })
            ) : (
              <tr>
                <td colSpan={9} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                  Tidak ada data pengajuan akses yang sesuai kriteria filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog Input Pesan Admin */}
      {activeModal.isOpen && (
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
                  : activeModal.type === "bulk_approve"
                  ? `Setujui ${validSelectedIds.length} Pengajuan Akses Sekaligus`
                  : activeModal.type === "reject"
                  ? "Tolak Pengajuan Akses"
                  : activeModal.type === "bulk_reject"
                  ? `Tolak ${validSelectedIds.length} Pengajuan Akses Sekaligus`
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

            {activeModal.item ? (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Mahasiswa: <strong>{activeModal.item.nama}</strong> ({activeModal.item.nim}) — Kelas: {activeModal.item.kelas || "-"}
              </p>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Tindakan massal untuk <strong>{validSelectedIds.length} mahasiswa terpilih</strong>.
              </p>
            )}

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
                  {activeModal.type === "approve" || activeModal.type === "bulk_approve"
                    ? "Catatan Balasan Admin untuk Mahasiswa:"
                    : activeModal.type === "reject" || activeModal.type === "bulk_reject"
                    ? "Alasan Penolakan untuk Mahasiswa (Wajib):"
                    : "Pesan Balasan Admin (Akan Tampil Saat Mahasiswa Input NIM):"}
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder={
                    activeModal.type === "approve" || activeModal.type === "bulk_approve"
                      ? "Contoh: Pengajuan disetujui, silakan langsung login dan memilih KRS."
                      : activeModal.type === "reject" || activeModal.type === "bulk_reject"
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
                  Pesan ini akan otomatis tampil saat mahasiswa mengecek NIM di halaman utama.
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
                    activeModal.type === "approve" || activeModal.type === "bulk_approve"
                      ? "btn-primary"
                      : activeModal.type === "reject" || activeModal.type === "bulk_reject"
                      ? "btn-danger"
                      : "btn-primary"
                  }`}
                  disabled={submitting}
                  style={{ fontSize: "0.85rem", padding: "0.5rem 1rem" }}
                >
                  {submitting ? (
                    "Memproses..."
                  ) : activeModal.type === "approve" ? (
                    "Setujui & Daftarkan"
                  ) : activeModal.type === "bulk_approve" ? (
                    `Setujui ${validSelectedIds.length} Pengajuan`
                  ) : activeModal.type === "reject" ? (
                    "Tolak Pengajuan"
                  ) : activeModal.type === "bulk_reject" ? (
                    `Tolak ${validSelectedIds.length} Pengajuan`
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
