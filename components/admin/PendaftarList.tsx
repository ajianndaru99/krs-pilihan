"use client";

import { useState } from "react";
import * as XLSX from "xlsx";
import { PendaftarStudentItem } from "@/lib/types";
import { AdminModal, AdminModalState } from "@/components/admin/AdminModal";

interface PendaftarListProps {
  pendaftar: PendaftarStudentItem[];
  kelasList: string[];
}

export function PendaftarList({ pendaftar, kelasList }: PendaftarListProps) {
  const [search, setSearch] = useState("");
  const [filterKelas, setFilterKelas] = useState("all");
  const [modal, setModal] = useState<AdminModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  const filtered = pendaftar.filter((item) => {
    const matchSearch =
      item.nim.toLowerCase().includes(search.toLowerCase()) ||
      item.nama.toLowerCase().includes(search.toLowerCase());
    const matchKelas = filterKelas === "all" || item.kelas === filterKelas;
    return matchSearch && matchKelas;
  });

  const handleExportExcel = () => {
    if (pendaftar.length === 0) {
      setModal({
        isOpen: true,
        type: "warning",
        title: "Data Masih Kosong",
        message: "Belum ada data pendaftar yang dapat diekspor ke file Excel.",
      });
      return;
    }

    const rows: Record<string, string | number>[] = [];
    pendaftar.forEach((p) => {
      p.pilihan.forEach((opt, oIdx) => {
        rows.push({
          No: rows.length + 1,
          NIM: p.nim,
          Nama: p.nama,
          "Kelas Tetap": p.kelas || "-",
          "Pilihan Ke": oIdx + 1,
          "Mata Kuliah / Proyek": opt.nama,
          Jenis: opt.jenis,
          Topik: opt.topik || "-",
          "Waktu Registrasi": p.registered_at || "-",
        });
      });
    });

    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Pendaftar KRS");
    XLSX.writeFile(wb, `pendaftar_krs_${new Date().toISOString().slice(0, 10)}.xlsx`);
  };

  return (
    <div className="card" style={{ padding: "1.5rem" }}>
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
          <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
            📋 Data Mahasiswa Masuk ({filtered.length} Terpilih / Total {pendaftar.length})
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
            Daftar seluruh mahasiswa yang telah menyelesaikan pemilihan KRS secara sah.
          </p>
        </div>

        <button type="button" className="btn btn-primary" onClick={handleExportExcel}>
          📥 Ekspor Data ke Excel (.xlsx)
        </button>
      </div>

      <div style={{ display: "flex", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
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
          style={{ width: 180 }}
          value={filterKelas}
          onChange={(e) => setFilterKelas(e.target.value)}
        >
          <option value="all">Semua Kelas Tetap</option>
          {kelasList.map((k) => (
            <option key={k} value={k}>
              {k}
            </option>
          ))}
        </select>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "8px 12px", width: 50 }}>No</th>
              <th style={{ padding: "8px 12px", width: 130 }}>NIM</th>
              <th style={{ padding: "8px 12px" }}>Nama Mahasiswa</th>
              <th style={{ padding: "8px 12px", width: 110 }}>Kelas</th>
              <th style={{ padding: "8px 12px" }}>Mata Kuliah / Proyek Terpilih</th>
              <th style={{ padding: "8px 12px", width: 160 }}>Waktu Terdaftar</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length > 0 ? (
              filtered.map((item, idx) => (
                <tr key={item.nim} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700 }}>{item.nim}</td>
                  <td style={{ padding: "8px 12px" }}>{item.nama}</td>
                  <td style={{ padding: "8px 12px" }}>{item.kelas}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: "4px" }}>
                      {item.pilihan.map((p, pIdx) => (
                        <span
                          key={pIdx}
                          style={{
                            fontSize: "0.75rem",
                            padding: "2px 6px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: p.jenis === "matkul" ? "#e0f2fe" : "#fef3c7",
                            color: p.jenis === "matkul" ? "#0369a1" : "#b45309",
                          }}
                        >
                          {p.nama}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ padding: "8px 12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                    {item.registered_at || "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={6} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                  Belum ada data pendaftar yang cocok.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <AdminModal
        modal={modal}
        onClose={() => setModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
