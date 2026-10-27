"use client";

import { useState, useMemo } from "react";
import { Offering } from "@/lib/types";
import { SelectedOfferingsSummary } from "./SelectedOfferingsSummary";

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
  // Filter state
  const [selectedClassTab, setSelectedClassTab] = useState<string>("all");
  const [quotaFilter, setQuotaFilter] = useState<"all" | "available" | "full">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showSummaryDrawer, setShowSummaryDrawer] = useState<boolean>(false);

  const selectedOfferings = useMemo(
    () => offerings.filter((o) => selectedIds.includes(o.id)),
    [offerings, selectedIds]
  );

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

  // Hitung jumlah per tab kelas
  const classCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: offerings.length,
      A: 0,
      B: 0,
      C: 0,
      D: 0,
      E: 0,
      proyek: 0,
    };
    offerings.forEach((o) => {
      if (o.jenis === "proyek") {
        counts.proyek += 1;
      } else {
        const k = (o.kelas || "A").toUpperCase();
        if (counts[k] !== undefined) counts[k] += 1;
      }
    });
    return counts;
  }, [offerings]);

  // Filter gabungan (Tab Kelas + Kuota + Search)
  const filteredOfferings = useMemo(() => {
    return offerings.filter((o) => {
      // 1. Tab Kelas
      if (selectedClassTab === "proyek") {
        if (o.jenis !== "proyek") return false;
      } else if (selectedClassTab !== "all") {
        if (o.jenis === "proyek") return false;
        const k = (o.kelas || "A").toUpperCase();
        if (k !== selectedClassTab) return false;
      }

      // 2. Kuota
      if (quotaFilter === "available" && o.sisa <= 0) return false;
      if (quotaFilter === "full" && o.sisa > 0) return false;

      // 3. Pencarian
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNama = o.nama.toLowerCase().includes(q);
        const matchKelas = (o.kelas || "").toLowerCase().includes(q);
        if (!matchNama && !matchKelas) return false;
      }

      return true;
    });
  }, [offerings, selectedClassTab, quotaFilter, searchQuery]);

  const availableCount = offerings.filter((o) => o.sisa > 0).length;
  const fullCount = offerings.filter((o) => o.sisa <= 0).length;

  return (
    <div className="has-mobile-bottom-bar" style={{ paddingBottom: "5.5rem" }}>
      {/* 1. STICKY TOP CONTROLLER (Timer + Status + Action) */}
      <div
        className="card"
        style={{
          position: "sticky",
          top: "0.5rem",
          zIndex: 90,
          backgroundColor: "rgba(255, 255, 255, 0.98)",
          backdropFilter: "blur(12px)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 6px 20px -4px rgba(0, 0, 0, 0.08)",
          border: "1.5px solid var(--primary-border)",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.75rem",
          }}
        >
          {/* Sisa Waktu & Status Pemilihan */}
          <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
            <div>
              <div style={{ fontSize: "0.675rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Sisa Waktu
              </div>
              <div style={{ fontSize: "1.25rem", fontWeight: 800, color: timerColor, fontFamily: "var(--font-mono)", lineHeight: 1.1 }}>
                {formatTimer(remainingSeconds)}
              </div>
            </div>

            <div style={{ height: 26, width: 1, backgroundColor: "var(--border-color)" }} />

            <div>
              <div style={{ fontSize: "0.675rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Status Pilihan
              </div>
              <div style={{ fontSize: "0.825rem", fontWeight: 700 }}>
                Matkul:{" "}
                <span style={{ color: matkulSelected === needMatkul ? "var(--success)" : "var(--primary)" }}>
                  {matkulSelected}/{needMatkul}
                </span>{" "}
                • Proyek:{" "}
                <span style={{ color: proyekSelected === needProyek ? "var(--success)" : "var(--primary)" }}>
                  {proyekSelected}/{needProyek}
                </span>
              </div>
            </div>
          </div>

          {/* Tombol Aksi Cepat (Refresh, Keluar, Toggle Summary) */}
          <div style={{ display: "flex", gap: "0.4rem", alignItems: "center" }}>
            {onRefreshQuota && (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onRefreshQuota}
                disabled={isRefreshingQuota}
                style={{ fontSize: "0.75rem", padding: "0.45rem 0.65rem" }}
                title="Perbarui kuota terkini"
              >
                {isRefreshingQuota ? "..." : "Refresh Kuota"}
              </button>
            )}

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowSummaryDrawer(!showSummaryDrawer)}
              style={{
                fontSize: "0.75rem",
                padding: "0.45rem 0.75rem",
                backgroundColor: showSummaryDrawer ? "var(--primary-light)" : undefined,
                color: showSummaryDrawer ? "var(--primary)" : undefined,
                fontWeight: 700,
              }}
            >
              {showSummaryDrawer ? "Tutup Pilihan" : `Lihat Pilihan (${selectedIds.length})`}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={onLogout}
              style={{ fontSize: "0.75rem", padding: "0.45rem 0.65rem", color: "var(--danger)" }}
            >
              Keluar
            </button>
          </div>
        </div>

        {/* 2. STICKY HORIZONTAL CLASS TABS (A - E, Proyek, Semua) */}
        <div
          style={{
            marginTop: "0.75rem",
            paddingTop: "0.65rem",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
            overflowX: "auto",
            WebkitOverflowScrolling: "touch",
            scrollbarWidth: "none",
            msOverflowStyle: "none",
          }}
        >
          {[
            { id: "all", label: "Semua", count: classCounts.all },
            { id: "A", label: "Kelas A", count: classCounts.A },
            { id: "B", label: "Kelas B", count: classCounts.B },
            { id: "C", label: "Kelas C", count: classCounts.C },
            { id: "D", label: "Kelas D", count: classCounts.D },
            { id: "E", label: "Kelas E", count: classCounts.E },
            { id: "proyek", label: "Proyek Terapan", count: classCounts.proyek },
          ].map((tab) => {
            const isActive = selectedClassTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSelectedClassTab(tab.id)}
                style={{
                  flexShrink: 0,
                  padding: "0.4rem 0.85rem",
                  borderRadius: "var(--radius-full)",
                  border: isActive ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                  backgroundColor: isActive ? "var(--primary)" : "#ffffff",
                  color: isActive ? "#ffffff" : "var(--text-main)",
                  fontSize: "0.8rem",
                  fontWeight: isActive ? 800 : 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.35rem",
                }}
              >
                <span>{tab.label}</span>
                <span
                  style={{
                    fontSize: "0.7rem",
                    padding: "1px 5px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: isActive ? "rgba(255,255,255,0.25)" : "var(--bg-subtle)",
                    color: isActive ? "#ffffff" : "var(--text-muted)",
                  }}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* 3. QUICK SEARCH & QUOTA FILTER BAR */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            marginTop: "0.65rem",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 180, position: "relative" }}>
            <input
              type="text"
              className="form-control"
              placeholder="Cari nama mata kuliah..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                fontSize: "0.8rem",
                padding: "0.45rem 0.75rem",
                height: 36,
                backgroundColor: "#f8fafc",
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute",
                  right: 8,
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  fontSize: "0.85rem",
                  padding: 2,
                }}
              >
                ✕
              </button>
            )}
          </div>

          <div
            style={{
              display: "inline-flex",
              backgroundColor: "var(--bg-subtle)",
              padding: "2px",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border-color)",
              gap: "2px",
              flexShrink: 0,
            }}
          >
            <button
              type="button"
              onClick={() => setQuotaFilter("all")}
              style={{
                padding: "0.3rem 0.65rem",
                borderRadius: "var(--radius-full)",
                border: "none",
                fontSize: "0.725rem",
                fontWeight: 700,
                cursor: "pointer",
                backgroundColor: quotaFilter === "all" ? "#ffffff" : "transparent",
                color: quotaFilter === "all" ? "var(--text-main)" : "var(--text-muted)",
                boxShadow: quotaFilter === "all" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              Semua
            </button>
            <button
              type="button"
              onClick={() => setQuotaFilter("available")}
              style={{
                padding: "0.3rem 0.65rem",
                borderRadius: "var(--radius-full)",
                border: "none",
                fontSize: "0.725rem",
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
                padding: "0.3rem 0.65rem",
                borderRadius: "var(--radius-full)",
                border: "none",
                fontSize: "0.725rem",
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
        </div>
      </div>

      {/* Ringkasan Pilihan yang bisa di-toggle atau otomatis tampil jika ada pilihan */}
      {showSummaryDrawer && (
        <SelectedOfferingsSummary
          selectedOfferings={selectedOfferings}
          needMatkul={needMatkul}
          needProyek={needProyek}
          onRemoveOffering={onToggleOffering}
        />
      )}

      {/* DAFTAR MATA KULIAH: FORMAT KOMPAK MOBILE-FIRST */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.65rem" }}>
        {filteredOfferings.length === 0 ? (
          <div
            className="card"
            style={{
              padding: "2rem 1.5rem",
              textAlign: "center",
              borderRadius: "var(--radius-lg)",
              color: "var(--text-muted)",
            }}
          >
            <div style={{ fontSize: "1.5rem", marginBottom: "0.5rem" }}>🔍</div>
            <div style={{ fontWeight: 700, fontSize: "0.95rem", color: "var(--text-main)" }}>
              Tidak ada mata kuliah yang cocok
            </div>
            <p style={{ fontSize: "0.8rem", margin: "0.25rem 0 0.75rem" }}>
              Coba sesuaikan filter kelas atau kata kunci pencarian Anda.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSelectedClassTab("all");
                setQuotaFilter("all");
                setSearchQuery("");
              }}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}
            >
              Reset Semua Filter
            </button>
          </div>
        ) : (
          filteredOfferings.map((item) => {
            const isSelected = selectedIds.includes(item.id);
            const isFull = item.sisa <= 0;
            const hasClashWithClass = Boolean(item.bentrok_kelas);
            const isProyek = item.jenis === "proyek";
            const kelasDisplay = isProyek ? "PROYEK" : `KELAS ${item.kelas || "A"}`;

            const scheduleShort =
              item.jadwal && item.jadwal.length > 0
                ? item.jadwal
                    .map((s) => `${s.hari} ${s.jam_mulai.slice(0, 5)}-${s.jam_selesai.slice(0, 5)}`)
                    .join(", ")
                : "Jadwal belum ditentukan";

            return (
              <div
                key={item.id}
                className="card"
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "0.75rem",
                  padding: "0.85rem 1rem",
                  borderRadius: "var(--radius-md)",
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
                  transition: "all 0.15s ease",
                  marginBottom: 0,
                  opacity: isFull && !isSelected ? 0.88 : 1,
                }}
              >
                {/* Kolom Kiri: Badge Kelas & Info Utama */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                    {/* Badge Kelas (A-E / Proyek) */}
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 800,
                        padding: "2px 7px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: isProyek ? "#fef3c7" : "#e0f2fe",
                        color: isProyek ? "#b45309" : "#0369a1",
                        border: `1px solid ${isProyek ? "#fde68a" : "#bae6fd"}`,
                        letterSpacing: "0.03em",
                      }}
                    >
                      {kelasDisplay}
                    </span>

                    {/* Kuota Status Badge */}
                    <span
                      style={{
                        fontSize: "0.7rem",
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: "var(--radius-sm)",
                        backgroundColor: isFull ? "#fef2f2" : "#f0fdf4",
                        color: isFull ? "#dc2626" : "var(--success)",
                        border: `1px solid ${isFull ? "#fecaca" : "#bbf7d0"}`,
                      }}
                    >
                      {isFull ? "KUOTA PENUH" : `Sisa: ${item.sisa}/${item.kuota}`}
                    </span>

                    {hasClashWithClass && (
                      <span
                        style={{
                          fontSize: "0.68rem",
                          fontWeight: 700,
                          padding: "2px 6px",
                          borderRadius: "var(--radius-sm)",
                          backgroundColor: "#fee2e2",
                          color: "#b91c1c",
                        }}
                      >
                        Bentrok Jadwal Kelas
                      </span>
                    )}
                  </div>

                  {/* Nama Mata Kuliah */}
                  <h3
                    style={{
                      fontSize: "0.95rem",
                      fontWeight: 700,
                      color: "var(--text-main)",
                      margin: "0 0 0.2rem",
                      lineHeight: 1.3,
                      wordBreak: "break-word",
                    }}
                  >
                    {item.nama}
                  </h3>

                  {/* Jadwal Ringkas */}
                  <div
                    style={{
                      fontSize: "0.725rem",
                      color: "var(--text-muted)",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    <span>🕒 {scheduleShort}</span>
                  </div>
                </div>

                {/* Kolom Kanan: Tombol Pilih / Terpilih (Touch Target Ramah HP) */}
                <div style={{ flexShrink: 0 }}>
                  <button
                    type="button"
                    onClick={() => onToggleOffering(item)}
                    disabled={isFull && !isSelected}
                    className={isSelected ? "btn btn-primary" : "btn btn-secondary"}
                    style={{
                      minHeight: 42,
                      minWidth: isSelected ? 86 : 74,
                      padding: "0.5rem 0.85rem",
                      fontSize: "0.825rem",
                      fontWeight: 800,
                      borderRadius: "var(--radius-md)",
                      justifyContent: "center",
                    }}
                  >
                    {isSelected ? "Terpilih ✓" : isFull ? "Penuh" : "Pilih"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 4. FLOATING BOTTOM BAR (THUMB ZONE FRIENDLY) */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          backgroundColor: "rgba(255, 255, 255, 0.98)",
          backdropFilter: "blur(12px)",
          borderTop: "1.5px solid var(--primary-border)",
          padding: "0.65rem 1rem",
          boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.08)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.75rem",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: "0.68rem", fontWeight: 700, color: "var(--text-muted)", textTransform: "uppercase" }}>
            Total Dipilih: {selectedIds.length} / {needMatkul + needProyek}
          </div>
          <div
            style={{
              fontSize: "0.85rem",
              fontWeight: 800,
              color: isCompositionValid ? "var(--success)" : "var(--primary)",
              lineHeight: 1.2,
            }}
          >
            {isCompositionValid
              ? "Lengkap Siap Simpan ✓"
              : `${matkulSelected}/${needMatkul} Matkul, ${proyekSelected}/${needProyek} Proyek`}
          </div>
        </div>

        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowSummaryDrawer(!showSummaryDrawer)}
            style={{
              minHeight: 44,
              padding: "0.55rem 0.85rem",
              fontSize: "0.8rem",
              fontWeight: 700,
            }}
          >
            {showSummaryDrawer ? "Sembunyikan" : "Periksa"}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitSelection}
            disabled={!isCompositionValid || isSubmitting}
            style={{
              minHeight: 44,
              padding: "0.55rem 1.15rem",
              fontSize: "0.85rem",
              fontWeight: 800,
              flexShrink: 0,
            }}
          >
            {isSubmitting ? "Menyimpan..." : "Daftar KRS"}
          </button>
        </div>
      </div>
    </div>
  );
}
