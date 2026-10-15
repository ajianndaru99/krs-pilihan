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
    <div
      className="card"
      style={{
        maxWidth: 480,
        margin: "2rem auto",
        textAlign: "center",
        borderRadius: "var(--radius-xl)",
        padding: "2.5rem 2rem",
      }}
    >
      <div style={{ marginBottom: "1.75rem" }}>
        <h2 className="card-title" style={{ justifyContent: "center", fontSize: "1.4rem", margin: "0 0 0.5rem" }}>
          {isExpired ? "Sesi Antrian Kedaluwarsa" : "Ruang Tunggu Antrian Pemilihan"}
        </h2>
        <p style={{ color: "var(--text-muted)", fontSize: "0.875rem", margin: 0, lineHeight: 1.5 }}>
          {isExpired
            ? "Waktu tunggu sesi Anda telah habis karena tidak ada aktivitas."
            : "Sistem membatasi jumlah mahasiswa yang memilih secara bersamaan untuk menjamin keadilan kuota."}
        </p>
      </div>

      {!isExpired ? (
        <>
          <div
            style={{
              padding: "2rem 1.5rem",
              backgroundColor: "var(--primary-light)",
              borderRadius: "var(--radius-lg)",
              border: "1px solid var(--primary-border)",
              marginBottom: "1.5rem",
            }}
          >
            <div
              style={{
                fontSize: "0.8rem",
                fontWeight: 700,
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Posisi Antrian Anda
            </div>
            <div
              style={{
                fontSize: "4rem",
                fontWeight: 800,
                color: "var(--primary)",
                lineHeight: 1,
                margin: "0.6rem 0",
                fontVariantNumeric: "tabular-nums",
                letterSpacing: "-0.03em",
              }}
            >
              #{queuePosition !== null ? queuePosition : "-"}
            </div>
            <div style={{ fontSize: "0.85rem", color: "var(--text-muted)" }}>
              Nomor Tiket Antrian: <strong style={{ color: "var(--text-main)" }}>{queueNumber !== null ? queueNumber : "-"}</strong>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              padding: "0.85rem 1.25rem",
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
            <div style={{ display: "flex", alignItems: "center", gap: "0.45rem" }}>
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
              <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", fontWeight: 600 }}>Pembaruan Otomatis</span>
            </div>
          </div>

          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1.75rem", lineHeight: 1.5 }}>
            Halaman ini akan otomatis masuk ke pemilihan mata kuliah saat giliran Anda tiba. Mohon jangan menutup
            peramban.
          </p>

          <button
            type="button"
            className="btn btn-secondary btn-block"
            onClick={onExit}
            style={{ padding: "0.85rem" }}
          >
            Batalkan & Keluar
          </button>
        </>
      ) : (
        <div style={{ padding: "0.5rem" }}>
          <div className="alert alert-warning" style={{ marginBottom: "1.5rem", textAlign: "left" }}>
            <span>
              Sesi pemilihan Anda telah kedaluwarsa. Anda dapat mengantri kembali selama kuota retri antrian masih
              tersedia.
            </span>
          </div>

          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={onExit}
              style={{ flex: 1, padding: "0.85rem" }}
            >
              Keluar
            </button>
            {canRequeue && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={onRequeue}
                style={{ flex: 1, padding: "0.85rem" }}
              >
                Antri Kembali
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
