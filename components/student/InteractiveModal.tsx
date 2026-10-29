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
    if (dialog.title.toUpperCase().includes("PERHATIAN")) return "PERHATIAN";
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
        zIndex: 100050,
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
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: "0.45rem", marginBottom: "0.75rem" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              fontSize: "0.68rem",
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
              lineHeight: 1.2,
            }}
          >
            {getBadgeText()}
          </span>
          <h3
            style={{
              fontSize: "1.125rem",
              fontWeight: 800,
              color: "var(--text-main)",
              margin: 0,
              lineHeight: 1.3,
              letterSpacing: "-0.01em",
            }}
          >
            {dialog.title}
          </h3>
        </div>

        <p
          style={{
            fontSize: "0.85rem",
            color: "#475569",
            lineHeight: 1.55,
            marginTop: 0,
            marginBottom: "1rem",
            fontWeight: 500,
          }}
        >
          {dialog.message}
        </p>

        {dialog.details && dialog.details.length > 0 && (
          <div
            style={{
              backgroundColor: "#f8fafc",
              borderRadius: "var(--radius-lg)",
              padding: "0.65rem 1rem",
              marginBottom: "1.25rem",
              fontSize: "0.825rem",
              border: "1px solid var(--border-color)",
              maxHeight: "42vh",
              overflowY: "auto",
            }}
          >
            {dialog.details.map((item, idx) => (
              <div
                key={idx}
                style={{
                  padding: "0.55rem 0",
                  borderBottom: idx < dialog.details!.length - 1 ? "1px dashed #cbd5e1" : "none",
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.15rem" }}>
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
                        fontSize: "0.7rem",
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

                <div style={{ fontWeight: 700, color: "var(--text-main)", fontSize: "0.9rem", lineHeight: 1.35 }}>
                  {item.value}
                </div>

                {item.schedule && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "5px",
                      fontSize: "0.75rem",
                      fontWeight: 600,
                      color: "#64748b",
                      marginTop: "0.2rem",
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
              style={{
                width: "100%",
                padding: "0.85rem 1.35rem",
                fontSize: "0.95rem",
                fontWeight: 700,
                borderRadius: "var(--radius-lg)",
                cursor: "pointer",
              }}
            >
              {dialog.confirmText || (dialog.title.toUpperCase().includes("PERHATIAN") ? "Saya Mengerti & Lanjutkan" : "Tutup")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
