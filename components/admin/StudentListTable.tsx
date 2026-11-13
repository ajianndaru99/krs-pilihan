"use client";

import { useState } from "react";
import { MasterStudentItem } from "@/lib/types";
import { EditStudentModal } from "./EditStudentModal";

interface StudentListTableProps {
  students: MasterStudentItem[];
  kelasList: string[];
  onUpdateStudent: (nim: string, nama: string, kelas: string) => Promise<void>;
  onDeleteStudent?: (nim: string) => Promise<void>;
  onRequestDelete?: (student: MasterStudentItem) => void;
  onBatalDaftar?: (nim: string, nama: string) => Promise<void>;
}

type SortField = "nim" | "nama" | "kelas" | "status";
type SortOrder = "asc" | "desc";

export function StudentListTable({
  students,
  kelasList,
  onUpdateStudent,
  onRequestDelete,
  onBatalDaftar,
}: StudentListTableProps) {
  const [search, setSearch] = useState("");
  const [filterKelas, setFilterKelas] = useState("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "registered" | "not_registered">("all");
  const [sortField, setSortField] = useState<SortField>("nama");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<MasterStudentItem | null>(null);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder("asc");
    }
  };

  const filtered = students.filter((s) => {
    const matchSearch =
      s.nim.toLowerCase().includes(search.toLowerCase()) ||
      s.nama.toLowerCase().includes(search.toLowerCase());
    const matchKelas = filterKelas === "all" || s.kelas === filterKelas;
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "registered" && s.has_registered) ||
      (filterStatus === "not_registered" && !s.has_registered);

    return matchSearch && matchKelas && matchStatus;
  });

  const sortedStudents = [...filtered].sort((a, b) => {
    let cmp = 0;
    if (sortField === "nama") {
      cmp = a.nama.localeCompare(b.nama, "id");
    } else if (sortField === "nim") {
      cmp = a.nim.localeCompare(b.nim, "id", { numeric: true });
    } else if (sortField === "kelas") {
      cmp = (a.kelas || "").localeCompare(b.kelas || "", "id");
    } else if (sortField === "status") {
      const valA = a.has_registered ? 1 : 0;
      const valB = b.has_registered ? 1 : 0;
      cmp = valA - valB;
    }
    if (cmp === 0) {
      cmp = a.nim.localeCompare(b.nim, "id", { numeric: true });
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const registeredCount = students.filter((s) => s.has_registered).length;
  const notRegisteredCount = students.length - registeredCount;

  return (
    <div>
      {/* Filter and Search Bar */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.85rem",
          marginBottom: "1rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flex: 1, minWidth: 280, flexWrap: "wrap" }}>
          <input
            type="text"
            className="form-control"
            style={{ flex: 1, minWidth: 220 }}
            placeholder="Cari berdasarkan NIM atau Nama Mahasiswa..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-control"
            style={{ width: 170 }}
            value={filterKelas}
            onChange={(e) => setFilterKelas(e.target.value)}
          >
            <option value="all">Semua Kelas Tetap</option>
            {kelasList.map((k) => (
              <option key={k} value={k}>
                Kelas {k}
              </option>
            ))}
          </select>
          <select
            className="form-control"
            style={{ width: 170 }}
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value as "all" | "registered" | "not_registered")}
          >
            <option value="all">Semua Status KRS</option>
            <option value="registered">Sudah Memilih ({registeredCount})</option>
            <option value="not_registered">Belum Memilih ({notRegisteredCount})</option>
          </select>
        </div>

        <div style={{ fontSize: "0.825rem", color: "var(--text-muted)" }}>
          Menampilkan <strong>{filtered.length}</strong> dari <strong>{students.length}</strong> mahasiswa
        </div>
      </div>

      {/* Table */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "11px 12px", width: 50, textAlign: "center", fontSize: "0.78rem", fontWeight: 800, color: "var(--text-main)" }}>No</th>
              <th
                onClick={() => handleSort("nim")}
                style={{ padding: "11px 12px", width: 130, fontSize: "0.78rem", fontWeight: 800, color: "var(--text-main)", cursor: "pointer", userSelect: "none" }}
                title={`Urutkan NIM (${sortField === "nim" && sortOrder === "asc" ? "Z ke A" : "A ke Z"})`}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>NIM</span>
                  <span style={{ fontSize: "0.75rem", color: sortField === "nim" ? "var(--primary)" : "#94a3b8" }}>
                    {sortField === "nim" ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
                  </span>
                </div>
              </th>
              <th
                onClick={() => handleSort("nama")}
                style={{ padding: "11px 12px", fontSize: "0.78rem", fontWeight: 800, color: "var(--text-main)", cursor: "pointer", userSelect: "none" }}
                title={`Urutkan Nama Lengkap (${sortField === "nama" && sortOrder === "asc" ? "Z ke A (Z-A)" : "A ke Z (A-Z)"})`}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Nama Lengkap Mahasiswa</span>
                  <span style={{ fontSize: "0.75rem", color: sortField === "nama" ? "var(--primary)" : "#94a3b8" }}>
                    {sortField === "nama" ? (sortOrder === "asc" ? "▲ (A-Z)" : "▼ (Z-A)") : "⇅"}
                  </span>
                </div>
              </th>
              <th
                onClick={() => handleSort("kelas")}
                style={{ padding: "11px 12px", width: 125, textAlign: "center", fontSize: "0.78rem", fontWeight: 800, color: "var(--text-main)", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                title={`Urutkan Kelas Tetap (${sortField === "kelas" && sortOrder === "asc" ? "Z ke A" : "A ke Z"})`}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Kelas Tetap</span>
                  <span style={{ fontSize: "0.75rem", color: sortField === "kelas" ? "var(--primary)" : "#94a3b8" }}>
                    {sortField === "kelas" ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
                  </span>
                </div>
              </th>
              <th
                onClick={() => handleSort("status")}
                style={{ padding: "11px 12px", width: 150, textAlign: "center", fontSize: "0.78rem", fontWeight: 800, color: "var(--text-main)", whiteSpace: "nowrap", cursor: "pointer", userSelect: "none" }}
                title={`Urutkan Status KRS (${sortField === "status" && sortOrder === "asc" ? "Sudah Memilih dahulu" : "Belum Memilih dahulu"})`}
              >
                <div style={{ display: "inline-flex", alignItems: "center", gap: "4px" }}>
                  <span>Status KRS</span>
                  <span style={{ fontSize: "0.75rem", color: sortField === "status" ? "var(--primary)" : "#94a3b8" }}>
                    {sortField === "status" ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
                  </span>
                </div>
              </th>
              <th style={{ padding: "11px 12px", width: 230, textAlign: "center", fontSize: "0.78rem", fontWeight: 800, color: "var(--text-main)", whiteSpace: "nowrap" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {sortedStudents.length > 0 ? (
              sortedStudents.map((item, idx) => (
                <tr key={item.nim} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600 }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "var(--font-mono)", fontSize: "0.825rem", color: "var(--text-main)" }}>
                    {item.nim}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, fontSize: "0.85rem", color: "var(--text-main)" }}>
                    {item.nama}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <span
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        justifyContent: "center",
                        height: 26,
                        padding: "0 10px",
                        borderRadius: "var(--radius-full)",
                        backgroundColor: item.kelas && item.kelas !== "-" ? "#f8fafc" : "transparent",
                        border: item.kelas && item.kelas !== "-" ? "1px solid #cbd5e1" : "none",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        color: "#334155",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {item.kelas || "-"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    {item.has_registered ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: 26,
                          padding: "0 11px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: "#ecfdf5",
                          color: "#047857",
                          border: "1px solid #a7f3d0",
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Sudah Memilih
                      </span>
                    ) : (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          justifyContent: "center",
                          height: 26,
                          padding: "0 11px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: "#f8fafc",
                          color: "#64748b",
                          border: "1px solid #e2e8f0",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Belum Memilih
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center", whiteSpace: "nowrap" }}>
                    <div style={{ display: "inline-flex", gap: "6px", alignItems: "center", flexWrap: "nowrap", justifyContent: "center" }}>
                      <button
                        type="button"
                        className="btn btn-sm"
                        style={{
                          height: 28,
                          padding: "0 10px",
                          fontSize: "0.75rem",
                          borderRadius: "var(--radius-full)",
                          color: "#047857",
                          border: "1px solid #a7f3d0",
                          backgroundColor: "#ecfdf5",
                          fontWeight: 700,
                        }}
                        onClick={() => setSelectedStudentForEdit(item)}
                      >
                        Edit
                      </button>

                      {item.has_registered && onBatalDaftar && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            height: 28,
                            padding: "0 10px",
                            fontSize: "0.75rem",
                            borderRadius: "var(--radius-full)",
                            color: "#b45309",
                            border: "1px solid #fde68a",
                            backgroundColor: "#fffbeb",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                          onClick={() => onBatalDaftar(item.nim, item.nama)}
                          title="Batalkan pilihan KRS mahasiswa ini agar kuota kembali dan bisa memilih ulang"
                        >
                          Batal KRS
                        </button>
                      )}

                      {onRequestDelete && (
                        <button
                          type="button"
                          className="btn btn-sm"
                          style={{
                            height: 28,
                            padding: "0 10px",
                            fontSize: "0.75rem",
                            borderRadius: "var(--radius-full)",
                            color: "#dc2626",
                            border: "1px solid #fecaca",
                            backgroundColor: "#fef2f2",
                            fontWeight: 700,
                          }}
                          onClick={() => onRequestDelete(item)}
                        >
                          Hapus
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))

            ) : (
              <tr>
                <td colSpan={6} style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                  <div style={{ fontSize: "1.1rem", fontWeight: 600, marginBottom: "0.25rem" }}>
                    Tidak ada data mahasiswa ditemukan
                  </div>
                  <div style={{ fontSize: "0.85rem" }}>
                    Coba sesuaikan kata kunci pencarian atau ganti filter kelas.
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Edit Student Modal */}
      <EditStudentModal
        student={selectedStudentForEdit}
        kelasList={kelasList}
        isOpen={Boolean(selectedStudentForEdit)}
        onClose={() => setSelectedStudentForEdit(null)}
        onSave={onUpdateStudent}
      />
    </div>
  );
}
