"use client";

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
    <div className="card" style={{ maxWidth: 440, margin: "4rem auto", padding: "2rem" }}>
      <div style={{ textAlign: "center", marginBottom: "1.75rem" }}>
        <h2 className="card-title" style={{ justifyContent: "center", fontSize: "1.35rem" }}>
          Masuk Administrator
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem" }}>
          Panel Manajemen Pemilihan KRS Fakultas Pertanian
        </p>
      </div>

      {actionError && (
        <div className="alert alert-danger" style={{ marginBottom: "1.25rem", fontSize: "0.85rem" }}>
          <span>{actionError}</span>
        </div>
      )}

      <form onSubmit={onLogin}>
        <div className="form-group">
          <label className="form-label">Username atau Email Admin</label>
          <input
            type="text"
            className="form-control"
            placeholder="admin"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={authLoading}
            autoFocus
            required
          />
        </div>

        <div className="form-group">
          <label className="form-label">Kata Sandi</label>
          <input
            type="password"
            className="form-control"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={authLoading}
            required
          />
        </div>

        <button type="submit" className="btn btn-primary btn-block" disabled={authLoading}>
          {authLoading ? "Memverifikasi..." : "Masuk ke Panel Admin →"}
        </button>
      </form>
    </div>
  );
}
