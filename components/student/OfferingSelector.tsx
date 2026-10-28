"use client";

import { useState, useMemo } from "react";
import { Offering } from "@/lib/types";

interface OfferingSelectorProps {
  offerings: Offering[];
  selectedIds: number[];
  remainingSeconds: number | null;
  needMatkul?: number;
  needProyek?: number;
  isSubmitting: boolean;
  isRefreshingQuota?: boolean;
  hasQueue?: boolean;
  onRefreshQuota?: () => void;
  onToggleOffering: (offering: Offering) => void;
  onSubmitSelection: () => void;
  onLogout?: () => void;
}

// Helper ekstraksi nama dasar matkul (membuang sufiks kelas ' A', ' B', ' - A', '/A')
export const getCourseBaseName = (nama: string): string => {
  return nama.trim().replace(/(\s+|-|\/)+[A-Za-z]$/, "").toLowerCase();
};

export function OfferingSelector({
  offerings,
  selectedIds,
  remainingSeconds,
  isSubmitting,
  isRefreshingQuota,
  hasQueue = false,
  onRefreshQuota,
  onToggleOffering,
  onSubmitSelection,
}: OfferingSelectorProps) {
  // Filter state
  const [selectedClassTab, setSelectedClassTab] = useState<string>("all");
  const [quotaFilter, setQuotaFilter] = useState<"all" | "available" | "full">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showDropUp, setShowDropUp] = useState<boolean>(false);

  const selectedOfferings = useMemo(
    () => offerings.filter((o) => selectedIds.includes(o.id)),
    [offerings, selectedIds]
  );

  // Set nama dasar matkul yang sedang dipilih mahasiswa untuk mencegah memilih kelas lain dari matkul yang sama
  const selectedBaseNames = useMemo(
    () => selectedOfferings.map((o) => getCourseBaseName(o.nama)),
    [selectedOfferings]
  );

  // Aturan baru: Minimal 1 dan Maksimal 4 Mata Kuliah
  const isCompositionValid = selectedIds.length >= 1 && selectedIds.length <= 4;

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
    <div className="has-mobile-bottom-bar" style={{ paddingBottom: "4.5rem" }}>
      {/* 1. STICKY TOP CONTROLLER (Countdown Waktu, Pilihan Kelas, Cari & Filter Kuota) */}
      <div
        className="card"
        style={{
          position: "sticky",
          top: "0.5rem",
          zIndex: 90,
          backgroundColor: "rgba(255, 255, 255, 0.98)",
          backdropFilter: "blur(12px)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "0 4px 16px -2px rgba(0, 0, 0, 0.08)",
          border: hasQueue ? "1.5px solid var(--warning)" : "1.5px solid var(--primary-border)",
          padding: "0.65rem 0.85rem",
          marginBottom: "0.75rem",
        }}
      >
        {/* Baris 1: Countdown Waktu (HANYA tampil jika hasQueue === true) */}
        {hasQueue && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.5rem",
              paddingBottom: "0.4rem",
              borderBottom: "1px dashed var(--border-color)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  color: "#d97706",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                SISA WAKTU
              </span>
              <span
                style={{
                  fontSize: "1.25rem",
                  fontWeight: 800,
                  color: timerColor,
                  fontFamily: "var(--font-mono)",
                  lineHeight: 1,
                }}
              >
                {formatTimer(remainingSeconds)}
              </span>
            </div>

            {onRefreshQuota && (
              <button
                type="button"
                onClick={onRefreshQuota}
                disabled={isRefreshingQuota}
                style={{
                  backgroundColor: "#ffffff",
                  border: "1.5px solid var(--border-color)",
                  borderRadius: "var(--radius-full)",
                  color: isRefreshingQuota ? "var(--primary)" : "var(--text-main)",
                  fontSize: "0.725rem",
                  fontWeight: 700,
                  cursor: isRefreshingQuota ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "0.25rem 0.65rem",
                  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
                  transition: "all 0.15s ease",
                }}
                title="Perbarui kuota terkini"
              >
                <span
                  style={{
                    display: "inline-block",
                    animation: isRefreshingQuota ? "spin 1s linear infinite" : "none",
                  }}
                >
                  🔄
                </span>
                <span>{isRefreshingQuota ? "Memuat..." : "Refresh Kuota"}</span>
              </button>
            )}
          </div>
        )}

        {/* Baris 2: Tabs Pilihan Kelas Horizontal */}
        <div style={{ marginBottom: "0.5rem" }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.25rem",
              padding: "0 2px",
            }}
          >
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.04em",
              }}
            >
              PILIHAN KELAS
            </span>
            <span
              style={{
                fontSize: "0.68rem",
                fontWeight: 700,
                color: "var(--primary)",
                display: "inline-flex",
                alignItems: "center",
                gap: "2px",
                backgroundColor: "var(--primary-light, #ecfdf5)",
                padding: "1px 6px",
                borderRadius: "var(--radius-full)",
              }}
            >
              <span>↔ Geser kelas</span>
              <span style={{ fontSize: "0.75rem" }}>›</span>
            </span>
          </div>

          <div style={{ position: "relative" }}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.35rem",
                overflowX: "auto",
                WebkitOverflowScrolling: "touch",
                scrollbarWidth: "none",
                msOverflowStyle: "none",
                paddingBottom: "2px",
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
                      padding: "0.3rem 0.75rem",
                      borderRadius: "var(--radius-full)",
                      border: isActive ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                      backgroundColor: isActive ? "var(--primary)" : "#ffffff",
                      color: isActive ? "#ffffff" : "var(--text-main)",
                      fontSize: "0.75rem",
                      fontWeight: isActive ? 800 : 600,
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "0.25rem",
                    }}
                  >
                    <span>{tab.label}</span>
                    <span
                      style={{
                        fontSize: "0.68rem",
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
            <div
              style={{
                position: "absolute",
                right: 0,
                top: 0,
                bottom: 2,
                width: 20,
                background: "linear-gradient(to right, transparent, rgba(255, 255, 255, 0.95))",
                pointerEvents: "none",
                display: "flex",
                alignItems: "center",
                justifyContent: "flex-end",
              }}
            >
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", opacity: 0.7 }}>›</span>
            </div>
          </div>
        </div>

        {/* Baris 3: Kolom Cari Nama Mata Kuliah */}
        <div style={{ position: "relative", marginBottom: "0.5rem" }}>
          <input
            type="text"
            className="form-control"
            placeholder="Cari nama mata kuliah..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              fontSize: "0.8rem",
              padding: "0.4rem 0.75rem",
              height: 34,
              backgroundColor: "#f8fafc",
              borderRadius: "var(--radius-md)",
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

        {/* Baris 4: Filter Kuota (Semua, Tersedia, Penuh) + Refresh jika !hasQueue */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.4rem",
          }}
        >
          <div
            style={{
              display: "inline-flex",
              backgroundColor: "var(--bg-subtle)",
              padding: "2px",
              borderRadius: "var(--radius-full)",
              border: "1px solid var(--border-color)",
              gap: "2px",
            }}
          >
            <button
              type="button"
              onClick={() => setQuotaFilter("all")}
              style={{
                padding: "0.25rem 0.65rem",
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
                padding: "0.25rem 0.65rem",
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
                padding: "0.25rem 0.65rem",
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

          {!hasQueue && onRefreshQuota && (
            <button
              type="button"
              onClick={onRefreshQuota}
              disabled={isRefreshingQuota}
              style={{
                backgroundColor: "#ffffff",
                border: "1.5px solid var(--border-color)",
                borderRadius: "var(--radius-full)",
                color: isRefreshingQuota ? "var(--primary)" : "var(--text-main)",
                fontSize: "0.725rem",
                fontWeight: 700,
                cursor: isRefreshingQuota ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                padding: "0.3rem 0.75rem",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                transition: "all 0.15s ease",
              }}
              title="Perbarui kuota terkini"
            >
              <span
                style={{
                  display: "inline-block",
                  animation: isRefreshingQuota ? "spin 1s linear infinite" : "none",
                  fontSize: "0.8rem",
                }}
              >
                🔄
              </span>
              <span>{isRefreshingQuota ? "Memuat..." : "Refresh Kuota"}</span>
            </button>
          )}
        </div>
      </div>

      {/* HEADER DAFTAR MATKUL (Tabel Compact Horizontal) */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.3rem 0.6rem",
          fontSize: "0.68rem",
          fontWeight: 800,
          color: "var(--text-muted)",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          borderBottom: "1.5px solid var(--border-color)",
          marginBottom: "0.4rem",
        }}
      >
        <div style={{ width: 26, textAlign: "center", flexShrink: 0 }}>PILIH</div>
        <div style={{ flex: 1, minWidth: 0 }}>MATA KULIAH & JADWAL</div>
        <div style={{ width: 44, textAlign: "center", flexShrink: 0 }}>KELAS</div>
        <div style={{ width: 48, textAlign: "right", flexShrink: 0 }}>KUOTA</div>
      </div>

      {/* 2. DAFTAR MATA KULIAH: FORMAT BARIS HORIZONTAL ULTRA COMPACT (HP FRIENDLY) */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
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
            const itemBaseName = getCourseBaseName(item.nama);

            // Cek apakah mahasiswa sudah memilih kelas lain dari mata kuliah yang sama
            const hasSameCourseSelected = !isSelected && selectedBaseNames.includes(itemBaseName);
            // Cek batas maksimal 4 mata kuliah terpilih
            const isMaxReached = !isSelected && selectedIds.length >= 4;
            const isDisabled = (isFull && !isSelected) || hasSameCourseSelected || isMaxReached;

            const scheduleShort =
              item.jadwal && item.jadwal.length > 0
                ? item.jadwal
                    .map((s) => `${s.hari} ${s.jam_mulai.slice(0, 5)}–${s.jam_selesai.slice(0, 5)}`)
                    .join(", ")
                : "Jadwal belum ditentukan";

            return (
              <div
                key={item.id}
                onClick={() => {
                  if (isSelected || !isDisabled) {
                    onToggleOffering(item);
                  }
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  padding: "0.45rem 0.6rem",
                  borderRadius: "var(--radius-md)",
                  border: isSelected
                    ? "2px solid #059669"
                    : hasClashWithClass
                    ? "1.5px solid #fecaca"
                    : hasSameCourseSelected
                    ? "1px dashed #cbd5e1"
                    : "1px solid var(--border-color)",
                  backgroundColor: isSelected
                    ? "#ecfdf5"
                    : hasClashWithClass
                    ? "#fff5f5"
                    : hasSameCourseSelected
                    ? "#f8fafc"
                    : "#ffffff",
                  cursor: isDisabled && !isSelected ? "not-allowed" : "pointer",
                  opacity: isDisabled && !isSelected ? 0.6 : 1,
                  transition: "all 0.12s ease",
                  userSelect: "none",
                }}
              >
                {/* Kolom 1: Kotak Centang Jelas [✓] */}
                <div
                  style={{
                    flexShrink: 0,
                    width: 26,
                    height: 26,
                    borderRadius: 6,
                    border: isSelected
                      ? "2px solid #059669"
                      : isDisabled
                      ? "1.5px solid #cbd5e1"
                      : "2px solid #94a3b8",
                    backgroundColor: isSelected ? "#059669" : "#ffffff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "#ffffff",
                    fontSize: "0.95rem",
                    fontWeight: 900,
                    boxShadow: isSelected ? "0 2px 4px rgba(5, 150, 105, 0.25)" : "none",
                    transition: "all 0.12s ease",
                  }}
                  title={isSelected ? "Klik untuk membatalkan pilihan" : "Klik untuk memilih"}
                >
                  {isSelected ? "✓" : ""}
                </div>

                {/* Kolom 2: Nama Mata Kuliah & Jadwal / Status Kecil */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: "0.825rem",
                      fontWeight: isSelected ? 800 : 700,
                      color: isSelected ? "#065f46" : isDisabled ? "#94a3b8" : "var(--text-main)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      lineHeight: 1.25,
                    }}
                    title={item.nama}
                  >
                    {item.nama}
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: hasClashWithClass
                        ? "#dc2626"
                        : hasSameCourseSelected
                        ? "#d97706"
                        : "var(--text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: "1px",
                    }}
                  >
                    {hasClashWithClass
                      ? "⚠️ Bentrok jadwal kelas"
                      : hasSameCourseSelected
                      ? "⚠️ Sudah pilih kelas lain"
                      : `🕒 ${scheduleShort}`}
                  </div>
                </div>

                {/* Kolom 3: Kelas */}
                <div style={{ flexShrink: 0, textAlign: "center", width: 44 }}>
                  <span
                    style={{
                      fontSize: "0.675rem",
                      fontWeight: 800,
                      padding: "2px 5px",
                      borderRadius: "4px",
                      backgroundColor: isProyek ? "#fef3c7" : "#e0f2fe",
                      color: isProyek ? "#b45309" : "#0369a1",
                      border: `1px solid ${isProyek ? "#fde68a" : "#bae6fd"}`,
                      whiteSpace: "nowrap",
                      display: "inline-block",
                    }}
                  >
                    {isProyek ? "Proyek" : `Kls ${item.kelas || "A"}`}
                  </span>
                </div>

                {/* Kolom 4: Kuota */}
                <div style={{ flexShrink: 0, textAlign: "right", width: 48 }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      padding: "2px 5px",
                      borderRadius: "4px",
                      backgroundColor: isFull ? "#fef2f2" : "#f0fdf4",
                      color: isFull ? "#dc2626" : "#059669",
                      border: `1px solid ${isFull ? "#fecaca" : "#a7f3d0"}`,
                      whiteSpace: "nowrap",
                      display: "inline-block",
                    }}
                  >
                    {isFull ? "Penuh" : `${item.sisa}/${item.kuota}`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. AUTO DROP-UP SHEET (Ringkasan Pilihan Mahasiswa) */}
      {showDropUp && (
        <>
          <div
            onClick={() => setShowDropUp(false)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              zIndex: 990,
              backdropFilter: "blur(2px)",
              animation: "fadeIn 0.15s ease-out",
            }}
          />

          <div
            style={{
              position: "fixed",
              bottom: "64px",
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: 580,
              maxHeight: "75vh",
              backgroundColor: "#ffffff",
              borderTopLeftRadius: "var(--radius-xl)",
              borderTopRightRadius: "var(--radius-xl)",
              border: "1.5px solid var(--primary-border)",
              boxShadow: "0 -8px 30px rgba(0, 0, 0, 0.16)",
              zIndex: 995,
              display: "flex",
              flexDirection: "column",
              animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Header Drop-Up */}
            <div
              style={{
                padding: "0.75rem 1rem",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#f8fafc",
                borderTopLeftRadius: "var(--radius-xl)",
                borderTopRightRadius: "var(--radius-xl)",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "0.9rem", fontWeight: 800, color: "var(--text-main)" }}>
                Mata Kuliah Terpilih ({selectedOfferings.length} dari Maks. 4)
              </h4>

              <button
                type="button"
                onClick={() => setShowDropUp(false)}
                style={{
                  background: "#e2e8f0",
                  border: "none",
                  color: "var(--text-main)",
                  fontSize: "0.85rem",
                  fontWeight: 800,
                  width: 28,
                  height: 28,
                  borderRadius: "50%",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  cursor: "pointer",
                }}
                title="Tutup ringkasan"
              >
                ✕
              </button>
            </div>

            {/* Isi Daftar Pilihan */}
            <div
              style={{
                padding: "0.75rem 1rem",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.45rem",
              }}
            >
              {selectedOfferings.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Belum ada mata kuliah yang dipilih.
                  <br />
                  <span style={{ fontSize: "0.775rem" }}>Centang mata kuliah pada daftar kelas di atas (min. 1, maks. 4).</span>
                </div>
              ) : (
                selectedOfferings.map((item) => {
                  const isProyek = item.jenis === "proyek";
                  return (
                    <div
                      key={item.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        padding: "0.6rem 0.75rem",
                        backgroundColor: "#f8fafc",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                        gap: "0.6rem",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.15rem" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              padding: "1px 6px",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: isProyek ? "#fef3c7" : "#e0f2fe",
                              color: isProyek ? "#b45309" : "#0369a1",
                              border: `1px solid ${isProyek ? "#fde68a" : "#bae6fd"}`,
                              textTransform: "uppercase",
                            }}
                          >
                            {isProyek ? "PROYEK" : `KELAS ${item.kelas || "A"}`}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: "0.825rem",
                            fontWeight: 700,
                            color: "var(--text-main)",
                            lineHeight: 1.3,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {item.nama}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => onToggleOffering(item)}
                        style={{
                          background: "#fee2e2",
                          border: "1px solid #fecaca",
                          color: "#b91c1c",
                          fontSize: "0.725rem",
                          fontWeight: 700,
                          padding: "0.35rem 0.65rem",
                          borderRadius: "var(--radius-sm)",
                          cursor: "pointer",
                          flexShrink: 0,
                        }}
                      >
                        ✕ Batal
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </>
      )}

      {/* 4. FLOATING BOTTOM BAR (Status Pilihan & Tombol Simpan Pilihan) */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 999,
          backgroundColor: "#ffffff",
          borderTop: "1.5px solid var(--primary-border)",
          padding: "0.55rem 0.85rem",
          boxShadow: "0 -4px 20px rgba(0, 0, 0, 0.12)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: "0.6rem",
        }}
      >
        {/* Area Status Kiri (Bisa diklik untuk Drop-Up) */}
        <div
          onClick={() => setShowDropUp(!showDropUp)}
          style={{ flex: 1, cursor: "pointer", userSelect: "none", minWidth: 0 }}
          title="Klik untuk melihat mata kuliah yang dipilih"
        >
          <div
            style={{
              fontSize: "0.825rem",
              fontWeight: 800,
              color: isCompositionValid ? "#059669" : "#d97706",
              lineHeight: 1.2,
              display: "flex",
              alignItems: "center",
              gap: "4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            <span>
              {selectedOfferings.length === 0
                ? "Pilih 1–4 Matkul"
                : `${selectedOfferings.length}/4 Terpilih`}
            </span>
            <span style={{ fontSize: "0.65rem" }}>
              {showDropUp ? "▼" : "▲"}
            </span>
          </div>
          <div style={{ fontSize: "0.65rem", color: "var(--text-muted)" }}>
            {isCompositionValid ? "Siap disimpan" : "Minimal 1 mata kuliah"}
          </div>
        </div>

        {/* Tombol Aksi Kanan: Periksa & Simpan Pilihan */}
        <div style={{ display: "flex", gap: "0.4rem", alignItems: "center", flexShrink: 0 }}>
          <button
            type="button"
            onClick={() => setShowDropUp(!showDropUp)}
            style={{
              minHeight: 40,
              padding: "0.45rem 0.75rem",
              fontSize: "0.8rem",
              fontWeight: 800,
              backgroundColor: showDropUp ? "#059669" : "#ecfdf5",
              color: showDropUp ? "#ffffff" : "#047857",
              border: "1.5px solid #059669",
              borderRadius: "var(--radius-md)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: "pointer",
              transition: "all 0.15s ease",
            }}
          >
            {showDropUp ? "✕ Tutup" : `👁️ Periksa (${selectedOfferings.length})`}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitSelection}
            disabled={!isCompositionValid || isSubmitting}
            style={{
              minHeight: 40,
              padding: "0.45rem 1rem",
              fontSize: "0.825rem",
              fontWeight: 800,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {isSubmitting ? "Menyimpan..." : "Simpan Pilihan"}
          </button>
        </div>
      </div>
    </div>
  );
}
