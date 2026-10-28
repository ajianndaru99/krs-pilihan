"use client";

import { useState, useMemo } from "react";
import { Offering } from "@/lib/types";

// Helper pembersihan nama matkul dari sufiks kelas (misal: "Literasi Digital A" -> "Literasi Digital")
export const cleanCourseName = (nama: string): string => {
  const cleaned = nama.trim().replace(/(\s+|-|\/)+[A-Za-z]$/, "");
  return cleaned.trim() || nama.trim();
};

export const getCourseBaseName = (nama: string): string => {
  return cleanCourseName(nama).toLowerCase();
};

export interface GroupedCourse {
  baseKey: string;
  displayName: string;
  jenis: "matkul" | "proyek";
  classes: Offering[];
  selectedOffering: Offering | null;
  totalKuota: number;
  totalSisa: number;
  hasAvailableClass: boolean;
}

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
  onToggleOffering: (offering: Offering, replaceOfferingId?: number) => void;
  onSubmitSelection: () => void;
  onLogout?: () => void;
}

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
  // Filter state (Tabs sort kelas sudah dieliminasi agar tampilan HP hemat ruang)
  const [quotaFilter, setQuotaFilter] = useState<"all" | "available" | "full">("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [showDropUp, setShowDropUp] = useState<boolean>(false);
  const [sheetCourse, setSheetCourse] = useState<GroupedCourse | null>(null);

  // 1. Kelompokkan penawaran berdasarkan Mata Kuliah Unik (Base Name)
  const groupedCourses = useMemo(() => {
    const map = new Map<string, GroupedCourse>();

    offerings.forEach((off) => {
      const baseKey = getCourseBaseName(off.nama);
      const existing = map.get(baseKey);

      if (existing) {
        existing.classes.push(off);
        existing.totalKuota += off.kuota;
        existing.totalSisa += off.sisa;
        if (off.sisa > 0) existing.hasAvailableClass = true;
        if (selectedIds.includes(off.id)) {
          existing.selectedOffering = off;
        }
      } else {
        const isSelected = selectedIds.includes(off.id);
        map.set(baseKey, {
          baseKey,
          displayName: cleanCourseName(off.nama),
          jenis: off.jenis,
          classes: [off],
          selectedOffering: isSelected ? off : null,
          totalKuota: off.kuota,
          totalSisa: off.sisa,
          hasAvailableClass: off.sisa > 0,
        });
      }
    });

    // Urutkan kelas di dalam tiap matkul (Kelas A, B, C...)
    map.forEach((group) => {
      group.classes.sort((a, b) => (a.kelas || "A").localeCompare(b.kelas || "A"));
    });

    return Array.from(map.values());
  }, [offerings, selectedIds]);

  // Saring daftar berdasarkan Pencarian & Filter Kuota
  const filteredCourses = useMemo(() => {
    return groupedCourses.filter((course) => {
      // Filter Kuota
      if (quotaFilter === "available" && !course.hasAvailableClass) return false;
      if (quotaFilter === "full" && course.hasAvailableClass) return false;

      // Filter Pencarian
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchNama = course.displayName.toLowerCase().includes(q);
        const matchClass = course.classes.some((c) => (c.kelas || "").toLowerCase().includes(q));
        if (!matchNama && !matchClass) return false;
      }

      return true;
    });
  }, [groupedCourses, quotaFilter, searchQuery]);

  const selectedOfferings = useMemo(
    () => offerings.filter((o) => selectedIds.includes(o.id)),
    [offerings, selectedIds]
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

  // Handler klik pada baris mata kuliah
  const handleCourseRowClick = (course: GroupedCourse) => {
    // Jika matkul ini sudah memiliki kelas terpilih, buka bottom sheet untuk memungkinkan ganti kelas
    if (course.selectedOffering) {
      setSheetCourse(course);
      return;
    }

    // Jika seluruh kelas pada matkul ini penuh
    if (!course.hasAvailableClass) {
      return;
    }

    // Jika matkul hanya punya 1 kelas (misal Proyek Terapan atau kelas tunggal), langsung pilih
    if (course.classes.length === 1) {
      onToggleOffering(course.classes[0]);
      return;
    }

    // Jika punya beberapa kelas, buka bottom sheet pilihan kelas
    setSheetCourse(course);
  };

  // Handler klik tombol centang [✓]
  const handleCheckboxClick = (e: React.MouseEvent, course: GroupedCourse) => {
    e.stopPropagation();
    if (course.selectedOffering) {
      // Batalkan pilihan kelas saat ini
      onToggleOffering(course.selectedOffering);
    } else {
      // Jika belum terpilih dan hanya ada 1 kelas, langsung pilih
      if (course.classes.length === 1) {
        if (course.classes[0].sisa > 0) {
          onToggleOffering(course.classes[0]);
        }
      } else {
        // Buka bottom sheet pemilihan kelas
        setSheetCourse(course);
      }
    }
  };

  // Handler pemilihan kelas dari bottom sheet
  const handleSelectClassFromSheet = (cls: Offering) => {
    if (cls.sisa <= 0) return; // Kuota penuh

    const currentSelected = sheetCourse?.selectedOffering;
    if (currentSelected?.id === cls.id) {
      // Kelas yang sama sudah terpilih, tutup sheet
      setSheetCourse(null);
      return;
    }

    // Pilih kelas baru (jika sebelumnya sudah ada kelas lain, gantikan ID-nya secara mulus)
    onToggleOffering(cls, currentSelected?.id);
    setSheetCourse(null);
  };

  const availableCount = groupedCourses.filter((c) => c.hasAvailableClass).length;
  const fullCount = groupedCourses.filter((c) => !c.hasAvailableClass).length;

  return (
    <div className="has-mobile-bottom-bar" style={{ paddingBottom: "4.5rem" }}>
      {/* 1. STICKY TOP CONTROLLER (Ramping & Hemat Ruang di HP) */}
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
          padding: "0.55rem 0.8rem",
          marginBottom: "0.65rem",
        }}
      >
        {/* Baris 1: Countdown Waktu (HANYA tampil jika hasQueue === true) */}
        {hasQueue && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.45rem",
              paddingBottom: "0.35rem",
              borderBottom: "1px dashed var(--border-color)",
            }}
          >
            <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem" }}>
              <span
                style={{
                  fontSize: "0.68rem",
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
                  fontSize: "1.2rem",
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
                  fontSize: "0.7rem",
                  fontWeight: 700,
                  cursor: isRefreshingQuota ? "wait" : "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "4px",
                  padding: "0.2rem 0.6rem",
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
                <span>{isRefreshingQuota ? "Memuat..." : "Refresh"}</span>
              </button>
            )}
          </div>
        )}

        {/* Baris 2: Kolom Cari Nama Mata Kuliah + Tombol Refresh jika !hasQueue */}
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center", marginBottom: "0.4rem" }}>
          <div style={{ position: "relative", flex: 1 }}>
            <input
              type="text"
              className="form-control"
              placeholder="Cari mata kuliah..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                fontSize: "0.8rem",
                padding: "0.35rem 0.65rem",
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

          {!hasQueue && onRefreshQuota && (
            <button
              type="button"
              onClick={onRefreshQuota}
              disabled={isRefreshingQuota}
              style={{
                backgroundColor: "#ffffff",
                border: "1.5px solid var(--border-color)",
                borderRadius: "var(--radius-md)",
                color: isRefreshingQuota ? "var(--primary)" : "var(--text-main)",
                fontSize: "0.75rem",
                fontWeight: 700,
                cursor: isRefreshingQuota ? "wait" : "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                height: 34,
                padding: "0 0.65rem",
                boxShadow: "0 1px 2px rgba(0, 0, 0, 0.05)",
                flexShrink: 0,
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
              <span>{isRefreshingQuota ? "..." : "Refresh"}</span>
            </button>
          )}
        </div>

        {/* Baris 3: Filter Kuota (Semua, Tersedia, Penuh) */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
                padding: "0.2rem 0.6rem",
                borderRadius: "var(--radius-full)",
                border: "none",
                fontSize: "0.7rem",
                fontWeight: 700,
                cursor: "pointer",
                backgroundColor: quotaFilter === "all" ? "#ffffff" : "transparent",
                color: quotaFilter === "all" ? "var(--text-main)" : "var(--text-muted)",
                boxShadow: quotaFilter === "all" ? "0 1px 2px rgba(0,0,0,0.08)" : "none",
              }}
            >
              Semua ({groupedCourses.length})
            </button>
            <button
              type="button"
              onClick={() => setQuotaFilter("available")}
              style={{
                padding: "0.2rem 0.6rem",
                borderRadius: "var(--radius-full)",
                border: "none",
                fontSize: "0.7rem",
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
                padding: "0.2rem 0.6rem",
                borderRadius: "var(--radius-full)",
                border: "none",
                fontSize: "0.7rem",
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

          <span style={{ fontSize: "0.68rem", color: "var(--text-muted)", fontWeight: 600 }}>
            {filteredCourses.length} Mata Kuliah
          </span>
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
          marginBottom: "0.35rem",
        }}
      >
        <div style={{ width: 26, textAlign: "center", flexShrink: 0 }}>PILIH</div>
        <div style={{ flex: 1, minWidth: 0 }}>MATA KULIAH & JADWAL</div>
        <div style={{ width: 56, textAlign: "center", flexShrink: 0 }}>KELAS</div>
        <div style={{ width: 48, textAlign: "right", flexShrink: 0 }}>KUOTA</div>
      </div>

      {/* 2. DAFTAR MATA KULIAH: FORMAT BARIS HORIZONTAL HIERARKI KOMPAK */}
      <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
        {filteredCourses.length === 0 ? (
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
              Coba sesuaikan kata kunci pencarian atau filter kuota Anda.
            </p>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setQuotaFilter("all");
                setSearchQuery("");
              }}
              style={{ fontSize: "0.8rem", padding: "0.4rem 0.85rem" }}
            >
              Reset Filter
            </button>
          </div>
        ) : (
          filteredCourses.map((course) => {
            const isSelected = Boolean(course.selectedOffering);
            const isFull = !course.hasAvailableClass;
            const isMaxReached = !isSelected && selectedIds.length >= 4;
            const isDisabled = (isFull && !isSelected) || isMaxReached;

            // Keterangan jadwal ringkas
            let scheduleText = "";
            let hasClashWithClass = false;

            if (course.selectedOffering) {
              const sel = course.selectedOffering;
              hasClashWithClass = Boolean(sel.bentrok_kelas);
              if (sel.jadwal && sel.jadwal.length > 0) {
                scheduleText = sel.jadwal
                  .map((s) => `${s.hari} ${s.jam_mulai.slice(0, 5)}–${s.jam_selesai.slice(0, 5)}`)
                  .join(", ");
              } else {
                scheduleText = "Jadwal belum ditentukan";
              }
            } else if (course.classes.length === 1) {
              const single = course.classes[0];
              hasClashWithClass = Boolean(single.bentrok_kelas);
              if (single.jadwal && single.jadwal.length > 0) {
                scheduleText = single.jadwal
                  .map((s) => `${s.hari} ${s.jam_mulai.slice(0, 5)}–${s.jam_selesai.slice(0, 5)}`)
                  .join(", ");
              } else {
                scheduleText = "Jadwal belum ditentukan";
              }
            } else {
              scheduleText = `Tersedia ${course.classes.length} pilihan kelas (Klik untuk memilih)`;
            }

            return (
              <div
                key={course.baseKey}
                onClick={() => handleCourseRowClick(course)}
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
                    : isFull
                    ? "1px solid #fed7aa"
                    : "1px solid var(--border-color)",
                  backgroundColor: isSelected
                    ? "#ecfdf5"
                    : hasClashWithClass
                    ? "#fff5f5"
                    : isFull
                    ? "#fffbeb"
                    : "#ffffff",
                  cursor: isDisabled && !isSelected ? "not-allowed" : "pointer",
                  opacity: isDisabled && !isSelected ? 0.6 : 1,
                  transition: "all 0.12s ease",
                  userSelect: "none",
                }}
              >
                {/* Kolom 1: Kotak Centang Jelas [✓] */}
                <div
                  onClick={(e) => handleCheckboxClick(e, course)}
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
                  title={isSelected ? "Klik untuk membatalkan" : "Klik untuk memilih"}
                >
                  {isSelected ? "✓" : ""}
                </div>

                {/* Kolom 2: Nama Mata Kuliah & Jadwal / Opsi Kelas */}
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
                    title={course.displayName}
                  >
                    {course.displayName}
                  </div>
                  <div
                    style={{
                      fontSize: "0.68rem",
                      color: hasClashWithClass
                        ? "#dc2626"
                        : isSelected
                        ? "#047857"
                        : "var(--text-muted)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      marginTop: "1px",
                    }}
                  >
                    {hasClashWithClass ? "⚠️ Bentrok jadwal kelas" : `🕒 ${scheduleText}`}
                  </div>
                </div>

                {/* Kolom 3: Kelas Selector (Interaktif) */}
                <div style={{ flexShrink: 0, textAlign: "center", width: 56 }}>
                  {isSelected ? (
                    <span
                      style={{
                        fontSize: "0.675rem",
                        fontWeight: 800,
                        padding: "2px 6px",
                        borderRadius: "4px",
                        backgroundColor: course.jenis === "proyek" ? "#fef3c7" : "#d1fae5",
                        color: course.jenis === "proyek" ? "#b45309" : "#065f46",
                        border: `1px solid ${course.jenis === "proyek" ? "#fde68a" : "#6ee7b7"}`,
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                      title="Klik untuk mengganti kelas"
                    >
                      <span>{course.jenis === "proyek" ? "Proyek" : `Kls ${course.selectedOffering?.kelas || "A"}`}</span>
                      <span style={{ fontSize: "0.6rem" }}>▾</span>
                    </span>
                  ) : course.classes.length > 1 ? (
                    <span
                      style={{
                        fontSize: "0.675rem",
                        fontWeight: 700,
                        padding: "2px 5px",
                        borderRadius: "4px",
                        backgroundColor: "#f1f5f9",
                        color: "#475569",
                        border: "1px solid #cbd5e1",
                        whiteSpace: "nowrap",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: "2px",
                      }}
                      title="Klik untuk memilih kelas"
                    >
                      <span>Pilih</span>
                      <span style={{ fontSize: "0.6rem" }}>▾</span>
                    </span>
                  ) : (
                    <span
                      style={{
                        fontSize: "0.675rem",
                        fontWeight: 800,
                        padding: "2px 5px",
                        borderRadius: "4px",
                        backgroundColor: course.jenis === "proyek" ? "#fef3c7" : "#e0f2fe",
                        color: course.jenis === "proyek" ? "#b45309" : "#0369a1",
                        border: `1px solid ${course.jenis === "proyek" ? "#fde68a" : "#bae6fd"}`,
                        whiteSpace: "nowrap",
                        display: "inline-block",
                      }}
                    >
                      {course.jenis === "proyek" ? "Proyek" : `Kls ${course.classes[0]?.kelas || "A"}`}
                    </span>
                  )}
                </div>

                {/* Kolom 4: Kuota Ringkas */}
                <div style={{ flexShrink: 0, textAlign: "right", width: 48 }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      padding: "2px 4px",
                      borderRadius: "4px",
                      backgroundColor: isFull
                        ? "#fef2f2"
                        : isSelected
                        ? "#ecfdf5"
                        : "#f0fdf4",
                      color: isFull
                        ? "#dc2626"
                        : isSelected
                        ? "#047857"
                        : "#059669",
                      border: `1px solid ${isFull ? "#fecaca" : "#a7f3d0"}`,
                      whiteSpace: "nowrap",
                      display: "inline-block",
                    }}
                  >
                    {isFull
                      ? "Penuh"
                      : isSelected && course.selectedOffering
                      ? `${course.selectedOffering.sisa}/${course.selectedOffering.kuota}`
                      : `${course.totalSisa}/${course.totalKuota}`}
                  </span>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. BOTTOM SHEET PEMILIHAN KELAS (Modal Drawer saat klik matkul/kelas) */}
      {sheetCourse && (
        <>
          {/* Backdrop gelap semi-transparan */}
          <div
            onClick={() => setSheetCourse(null)}
            style={{
              position: "fixed",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: "rgba(15, 23, 42, 0.45)",
              zIndex: 996,
              backdropFilter: "blur(2px)",
              animation: "fadeIn 0.15s ease-out",
            }}
          />

          {/* Drawer Pemilihan Kelas dari Bawah Layar */}
          <div
            style={{
              position: "fixed",
              bottom: 0,
              left: "50%",
              transform: "translateX(-50%)",
              width: "100%",
              maxWidth: 580,
              maxHeight: "80vh",
              backgroundColor: "#ffffff",
              borderTopLeftRadius: "var(--radius-xl)",
              borderTopRightRadius: "var(--radius-xl)",
              border: "1.5px solid var(--primary-border)",
              boxShadow: "0 -8px 30px rgba(0, 0, 0, 0.18)",
              zIndex: 998,
              display: "flex",
              flexDirection: "column",
              animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
            }}
          >
            {/* Header Sheet */}
            <div
              style={{
                padding: "0.85rem 1rem",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "flex-start",
                backgroundColor: "#f8fafc",
                borderTopLeftRadius: "var(--radius-xl)",
                borderTopRightRadius: "var(--radius-xl)",
              }}
            >
              <div style={{ flex: 1, minWidth: 0, paddingRight: "0.5rem" }}>
                <span
                  style={{
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    padding: "2px 6px",
                    borderRadius: "var(--radius-sm)",
                    backgroundColor: sheetCourse.jenis === "proyek" ? "#fef3c7" : "#e0f2fe",
                    color: sheetCourse.jenis === "proyek" ? "#b45309" : "#0369a1",
                    textTransform: "uppercase",
                    letterSpacing: "0.03em",
                  }}
                >
                  {sheetCourse.jenis === "proyek" ? "Proyek Terapan" : "Mata Kuliah Pilihan"}
                </span>
                <h3
                  style={{
                    margin: "0.3rem 0 0.1rem",
                    fontSize: "1rem",
                    fontWeight: 800,
                    color: "var(--text-main)",
                    lineHeight: 1.3,
                  }}
                >
                  {sheetCourse.displayName}
                </h3>
                <p style={{ margin: 0, fontSize: "0.75rem", color: "var(--text-muted)" }}>
                  Pilih kelas yang sesuai dengan jadwal perkuliahan Anda:
                </p>
              </div>

              <button
                type="button"
                onClick={() => setSheetCourse(null)}
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
                  flexShrink: 0,
                }}
                title="Tutup dialog"
              >
                ✕
              </button>
            </div>

            {/* List Pilihan Kelas */}
            <div
              style={{
                padding: "0.85rem 1rem",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.55rem",
              }}
            >
              {sheetCourse.classes.map((cls) => {
                const isCurrentActive = sheetCourse.selectedOffering?.id === cls.id;
                const isFull = cls.sisa <= 0;
                const hasClash = Boolean(cls.bentrok_kelas);
                const schedule =
                  cls.jadwal && cls.jadwal.length > 0
                    ? cls.jadwal
                        .map(
                          (j) =>
                            `${j.hari}, ${j.jam_mulai.slice(0, 5)}–${j.jam_selesai.slice(0, 5)}${
                              j.ruang ? ` (${j.ruang})` : ""
                            }`
                        )
                        .join("; ")
                    : "Jadwal belum ditentukan";

                return (
                  <div
                    key={cls.id}
                    onClick={() => {
                      if (!isFull) handleSelectClassFromSheet(cls);
                    }}
                    style={{
                      padding: "0.75rem 0.85rem",
                      borderRadius: "var(--radius-md)",
                      border: isCurrentActive
                        ? "2px solid #059669"
                        : hasClash
                        ? "1.5px solid #fecaca"
                        : isFull
                        ? "1px solid #fed7aa"
                        : "1.5px solid var(--border-color)",
                      backgroundColor: isCurrentActive
                        ? "#ecfdf5"
                        : hasClash
                        ? "#fff5f5"
                        : isFull
                        ? "#f8fafc"
                        : "#ffffff",
                      cursor: isFull ? "not-allowed" : "pointer",
                      opacity: isFull && !isCurrentActive ? 0.6 : 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: "0.6rem",
                      transition: "all 0.12s ease",
                    }}
                  >
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.25rem", flexWrap: "wrap" }}>
                        <span
                          style={{
                            fontSize: "0.725rem",
                            fontWeight: 800,
                            padding: "2px 7px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: isCurrentActive ? "#059669" : "#e0f2fe",
                            color: isCurrentActive ? "#ffffff" : "#0369a1",
                          }}
                        >
                          {cls.jenis === "proyek" ? "PROYEK" : `KELAS ${cls.kelas || "A"}`}
                        </span>

                        <span
                          style={{
                            fontSize: "0.7rem",
                            fontWeight: 800,
                            padding: "2px 6px",
                            borderRadius: "var(--radius-sm)",
                            backgroundColor: isFull ? "#fef2f2" : "#f0fdf4",
                            color: isFull ? "#dc2626" : "#059669",
                            border: `1px solid ${isFull ? "#fecaca" : "#a7f3d0"}`,
                          }}
                        >
                          {isFull ? `🚫 Penuh (0/${cls.kuota})` : `Sisa ${cls.sisa} dari ${cls.kuota} Kursi`}
                        </span>

                        {hasClash && (
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 700,
                              padding: "2px 5px",
                              borderRadius: "var(--radius-sm)",
                              backgroundColor: "#fee2e2",
                              color: "#b91c1c",
                            }}
                          >
                            Bentrok Jadwal Kelas
                          </span>
                        )}
                      </div>

                      <div style={{ fontSize: "0.75rem", color: "var(--text-main)", fontWeight: 600 }}>
                        🕒 {schedule}
                      </div>
                    </div>

                    <div style={{ flexShrink: 0 }}>
                      <button
                        type="button"
                        disabled={isFull && !isCurrentActive}
                        style={{
                          padding: "0.4rem 0.75rem",
                          fontSize: "0.75rem",
                          fontWeight: 800,
                          borderRadius: "var(--radius-sm)",
                          border: isCurrentActive
                            ? "1.5px solid #059669"
                            : "1.5px solid var(--border-color)",
                          backgroundColor: isCurrentActive
                            ? "#059669"
                            : isFull
                            ? "#e2e8f0"
                            : "#ffffff",
                          color: isCurrentActive
                            ? "#ffffff"
                            : isFull
                            ? "#94a3b8"
                            : "var(--primary)",
                          cursor: isFull && !isCurrentActive ? "not-allowed" : "pointer",
                        }}
                      >
                        {isCurrentActive ? "✓ Terpilih" : isFull ? "Penuh" : "Pilih"}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </>
      )}

      {/* 4. AUTO DROP-UP SHEET (Ringkasan Pilihan Mahasiswa) */}
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

      {/* 5. FLOATING BOTTOM BAR (Status Pilihan & Tombol Simpan Pilihan) */}
      <div
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 994,
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
