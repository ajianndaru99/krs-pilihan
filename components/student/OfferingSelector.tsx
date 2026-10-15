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
        className="card"
        style={{
          position: "sticky",
          top: "0.5rem",
          zIndex: 100,
          backgroundColor: "rgba(255, 255, 255, 0.95)",
          backdropFilter: "blur(8px)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 10px 25px -5px rgba(0, 0, 0, 0.08), 0 8px 10px -6px rgba(0, 0, 0, 0.04)",
          border: "1.5px solid var(--primary-border)",
          padding: "0.85rem 1.4rem",
          marginBottom: "1.75rem",
          display: "flex",
          flexWrap: "wrap",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1.25rem", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Sisa Waktu Sesi
            </div>
            <div style={{ fontSize: "1.35rem", fontWeight: 800, color: timerColor, fontFamily: "var(--font-mono)" }}>
              {formatTimer(remainingSeconds)}
            </div>
          </div>

          <div style={{ height: 32, width: 1, backgroundColor: "var(--border-color)" }} />

          <div>
            <div style={{ fontSize: "0.72rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Status Pilihan
            </div>
            <div style={{ fontSize: "0.925rem", fontWeight: 700 }}>
              Matkul: <span style={{ color: matkulSelected === needMatkul ? "var(--success)" : "var(--primary)" }}>{matkulSelected}/{needMatkul}</span> | Proyek: <span style={{ color: proyekSelected === needProyek ? "var(--success)" : "var(--primary)" }}>{proyekSelected}/{needProyek}</span>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", flexWrap: "wrap" }}>
          {onRefreshQuota && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onRefreshQuota}
              disabled={isRefreshingQuota}
              style={{ fontSize: "0.85rem", padding: "0.6rem 0.9rem" }}
              title="Perbarui data kuota terkini"
            >
              {isRefreshingQuota ? (
                <>
                  <span className="spinner spinner-primary" style={{ width: 12, height: 12 }} />
                  <span>Memperbarui...</span>
                </>
              ) : (
                <span>Refresh Kuota</span>
              )}
            </button>
          )}

          <button
            type="button"
            className="btn btn-secondary"
            onClick={onLogout}
            style={{ fontSize: "0.85rem", padding: "0.6rem 1rem" }}
          >
            Keluar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitSelection}
            disabled={!isCompositionValid || isSubmitting}
            style={{ fontSize: "0.9rem", padding: "0.6rem 1.4rem" }}
          >
            {isSubmitting ? "Menyimpan..." : "Simpan Pilihan Final"}
          </button>
        </div>
      </div>

      {/* Grid Kartu Mata Kuliah */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1.25rem" }}>
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
                padding: "1.35rem",
                borderRadius: "var(--radius-lg)",
                border: isSelected
                  ? "2px solid var(--primary)"
                  : hasClashWithClass
                  ? "1.5px solid #fecaca"
                  : "1px solid var(--border-subtle)",
                backgroundColor: isSelected
                  ? "var(--primary-light)"
                  : hasClashWithClass
                  ? "#fff5f5"
                  : "#ffffff",
                transition: "all 0.18s ease",
                marginBottom: 0,
              }}
            >
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem", marginBottom: "0.65rem" }}>
                  <span
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      textTransform: "uppercase",
                      padding: "3px 10px",
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
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      padding: "3px 10px",
                      borderRadius: "var(--radius-full)",
                      backgroundColor: isFull ? "var(--danger-light)" : "var(--success-light)",
                      color: isFull ? "var(--danger)" : "var(--success)",
                      border: `1px solid ${isFull ? "var(--danger-border)" : "var(--success-border)"}`,
                    }}
                  >
                    Sisa Kuota: {item.sisa}/{item.kuota}
                  </span>
                </div>

                <h3 style={{ fontSize: "1.1rem", fontWeight: 800, color: "var(--text-main)", marginBottom: "0.35rem" }}>
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
                    padding: "0.75rem 0.85rem",
                    borderRadius: "var(--radius-md)",
                    fontSize: "0.825rem",
                    marginBottom: "1rem",
                    border: "1px solid var(--border-color)",
                  }}
                >
                  <div style={{ fontWeight: 700, color: "var(--text-muted)", marginBottom: "0.35rem", fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    Jadwal Pertemuan
                  </div>
                  {item.jadwal && item.jadwal.length > 0 ? (
                    item.jadwal.map((j, idx) => (
                      <div key={idx} style={{ color: "var(--text-body)", lineHeight: 1.5 }}>
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
                      fontWeight: 600,
                      color: "var(--danger)",
                      backgroundColor: "#fee2e2",
                      border: "1px solid #fecaca",
                      padding: "6px 10px",
                      borderRadius: "var(--radius-sm)",
                      marginBottom: "0.85rem",
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
                  style={{ width: "100%", justifyContent: "center", padding: "0.75rem" }}
                >
                  {isSelected ? "Terpilih" : isFull ? "Kuota Penuh" : "Pilih"}
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
