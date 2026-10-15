"use client";

import { AdminPengajuanItem } from "@/lib/types";

interface AccessRequestsListProps {
  requests: AdminPengajuanItem[];
  onApprove: (id: number) => Promise<void>;
}

export function AccessRequestsList({ requests, onApprove }: AccessRequestsListProps) {
  return (
    <div className="card" style={{ padding: "1.5rem" }}>
      <div style={{ marginBottom: "1.25rem" }}>
        <h2 style={{ fontSize: "1.2rem", fontWeight: 700, margin: 0 }}>
          Verifikasi Pengajuan Akses Mahasiswa ({requests.filter((r) => r.status === "pending").length} Menunggu)
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Mahasiswa yang belum terdaftar di sistem dapat mengajukan permohonan akses mandiri.
        </p>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem", textAlign: "left" }}>
          <thead>
            <tr style={{ backgroundColor: "var(--bg-subtle)", borderBottom: "2px solid var(--border-color)" }}>
              <th style={{ padding: "8px 12px", width: 50 }}>No</th>
              <th style={{ padding: "8px 12px", width: 130 }}>NIM</th>
              <th style={{ padding: "8px 12px" }}>Nama Lengkap</th>
              <th style={{ padding: "8px 12px", width: 100 }}>Kelas</th>
              <th style={{ padding: "8px 12px" }}>Alasan Pengajuan</th>
              <th style={{ padding: "8px 12px", width: 130 }}>Kontak</th>
              <th style={{ padding: "8px 12px", width: 110 }}>Status</th>
              <th style={{ padding: "8px 12px", width: 120 }}>Aksi</th>
            </tr>
          </thead>
          <tbody>
            {requests.length > 0 ? (
              requests.map((item, idx) => (
                <tr key={item.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                  <td style={{ padding: "8px 12px", textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ padding: "8px 12px", fontWeight: 700 }}>{item.nim}</td>
                  <td style={{ padding: "8px 12px" }}>{item.nama}</td>
                  <td style={{ padding: "8px 12px" }}>{item.kelas || "-"}</td>
                  <td style={{ padding: "8px 12px", fontSize: "0.8rem" }}>{item.alasan}</td>
                  <td style={{ padding: "8px 12px", fontSize: "0.8rem" }}>{item.kontak || "-"}</td>
                  <td style={{ padding: "8px 12px" }}>
                    <span
                      style={{
                        fontSize: "0.75rem",
                        padding: "2px 8px",
                        borderRadius: "var(--radius-full)",
                        fontWeight: 600,
                        backgroundColor:
                          item.status === "approved"
                            ? "var(--success-light)"
                            : item.status === "pending"
                            ? "var(--warning-light)"
                            : "var(--danger-light)",
                        color:
                          item.status === "approved"
                            ? "var(--success)"
                            : item.status === "pending"
                            ? "var(--warning)"
                            : "var(--danger)",
                      }}
                    >
                      {item.status.toUpperCase()}
                    </span>
                  </td>
                  <td style={{ padding: "8px 12px" }}>
                    {item.status === "pending" ? (
                      <button
                        type="button"
                        className="btn btn-primary"
                        style={{ fontSize: "0.75rem", padding: "4px 8px" }}
                        onClick={() => onApprove(item.id)}
                      >
                        Setujui
                      </button>
                    ) : (
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Selesai</span>
                    )}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={8} style={{ padding: "2rem", textAlign: "center", color: "var(--text-muted)" }}>
                  Tidak ada pengajuan akses saat ini.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
