"use client";

import { useState, useMemo } from "react";
import { Offering } from "@/lib/types";

interface OfferingSelectorProps {
  offerings: Offering[];
  selectedIds: number[];
  remainingSeconds: number | null;
  needMatkul: number;
  needProyek: number;
  isSubmitting: boolean;
  isRefreshingQuota?: boolean;
  hasQueue?: boolean;
  onRefreshQuota?: () => void;
  onToggleOffering: (offering: Offering) => void;
  onSubmitSelection: () => void;
  onLogout?: () => void;
}

export function OfferingSelector({
  offerings,
  selectedIds,
  remainingSeconds,
  needMatkul,
  needProyek,
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
    <div className="has-mobile-bottom-bar" style={{ paddingBottom: "6rem" }}>
      {/* 1. STICKY TOP CONTROLLER (Foto 1: HANYA Countdown Waktu, Pilihan Kelas, Cari & Kuota Tersedia/Penuh) */}
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
          border: hasQueue ? "1.5px solid var(--warning)" : "1.5px solid var(--primary-border)",
          padding: "0.75rem 1rem",
          marginBottom: "1rem",
        }}
      >
        {/* Baris 1: Countdown Waktu (HANYA tampil jika hasQueue === true) */}
        {hasQueue && (
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "0.6rem",
              paddingBottom: "0.45rem",
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
                  fontSize: "1.35rem",
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
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "0.725rem",
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "3px",
                  padding: "2px 6px",
                }}
                title="Perbarui kuota terkini"
              >
                <span>🔄</span>
                <span>{isRefreshingQuota ? "Memuat..." : "Refresh Kuota"}</span>
              </button>
            )}
          </div>
        )}

        {/* Baris 2: Tabs Pilihan Kelas Horizontal (Semua, A - E, Proyek) */}
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
            marginBottom: "0.55rem",
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
                  padding: "0.35rem 0.8rem",
                  borderRadius: "var(--radius-full)",
                  border: isActive ? "1.5px solid var(--primary)" : "1px solid var(--border-color)",
                  backgroundColor: isActive ? "var(--primary)" : "#ffffff",
                  color: isActive ? "#ffffff" : "var(--text-main)",
                  fontSize: "0.775rem",
                  fontWeight: isActive ? 800 : 600,
                  cursor: "pointer",
                  transition: "all 0.15s ease",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "0.3rem",
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

        {/* Baris 3: Kolom Cari Nama Mata Kuliah */}
        <div style={{ position: "relative", marginBottom: "0.55rem" }}>
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
                padding: "0.3rem 0.75rem",
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
                padding: "0.3rem 0.75rem",
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
                padding: "0.3rem 0.75rem",
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
                background: "none",
                border: "none",
                color: "var(--text-muted)",
                fontSize: "0.725rem",
                fontWeight: 600,
                cursor: "pointer",
                display: "inline-flex",
                alignItems: "center",
                gap: "3px",
                padding: "2px 6px",
              }}
              title="Perbarui kuota terkini"
            >
              <span>🔄</span>
              <span>{isRefreshingQuota ? "Memuat..." : "Refresh Kuota"}</span>
            </button>
          )}
        </div>
      </div>

      {/* 2. DAFTAR MATA KULIAH: FORMAT BARIS KOMPAK */}
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
                    .map((s) => `${s.hari} ${s.jam_mulai.slice(0, 5)}–${s.jam_selesai.slice(0, 5)}`)
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
                  <div style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.35rem", flexWrap: "wrap" }}>
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
                      margin: "0 0 0.35rem 0",
                      lineHeight: 1.35,
                      wordBreak: "break-word",
                    }}
                  >
                    {item.nama}
                  </h3>

                  {/* Jadwal Ringkas */}
                  <div
                    style={{
                      fontSize: "0.75rem",
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

                {/* Kolom Kanan: Tombol Pilih */}
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
                    {isSelected ? "Terpilih" : isFull ? "Penuh" : "Pilih"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 3. AUTO DROP-UP SHEET (Foto 2: Pop-up / Drop-Up Otomatis dari Bawah Layar) */}
      {showDropUp && (
        <>
          {/* Backdrop gelap semi-transparan untuk menutup drop-up jika diklik di luar */}
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

          {/* Drawer Drop-Up Mengambang */}
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
                padding: "0.85rem 1.15rem",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                backgroundColor: "#f8fafc",
                borderTopLeftRadius: "var(--radius-xl)",
                borderTopRightRadius: "var(--radius-xl)",
              }}
            >
              <h4 style={{ margin: 0, fontSize: "0.95rem", fontWeight: 800, color: "var(--text-main)" }}>
                Mata Kuliah Terpilih ({selectedOfferings.length} dari {needMatkul + needProyek})
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

            {/* Isi Daftar Pilihan (TANPA JADWAL WAKTU SESUAI INSTRUKSI USER) */}
            <div
              style={{
                padding: "1rem 1.15rem",
                overflowY: "auto",
                display: "flex",
                flexDirection: "column",
                gap: "0.6rem",
              }}
            >
              {selectedOfferings.length === 0 ? (
                <div style={{ textAlign: "center", padding: "1.5rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                  Belum ada mata kuliah yang dipilih.
                  <br />
                  <span style={{ fontSize: "0.775rem" }}>Silakan klik tombol <strong>Pilih</strong> pada daftar kelas.</span>
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
                        padding: "0.75rem 0.85rem",
                        backgroundColor: "#f8fafc",
                        border: "1px solid var(--border-color)",
                        borderRadius: "var(--radius-md)",
                        gap: "0.65rem",
                      }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.2rem" }}>
                          <span
                            style={{
                              fontSize: "0.68rem",
                              fontWeight: 800,
                              padding: "2px 6px",
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
                            fontSize: "0.875rem",
                            fontWeight: 700,
                            color: "var(--text-main)",
                            lineHeight: 1.3,
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
                          fontSize: "0.75rem",
                          fontWeight: 700,
                          padding: "0.4rem 0.75rem",
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

      {/* 4. FLOATING BOTTOM BAR (Foto 2: Auto Drop-Up Trigger & Status) */}
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
        {/* Area Status Kiri (Bisa diklik untuk Auto Drop-Up) */}
        <div
          onClick={() => setShowDropUp(!showDropUp)}
          style={{ flex: 1, cursor: "pointer", userSelect: "none" }}
          title="Klik untuk melihat mata kuliah yang sudah diambil"
        >
          <div
            style={{
              fontSize: "0.68rem",
              fontWeight: 700,
              color: "var(--text-muted)",
              textTransform: "uppercase",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }}
          >
            <span>TOTAL DIPILIH: {selectedIds.length} / {needMatkul + needProyek}</span>
            <span style={{ fontSize: "0.65rem", color: "var(--primary)" }}>{showDropUp ? "▼" : "▲"}</span>
          </div>
          <div
            style={{
              fontSize: "0.85rem",
              fontWeight: 800,
              color: isCompositionValid ? "var(--success)" : "var(--primary)",
              lineHeight: 1.2,
            }}
          >
            {`${matkulSelected}/${needMatkul} Matkul, ${proyekSelected}/${needProyek} Proyek`}
          </div>
        </div>

        {/* Tombol Aksi Kanan: Periksa & Daftar KRS */}
        <div style={{ display: "flex", gap: "0.45rem", alignItems: "center" }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => setShowDropUp(!showDropUp)}
            style={{
              minHeight: 44,
              padding: "0.55rem 0.95rem",
              fontSize: "0.825rem",
              fontWeight: 700,
              backgroundColor: showDropUp ? "var(--primary-light)" : "#ffffff",
              color: showDropUp ? "var(--primary)" : "var(--text-main)",
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            {showDropUp ? "Tutup" : "Periksa"}
          </button>

          <button
            type="button"
            className="btn btn-primary"
            onClick={onSubmitSelection}
            disabled={!isCompositionValid || isSubmitting}
            style={{
              minHeight: 44,
              padding: "0.55rem 1.25rem",
              fontSize: "0.85rem",
              fontWeight: 800,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
            }}
          >
            {isSubmitting ? "Menyimpan..." : "Daftar KRS"}
          </button>
        </div>
      </div>
    </div>
  );
}
