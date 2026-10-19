"use client";

import Image from "next/image";
import Link from "next/link";

interface AdminLoginCardProps {
  username: string;
  setUsername: (val: string) => void;
  password: string;
  setPassword: (val: string) => void;
  authLoading: boolean;
  actionError: string | null;
  onLogin: (e: React.FormEvent) => void;
}

export function AdminLoginCard({
  username,
  setUsername,
  password,
  setPassword,
  authLoading,
  actionError,
  onLogin,
}: AdminLoginCardProps) {
  return (
    <div className="admin-login-canvas">
      <div style={{ textAlign: "center", marginBottom: "1.75rem", maxWidth: 480 }}>
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", width: "100%", marginBottom: "1.25rem" }}>
          <Image
            src="/logo-instiper.png"
            alt="Logo INSTIPER"
            width={100}
            height={90}
            priority
            style={{ objectFit: "contain", display: "block" }}
          />
        </div>

        <div className="admin-control-badge">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
          </svg>
          ADMINISTRATOR CONTROL CENTER
        </div>

        <h1 style={{ fontSize: "2rem", fontWeight: 800, color: "#ffffff", letterSpacing: "-0.025em", margin: "0.25rem 0" }}>
          Portal Admin KRS
        </h1>
        <p style={{ color: "#a7f3d0", fontSize: "0.85rem", fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase" }}>
          Fakultas Pertanian INSTIPER Yogyakarta
        </p>
      </div>

      <div
        className="card"
        style={{
          width: "100%",
          maxWidth: 460,
          padding: "2.5rem 2rem",
          borderRadius: "var(--radius-xl)",
          boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.45)",
          border: "1px solid rgba(255, 255, 255, 0.15)",
          backgroundColor: "#ffffff",
        }}
      >
        {actionError && (
          <div className="alert alert-danger" style={{ marginBottom: "1.25rem", fontSize: "0.85rem" }}>
            <span>{actionError}</span>
          </div>
        )}

        <form onSubmit={onLogin}>
          <div className="form-group">
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#475569" }}>
              Username Admin
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="text"
                className="form-control"
                placeholder="Contoh: admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={authLoading}
                autoFocus
                required
                style={{ paddingLeft: "2.6rem" }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "0.95rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  display: "flex",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
              </span>
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: "1.75rem" }}>
            <label className="form-label" style={{ fontSize: "0.75rem", textTransform: "uppercase", letterSpacing: "0.05em", color: "#475569" }}>
              Kata Sandi
            </label>
            <div style={{ position: "relative" }}>
              <input
                type="password"
                className="form-control"
                placeholder="Masukkan password admin"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={authLoading}
                required
                style={{ paddingLeft: "2.6rem" }}
              />
              <span
                style={{
                  position: "absolute",
                  left: "0.95rem",
                  top: "50%",
                  transform: "translateY(-50%)",
                  color: "#94a3b8",
                  display: "flex",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                  <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                </svg>
              </span>
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
            disabled={authLoading}
            style={{ padding: "0.9rem", fontSize: "0.95rem" }}
          >
            {authLoading ? (
              <>
                <span className="spinner" style={{ width: 16, height: 16 }} />
                <span>Memverifikasi...</span>
              </>
            ) : (
              <span>Masuk ke Admin Panel →</span>
            )}
          </button>
        </form>
      </div>

      <div style={{ marginTop: "1.75rem", textAlign: "center" }}>
        <Link
          href="/"
          style={{
            color: "#34d399",
            textDecoration: "none",
            fontSize: "0.875rem",
            fontWeight: 600,
            display: "inline-flex",
            alignItems: "center",
            gap: "0.4rem",
            transition: "opacity 0.15s ease",
          }}
        >
          ← Kembali ke Portal Mahasiswa
        </Link>
      </div>
    </div>
  );
}
