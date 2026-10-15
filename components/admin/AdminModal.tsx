"use client";

import { useState } from "react";

export type AdminModalType = "info" | "success" | "warning" | "danger" | "confirm" | "prompt";

export interface AdminModalState {
  isOpen: boolean;
  type: AdminModalType;
  title: string;
  message: string;
  details?: { label: string; value: string }[];
  confirmText?: string;
  cancelText?: string;
  promptLabel?: string;
  promptDefaultValue?: string;
  promptPlaceholder?: string;
  promptInputType?: "text" | "number";
  onConfirm?: (inputValue?: string) => void;
}

interface AdminModalProps {
  modal: AdminModalState;
  onClose: () => void;
}

export function AdminModal({ modal, onClose }: AdminModalProps) {
  const [inputValue, setInputValue] = useState(modal.promptDefaultValue || "");

  if (!modal.isOpen) return null;

  const isDanger = modal.type === "danger";
  const isWarning = modal.type === "warning";
  const isSuccess = modal.type === "success";
  const isConfirm = modal.type === "confirm" || isDanger;
  const isPrompt = modal.type === "prompt";

  const getHeaderColor = () => {
    if (isDanger) return "var(--danger)";
    if (isWarning) return "var(--warning)";
    if (isSuccess) return "var(--success)";
    return "var(--primary)";
  };

  const getBadgeText = () => {
    if (isDanger) return "PERHATIAN";
    if (isWarning) return "PERINGATAN";
    if (isSuccess) return "BERHASIL";
    if (isPrompt) return "EDIT";
    if (isConfirm) return "KONFIRMASI";
    return "INFORMASI";
  };

  const handleConfirmClick = () => {
    onClose();
    if (modal.onConfirm) {
      modal.onConfirm(isPrompt ? inputValue : undefined);
    }
  };

  return (
    <div
      key={`${modal.title}-${modal.promptDefaultValue || ""}`}
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
        zIndex: 99999,
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
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
          borderRadius: "var(--radius-xl)",
          padding: "2rem",
          border: `1px solid ${getHeaderColor()}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.85rem" }}>
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
                : isSuccess
                ? "var(--success-light)"
                : "var(--primary-light)",
              color: getHeaderColor(),
              border: `1px solid ${getHeaderColor()}`,
              letterSpacing: "0.06em",
            }}
          >
            {getBadgeText()}
          </span>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-main)", margin: 0, letterSpacing: "-0.015em" }}>
            {modal.title}
          </h3>
        </div>

        <p style={{ fontSize: "0.925rem", color: "var(--text-body)", lineHeight: 1.5, marginBottom: "1rem" }}>
          {modal.message}
        </p>

        {modal.details && modal.details.length > 0 && (
          <div
            style={{
              backgroundColor: "var(--bg-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "0.85rem 1.15rem",
              marginBottom: "1.25rem",
              fontSize: "0.85rem",
              border: "1px solid var(--border-color)",
            }}
          >
            {modal.details.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.3rem 0",
                  borderBottom: idx < modal.details!.length - 1 ? "1px dashed #cbd5e1" : "none",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 600 }}>{item.label}:</span>
                <span style={{ fontWeight: 700, color: "var(--text-main)" }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {isPrompt && (
          <div style={{ marginBottom: "1.25rem" }}>
            {modal.promptLabel && (
              <label className="form-label" style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                {modal.promptLabel}
              </label>
            )}
            <input
              type={modal.promptInputType || "text"}
              className="form-control"
              placeholder={modal.promptPlaceholder || ""}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              required
            />
          </div>
        )}

        <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
          {isConfirm || isPrompt ? (
            <>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={onClose}
                style={{ padding: "0.75rem 1.25rem" }}
              >
                {modal.cancelText || "Batal"}
              </button>
              <button
                type="button"
                className={isDanger ? "btn btn-danger" : "btn btn-primary"}
                onClick={handleConfirmClick}
                style={{ padding: "0.75rem 1.35rem" }}
              >
                {modal.confirmText || (isDanger ? "Ya, Lanjutkan" : "Konfirmasi")}
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
