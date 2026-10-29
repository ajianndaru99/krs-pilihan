"use client";

import { useState } from "react";
import { StudentComplaintItem } from "@/lib/types";
import { formatWIBDateTime } from "@/lib/admin-adapter";

interface ComplaintManagerProps {
  complaints: StudentComplaintItem[];
  onResolveComplaint: (id: number, action: "reset_and_batal" | "reject", catatan?: string) => Promise<void>;
  onBulkResolveComplaint?: (ids: number[], action: "reset_and_batal" | "reject", catatan: string) => Promise<void>;
  onReplyComplaint?: (id: number, catatan: string) => Promise<void>;
  onSuccess: (msg: string) => void;
  onError: (msg: string) => void;
}

export function ComplaintManager({
  complaints,
  onResolveComplaint,
  onBulkResolveComplaint,
  onReplyComplaint,
  onSuccess,
  onError,
}: ComplaintManagerProps) {
  const [filterStatus, setFilterStatus] = useState<"all" | "pending" | "resolved" | "rejected">("pending");
  const [search, setSearch] = useState("");
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [activeModal, setActiveModal] = useState<{
    isOpen: boolean;
    type: "reset_and_batal" | "reject" | "reply" | "bulk_reset" | "bulk_reject";
    item: StudentComplaintItem | null;
  }>({
    isOpen: false,
    type: "reset_and_batal",
    item: null,
  });
  const [catatanInput, setCatatanInput] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState("");

  const filtered = complaints.filter((c) => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const q = search.toLowerCase().trim();
    const matchSearch =
      !q ||
      c.nim.toLowerCase().includes(q) ||
      c.nama.toLowerCase().includes(q) ||
      c.alasan.toLowerCase().includes(q) ||
      (c.catatan_admin || "").toLowerCase().includes(q);
    return matchStatus && matchSearch;
  });

  const pendingCount = complaints.filter((c) => c.status === "pending").length;
  const resolvedCount = complaints.filter((c) => c.status === "resolved").length;
  const rejectedCount = complaints.filter((c) => c.status === "rejected").length;

  const selectableIds = filtered.filter((c) => c.status === "pending").map((c) => c.id);
  const validSelectedIds = selectedIds.filter((id) =>
    complaints.some((c) => c.id === id && c.status === "pending")
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

  const openModal = (type: "reset_and_batal" | "reject" | "reply", item: StudentComplaintItem) => {
    setActiveModal({ isOpen: true, type, item });
    setCatatanInput(
      type === "reply"
        ? item.catatan_admin || ""
        : type === "reset_and_batal"
        ? item.catatan_admin || "Pendaftaran KRS Anda telah direset oleh Admin. Silakan masuk kembali untuk memilih ulang mata kuliah."
        : "Laporan kendala ditolak oleh Admin Akademik."
    );
    setModalError("");
  };

  const openBulkModal = (type: "bulk_reset" | "bulk_reject") => {
    if (validSelectedIds.length === 0) return;
    setActiveModal({ isOpen: true, type, item: null });
    setCatatanInput(
      type === "bulk_reset"
        ? "Pendaftaran KRS Anda telah direset oleh Admin. Silakan masuk kembali untuk memilih ulang mata kuliah."
        : "Laporan kendala ditolak oleh Admin Akademik."
    );
    setModalError("");
  };

  const closeModal = () => {
    setActiveModal({ isOpen: false, type: "reset_and_batal", item: null });
    setCatatanInput("");
    setModalError("");
  };

  const handleSubmitModal = async (e: React.FormEvent) => {
    e.preventDefault();

    const isBulk = activeModal.type === "bulk_reset" || activeModal.type === "bulk_reject";
    if (!isBulk && !activeModal.item) return;
    if (isBulk && validSelectedIds.length === 0) return;

    if (!catatanInput.trim()) {
      setModalError(
        activeModal.type === "reset_and_batal" || activeModal.type === "bulk_reset"
          ? "Balasan admin saat mereset KRS wajib diisi agar mahasiswa mengetahui tindak lanjutnya."
          : activeModal.type === "reject" || activeModal.type === "bulk_reject"
          ? "Alasan penolakan / balasan kendala wajib diisi agar mahasiswa paham."
          : "Pesan balasan admin tidak boleh kosong."
      );
      return;
    }

    setSubmitting(true);
    setModalError("");
    try {
      if ((activeModal.type === "reset_and_batal" || activeModal.type === "reject") && activeModal.item) {
        await onResolveComplaint(activeModal.item.id, activeModal.type, catatanInput.trim());
        setSelectedIds((prev) => prev.filter((id) => id !== activeModal.item?.id));
        if (activeModal.type === "reset_and_batal") {
          onSuccess(`Pendaftaran untuk ${activeModal.item.nama} (${activeModal.item.nim}) berhasil direset beserta pesan balasan admin.`);
        } else {
          onSuccess(`Laporan untuk ${activeModal.item.nama} (${activeModal.item.nim}) telah ditolak beserta pesan balasan admin.`);
        }
      } else if (activeModal.type === "reply" && activeModal.item) {
        if (onReplyComplaint) {
          await onReplyComplaint(activeModal.item.id, catatanInput.trim());
          onSuccess(`Pesan balasan untuk ${activeModal.item.nama} berhasil diperbarui.`);
        } else {
          await onResolveComplaint(activeModal.item.id, "reject", catatanInput.trim());
        }
      } else if (activeModal.type === "bulk_reset" || activeModal.type === "bulk_reject") {
        const actionType = activeModal.type === "bulk_reset" ? "reset_and_batal" : "reject";
        const count = validSelectedIds.length;
        if (onBulkResolveComplaint) {
          await onBulkResolveComplaint(validSelectedIds, actionType, catatanInput.trim());
        } else {
          for (const id of validSelectedIds) {
            await onResolveComplaint(id, actionType, catatanInput.trim());
          }
          onSuccess(
            actionType === "reset_and_batal"
              ? `${count} pendaftaran mahasiswa berhasil direset beserta pesan balasan admin.`
              : `${count} laporan kendala telah ditolak beserta pesan balasan admin.`
          );
        }
        setSelectedIds([]);
      }
      closeModal();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      setModalError(msg);
      onError(msg);
    } finally {
      setSubmitting(false);
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
                fontSize: "1.1rem",
              }}
            >
              ⚠️
            </span>
            <h2 style={{ fontSize: "1.25rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
              Laporan Kendala & Reset Mahasiswa
            </h2>
          </div>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.35rem", marginBottom: 0 }}>
            Pilih 1 atau banyak laporan sekaligus dengan mencentang kotak di kiri untuk mereset KRS (ACC) atau menolak dengan cepat.
          </p>
        </div>

        {/* Filter Badges */}
        <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "pending" ? "btn-warning" : "btn-secondary"}`}
            onClick={() => setFilterStatus("pending")}
            style={{ fontWeight: 600, fontSize: "0.8rem" }}
          >
            Menunggu Tindakan ({pendingCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "resolved" ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setFilterStatus("resolved")}
            style={{ fontWeight: 600, fontSize: "0.8rem" }}
          >
            Selesai / Direset ({resolvedCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "rejected" ? "btn-danger" : "btn-secondary"}`}
            onClick={() => setFilterStatus("rejected")}
            style={{ fontWeight: 600, fontSize: "0.8rem" }}
          >
            Ditolak ({rejectedCount})
          </button>
          <button
            type="button"
            className={`btn btn-sm ${filterStatus === "all" ? "btn-dark" : "btn-secondary"}`}
            onClick={() => setFilterStatus("all")}
            style={{ fontWeight: 600, fontSize: "0.8rem" }}
          >
            Semua ({complaints.length})
          </button>
        </div>
      </div>

      {/* Info Alert Box */}
      <div
        style={{
          backgroundColor: "#f8fafc",
          border: "1px solid var(--border-color)",
          borderRadius: "var(--radius-md)",
          padding: "0.85rem 1.15rem",
          marginBottom: "1.25rem",
          fontSize: "0.825rem",
          color: "var(--text-body)",
          display: "flex",
          gap: "0.6rem",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "1.1rem" }}>💡</span>
        <div>
          Menyetujui kendala dengan <strong>Reset KRS (ACC)</strong> akan otomatis membatalkan seluruh pilihan mata kuliah mahasiswa bersangkutan, mengembalikan kuota ke penawaran, dan mengirimkan pesan balasan agar mahasiswa dapat memilih ulang.
        </div>
      </div>

      {/* Search Input & Quick Select All */}
      <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap", marginBottom: "1rem" }}>
        <input
          type="text"
          className="form-control"
          placeholder="Cari berdasarkan NIM, Nama, atau isi alasan kendala..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ fontSize: "0.875rem", padding: "0.6rem 0.9rem", flex: "1 1 240px" }}
        />
        {selectableIds.length > 0 && (
          <button
            type="button"
            className="btn btn-sm btn-secondary"
            onClick={toggleSelectAllVisible}
            style={{ fontSize: "0.775rem", padding: "0.5rem 0.9rem", fontWeight: 700 }}
          >
            {isAllSelected
              ? `Batal Pilih Semua (${selectableIds.length})`
              : `☑️ Pilih Semua Menunggu (${selectableIds.length})`}
          </button>
        )}
      </div>

      {/* Bulk Action Bar ketika ada laporan yang dicentang */}
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
            <span>{validSelectedIds.length} Laporan Kendala Terpilih</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-sm btn-primary"
              onClick={() => openBulkModal("bulk_reset")}
              style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem", fontWeight: 700 }}
            >
              Reset KRS Terpilih ({validSelectedIds.length})
            </button>
            <button
              type="button"
              className="btn btn-sm btn-danger"
              onClick={() => openBulkModal("bulk_reject")}
              style={{ fontSize: "0.8rem", padding: "0.45rem 0.9rem", fontWeight: 700 }}
            >
              Tolak Terpilih ({validSelectedIds.length})
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

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "10px 10px", width: 40, textAlign: "center" }}>
                <input
                  type="checkbox"
                  checked={isAllSelected}
                  disabled={selectableIds.length === 0}
                  onChange={toggleSelectAllVisible}
                  title="Pilih semua laporan kendala yang menunggu"
                  style={{ width: 16, height: 16, cursor: selectableIds.length > 0 ? "pointer" : "default", accentColor: "var(--primary)" }}
                />
              </th>
              <th style={{ padding: "10px 10px", width: 45, textAlign: "center" }}>No</th>
              <th style={{ padding: "10px 10px", width: 120 }}>Waktu Lapor</th>
              <th style={{ padding: "10px 10px", width: 110 }}>NIM</th>
              <th style={{ padding: "10px 10px", width: 130 }}>Nama</th>
              <th style={{ padding: "10px 10px", minWidth: 150 }}>Kategori & Alasan</th>
              <th style={{ padding: "10px 10px", minWidth: 160 }}>Balasan / Catatan Admin</th>
              <th style={{ padding: "10px 10px", width: 130 }}>Kontak</th>
              <th style={{ padding: "10px 10px", width: 90, textAlign: "center" }}>Status</th>
              <th style={{ padding: "10px 10px", width: 150, textAlign: "center" }}>Aksi Admin</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((item, idx) => {
                const timeObj = formatWIBDateTime(item.created_at);
                const isPending = item.status === "pending";
                const isResolved = item.status === "resolved";
                const isSelected = validSelectedIds.includes(item.id);

                return (
                  <tr
                    key={item.id}
                    style={{
                      borderBottom: "1px solid var(--border-color)",
                      backgroundColor: isSelected ? "#f0fdf4" : undefined,
                    }}
                  >
                    <td style={{ padding: "10px 10px", textAlign: "center" }}>
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
                    <td style={{ padding: "10px 10px", textAlign: "center", color: "var(--text-muted)" }}>
                      {idx + 1}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                      <div style={{ fontWeight: 600, color: "var(--text-main)" }}>{timeObj.date}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                        {timeObj.time}
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                      {item.nim}
                    </td>
                    <td style={{ padding: "10px 10px" }}>
                      <div style={{ fontWeight: 600 }}>{item.nama}</div>
                      <div style={{ fontSize: "0.72rem", color: "var(--text-muted)" }}>
                        Kelas: {item.kelas || "-"}
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.8rem" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 6px",
                          borderRadius: "var(--radius-sm)",
                          fontSize: "0.7rem",
                          fontWeight: 700,
                          backgroundColor: "#f1f5f9",
                          color: "#475569",
                          marginBottom: "4px",
                        }}
                      >
                        {item.kategori === "salah_pilih"
                          ? "Salah Pilih Matkul"
                          : item.kategori === "salah_kelas"
                          ? "Salah Kelas"
                          : "Kendala Lainnya"}
                      </span>
                      <div style={{ color: "var(--text-body)", lineHeight: 1.35 }}>
                        {item.alasan}
                      </div>
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.8rem" }}>
                      {!isPending && item.catatan_admin ? (
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
                          {isPending ? "Menunggu tindakan (Reset / Tolak)" : "Belum ada balasan"}
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", fontSize: "0.8rem" }}>
                      {item.kontak ? (
                        <a
                          href={formatWhatsAppLink(item.kontak, item.nama, item.nim)}
                          target="_blank"
                          rel="noreferrer"
                          className="btn btn-sm btn-secondary"
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "5px",
                            padding: "3px 7px",
                            fontSize: "0.725rem",
                            textDecoration: "none",
                            color: "#059669",
                            borderColor: "#a7f3d0",
                            backgroundColor: "#ecfdf5",
                            fontWeight: 600,
                          }}
                        >
                          <span>WA: {item.kontak}</span>
                        </a>
                      ) : (
                        <span style={{ color: "var(--text-muted)" }}>-</span>
                      )}
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "center" }}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: "var(--radius-full)",
                          fontSize: "0.725rem",
                          fontWeight: 700,
                          backgroundColor: isPending
                            ? "var(--warning-light, #fef3c7)"
                            : isResolved
                            ? "var(--success-light, #dcfce7)"
                            : "var(--danger-light, #fee2e2)",
                          color: isPending
                            ? "var(--warning, #d97706)"
                            : isResolved
                            ? "var(--success, #16a34a)"
                            : "var(--danger, #dc2626)",
                        }}
                      >
                        {isPending ? "Menunggu" : isResolved ? "Selesai" : "Ditolak"}
                      </span>
                    </td>
                    <td style={{ padding: "10px 10px", textAlign: "center" }}>
                      <div style={{ display: "inline-flex", gap: "4px", flexWrap: "wrap", justifyContent: "center" }}>
                        {isPending && (
                          <>
                            <button
                              type="button"
                              className="btn btn-sm btn-primary"
                              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                              onClick={() => openModal("reset_and_batal", item)}
                              title="Setujui reset KRS dan kirim balasan ke mahasiswa"
                            >
                              Reset KRS
                            </button>
                            <button
                              type="button"
                              className="btn btn-sm btn-danger"
                              style={{ padding: "4px 8px", fontSize: "0.75rem" }}
                              onClick={() => openModal("reject", item)}
                              title="Tolak laporan kendala dan kirim alasan ke mahasiswa"
                            >
                              Tolak
                            </button>
                          </>
                        )}
                        {!isPending && (
                          <button
                            type="button"
                            className="btn btn-sm btn-secondary"
                            style={{ padding: "3px 6px", fontSize: "0.725rem" }}
                            onClick={() => openModal("reply", item)}
                            title="Ubah pesan balasan admin"
                          >
                            💬 Ubah Balasan
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            ) : (
              <tr>
                <td colSpan={10} style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: "1rem", fontWeight: 600 }}>Tidak ada laporan pengaduan ditemukan</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal Dialog Tindakan Admin Kendala */}
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
                {activeModal.type === "reset_and_batal"
                  ? "Setujui & Reset Pendaftaran (ACC)"
                  : activeModal.type === "bulk_reset"
                  ? `Setujui & Reset KRS ${validSelectedIds.length} Mahasiswa Sekaligus`
                  : activeModal.type === "reject"
                  ? "Tolak Pengaduan Kendala"
                  : activeModal.type === "bulk_reject"
                  ? `Tolak ${validSelectedIds.length} Pengaduan Kendala Sekaligus`
                  : "Ubah Balasan Pesan Kendala"}
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
              <>
                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "0.85rem" }}>
                  Mahasiswa: <strong>{activeModal.item.nama}</strong> ({activeModal.item.nim})
                </p>

                <div
                  style={{
                    backgroundColor: "#f8fafc",
                    border: "1px solid var(--border-color)",
                    borderRadius: "var(--radius-sm)",
                    padding: "8px 10px",
                    fontSize: "0.8rem",
                    color: "#475569",
                    marginBottom: "1rem",
                  }}
                >
                  <strong>Alasan Kendala:</strong> {activeModal.item.alasan}
                </div>
              </>
            ) : (
              <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
                Tindakan massal untuk <strong>{validSelectedIds.length} laporan kendala mahasiswa terpilih</strong>.
              </p>
            )}

            {modalError && (
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
                {modalError}
              </div>
            )}

            <form onSubmit={handleSubmitModal}>
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label" style={{ fontSize: "0.825rem", fontWeight: 700 }}>
                  {activeModal.type === "reset_and_batal" || activeModal.type === "bulk_reset"
                    ? "Balasan Admin untuk Mahasiswa (Wajib — Tampil Saat Cek NIM):"
                    : activeModal.type === "reject" || activeModal.type === "bulk_reject"
                    ? "Balasan / Alasan Penolakan untuk Mahasiswa (Wajib):"
                    : "Ubah Pesan Balasan Admin:"}
                </label>
                <textarea
                  className="form-control"
                  rows={4}
                  placeholder="Tulis pesan atau petunjuk tindak lanjut untuk mahasiswa..."
                  value={catatanInput}
                  onChange={(e) => setCatatanInput(e.target.value)}
                  disabled={submitting}
                  autoFocus
                  style={{ fontSize: "0.85rem" }}
                />
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
                    activeModal.type === "reset_and_batal" || activeModal.type === "bulk_reset"
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
                  ) : activeModal.type === "reset_and_batal" ? (
                    "Setujui & Reset KRS"
                  ) : activeModal.type === "bulk_reset" ? (
                    `Reset KRS ${validSelectedIds.length} Mahasiswa`
                  ) : activeModal.type === "reject" ? (
                    "Tolak Kendala"
                  ) : activeModal.type === "bulk_reject" ? (
                    `Tolak ${validSelectedIds.length} Laporan`
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
