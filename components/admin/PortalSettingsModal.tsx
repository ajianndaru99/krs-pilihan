"use client";

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { AdminSystemStatus } from "@/lib/types";
import { formatWIBDateTime, isoToWibInput, wibInputToIso } from "@/lib/portal-schedule";

interface PortalSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentStatus: AdminSystemStatus | null;
  onSuccess: () => void;
}

type Mode = "manual" | "scheduled";

export function PortalSettingsModal({
  isOpen,
  onClose,
  currentStatus,
  onSuccess,
}: PortalSettingsModalProps) {
  const [mode, setMode] = useState<Mode>("manual");
  const [manualOpen, setManualOpen] = useState(false);
  const [openAt, setOpenAt] = useState("");
  const [closeAt, setCloseAt] = useState("");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  // Sinkronisasi state awal dari status sistem yang berlaku
  useEffect(() => {
    if (!isOpen || !currentStatus) return;
    setMode((currentStatus.portal_mode as Mode) ?? "manual");
    setManualOpen(currentStatus.portal_open);
    setOpenAt(isoToWibInput(currentStatus.scheduled_open_at));
    setCloseAt(isoToWibInput(currentStatus.scheduled_close_at));
    setNote(currentStatus.portal_note ?? "");
    setValidationError(null);
  }, [isOpen, currentStatus]);

  if (!isOpen) return null;

  const validate = (): string | null => {
    if (mode === "scheduled") {
      const openIso = wibInputToIso(openAt);
      const closeIso = wibInputToIso(closeAt);

      if (!openAt && !closeAt) {
        return "Isi minimal satu jadwal (buka atau tutup) untuk mode Terjadwal.";
      }
      if (openIso && closeIso) {
        const openTs = new Date(openIso).getTime();
        const closeTs = new Date(closeIso).getTime();
        if (closeTs <= openTs) {
          return "Jadwal tutup harus setelah jadwal buka.";
        }
      }
    }
    return null;
  };

  const handleSave = async () => {
    const err = validate();
    if (err) {
      setValidationError(err);
      return;
    }
    setValidationError(null);
    setSaving(true);

    try {
      const openIso = openAt ? wibInputToIso(openAt) : null;
      const closeIso = closeAt ? wibInputToIso(closeAt) : null;

      const { data, error } = await supabase.rpc("admin_atur_portal", {
        p_mode: mode,
        p_manual_open: mode === "manual" ? manualOpen : null,
        p_open_at: mode === "scheduled" ? openIso : null,
        p_close_at: mode === "scheduled" ? closeIso : null,
        p_note: note.trim() || null,
      });

      if (error) {
        setValidationError(error.message);
        return;
      }

      const res = data as { ok?: boolean; error?: string } | null;
      if (!res?.ok) {
        setValidationError(res?.error ?? "Gagal menyimpan pengaturan portal.");
        return;
      }

      onSuccess();
      onClose();
    } catch (e: unknown) {
      setValidationError(e instanceof Error ? e.message : "Kesalahan koneksi.");
    } finally {
      setSaving(false);
    }
  };

  // Preview status yang akan terlihat mahasiswa
  const renderPreview = () => {
    if (mode === "manual") {
      return manualOpen ? (
        <span style={{ color: "var(--success)", fontWeight: 700 }}>● Portal DIBUKA (manual)</span>
      ) : (
        <span style={{ color: "var(--danger)", fontWeight: 700 }}>○ Portal DITUTUP (manual)</span>
      );
    }

    const openIso = wibInputToIso(openAt);
    const closeIso = wibInputToIso(closeAt);
    const now = Date.now();

    if (openIso && closeIso) {
      const openTs = new Date(openIso).getTime();
      const closeTs = new Date(closeIso).getTime();
      if (now < openTs) {
        return <span style={{ color: "#1d4ed8", fontWeight: 700 }}>⏳ Mahasiswa melihat hitung mundur pembukaan</span>;
      }
      if (now >= openTs && now < closeTs) {
        return <span style={{ color: "var(--success)", fontWeight: 700 }}>● Portal DIBUKA (akan tutup otomatis)</span>;
      }
      return <span style={{ color: "var(--danger)", fontWeight: 700 }}>○ Portal DITUTUP (jadwal berakhir)</span>;
    }

    if (openIso) {
      const openTs = new Date(openIso).getTime();
      return now < openTs ? (
        <span style={{ color: "#1d4ed8", fontWeight: 700 }}>⏳ Mahasiswa melihat hitung mundur pembukaan</span>
      ) : (
        <span style={{ color: "var(--success)", fontWeight: 700 }}>● Portal DIBUKA (terjadwal)</span>
      );
    }

    if (closeIso) {
      const closeTs = new Date(closeIso).getTime();
      return now < closeTs ? (
        <span style={{ color: "var(--success)", fontWeight: 700 }}>● Portal DIBUKA (akan tutup otomatis)</span>
      ) : (
        <span style={{ color: "var(--danger)", fontWeight: 700 }}>○ Portal DITUTUP (jadwal berakhir)</span>
      );
    }

    return <span style={{ color: "var(--text-muted)" }}>— Isi jadwal untuk melihat preview</span>;
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "1rem",
        backgroundColor: "rgba(15, 23, 42, 0.5)",
        backdropFilter: "blur(4px)",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 520,
          borderRadius: "var(--radius-xl)",
          backgroundColor: "#ffffff",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          overflow: "hidden",
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: "1.15rem 1.5rem",
            borderBottom: "1px solid var(--border-light)",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "1rem",
          }}
        >
          <div>
            <h2 style={{ margin: 0, fontSize: "1.05rem", fontWeight: 800, color: "var(--text-main)" }}>
              🗓 Atur Jadwal Portal
            </h2>
            <p style={{ margin: "0.2rem 0 0", fontSize: "0.8rem", color: "var(--text-muted)" }}>
              Kelola buka/tutup portal pemilihan KRS
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
              padding: "0.25rem",
              lineHeight: 1,
              flexShrink: 0,
            }}
            aria-label="Tutup"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: "1.5rem" }}>
          {/* Pilih Mode */}
          <div style={{ marginBottom: "1.25rem" }}>
            <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-body)", marginBottom: "0.5rem" }}>
              Mode Kontrol Portal
            </div>
            <div style={{ display: "flex", gap: "0.75rem" }}>
              {(["manual", "scheduled"] as const).map((m) => (
                <label
                  key={m}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.65rem 0.85rem",
                    borderRadius: "var(--radius-md)",
                    border: `2px solid ${mode === m ? "var(--primary)" : "var(--border-light)"}`,
                    backgroundColor: mode === m ? "#f0fdf4" : "#ffffff",
                    cursor: "pointer",
                    fontSize: "0.85rem",
                    fontWeight: mode === m ? 700 : 500,
                    color: mode === m ? "var(--primary)" : "var(--text-body)",
                    transition: "all 0.15s",
                  }}
                >
                  <input
                    type="radio"
                    name="portal_mode"
                    value={m}
                    checked={mode === m}
                    onChange={() => {
                      setMode(m);
                      setValidationError(null);
                    }}
                    style={{ accentColor: "var(--primary)" }}
                  />
                  {m === "manual" ? "🔧 Manual" : "📅 Terjadwal"}
                </label>
              ))}
            </div>
          </div>

          {/* Mode Manual */}
          {mode === "manual" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#f8fafc",
                border: "1px solid var(--border-light)",
                marginBottom: "1.25rem",
              }}
            >
              <div style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-body)", marginBottom: "0.5rem" }}>
                Status Portal (efektif sekarang)
              </div>
              <div style={{ display: "flex", gap: "0.75rem" }}>
                {[true, false].map((val) => (
                  <label
                    key={String(val)}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      gap: "0.5rem",
                      padding: "0.6rem 0.85rem",
                      borderRadius: "var(--radius-md)",
                      border: `2px solid ${manualOpen === val ? (val ? "var(--success)" : "var(--danger)") : "var(--border-light)"}`,
                      backgroundColor: manualOpen === val ? (val ? "#f0fdf4" : "#fef2f2") : "#ffffff",
                      cursor: "pointer",
                      fontSize: "0.85rem",
                      fontWeight: manualOpen === val ? 700 : 500,
                      color: manualOpen === val ? (val ? "var(--success)" : "var(--danger)") : "var(--text-muted)",
                      transition: "all 0.15s",
                    }}
                  >
                    <input
                      type="radio"
                      name="manual_state"
                      checked={manualOpen === val}
                      onChange={() => setManualOpen(val)}
                      style={{ accentColor: val ? "var(--success)" : "var(--danger)" }}
                    />
                    {val ? "● Buka Portal" : "○ Tutup Portal"}
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Mode Terjadwal */}
          {mode === "scheduled" && (
            <div
              style={{
                padding: "1rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#f8fafc",
                border: "1px solid var(--border-light)",
                marginBottom: "1.25rem",
              }}
            >
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "0.85rem",
                }}
              >
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-body)", display: "block", marginBottom: "0.3rem" }}>
                    📅 Jadwal Buka (WIB)
                  </label>
                  <input
                    type="datetime-local"
                    value={openAt}
                    onChange={(e) => {
                      setOpenAt(e.target.value);
                      setValidationError(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1.5px solid var(--border-light)",
                      fontSize: "0.82rem",
                      boxSizing: "border-box",
                    }}
                  />
                  {openAt && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      {formatWIBDateTime(wibInputToIso(openAt))}
                    </div>
                  )}
                </div>
                <div>
                  <label style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-body)", display: "block", marginBottom: "0.3rem" }}>
                    🔒 Jadwal Tutup (WIB)
                  </label>
                  <input
                    type="datetime-local"
                    value={closeAt}
                    onChange={(e) => {
                      setCloseAt(e.target.value);
                      setValidationError(null);
                    }}
                    style={{
                      width: "100%",
                      padding: "0.5rem 0.6rem",
                      borderRadius: "var(--radius-sm)",
                      border: "1.5px solid var(--border-light)",
                      fontSize: "0.82rem",
                      boxSizing: "border-box",
                    }}
                  />
                  {closeAt && (
                    <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.2rem" }}>
                      {formatWIBDateTime(wibInputToIso(closeAt))}
                    </div>
                  )}
                </div>
              </div>
              <div
                style={{
                  marginTop: "0.75rem",
                  fontSize: "0.75rem",
                  color: "#64748b",
                  backgroundColor: "#eff6ff",
                  border: "1px solid #bfdbfe",
                  borderRadius: "var(--radius-sm)",
                  padding: "0.4rem 0.6rem",
                  lineHeight: 1.45,
                }}
              >
                💡 Semua waktu dalam WIB (UTC+7). Kosongkan jadwal buka untuk mode &ldquo;tutup otomatis saja&rdquo;, atau kosongkan jadwal tutup untuk membuka tanpa batas waktu.
              </div>
            </div>
          )}

          {/* Catatan / Pengumuman */}
          <div style={{ marginBottom: "1.25rem" }}>
            <label style={{ fontSize: "0.8rem", fontWeight: 700, color: "var(--text-body)", display: "block", marginBottom: "0.3rem" }}>
              📢 Catatan / Pengumuman untuk Mahasiswa <span style={{ fontWeight: 400, color: "var(--text-muted)" }}>(opsional)</span>
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: Portal dibuka selama 2 hari. Hubungi prodi jika ada kendala."
              rows={2}
              maxLength={300}
              style={{
                width: "100%",
                padding: "0.6rem 0.75rem",
                borderRadius: "var(--radius-sm)",
                border: "1.5px solid var(--border-light)",
                fontSize: "0.82rem",
                resize: "vertical",
                boxSizing: "border-box",
                lineHeight: 1.45,
              }}
            />
            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textAlign: "right" }}>
              {note.length}/300
            </div>
          </div>

          {/* Preview Status */}
          <div
            style={{
              padding: "0.6rem 0.85rem",
              borderRadius: "var(--radius-md)",
              backgroundColor: "#f8fafc",
              border: "1px solid var(--border-light)",
              fontSize: "0.8rem",
              marginBottom: "1rem",
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            <span style={{ color: "var(--text-muted)", fontWeight: 600, flexShrink: 0 }}>Preview mahasiswa:</span>
            {renderPreview()}
          </div>

          {/* Error */}
          {validationError && (
            <div
              style={{
                padding: "0.6rem 0.85rem",
                borderRadius: "var(--radius-md)",
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                fontSize: "0.8rem",
                color: "#dc2626",
                marginBottom: "0.85rem",
                fontWeight: 600,
              }}
            >
              ⚠ {validationError}
            </div>
          )}

          {/* Tombol Aksi */}
          <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end" }}>
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
              disabled={saving}
              style={{ fontSize: "0.85rem", padding: "0.6rem 1.25rem" }}
            >
              Batal
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="btn btn-primary"
              disabled={saving}
              style={{ fontSize: "0.85rem", padding: "0.6rem 1.5rem", display: "flex", alignItems: "center", gap: "0.4rem" }}
            >
              {saving ? (
                <>
                  <span className="spinner spinner-primary" style={{ width: 14, height: 14, borderColor: "#ffffff", borderTopColor: "transparent" }} />
                  <span>Menyimpan...</span>
                </>
              ) : (
                <>
                  <span>✓</span>
                  <span>Simpan Pengaturan</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
