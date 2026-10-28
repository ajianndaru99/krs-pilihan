"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Offering } from "@/lib/types";

interface ScheduleOverviewModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function ScheduleOverviewModal({ isOpen, onClose }: ScheduleOverviewModalProps) {
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedClass, setSelectedClass] = useState("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    // Jika sudah ada data yang dimuat, jangan memanggil server lagi (hemat bandwidth & zero server load)
    if (offerings.length > 0) return;

    let isMounted = true;
    const fetchOfferings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase.rpc("daftar_kelas");
        if (error) throw error;
        if (isMounted && Array.isArray(data)) {
          setOfferings(data as Offering[]);
        }
      } catch {
        // Gagal memuat jadwal secara hening
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOfferings();

    return () => {
      isMounted = false;
    };
  }, [isOpen, offerings.length]);

  if (!isOpen) return null;

  const filteredOfferings = offerings.filter((item) => {
    // Filter kelas
    if (selectedClass === "proyek") {
      if (item.jenis !== "proyek") return false;
    } else if (selectedClass !== "all") {
      if (item.kelas !== selectedClass) return false;
    }

    // Filter pencarian
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchName = item.nama.toLowerCase().includes(q);
      const matchTopik = item.topik?.toLowerCase().includes(q);
      const matchKelas = item.kelas?.toLowerCase().includes(q);
      return matchName || matchTopik || matchKelas;
    }

    return true;
  });

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.7)",
        backdropFilter: "blur(3px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 99999,
        padding: "0.75rem",
        animation: "fadeIn 0.15s ease-out",
      }}
      onClick={onClose}
    >
      <div
        style={{
          backgroundColor: "#ffffff",
          borderRadius: "var(--radius-xl, 1rem)",
          width: "100%",
          maxWidth: "640px",
          maxHeight: "88vh",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div
          style={{
            padding: "1rem 1.25rem",
            borderBottom: "1px solid var(--border-color, #e2e8f0)",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            backgroundColor: "#f8fafc",
          }}
        >
          <div>
            <h3 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)" }}>
              📋 Daftar & Jadwal Mata Kuliah Pilihan
            </h3>
            <p style={{ margin: "2px 0 0 0", fontSize: "0.75rem", color: "var(--text-muted)" }}>
              Fakultas Pertanian INSTIPER Yogyakarta
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: "1.25rem",
              cursor: "pointer",
              color: "var(--text-muted)",
              lineHeight: 1,
              padding: "4px 8px",
              borderRadius: "4px",
            }}
            title="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ padding: "0.75rem 1.25rem 0.5rem", borderBottom: "1px solid #f1f5f9" }}>
          {/* Kolom Pencarian */}
          <input
            type="text"
            placeholder="Cari mata kuliah..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "0.5rem 0.75rem",
              borderRadius: "var(--radius-md, 0.5rem)",
              border: "1px solid var(--border-color, #cbd5e1)",
              fontSize: "0.825rem",
              marginBottom: "0.5rem",
            }}
          />

          {/* Tab Filter Kelas - HP Friendly Scroll */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.3rem",
              overflowX: "auto",
              WebkitOverflowScrolling: "touch",
              paddingBottom: "4px",
              scrollbarWidth: "none",
            }}
          >
            {[
              { id: "all", label: "Semua" },
              { id: "A", label: "Kelas A" },
              { id: "B", label: "Kelas B" },
              { id: "C", label: "Kelas C" },
              { id: "D", label: "Kelas D" },
              { id: "E", label: "Kelas E" },
              { id: "proyek", label: "Proyek Terapan" },
            ].map((tab) => {
              const active = selectedClass === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setSelectedClass(tab.id)}
                  style={{
                    flexShrink: 0,
                    padding: "0.3rem 0.65rem",
                    borderRadius: "var(--radius-full, 9999px)",
                    fontSize: "0.725rem",
                    fontWeight: active ? 800 : 600,
                    backgroundColor: active ? "var(--primary)" : "#f1f5f9",
                    color: active ? "#ffffff" : "var(--text-main)",
                    border: "none",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Daftar Mata Kuliah (Scrollable Body) */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            overflowY: "auto",
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "0.6rem",
          }}
        >
          {loading ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Memuat daftar mata kuliah & jadwal...
            </div>
          ) : filteredOfferings.length === 0 ? (
            <div style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)", fontSize: "0.85rem" }}>
              Tidak ada mata kuliah yang cocok dengan filter.
            </div>
          ) : (
            filteredOfferings.map((item) => (
              <div
                key={item.id}
                style={{
                  padding: "0.75rem 0.9rem",
                  borderRadius: "var(--radius-lg, 0.75rem)",
                  border: "1px solid var(--border-color, #e2e8f0)",
                  backgroundColor: "#ffffff",
                  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
                  display: "flex",
                  flexDirection: "column",
                  gap: "0.35rem",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.5rem" }}>
                  <div>
                    <span
                      style={{
                        fontSize: "0.65rem",
                        fontWeight: 800,
                        padding: "1px 6px",
                        borderRadius: "var(--radius-full, 9999px)",
                        backgroundColor: item.jenis === "proyek" ? "#fef3c7" : "var(--primary-light, #ecfdf5)",
                        color: item.jenis === "proyek" ? "#92400e" : "var(--primary)",
                        marginRight: "6px",
                        textTransform: "uppercase",
                      }}
                    >
                      {item.jenis === "proyek" ? "PROYEK" : `KELAS ${item.kelas || "-"}`}
                    </span>
                    <strong style={{ fontSize: "0.875rem", color: "var(--text-main)" }}>
                      {item.nama}
                    </strong>
                  </div>
                  <div
                    style={{
                      fontSize: "0.75rem",
                      fontWeight: 700,
                      color: item.sisa > 0 ? "var(--primary)" : "var(--danger)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    Sisa: {item.sisa} / {item.kuota}
                  </div>
                </div>

                {item.topik && (
                  <div style={{ fontSize: "0.775rem", color: "var(--text-muted)" }}>
                    Topik: <em>{item.topik}</em>
                  </div>
                )}

                {/* Jadwal Kuliah */}
                {item.jadwal && item.jadwal.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.35rem", marginTop: "0.15rem" }}>
                    {item.jadwal.map((j, idx) => (
                      <span
                        key={idx}
                        style={{
                          fontSize: "0.725rem",
                          backgroundColor: "#f8fafc",
                          border: "1px solid #e2e8f0",
                          borderRadius: "4px",
                          padding: "2px 6px",
                          color: "var(--text-body)",
                        }}
                      >
                        📅 <strong>{j.hari}</strong>: {j.jam_mulai?.slice(0, 5)} - {j.jam_selesai?.slice(0, 5)} {j.ruang ? `(${j.ruang})` : ""}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))
          )}
        </div>

        {/* Modal Footer */}
        <div
          style={{
            padding: "0.75rem 1.25rem",
            borderTop: "1px solid var(--border-color, #e2e8f0)",
            backgroundColor: "#f8fafc",
            textAlign: "right",
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={onClose}
            style={{ padding: "0.45rem 1.25rem", fontSize: "0.85rem", borderRadius: "var(--radius-md)" }}
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  );
}
