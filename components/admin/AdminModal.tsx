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

  const getHeaderIcon = () => {
    if (isDanger) return "⛔";
    if (isWarning) return "⚠️";
    if (isSuccess) return "✓";
    if (isPrompt) return "✏️";
    if (isConfirm) return "❓";
    return "ℹ️";
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
          boxShadow: "0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.08)",
          borderRadius: "var(--radius-lg)",
          padding: "1.75rem",
          border: `1px solid ${getHeaderColor()}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "0.85rem" }}>
          <span style={{ fontSize: "1.4rem" }}>{getHeaderIcon()}</span>
          <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: getHeaderColor(), margin: 0 }}>
            {modal.title}
          </h3>
        </div>

        <p style={{ fontSize: "0.95rem", color: "var(--text-main)", lineHeight: 1.5, marginBottom: "1rem" }}>
          {modal.message}
        </p>

        {modal.details && modal.details.length > 0 && (
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
            {modal.details.map((item, idx) => (
              <div
                key={idx}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  padding: "0.25rem 0",
                  borderBottom: idx < modal.details!.length - 1 ? "1px dashed #cbd5e1" : "none",
                }}
              >
                <span style={{ color: "var(--text-muted)", fontWeight: 500 }}>{item.label}:</span>
                <span style={{ fontWeight: 600, color: "var(--text-body)" }}>{item.value}</span>
              </div>
            ))}
          </div>
        )}

        {isPrompt && (
          <div style={{ marginBottom: "1.25rem" }}>
            {modal.promptLabel && (
              <label className="form-label" style={{ fontSize: "0.85rem" }}>
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
              <button type="button" className="btn btn-secondary" onClick={onClose}>
                {modal.cancelText || "Batal"}
              </button>
              <button
                type="button"
                className={isDanger ? "btn btn-danger" : "btn btn-primary"}
                onClick={handleConfirmClick}
              >
                {modal.confirmText || (isDanger ? "Ya, Lanjutkan" : "Konfirmasi")}
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
