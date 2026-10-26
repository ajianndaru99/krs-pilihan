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
    return "INFORMASI";
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
          maxHeight: "min(84vh, 620px)",
          overflowY: "auto",
          margin: "auto 0",
          backgroundColor: "#ffffff",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          borderRadius: "var(--radius-xl)",
          padding: "1.5rem 1.75rem",
          border: `1.5px solid ${getHeaderColor()}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "1rem" }}>
          <span
            style={{
              fontSize: "0.7rem",
              fontWeight: 800,
              padding: "3px 10px",
              borderRadius: "var(--radius-full)",
              backgroundColor: isDanger
                ? "var(--danger-light)"
                : isWarning
                ? "var(--warning-light)"
                : "var(--primary-light)",
              color: getHeaderColor(),
              border: `1px solid ${getHeaderColor()}`,
              letterSpacing: "0.06em",
            }}
          >
            {getBadgeText()}
          </span>
          <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-main)", margin: 0, letterSpacing: "-0.015em" }}>
            {dialog.title}
          </h3>
        </div>

        <p style={{ fontSize: "0.925rem", color: "var(--text-body)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
          {dialog.message}
        </p>

        {dialog.details && dialog.details.length > 0 && (
          <div
            style={{
              backgroundColor: "var(--bg-subtle)",
              borderRadius: "var(--radius-lg)",
              padding: "0.85rem 1.15rem",
              marginBottom: "1.5rem",
              fontSize: "0.85rem",
              border: "1px solid var(--border-color)",
              maxHeight: "45vh",
              overflowY: "auto",
            }}
          >
            {dialog.details.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: "0.5rem 0",
                  borderBottom: idx < dialog.details!.length - 1 ? "1px dashed #cbd5e1" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.2rem" }}>
                  <span
                    style={{
                      fontSize: "0.68rem",
                      fontWeight: 800,
                      color: "var(--primary)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    {item.label}
                  </span>
                  {item.subValue && (
                    <span
                      style={{
                        fontSize: "0.72rem",
                        fontWeight: 700,
                        backgroundColor: "#ffffff",
                        padding: "1px 7px",
                        borderRadius: "var(--radius-full)",
                        border: "1px solid var(--border-color)",
                        color: "var(--text-muted)",
                      }}
                    >
                      {item.subValue}
                    </span>
                  )}
                </div>

                <div style={{ fontWeight: 800, color: "var(--text-main)", fontSize: "0.925rem", lineHeight: 1.35 }}>
                  {item.value}
                </div>

                {item.schedule && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "0.775rem",
                      fontWeight: 600,
                      color: "#475569",
                      marginTop: "0.25rem",
                      fontFamily: "var(--font-mono)",
                    }}
                  >
                    <span>🕒 {item.schedule}</span>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            alignItems: "center",
            gap: "0.65rem",
            marginTop: "1.25rem",
            flexWrap: "wrap",
          }}
        >
          {isConfirm ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ padding: "0.75rem 1.25rem" }}
              >
                {dialog.cancelText || "Batal"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  onClose();
                  dialog.onConfirm?.();
                }}
                style={{ padding: "0.75rem 1.35rem" }}
              >
                {dialog.confirmText || "Konfirmasi"}
              </button>
            </>
          ) : dialog.actionLink ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{
                  padding: "0.7rem 1.15rem",
                  fontSize: "0.875rem",
                  fontWeight: 600,
                  order: 1,
                }}
              >
                Tutup
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const act = dialog.actionLink?.action;
                  onClose();
                  if (act) act();
                }}
                style={{
                  flex: 1,
                  minWidth: 190,
                  padding: "0.7rem 1.15rem",
                  fontSize: "0.875rem",
                  fontWeight: 700,
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "0.4rem",
                  order: 2,
                }}
              >
                <span>{dialog.actionLink.icon || "💬"}</span>
                <span>{dialog.actionLink.text}</span>
              </button>
            </>
          ) : (
            <button
              type="button"
              className={isDanger ? "btn btn-danger" : "btn btn-primary"}
              onClick={onClose}
              style={{ minWidth: 100, padding: "0.75rem 1.35rem" }}
            >
              Tutup
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
