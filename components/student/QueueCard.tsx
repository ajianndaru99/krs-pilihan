"use client";

interface QueueCardProps {
  queueState: string;
  queueNumber: number | null;
  queuePosition: number | null;
  estMinutes: number | null;
  canRequeue: boolean;
  onRequeue: () => void;
  onExit: () => void;
}

export function QueueCard({
  queueState,
  queueNumber,
  queuePosition,
  estMinutes,
  canRequeue,
  onRequeue,
  onExit,
}: QueueCardProps) {
  const isExpired = queueState === "expired";

  return (
    <div className="card" style={{ maxWidth: 540, margin: "2rem auto", textAlign: "center" }}>
      <div style={{ marginBottom: "1.5rem" }}>
        <h2 className="card-title" style={{ justifyContent: "center", fontSize: "1.35rem" }}>
          {isExpired ? "⌛ Sesi Antrian Kedaluwarsa" : "⏳ Ruang Tunggu Antrian Pemilihan"}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", marginTop: "0.25rem" }}>
          {isExpired
            ? "Waktu tunggu sesi Anda telah habis karena tidak ada aktivitas."
            : "Sistem membatasi jumlah mahasiswa yang memilih secara bersamaan untuk menjamin keadilan kuota."}
        </p>
      </div>

      {!isExpired ? (
        <>
          <div
            style={{
              padding: "1.75rem",
              backgroundColor: "var(--primary-light)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--primary-border)",
              marginBottom: "1.5rem",
            }}
          >
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Posisi Antrian Anda
            </div>
            <div
              style={{
                fontSize: "3.5rem",
                fontWeight: 800,
                color: "var(--primary)",
                lineHeight: 1.1,
                margin: "0.5rem 0",
              }}
            >
              #{queuePosition !== null ? queuePosition : "-"}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Nomor Tiket: <strong>{queueNumber !== null ? queueNumber : "-"}</strong>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-around",
              alignItems: "center",
              padding: "0.75rem",
              backgroundColor: "var(--bg-subtle)",
              borderRadius: "var(--radius-md)",
              marginBottom: "1.5rem",
              fontSize: "0.85rem",
            }}
          >
            <div>
              <span style={{ color: "var(--text-muted)" }}>Estimasi Menunggu: </span>
              <strong>{estMinutes !== null ? `~${estMinutes} menit` : "Menghitung..."}</strong>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
              <span
                style={{
                  display: "inline-block",
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  backgroundColor: "var(--success)",
                  animation: "pulse 1.5s infinite",
                }}
              />
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Pembaruan Otomatis</span>
            </div>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.5rem" }}>
            Halaman ini akan otomatis masuk ke pemilihan mata kuliah saat giliran Anda tiba. Mohon jangan menutup
            peramban.
          </p>

          <button type="button" className="btn btn-secondary" onClick={onExit} style={{ width: "100%" }}>
            Batalkan & Keluar
          </button>
        </>
      ) : (
        <div style={{ padding: "1rem" }}>
          <div className="alert alert-warning" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
            <span>
              Sesi pemilihan Anda telah kedaluwarsa. Anda dapat mengantri kembali selama kuota retri antrian masih
              tersedia.
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button type="button" className="btn btn-secondary" onClick={onExit} style={{ flex: 1 }}>
              Keluar
            </button>
            {canRequeue && (
              <button type="button" className="btn btn-primary" onClick={onRequeue} style={{ flex: 1 }}>
                Antri Kembali ↻
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
