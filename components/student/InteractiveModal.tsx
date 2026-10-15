"use client";

import { ModalDialogState } from "@/lib/types";

interface InteractiveModalProps {
  dialog: ModalDialogState;
  onClose: () => void;
}

export function InteractiveModal({ dialog, onClose }: InteractiveModalProps) {
  if (!dialog.isOpen) return null;

  const isDanger = dialog.type === "danger";
  const isWarning = dialog.type === "warning";
  const isConfirm = dialog.type === "confirm";

  const getHeaderColor = () => {
    if (isDanger) return "var(--danger)";
    if (isWarning) return "var(--warning)";
    return "var(--primary)";
  };

  const getBadgeText = () => {
    if (isDanger) return "PERHATIAN";
    if (isWarning) return "PERINGATAN";
    if (isConfirm) return "KONFIRMASI";
    return "PEMBERITAHUAN";
  };

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "rgba(15, 23, 42, 0.65)",
        backdropFilter: "blur(4px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
        padding: "1rem",
        animation: "fadeIn 0.15s ease-out",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 480,
          backgroundColor: "#ffffff",
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
          borderRadius: "var(--radius-lg)",
          padding: "1.75rem",
          border: `1px solid ${getHeaderColor()}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 700,
              padding: "2px 8px",
              borderRadius: "var(--radius-sm)",
              backgroundColor: isDanger
                ? "var(--danger-light)"
                : isWarning
                ? "var(--warning-light)"
                : "var(--bg-subtle)",
              color: getHeaderColor(),
              border: `1px solid ${getHeaderColor()}`,
              letterSpacing: "0.04em",
            }}
          >
            {getBadgeText()}
          </span>
          <h3 style={{ fontSize: "1.1rem", fontWeight: 700, color: "var(--text-main)", margin: 0 }}>
            {dialog.title}
          </h3>
        </div>

        <p style={{ fontSize: "0.95rem", color: "var(--text-main)", lineHeight: 1.5, marginBottom: "1rem" }}>
          {dialog.message}
        </p>

        {dialog.details && dialog.details.length > 0 && (
          <div
            style={{
              backgroundColor: "var(--bg-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "0.75rem 1rem",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
              border: "1px solid var(--border-color)",
            }}
          >
            {dialog.details.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.25rem 0",
                  borderBottom: idx < dialog.details!.length - 1 ? "1px dashed #cbd5e1" : "none",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{item.label}:</span>
                <span style={{ fontWeight: 600, color: "var(--text-body)" }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1rem" }}>
          {isConfirm ? (
            <>
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {dialog.cancelText || "Batal"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  dialog.onConfirm?.();
                }}
              >
                {dialog.confirmText || "Konfirmasi"}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={isDanger ? "btn btn-danger" : "btn btn-primary"}
              onClick={onClose}
              style={{ minWidth: 100 }}
            >
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
