"use client";

import { PortalPublicStatus } from "@/lib/types";
import { formatWIBDateTime, formatCountdown } from "@/lib/portal-schedule";

interface PortalStatusBannerProps {
  portalStatus: PortalPublicStatus | null;
  countdownSeconds: number | null;
  onRefresh?: () => void;
}

export function PortalStatusBanner({
  portalStatus,
  countdownSeconds,
  onRefresh,
}: PortalStatusBannerProps) {
  if (!portalStatus) return null;

  const phase = portalStatus.portal_phase;
  const note = portalStatus.portal_note?.trim();

  // 1. FASE UPCOMING: Menunggu Portal Dibuka Terjadwal
  if (phase === "upcoming") {
    const countdown = formatCountdown(countdownSeconds ?? 0);
    const pad = (n: number) => String(n).padStart(2, "0");

    return (
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-xl)",
          border: "1.5px solid #60a5fa",
          boxShadow: "0 10px 25px -5px rgba(59, 130, 246, 0.12), 0 8px 10px -6px rgba(59, 130, 246, 0.08)",
          padding: "1.25rem 1.15rem",
          marginBottom: "1.25rem",
          textAlign: "center",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Top Accent Strip */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: "4px",
            background: "linear-gradient(90deg, #3b82f6, #0ea5e9, #10b981)",
          }}
        />

        {/* Badge & Title */}
        <div
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            backgroundColor: "#eff6ff",
            color: "#1d4ed8",
            padding: "0.25rem 0.75rem",
            borderRadius: "9999px",
            fontSize: "0.75rem",
            fontWeight: 800,
            letterSpacing: "0.05em",
            textTransform: "uppercase",
            marginBottom: "0.6rem",
          }}
        >
          <span style={{ fontSize: "0.85rem" }}>⏳</span>
          <span>Portal Segera Dibuka</span>
        </div>

        <h3
          style={{
            fontSize: "1.05rem",
            fontWeight: 800,
            color: "#0f172a",
            margin: "0 0 0.35rem 0",
          }}
        >
          Hitung Mundur Pembukaan KRS
        </h3>

        <div
          style={{
            fontSize: "0.8rem",
            color: "#64748b",
            marginBottom: "0.85rem",
          }}
        >
          Jadwal Buka:{" "}
          <strong style={{ color: "#1e293b" }}>
            {formatWIBDateTime(portalStatus.scheduled_open_at)}
          </strong>
        </div>

        {/* Digit Boxes Display */}
        <div
          style={{
            display: "flex",
            justifyContent: "center",
            alignItems: "center",
            gap: "0.35rem",
            margin: "0.5rem 0 1rem 0",
          }}
        >
          {countdown.days > 0 && (
            <>
              <div style={boxStyle}>
                <div style={digitStyle}>{pad(countdown.days)}</div>
                <div style={labelStyle}>HARI</div>
              </div>
              <div style={separatorStyle}>:</div>
            </>
          )}

          <div style={boxStyle}>
            <div style={digitStyle}>{pad(countdown.hours)}</div>
            <div style={labelStyle}>JAM</div>
          </div>

          <div style={separatorStyle}>:</div>

          <div style={boxStyle}>
            <div style={digitStyle}>{pad(countdown.minutes)}</div>
            <div style={labelStyle}>MENIT</div>
          </div>

          <div style={separatorStyle}>:</div>

          <div style={boxStyle}>
            <div style={digitStyle}>{pad(countdown.seconds)}</div>
            <div style={labelStyle}>DETIK</div>
          </div>
        </div>

        {/* Pengumuman Admin jika ada */}
        {note && (
          <div
            style={{
              backgroundColor: "#f8fafc",
              border: "1px dashed #cbd5e1",
              borderRadius: "var(--radius-md)",
              padding: "0.55rem 0.75rem",
              fontSize: "0.8rem",
              color: "#334155",
              marginBottom: "0.75rem",
              textAlign: "left",
            }}
          >
            <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: "0.15rem", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <span>📢</span>
              <span>Catatan Prodi / Pengumuman:</span>
            </div>
            <div style={{ lineHeight: 1.45 }}>{note}</div>
          </div>
        )}

        <div
          style={{
            fontSize: "0.75rem",
            lineHeight: 1.45,
            backgroundColor: "#f0fdf4",
            border: "1px solid #bbf7d0",
            borderRadius: "var(--radius-md)",
            padding: "0.5rem 0.65rem",
            color: "#166534",
            fontWeight: 500,
          }}
        >
          💡 <strong>Tips:</strong> Anda sudah dapat melakukan <strong>Periksa NIM</strong> dan meninjau <strong>Jadwal &amp; Kuota</strong> terlebih dahulu. Tombol antrian akan terbuka otomatis saat hitung mundur selesai.
        </div>

        {onRefresh && (
          <div style={{ marginTop: "0.6rem" }}>
            <button
              type="button"
              onClick={onRefresh}
              style={{
                background: "none",
                border: "none",
                color: "#3b82f6",
                fontSize: "0.75rem",
                fontWeight: 600,
                cursor: "pointer",
                textDecoration: "underline",
              }}
            >
              Sinkronkan Waktu Server
            </button>
          </div>
        )}
      </div>
    );
  }

  // 2. FASE OPEN DENGAN JADWAL TUTUP
  if (phase === "open" && portalStatus.scheduled_close_at) {
    const countdown = formatCountdown(countdownSeconds ?? 0);

    return (
      <div
        style={{
          backgroundColor: "#fffbeb",
          borderRadius: "var(--radius-lg)",
          border: "1.5px solid #f59e0b",
          padding: "0.75rem 0.95rem",
          marginBottom: "1.15rem",
          fontSize: "0.8rem",
          color: "#92400e",
          display: "flex",
          flexDirection: "column",
          gap: "0.3rem",
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.4rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 800 }}>
            <span>⏱️</span>
            <span>PORTAL TERJADWAL BUKA</span>
          </div>
          <div
            style={{
              backgroundColor: "#fef3c7",
              border: "1px solid #fde68a",
              borderRadius: "var(--radius-sm)",
              padding: "0.15rem 0.5rem",
              fontWeight: 800,
              fontFamily: "monospace",
              fontSize: "0.85rem",
              color: "#b45309",
            }}
          >
            Sisa Waktu: {countdown.formatted}
          </div>
        </div>

        <div>
          Portal pemilihan akan ditutup otomatis pada{" "}
          <strong>{formatWIBDateTime(portalStatus.scheduled_close_at)}</strong>.
        </div>

        {note && (
          <div style={{ fontSize: "0.775rem", fontStyle: "italic", marginTop: "0.15rem", opacity: 0.9 }}>
            Catatan: {note}
          </div>
        )}
      </div>
    );
  }

  // 3. FASE CLOSED (Manual Tutup atau Melewati Jadwal Tutup)
  if (phase === "closed") {
    return (
      <div
        style={{
          backgroundColor: "#fef2f2",
          borderRadius: "var(--radius-lg)",
          border: "1.5px solid #ef4444",
          padding: "0.85rem 1rem",
          marginBottom: "1.15rem",
          fontSize: "0.825rem",
          color: "#991b1b",
          lineHeight: 1.45,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", fontWeight: 800, marginBottom: "0.25rem", color: "#dc2626" }}>
          <span>🔒</span>
          <span>PORTAL PEMILIHAN DITUTUP</span>
        </div>
        <div>
          {portalStatus.portal_mode === "scheduled" && portalStatus.scheduled_close_at ? (
            <>
              Portal pemilihan telah berakhir pada{" "}
              <strong>{formatWIBDateTime(portalStatus.scheduled_close_at)}</strong>.
            </>
          ) : (
            <>Portal pemilihan saat ini sedang ditutup oleh administrator prodi.</>
          )}
        </div>

        {note && (
          <div
            style={{
              marginTop: "0.4rem",
              padding: "0.4rem 0.6rem",
              backgroundColor: "#ffffff",
              borderRadius: "var(--radius-sm)",
              border: "1px solid #fecaca",
              fontSize: "0.775rem",
              color: "#7f1d1d",
            }}
          >
            📢 Catatan Admin: {note}
          </div>
        )}

        <div style={{ marginTop: "0.4rem", fontSize: "0.75rem", color: "#7f1d1d" }}>
          Mahasiswa yang sudah terdaftar tetap dapat memeriksa NIM untuk melihat dan mencetak bukti pendaftaran KRS.
        </div>
      </div>
    );
  }

  return null;
}

const boxStyle: React.CSSProperties = {
  backgroundColor: "#0f172a",
  color: "#ffffff",
  borderRadius: "10px",
  minWidth: "54px",
  padding: "0.45rem 0.35rem",
  boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -2px rgba(0, 0, 0, 0.1)",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
};

const digitStyle: React.CSSProperties = {
  fontSize: "1.35rem",
  fontWeight: 800,
  fontFamily: "monospace",
  lineHeight: 1.1,
  letterSpacing: "0.02em",
  color: "#38bdf8",
};

const labelStyle: React.CSSProperties = {
  fontSize: "0.55rem",
  fontWeight: 700,
  letterSpacing: "0.08em",
  color: "#94a3b8",
  marginTop: "2px",
};

const separatorStyle: React.CSSProperties = {
  fontSize: "1.25rem",
  fontWeight: 800,
  color: "#64748b",
  userSelect: "none",
  lineHeight: 1,
  paddingBottom: "10px",
};
