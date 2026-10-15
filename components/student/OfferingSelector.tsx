"use client";

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

  return (
    <div>
      {/* Floating Sticky Top Bar (Aman & Responsif di HP & Desktop) */}
      <div
        style={{
          position: "sticky",
          top: "0.5rem",
          zIndex: 100,
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.05)",
          border: "1px solid var(--border-color)",
          padding: "0.75rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "0.75rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Sisa Waktu Sesi
            </div>
            <div style={{ fontSize: "1.25rem", fontWeight: 800, color: timerColor, fontFamily: "var(--font-mono)" }}>
              ⏱️ {formatTimer(remainingSeconds)}
            </div>
          </div>

          <div style={{ height: 32, width: 1, backgroundColor: "var(--border-color)" }} />

          <div>
            <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
              Status Pilihan
            </div>
            <div style={{ fontSize: "0.9rem", fontWeight: 700 }}>
              Matkul: <span style={{ color: matkulSelected === needMatkul ? "var(--success)" : "var(--primary)" }}>{matkulSelected}/{needMatkul}</span> | Proyek: <span style={{ color: proyekSelected === needProyek ? "var(--success)" : "var(--primary)" }}>{proyekSelected}/{needProyek}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          {onRefreshQuota && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRefreshQuota}
              disabled={isRefreshingQuota}
              style={{ fontSize: "0.85rem", padding: "0.5rem 0.75rem" }}
              title="Perbarui data kuota terkini"
            >
              {isRefreshingQuota ? (
                <span className="spinner spinner-primary" style={{ width: 12, height: 12 }} />
              ) : (
                "↻ Kuota"
              )}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLogout}
            style={{ fontSize: "0.85rem", padding: "0.5rem 0.85rem" }}
          >
            Keluar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitSelection}
            disabled={!isCompositionValid || isSubmitting}
            style={{ fontSize: "0.9rem", padding: "0.5rem 1.25rem" }}
          >
            {isSubmitting ? "Menyimpan..." : "Simpan Pilihan Final →"}
          </button>
        </div>
      </div>

      {/* Grid Kartu Mata Kuliah */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
        {offerings.map((item) => {
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
                borderRadius: "var(--radius-md)",
                border: isSelected
                  ? "2px solid var(--primary)"
                  : hasClashWithClass
                  ? "1px solid #fecaca"
                  : "1px solid var(--border-color)",
                backgroundColor: isSelected
                  ? "var(--primary-light)"
                  : hasClashWithClass
                  ? "#fff5f5"
                  : "#ffffff",
                transition: "all 0.15s ease",
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.5rem" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: item.jenis === "matkul" ? "#e0f2fe" : "#fef3c7",
                      color: item.jenis === "matkul" ? "#0369a1" : "#b45309",
                    }}
                  >
                    {item.jenis === "matkul" ? "Mata Kuliah" : "Proyek Terapan"}
                  </span>

                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: isFull ? "var(--danger-light)" : "var(--success-light)",
                      color: isFull ? "var(--danger)" : "var(--success)",
                    }}
                  >
                    Sisa Kuota: {item.sisa}/{item.kuota}
                  </span>
                </div>

                <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-body)", marginBottom: "0.25rem" }}>
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
                    backgroundColor: isSelected ? "rgba(255,255,255,0.7)" : "var(--bg-subtle)",
                    padding: "0.6rem 0.75rem",
                    borderRadius: "var(--radius-sm)",
                    fontSize: "0.8rem",
                    marginBottom: "1rem",
                  }}
                >
                  <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                    📅 Jadwal Pertemuan:
                  </div>
                  {item.jadwal && item.jadwal.length > 0 ? (
                    item.jadwal.map((j, idx) => (
                      <div key={idx} style={{ color: "var(--text-body)" }}>
                        • {j.hari}, {j.jam_mulai} - {j.jam_selesai} {j.ruang ? `(${j.ruang})` : ""}
                      </div>
                    ))
                  ) : (
                    <span style={{ color: "var(--text-light)" }}>Belum ada jadwal terplot</span>
                  )}
                </div>

                {hasClashWithClass && (
                  <div
                    style={{
                      fontSize: "0.75rem",
                      color: "var(--danger)",
                      backgroundColor: "#fee2e2",
                      padding: "4px 8px",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "0.75rem",
                    }}
                  >
                    ⚠️ Bentrok dengan jadwal kelas tetap Anda
                  </div>
                )}
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => onToggleOffering(item)}
                  disabled={isFull && !isSelected}
                  className={isSelected ? "btn btn-primary" : "btn btn-secondary"}
                  style={{ width: "100%", justifyContent: "center" }}
                >
                  {isSelected ? "✓ Terpilih" : isFull ? "Kuota Penuh" : "+ Pilih"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
