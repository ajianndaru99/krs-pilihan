"use client";

import { Offering } from "@/lib/types";

interface SelectedOfferingsSummaryProps {
  selectedOfferings: Offering[];
  needMatkul: number;
  needProyek: number;
  onRemoveOffering: (offering: Offering) => void;
}

export function SelectedOfferingsSummary({
  selectedOfferings,
  needMatkul,
  needProyek,
  onRemoveOffering,
}: SelectedOfferingsSummaryProps) {
  const matkulCount = selectedOfferings.filter((o) => o.jenis === "matkul").length;
  const proyekCount = selectedOfferings.filter((o) => o.jenis === "proyek").length;
  const isComplete = matkulCount === needMatkul && proyekCount === needProyek;

  return (
    <div
      className="card"
      style={{
        backgroundColor: "#ffffff",
        borderRadius: "var(--radius-lg)",
        border: isComplete ? "1.5px solid var(--primary)" : "1.5px solid var(--primary-border)",
        boxShadow: "0 4px 15px -3px rgba(0, 0, 0, 0.05)",
        padding: "1rem 1.25rem",
        marginBottom: "1.5rem",
      }}
    >
      {/* Header Ringkasan */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          flexWrap: "wrap",
          gap: "0.5rem",
          marginBottom: selectedOfferings.length > 0 ? "0.85rem" : "0",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "1.1rem" }}>📋</span>
          <div>
            <h3
              style={{
                fontSize: "0.95rem",
                fontWeight: 700,
                color: "var(--text-title)",
                margin: 0,
              }}
            >
              Mata Kuliah & Proyek yang Dipilih ({selectedOfferings.length} dari {needMatkul + needProyek})
            </h3>
            <p style={{ fontSize: "0.75rem", color: "var(--text-muted)", margin: "2px 0 0" }}>
              Periksa pilihan Anda sebelum melakukan konfirmasi penyimpanan final
            </p>
          </div>
        </div>

        <div style={{ display: "flex", gap: "6px", alignItems: "center", flexWrap: "wrap" }}>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: "var(--radius-full)",
              backgroundColor: matkulCount === needMatkul ? "var(--primary-light)" : "#fef3c7",
              color: matkulCount === needMatkul ? "var(--primary)" : "#b45309",
              border: `1px solid ${matkulCount === needMatkul ? "var(--primary-border)" : "#fde68a"}`,
            }}
          >
            Matkul: {matkulCount}/{needMatkul}
          </span>
          <span
            style={{
              fontSize: "0.75rem",
              fontWeight: 700,
              padding: "3px 9px",
              borderRadius: "var(--radius-full)",
              backgroundColor: proyekCount === needProyek ? "var(--primary-light)" : "#fef3c7",
              color: proyekCount === needProyek ? "var(--primary)" : "#b45309",
              border: `1px solid ${proyekCount === needProyek ? "var(--primary-border)" : "#fde68a"}`,
            }}
          >
            Proyek: {proyekCount}/{needProyek}
          </span>
        </div>
      </div>

      {/* Keadaan Kosong (Belum Memilih) */}
      {selectedOfferings.length === 0 ? (
        <div
          style={{
            backgroundColor: "var(--bg-subtle)",
            border: "1.5px dashed var(--border-color)",
            borderRadius: "var(--radius-md)",
            padding: "1rem",
            textAlign: "center",
            marginTop: "0.75rem",
          }}
        >
          <p style={{ margin: 0, fontSize: "0.85rem", color: "var(--text-muted)" }}>
            Belum ada mata kuliah yang dipilih. Silakan klik tombol <strong>Pilih</strong> pada daftar mata kuliah di bawah.
          </p>
        </div>
      ) : (
        /* Daftar Kartu Pilihan Terpilih */
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(260px, 1fr))",
            gap: "0.75rem",
          }}
        >
          {selectedOfferings.map((item) => {
            const isMatkul = item.jenis === "matkul";
            const scheduleText =
              item.jadwal && item.jadwal.length > 0
                ? item.jadwal
                    .map(
                      (j) =>
                        `${j.hari}, ${j.jam_mulai.slice(0, 5)}-${j.jam_selesai.slice(0, 5)}${
                          j.ruang ? ` (${j.ruang})` : ""
                        }`
                    )
                    .join("; ")
                : "Jadwal belum ditentukan";

            return (
              <div
                key={item.id}
                style={{
                  backgroundColor: "#f8fafc",
                  border: "1px solid var(--border-color)",
                  borderRadius: "var(--radius-md)",
                  padding: "0.75rem 0.85rem",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  gap: "0.5rem",
                  position: "relative",
                  transition: "all 0.15s ease",
                }}
              >
                <div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: "0.5rem",
                      marginBottom: "0.35rem",
                    }}
                  >
                    <span
                      style={{
                        fontSize: "0.68rem",
                        fontWeight: 700,
                        textTransform: "uppercase",
                        letterSpacing: "0.04em",
                        padding: "2px 7px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: isMatkul ? "var(--primary-light)" : "#ede9fe",
                        color: isMatkul ? "var(--primary)" : "#6d28d9",
                        border: `1px solid ${isMatkul ? "var(--primary-border)" : "#ddd6fe"}`,
                      }}
                    >
                      {isMatkul ? `Matkul • Kelas ${item.kelas || "A"}` : "Proyek Terapan"}
                    </span>

                    <button
                      type="button"
                      onClick={() => onRemoveOffering(item)}
                      style={{
                        background: "none",
                        border: "none",
                        color: "var(--danger)",
                        fontSize: "0.75rem",
                        fontWeight: 700,
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                      title="Batalkan pilihan ini"
                    >
                      ✕ Batal
                    </button>
                  </div>

                  <div
                    style={{
                      fontSize: "0.875rem",
                      fontWeight: 700,
                      color: "var(--text-title)",
                      lineHeight: 1.3,
                      marginBottom: "0.35rem",
                    }}
                  >
                    {item.nama}
                  </div>
                </div>

                <div
                  style={{
                    fontSize: "0.725rem",
                    color: "var(--text-body)",
                    backgroundColor: "#ffffff",
                    padding: "4px 8px",
                    borderRadius: "var(--radius-sm)",
                    border: "1px solid var(--border-color)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  }}
                >
                  <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Jadwal:</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {scheduleText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
