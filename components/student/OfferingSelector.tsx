"use client";

import { useState } from "react";
import { Offering } from "@/lib/types";

interface OfferingSelectorProps {
  offerings: Offering[];
  selectedIds: number[];
  remainingSeconds: number | null;
  needMatkul: number;
  needProyek: number;
  isSubmitting: boolean;
  isRefreshingQuota?: boolean;
  onRefreshQuota?: () => void;
  onToggleOffering: (offering: Offering) => void;
  onSubmitSelection: () => void;
  onLogout: () => void;
}

export function OfferingSelector({
  offerings,
  selectedIds,
  remainingSeconds,
  needMatkul,
  needProyek,
  isSubmitting,
  isRefreshingQuota,
  onRefreshQuota,
  onToggleOffering,
  onSubmitSelection,
  onLogout,
}: OfferingSelectorProps) {
  const [quotaFilter, setQuotaFilter] = useState<"all" | "available" | "full">("all");

  const selectedOfferings = offerings.filter((o) => selectedIds.includes(o.id));
  const matkulSelected = selectedOfferings.filter((o) => o.jenis === "matkul").length;
  const proyekSelected = selectedOfferings.filter((o) => o.jenis === "proyek").length;

  const isCompositionValid = matkulSelected === needMatkul && proyekSelected === needProyek;

  // Format countdown mm:ss
  const formatTimer = (sec: number | null) => {
    if (sec === null || sec < 0) return "--:--";
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
  };

  const timerColor = remainingSeconds && remainingSeconds < 60 ? "var(--danger)" : "var(--primary)";

  const availableCount = offerings.filter((o) => o.sisa > 0).length;
  const fullCount = offerings.filter((o) => o.sisa <= 0).length;

  const filteredOfferings = offerings.filter((o) => {
    if (quotaFilter === "available") return o.sisa > 0;
    if (quotaFilter === "full") return o.sisa <= 0;
    return true;
  });

  return (
    <div className="has-mobile-bottom-bar">
      {/* Floating Sticky Top Bar */}
      <div
        className="card"
        style={{
          position: "sticky",
          top: "0.5rem",
          zIndex: 100,
          backgroundColor: "rgba(255, 255, 255, 0.96)",
          backdropFilter: "blur(10px)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
          border: "1.5px solid var(--primary-border)",
          padding: "0.85rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.85rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Sisa Waktu
            </div>
            <div style={{ fontSize: "1.3rem", fontWeight: 800, color: timerColor, fontFamily: "var(--font-mono)" }}>
              {formatTimer(remainingSeconds)}
            </div>
          </div>

          <div style={{ height: 28, width: 1, backgroundColor: "var(--border-color)" }} />

          <div>
            <div style={{ fontSize: "0.7rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Status Pilihan
            </div>
            <div style={{ fontSize: "0.875rem", fontWeight: 700 }}>
              Matkul: <span style={{ color: matkulSelected === needMatkul ? "var(--success)" : "var(--primary)" }}>{matkulSelected}/{needMatkul}</span> | Proyek: <span style={{ color: proyekSelected === needProyek ? "var(--success)" : "var(--primary)" }}>{proyekSelected}/{needProyek}</span>
            </div>
          </div>
        </div>

        {/* Filter Pills Kuota */}
        <div
          style={{
            display: "inline-flex",
            backgroundColor: "var(--bg-subtle)",
            padding: "3px",
            borderRadius: "var(--radius-full)",
            border: "1px solid var(--border-color)",
            gap: "2px",
          }}
        >
          <button
            type="button"
            onClick={() => setQuotaFilter("all")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.775rem",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: quotaFilter === "all" ? "#ffffff" : "transparent",
              color: quotaFilter === "all" ? "var(--text-main)" : "var(--text-muted)",
              boxShadow: quotaFilter === "all" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Semua ({offerings.length})
          </button>
          <button
            type="button"
            onClick={() => setQuotaFilter("available")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.775rem",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: quotaFilter === "available" ? "#ffffff" : "transparent",
              color: quotaFilter === "available" ? "var(--success)" : "var(--text-muted)",
              boxShadow: quotaFilter === "available" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Tersedia ({availableCount})
          </button>
          <button
            type="button"
            onClick={() => setQuotaFilter("full")}
            style={{
              padding: "0.35rem 0.75rem",
              borderRadius: "var(--radius-full)",
              border: "none",
              fontSize: "0.775rem",
              fontWeight: 700,
              cursor: "pointer",
              backgroundColor: quotaFilter === "full" ? "#ffffff" : "transparent",
              color: quotaFilter === "full" ? "var(--danger)" : "var(--text-muted)",
              boxShadow: quotaFilter === "full" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
            }}
          >
            Penuh ({fullCount})
          </button>
        </div>

        {/* Action Buttons (Desktop view) */}
        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {onRefreshQuota && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRefreshQuota}
              disabled={isRefreshingQuota}
              style={{ fontSize: "0.8rem", padding: "0.5rem 0.85rem" }}
              title="Perbarui kuota terkini"
            >
              {isRefreshingQuota ? "Memperbarui..." : "Refresh Kuota"}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLogout}
            style={{ fontSize: "0.8rem", padding: "0.5rem 0.85rem" }}
          >
            Keluar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitSelection}
            disabled={!isCompositionValid || isSubmitting}
            style={{ fontSize: "0.85rem", padding: "0.5rem 1.15rem" }}
          >
            {isSubmitting ? "Menyimpan..." : "Simpan Pilihan Final"}
          </button>
        </div>
      </div>

      {/* Grid Kartu Mata Kuliah */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(285px, 1fr))", gap: "1rem" }}>
        {filteredOfferings.map((item) => {
          const isSelected = selectedIds.includes(item.id);
          const isFull = item.sisa <= 0;
          const hasClashWithClass = Boolean(item.bentrok_kelas);

          return (
            <div
              key={item.id}
              className="card"
              style={{
                display: "flex",
                flexDirection: "column",
                justifyContent: "space-between",
                padding: "1.25rem",
                borderRadius: "var(--radius-lg)",
                border: isSelected
                  ? "2px solid var(--primary)"
                  : hasClashWithClass
                  ? "1.5px solid #fecaca"
                  : isFull
                  ? "1px solid #fed7aa"
                  : "1px solid var(--border-subtle)",
                backgroundColor: isSelected
                  ? "var(--primary-light)"
                  : hasClashWithClass
                  ? "#fff5f5"
                  : "#ffffff",
                transition: "all 0.18s ease",
                marginBottom: 0,
                opacity: isFull && !isSelected ? 0.9 : 1,
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.65rem" }}>
                  <span
                    style={{
                      fontSize: "0.725rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: item.jenis === "matkul" ? "#f0f7ff" : "#fffbeb",
                      color: item.jenis === "matkul" ? "#1e40af" : "#b45309",
                      border: `1px solid ${item.jenis === "matkul" ? "#dbeafe" : "#fef3c7"}`,
                    }}
                  >
                    {item.jenis === "matkul" ? "Mata Kuliah" : "Proyek Terapan"}
                  </span>

                  <span
                    style={{
                      fontSize: "0.725rem",
                      fontWeight: 800,
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: isFull ? "#fef2f2" : "var(--success-light)",
                      color: isFull ? "#dc2626" : "var(--success)",
                      border: `1px solid ${isFull ? "#fecaca" : "var(--success-border)"}`,
                      letterSpacing: "0.02em",
                    }}
                  >
                    {isFull ? `● KUOTA HABIS (0/${item.kuota})` : `Sisa Kuota: ${item.sisa}/${item.kuota}`}
                  </span>
                </div>

                <h3 style={{ fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.35rem", lineHeight: 1.35 }}>
                  {item.nama}
                </h3>
                {item.topik && (
                  <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "0.75rem" }}>
                    Topik: <strong>{item.topik}</strong>
                  </div>
                )}

                {/* Info Jadwal */}
                <div
                  style={{
                    backgroundColor: isSelected ? "rgba(255,255,255,0.85)" : "var(--bg-subtle)",
                    padding: "0.65rem 0.75rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.8rem",
                    marginBottom: "0.85rem",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.25rem", fontSize: "0.7rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Jadwal Pertemuan
                  </div>
                  {item.jadwal && item.jadwal.length > 0 ? (
                    item.jadwal.map((sch, schIdx) => (
                      <div key={schIdx} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0" }}>
                        <span style={{ fontWeight: 600 }}>{sch.hari}</span>
                        <span style={{ fontFamily: "var(--font-mono)", fontSize: "0.75rem" }}>
                          {sch.jam_mulai.slice(0, 5)} - {sch.jam_selesai.slice(0, 5)} {sch.ruang ? `(${sch.ruang})` : ""}
                        </span>
                      </div>
                    ))
                  ) : (
                    <span style={{ color: "var(--warning)", fontSize: "0.75rem", fontWeight: 600 }}>
                      ⚠️ Jadwal belum ditentukan
                    </span>
                  )}
                </div>

                {hasClashWithClass && (
                  <div
                    style={{
                      padding: "0.45rem 0.65rem",
                      backgroundColor: "#fee2e2",
                      color: "#b91c1c",
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    Bentrok dengan jadwal kelas tetap Anda
                  </div>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => onToggleOffering(item)}
                  disabled={isFull && !isSelected}
                  className={isSelected ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ width: "100%", justifyContent: "center", padding: "0.65rem", fontSize: "0.875rem" }}
                >
                  {isSelected ? "Terpilih ✓" : isFull ? "Kuota Penuh" : "Pilih Mata Kuliah"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Bar Khusus Layar HP (Thumb Zone Friendly) */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          backgroundColor: "rgba(255, 255, 255, 0.97)",
          backdropFilter: "blur(12px)",
          borderTop: "1.5px solid var(--primary-border)",
          padding: "0.75rem 1rem",
          boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div>
          <div style={{ fontSize: "0.675rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Total Terpilih: {selectedIds.length} / {needMatkul + needProyek}
          </div>
          <div style={{ fontSize: "0.85rem", fontWeight: 800, color: isCompositionValid ? "var(--success)" : "var(--primary)" }}>
            {isCompositionValid
              ? "Lengkap Siap Simpan ✓"
              : `${matkulSelected}/${needMatkul} Matkul, ${proyekSelected}/${needProyek} Proyek`}
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary"
          onClick={onSubmitSelection}
          disabled={!isCompositionValid || isSubmitting}
          style={{ minHeight: 46, padding: "0.65rem 1.25rem", fontSize: "0.875rem", fontWeight: 800, flexShrink: 0 }}
        >
          {isSubmitting ? "Menyimpan..." : "Simpan KRS Final"}
        </button>
      </div>
    </div>
  );
}
