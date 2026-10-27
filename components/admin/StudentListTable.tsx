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
  const [selectedStudentForEdit, setSelectedStudentForEdit] = useState<MasterStudentItem | null>(null);

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
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "10px 12px", width: 45, textAlign: "center" }}>No</th>
              <th style={{ padding: "10px 12px", width: 130 }}>NIM</th>
              <th style={{ padding: "10px 12px" }}>Nama Lengkap Mahasiswa</th>
              <th style={{ padding: "10px 12px", width: 110 }}>Kelas Tetap</th>
              <th style={{ padding: "10px 12px", width: 140, textAlign: "center" }}>Status KRS</th>
              <th style={{ padding: "10px 12px", width: 140, textAlign: "center" }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((item, idx) => (
                <tr key={item.nim} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "var(--text-muted)" }}>
                    {idx + 1}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                    {item.nim}
                  </td>
                  <td style={{ padding: "10px 12px", fontWeight: 600, color: "var(--text-main)" }}>
                    {item.nama}
                  </td>
                  <td style={{ padding: "10px 12px" }}>
                    <span
                      style={{
                        display: "inline-block",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: item.kelas && item.kelas !== "-" ? "var(--bg-subtle)" : "transparent",
                        border: item.kelas && item.kelas !== "-" ? "1px solid var(--border-color)" : "none",
                        fontSize: "0.8rem",
                        fontWeight: 600,
                        color: "var(--text-body)",
                      }}
                    >
                      {item.kelas || "-"}
                    </span>
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    {item.has_registered ? (
                      <span
                        style={{
                          display: "inline-block",
                          padding: "3px 9px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: "var(--primary-light)",
                          color: "var(--primary)",
                          border: "1px solid var(--primary-border)",
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
                          display: "inline-block",
                          padding: "3px 9px",
                          borderRadius: "var(--radius-full)",
                          backgroundColor: "var(--bg-subtle)",
                          color: "var(--text-muted)",
                          border: "1px solid var(--border-color)",
                          fontSize: "0.75rem",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        Belum Memilih
                      </span>
                    )}
                  </td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>
                    <div style={{ display: "inline-flex", gap: "5px", alignItems: "center", flexWrap: "wrap", justifyContent: "center" }}>
                      <button
                        type="button"
                        className="btn btn-sm btn-secondary"
                        style={{
                          padding: "3px 8px",
                          fontSize: "0.725rem",
                          borderRadius: "var(--radius-sm)",
                          color: "var(--primary)",
                          borderColor: "var(--primary-border)",
                          backgroundColor: "var(--primary-light)",
                          fontWeight: 600,
                        }}
                        onClick={() => setSelectedStudentForEdit(item)}
                      >
                        Edit
                      </button>

                      {item.has_registered && onBatalDaftar && (
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-danger"
                          style={{
                            padding: "3px 8px",
                            fontSize: "0.725rem",
                            borderRadius: "var(--radius-sm)",
                            fontWeight: 600,
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
                          className="btn btn-sm btn-outline-danger"
                          style={{
                            padding: "3px 7px",
                            fontSize: "0.725rem",
                            borderRadius: "var(--radius-sm)",
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
