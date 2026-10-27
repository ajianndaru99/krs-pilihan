"use client";

import Image from "next/image";
import { AdminSystemStatus } from "@/lib/types";

interface AdminHeaderProps {
  portalOpen: boolean;
  status: AdminSystemStatus | null;
  onTogglePortal: () => void;
  onLogout: () => void;
  onRefresh?: () => void;
  onSapuSesi?: () => void;
  isRefreshing?: boolean;
  lastSyncTime?: string;
}

export function AdminHeader({
  portalOpen,
  status,
  onTogglePortal,
  onLogout,
  onRefresh,
  onSapuSesi,
  isRefreshing,
  lastSyncTime,
}: AdminHeaderProps) {
  // Format tanggal Indonesia formal (Reference Gambar 3)
  const todayFormatted = new Intl.DateTimeFormat("id-ID", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date());

  return (
    <div style={{ marginBottom: "1.75rem" }}>
      {/* Topbar Header (Reference Gambar 3) */}
      <header
        className="card"
        style={{
          marginBottom: "1.25rem",
          padding: "1.25rem 1.75rem",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1.25rem",
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <Image
            src="/logo-instiper.png"
            alt="Logo INSTIPER"
            width={40}
            height={40}
            priority
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", flexWrap: "wrap" }}>
              <h1 style={{ fontSize: "1.35rem", fontWeight: 800, margin: 0, color: "var(--text-main)", letterSpacing: "-0.02em" }}>
                Panel Kontrol Administrator
              </h1>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: portalOpen ? "var(--success-light)" : "var(--danger-light)",
                  color: portalOpen ? "var(--success)" : "var(--danger)",
                  border: `1px solid ${portalOpen ? "var(--success-border)" : "var(--danger-border)"}`,
                }}
              >
                {portalOpen ? "● PORTAL DIBUKA" : "○ PORTAL DITUTUP"}
              </span>
              <span
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  padding: "3px 10px",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "#f0fdf4",
                  color: "var(--primary)",
                  border: "1px solid #bbf7d0",
                }}
              >
                T.A. 2026/2027
              </span>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem", margin: 0 }}>
              Fakultas Pertanian INSTIPER Yogyakarta • Sistem KRS Pilihan
            </p>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              padding: "0.45rem 0.85rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--bg-subtle)",
              fontSize: "0.8rem",
              color: "var(--text-body)",
              fontWeight: 600,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", backgroundColor: "var(--success)", display: "inline-block" }} />
            <span>{todayFormatted}</span>
          </div>

          <div
            style={{
              fontSize: "0.75rem",
              color: "var(--text-muted)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              padding: "0.45rem 0.75rem",
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--bg-subtle)",
            }}
            title="Dashboard melakukan sinkronisasi otomatis ke database Supabase setiap 5 detik"
          >
            <span style={{ display: "inline-block", width: 6, height: 6, borderRadius: "50%", backgroundColor: "var(--success)" }} />
            {lastSyncTime ? `Live ${lastSyncTime}` : "Sinkron..."}
          </div>

          {onRefresh && (
            <button
              type="button"
              onClick={onRefresh}
              className="btn btn-secondary"
              style={{ fontSize: "0.85rem", padding: "0.6rem 1rem" }}
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
            style={{ fontSize: "0.85rem", padding: "0.6rem 1.15rem" }}
          >
            {portalOpen ? "Tutup Portal" : "Buka Portal"}
          </button>

          <button
            type="button"
            onClick={onLogout}
            className="btn btn-secondary"
            style={{ fontSize: "0.85rem", padding: "0.6rem 1rem" }}
          >
            Keluar
          </button>
        </div>
      </header>

      {/* 4 Soft Pastel KPI Stat Cards (Reference Gambar 3) */}
      {status && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            gap: "1rem",
            marginBottom: "1.5rem",
          }}
        >
          {/* Card 1: Total Mahasiswa (Soft Blue) */}
          <div className="stat-card stat-card-blue">
            <div className="stat-label">Total Mahasiswa</div>
            <div className="stat-value">{status.total_students ?? 0}</div>
            <div className="stat-sub">Mahasiswa Terdaftar Aktif</div>
          </div>

          {/* Card 2: Sudah Mendaftar (Soft Teal) */}
          <div className="stat-card stat-card-teal">
            <div className="stat-label">Sudah Mendaftar</div>
            <div className="stat-value">{status.sudah_daftar ?? status.total_registered ?? 0}</div>
            <div className="stat-sub">Selesai Memilih KRS</div>
          </div>

          {/* Card 3: Sesi Aktif Saat Ini (Soft Amber) */}
          <div className="stat-card stat-card-amber">
            <div className="stat-label">Sesi Aktif Memilih</div>
            <div className="stat-value">
              {status.active_queue ?? 0} <span style={{ fontSize: "1.25rem", opacity: 0.65 }}>/ {status.max_active ?? 30}</span>
            </div>
            <div className="stat-sub">Kapasitas Slot Bersamaan</div>
            {onSapuSesi && (status.active_queue ?? 0) > 0 && (
              <button
                type="button"
                onClick={onSapuSesi}
                disabled={isRefreshing}
                style={{
                  marginTop: "0.5rem",
                  padding: "3px 8px",
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  backgroundColor: "#ffffff",
                  color: "#b45309",
                  border: "1px solid #fde68a",
                  borderRadius: "var(--radius-sm)",
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                }}
                title="Bersihkan sesi mahasiswa yang sudah keluar atau idle"
              >
                <span>🧹</span>
                <span>Sapukan Sesi Tertahan</span>
              </button>
            )}
          </div>

          {/* Card 4: Antrian Menunggu (Soft Green) */}
          <div className="stat-card stat-card-green">
            <div className="stat-label">Antrian Menunggu</div>
            <div className="stat-value">{status.waiting_queue ?? 0}</div>
            <div className="stat-sub">Mahasiswa di Ruang Tunggu</div>
          </div>
        </div>
      )}
    </div>
  );
}
