"use client";

import { useState } from "react";
import { SystemLogItem } from "@/lib/types";

interface SystemLogsViewerProps {
  logs: SystemLogItem[];
  onRefresh: () => void;
  onClearLogs?: () => void;
  isRefreshing?: boolean;
}

type FilterCategory = "all" | "mental" | "error" | "warning" | "success" | "info";

export function SystemLogsViewer({
  logs,
  onRefresh,
  onClearLogs,
  isRefreshing,
}: SystemLogsViewerProps) {
  const [filterCategory, setFilterCategory] = useState<FilterCategory>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLog, setSelectedLog] = useState<SystemLogItem | null>(null);
  const [sortField, setSortField] = useState<"waktu" | "level" | "mahasiswa">("waktu");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");

  const handleSort = (field: "waktu" | "level" | "mahasiswa") => {
    if (sortField === field) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortField(field);
      setSortOrder(field === "waktu" ? "desc" : "asc");
    }
  };

  // Helper pembeda Mental (kalah kuota / aturan pemilihan) vs Error teknis sistem/database
  const isMentalLog = (log: SystemLogItem): boolean => {
    const ev = (log.event_type || "").toUpperCase();
    const msg = (log.pesan || "").toLowerCase();
    return (
      ev.includes("MENTAL") ||
      msg.includes("mental") ||
      msg.includes("kuota") ||
      msg.includes("penuh") ||
      msg.includes("bentrok") ||
      msg.includes("pilihan harus")
    );
  };

  const mentalCount = logs.filter((l) => isMentalLog(l)).length;
  const sysErrorCount = logs.filter((l) => l.level === "error" && !isMentalLog(l)).length;
  const warningCount = logs.filter((l) => l.level === "warning" && !isMentalLog(l)).length;
  const successCount = logs.filter((l) => l.level === "success").length;
  const infoCount = logs.filter((l) => l.level === "info").length;

  const filteredLogs = logs.filter((log) => {
    if (filterCategory === "mental" && !isMentalLog(log)) return false;
    if (filterCategory === "error" && (log.level !== "error" || isMentalLog(log))) return false;
    if (filterCategory === "warning" && log.level !== "warning") return false;
    if (filterCategory === "success" && log.level !== "success") return false;
    if (filterCategory === "info" && log.level !== "info") return false;

    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      const matchNim = log.nim.toLowerCase().includes(term);
      const matchNama = log.nama.toLowerCase().includes(term);
      const matchPesan = log.pesan.toLowerCase().includes(term);
      const matchEvent = log.event_type.toLowerCase().includes(term);
      if (!matchNim && !matchNama && !matchPesan && !matchEvent) return false;
    }
    return true;
  });

  const sortedLogs = [...filteredLogs].sort((a, b) => {
    let cmp = 0;
    if (sortField === "mahasiswa") {
      const nameA = a.nama || a.nim || "";
      const nameB = b.nama || b.nim || "";
      cmp = nameA.localeCompare(nameB, "id");
    } else if (sortField === "level") {
      cmp = a.level.localeCompare(b.level, "id");
    } else if (sortField === "waktu") {
      const tA = new Date(a.created_at).getTime();
      const tB = new Date(b.created_at).getTime();
      cmp = tA - tB;
    }
    if (cmp === 0) {
      cmp = b.id - a.id;
    }
    return sortOrder === "asc" ? cmp : -cmp;
  });

  const getLogBadge = (log: SystemLogItem) => {
    if (isMentalLog(log)) {
      return {
        bg: "#fff7ed",
        color: "#c2410c",
        border: "#fed7aa",
        label: "🟠 MENTAL (KUOTA / ATURAN)",
      };
    }

    switch (log.level) {
      case "error":
        return {
          bg: "#fef2f2",
          color: "#991b1b",
          border: "#f87171",
          label: "🔴 ERROR SISTEM",
        };
      case "warning":
        return {
          bg: "#fffbeb",
          color: "#92400e",
          border: "#fcd34d",
          label: "🟡 PERINGATAN",
        };
      case "success":
        return {
          bg: "#f0fdf4",
          color: "#166534",
          border: "#86efac",
          label: "🟢 SUKSES",
        };
      default:
        return {
          bg: "#eff6ff",
          color: "#1e40af",
          border: "#93c5fd",
          label: "🔵 INFO",
        };
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Header Panel Kontrol Log */}
      <div
        className="card"
        style={{
          padding: "1.25rem 1.5rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <h2 style={{ fontSize: "1.15rem", fontWeight: 800, margin: 0, color: "var(--text-main)" }}>
              📋 Log Aktivitas Database & Notifikasi Sistem
            </h2>
            <span
              style={{
                fontSize: "0.725rem",
                fontWeight: 700,
                padding: "2px 8px",
                borderRadius: "var(--radius-full)",
                backgroundColor: "#f1f5f9",
                color: "#475569",
              }}
            >
              Total: {logs.length}
            </span>
          </div>
          <p style={{ margin: "4px 0 0 0", fontSize: "0.825rem", color: "var(--text-muted)" }}>
            Memantau seluruh transaksi pendaftaran, antrian, perubahan status, dan data yang mental/gagal secara real-time.
          </p>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onRefresh}
            disabled={isRefreshing}
            style={{ fontSize: "0.825rem", padding: "0.5rem 1rem" }}
          >
            {isRefreshing ? "Menyinkron..." : "🔄 Refresh Log"}
          </button>

          {onClearLogs && logs.length > 0 && (
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClearLogs}
              style={{
                fontSize: "0.825rem",
                padding: "0.5rem 0.85rem",
                color: "var(--danger)",
                borderColor: "var(--danger-border)",
              }}
            >
              Bersihkan Log
            </button>
          )}
        </div>
      </div>

      {/* Filter Chips & Pencarian */}
      <div
        className="card"
        style={{
          padding: "1rem 1.25rem",
          display: "flex",
          flexDirection: "column",
          gap: "0.85rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
          <div style={{ display: "flex", gap: "0.35rem", flexWrap: "wrap" }}>
            <button
              type="button"
              className={`btn btn-sm ${filterCategory === "all" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterCategory("all")}
              style={{ fontSize: "0.775rem", fontWeight: 700 }}
            >
              Semua ({logs.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterCategory === "mental" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterCategory("mental")}
              style={{
                fontSize: "0.775rem",
                fontWeight: 700,
                backgroundColor: filterCategory === "mental" ? "#ea580c" : undefined,
                color: filterCategory === "mental" ? "#ffffff" : "#c2410c",
                borderColor: filterCategory === "mental" ? "#ea580c" : "#fdba74",
              }}
            >
              🟠 Mental Kuota / Aturan ({mentalCount})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterCategory === "error" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterCategory("error")}
              style={{
                fontSize: "0.775rem",
                fontWeight: 700,
                backgroundColor: filterCategory === "error" ? "#dc2626" : undefined,
                color: filterCategory === "error" ? "#ffffff" : "#dc2626",
                borderColor: filterCategory === "error" ? "#dc2626" : "#fca5a5",
              }}
            >
              🔴 Error Sistem / DB ({sysErrorCount})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterCategory === "warning" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterCategory("warning")}
              style={{
                fontSize: "0.775rem",
                fontWeight: 700,
                backgroundColor: filterCategory === "warning" ? "#d97706" : undefined,
                color: filterCategory === "warning" ? "#ffffff" : "#d97706",
              }}
            >
              🟡 Peringatan ({warningCount})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterCategory === "success" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterCategory("success")}
              style={{
                fontSize: "0.775rem",
                fontWeight: 700,
                backgroundColor: filterCategory === "success" ? "#059669" : undefined,
                color: filterCategory === "success" ? "#ffffff" : "#059669",
              }}
            >
              🟢 Sukses ({successCount})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${filterCategory === "info" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setFilterCategory("info")}
              style={{ fontSize: "0.775rem", fontWeight: 700 }}
            >
              🔵 Info ({infoCount})
            </button>
          </div>

          <div style={{ position: "relative", minWidth: 260, flex: 1, maxWidth: 380 }}>
            <span
              style={{
                position: "absolute",
                left: "0.9rem",
                top: "50%",
                transform: "translateY(-50%)",
                fontSize: "0.85rem",
                color: "var(--text-muted)",
                pointerEvents: "none",
              }}
            >
              🔍
            </span>
            <input
              type="text"
              className="form-control"
              placeholder="Cari NIM, Nama, atau Pesan..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{
                fontSize: "0.825rem",
                padding: "0.55rem 0.95rem 0.55rem 2.25rem",
                borderRadius: "var(--radius-full)",
                backgroundColor: "#f8fafc",
                border: "1.5px solid var(--border-color)",
              }}
            />
          </div>
        </div>
      </div>

      {/* Tabel Log Aktivitas */}
      <div className="card" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.825rem", textAlign: "left" }}>
            <thead>
              <tr style={{ backgroundColor: "#f8fafc", borderBottom: "1.5px solid var(--border-color)" }}>
                <th
                  onClick={() => handleSort("waktu")}
                  style={{ padding: "10px 12px", width: 140, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  title="Urutkan Waktu"
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <span>Waktu</span>
                    <span style={{ fontSize: "0.8rem", color: sortField === "waktu" ? "#059669" : "#94a3b8", fontWeight: 800 }}>
                      {sortField === "waktu" ? (sortOrder === "desc" ? "▼" : "▲") : "⇅"}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort("level")}
                  style={{ padding: "10px 12px", width: 140, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  title="Urutkan Level"
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <span>Status / Level</span>
                    <span style={{ fontSize: "0.8rem", color: sortField === "level" ? "#059669" : "#94a3b8", fontWeight: 800 }}>
                      {sortField === "level" ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>
                <th
                  onClick={() => handleSort("mahasiswa")}
                  style={{ padding: "10px 12px", width: 160, cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                  title="Urutkan Mahasiswa"
                >
                  <div style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                    <span>Mahasiswa</span>
                    <span style={{ fontSize: "0.8rem", color: sortField === "mahasiswa" ? "#059669" : "#94a3b8", fontWeight: 800 }}>
                      {sortField === "mahasiswa" ? (sortOrder === "asc" ? "▲" : "▼") : "⇅"}
                    </span>
                  </div>
                </th>
                <th style={{ padding: "10px 12px", whiteSpace: "nowrap" }}>Keterangan Aktivitas</th>
                <th style={{ padding: "10px 12px", width: 80, textAlign: "center", whiteSpace: "nowrap" }}>Aksi</th>
              </tr>
            </thead>
            <tbody>
              {sortedLogs.length > 0 ? (
                sortedLogs.map((log) => {
                  const badge = getLogBadge(log);
                  const isMental = isMentalLog(log);
                  return (
                    <tr
                      key={log.id}
                      style={{
                        borderBottom: "1px solid var(--border-color)",
                        backgroundColor: isMental ? "#fffaf5" : log.level === "error" ? "#fff5f5" : undefined,
                      }}
                    >
                      <td style={{ padding: "8px 12px", color: "var(--text-muted)", fontSize: "0.775rem", whiteSpace: "nowrap" }}>
                        {log.created_at}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <span
                          style={{
                            fontSize: "0.68rem",
                            fontWeight: 800,
                            padding: "2px 7px",
                            borderRadius: "var(--radius-full)",
                            backgroundColor: badge.bg,
                            color: badge.color,
                            border: `1px solid ${badge.border}`,
                            whiteSpace: "nowrap",
                            display: "inline-block",
                          }}
                        >
                          {badge.label}
                        </span>
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        {log.nim !== "-" ? (
                          <div>
                            <strong style={{ color: "var(--text-main)", fontSize: "0.825rem" }}>{log.nim}</strong>
                            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>{log.nama}</div>
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Sistem</span>
                        )}
                      </td>
                      <td style={{ padding: "8px 12px" }}>
                        <div
                          style={{
                            color: isMental ? "#c2410c" : log.level === "error" ? "#991b1b" : "var(--text-main)",
                            fontWeight: isMental || log.level === "error" ? 600 : 400,
                            lineHeight: 1.4,
                          }}
                        >
                          {log.pesan}
                        </div>
                      </td>
                      <td style={{ padding: "8px 12px", textAlign: "center" }}>
                        {log.detail && Object.keys(log.detail).length > 0 ? (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => setSelectedLog(log)}
                            style={{ fontSize: "0.7rem", padding: "2px 6px" }}
                          >
                            Detail
                          </button>
                        ) : (
                          <span style={{ color: "var(--text-light)", fontSize: "0.75rem" }}>-</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={5} style={{ padding: "2.5rem 1rem", textAlign: "center", color: "var(--text-muted)" }}>
                    Tidak ada catatan log aktivitas yang cocok dengan filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Detail JSON */}
      {selectedLog && (
        <div className="modal-backdrop" onClick={() => setSelectedLog(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.1rem", fontWeight: 800, margin: 0 }}>
                Rincian Log #{selectedLog.id}
              </h3>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                onClick={() => setSelectedLog(null)}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: "0.85rem", fontSize: "0.85rem", lineHeight: 1.5 }}>
              <div><strong>Waktu:</strong> {selectedLog.created_at}</div>
              <div><strong>Status:</strong> {selectedLog.level.toUpperCase()}</div>
              <div><strong>Event:</strong> {selectedLog.event_type}</div>
              <div><strong>Mahasiswa:</strong> {selectedLog.nim} - {selectedLog.nama}</div>
              <div style={{ marginTop: "0.5rem" }}><strong>Pesan:</strong> {selectedLog.pesan}</div>
            </div>

            <div style={{ marginBottom: "1rem" }}>
              <strong style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Payload Detail:</strong>
              <pre
                style={{
                  backgroundColor: "#0f172a",
                  color: "#38bdf8",
                  padding: "0.75rem",
                  borderRadius: "var(--radius-md)",
                  fontSize: "0.75rem",
                  overflowX: "auto",
                  marginTop: "0.35rem",
                  maxHeight: 200,
                }}
              >
                {JSON.stringify(selectedLog.detail, null, 2)}
              </pre>
            </div>

            <button
              type="button"
              className="btn btn-primary btn-block"
              onClick={() => setSelectedLog(null)}
            >
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
