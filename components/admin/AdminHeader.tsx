"use client";

import Image from "next/image";
import { AdminSystemStatus } from "@/lib/types";

interface AdminHeaderProps {
  portalOpen: boolean;
  status: AdminSystemStatus | null;
  onTogglePortal: () => void;
  onLogout: () => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  lastSyncTime?: string;
}

export function AdminHeader({
  portalOpen,
  status,
  onTogglePortal,
  onLogout,
  onRefresh,
  isRefreshing,
  lastSyncTime,
}: AdminHeaderProps) {
  return (
    <header
      className="card"
      style={{
        marginBottom: "1.5rem",
        padding: "1.25rem 1.5rem",
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "space-between",
        alignItems: "center",
        gap: "1rem",
        backgroundColor: "#ffffff",
        borderTop: "4px solid var(--primary)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
        <Image
          src="/logo-instiper.png"
          alt="Logo INSTIPER"
          width={52}
          height={52}
          priority
          style={{ objectFit: "contain", flexShrink: 0 }}
        />
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
            <h1 style={{ fontSize: "1.3rem", fontWeight: 800, margin: 0 }}>
              Dashboard Admin KRS
            </h1>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "3px 10px",
              borderRadius: "var(--radius-full)",
              backgroundColor: portalOpen ? "var(--success-light)" : "var(--danger-light)",
              color: portalOpen ? "var(--success)" : "var(--danger)",
            }}
          >
            {portalOpen ? "● PORTAL DIBUKA" : "○ PORTAL DITUTUP"}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
            title="Dashboard melakukan sinkronisasi otomatis ke database Supabase setiap 5 detik"
          >
            <span style={{ display: "inline-block", width: 7, height: 7, borderRadius: "50%", backgroundColor: "var(--success)" }} />
            {lastSyncTime ? `Sinkron ${lastSyncTime}` : "Menyinkronkan..."}
          </span>
        </div>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Institut Pertanian STIPER — Fakultas Pertanian
        </p>
      </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
        {onRefresh && (
          <button
            type="button"
            onClick={onRefresh}
            className="btn btn-secondary"
            style={{ fontSize: "0.85rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
            disabled={isRefreshing}
            title="Perbarui data kuota & antrian sekarang"
          >
            {isRefreshing ? (
              <>
                <span className="spinner spinner-primary" style={{ width: 12, height: 12 }} />
                <span>Memperbarui...</span>
              </>
            ) : (
              <span>Refresh Data</span>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={onTogglePortal}
          className={portalOpen ? "btn btn-danger" : "btn btn-primary"}
          style={{ fontSize: "0.85rem" }}
        >
          {portalOpen ? "Tutup Portal Pemilihan" : "Buka Portal Pemilihan"}
        </button>

        <button
          type="button"
          onClick={onLogout}
          className="btn btn-secondary"
          style={{ fontSize: "0.85rem" }}
        >
          Keluar
        </button>
      </div>

      {status && (
        <div
          style={{
            width: "100%",
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))",
            gap: "0.75rem",
            marginTop: "0.5rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--border-color)",
          }}
        >
          <div style={{ padding: "0.5rem", backgroundColor: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Total Mahasiswa Terdaftar</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{status.total_students}</div>
          </div>
          <div style={{ padding: "0.5rem", backgroundColor: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Sudah Mendaftar</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--success)" }}>
              {status.sudah_daftar}
            </div>
          </div>
          <div style={{ padding: "0.5rem", backgroundColor: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Sesi Aktif Saat Ini</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--primary)" }}>
              {status.active_queue} / {status.max_active}
            </div>
          </div>
          <div style={{ padding: "0.5rem", backgroundColor: "var(--bg-subtle)", borderRadius: "var(--radius-sm)" }}>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Antrian Menunggu</div>
            <div style={{ fontSize: "1.25rem", fontWeight: 700, color: "var(--warning)" }}>
              {status.waiting_queue}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
