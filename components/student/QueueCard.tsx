"use client";

interface QueueCardProps {
  queueState: string;
  queueNumber: number | null;
  queuePosition: number | null;
  estMinutes: number | null;
  canRequeue: boolean;
  isServerBusy?: boolean;
  studentName?: string;
  onRequeue: () => void;
  onExit: () => void;
}

export function QueueCard({
  queueState,
  queueNumber,
  queuePosition,
  estMinutes,
  canRequeue,
  isServerBusy = false,
  studentName,
  onRequeue,
  onExit,
}: QueueCardProps) {
  const isExpired = queueState === "expired";

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 480,
        margin: "1.25rem auto 2.5rem",
        padding: "0 0.5rem",
      }}
    >
      <div
        className="card"
        style={{
          width: "100%",
          textAlign: "center",
          borderRadius: "var(--radius-xl)",
          padding: "clamp(1.5rem, 5vw, 2.25rem) clamp(1.15rem, 4vw, 1.75rem)",
          backgroundColor: "#ffffff",
          boxShadow: "var(--shadow-card)",
          border: "1px solid var(--border-subtle)",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Header Kartu */}
        <div style={{ marginBottom: "1.5rem" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 12px",
              borderRadius: "var(--radius-full)",
              backgroundColor: isExpired ? "var(--warning-light)" : "var(--primary-light)",
              border: `1px solid ${isExpired ? "var(--warning-border)" : "var(--primary-border)"}`,
              color: isExpired ? "var(--warning)" : "var(--primary)",
              fontSize: "0.75rem",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "0.75rem",
            }}
          >
            <span>{isExpired ? "⚠️ Sesi Berakhir" : "⏳ Antrian Masuk Portal"}</span>
          </div>

          <h2
            style={{
              fontSize: "clamp(1.2rem, 4vw, 1.45rem)",
              fontWeight: 800,
              color: "var(--text-main)",
              margin: "0 0 0.4rem",
              letterSpacing: "-0.02em",
              lineHeight: 1.25,
            }}
          >
            {isExpired ? "Sesi Antrian Kedaluwarsa" : "Ruang Tunggu Pemilihan"}
          </h2>

          <p
            style={{
              color: "var(--text-muted)",
              fontSize: "0.85rem",
              margin: 0,
              lineHeight: 1.45,
            }}
          >
            {isExpired
              ? "Waktu sesi tunggu Anda telah berakhir karena tidak ada interaksi."
              : "Sistem membatasi jumlah mahasiswa yang memilih bersamaan agar portal tetap lancar dan adil."}
          </p>

          {studentName && (
            <div
              style={{
                marginTop: "0.6rem",
                fontSize: "0.8rem",
                color: "var(--text-body)",
                fontWeight: 600,
              }}
            >
              Mahasiswa: <span style={{ color: "var(--primary)" }}>{studentName}</span>
            </div>
          )}
        </div>

        {!isExpired ? (
          <>
            {/* Hero Box: Posisi Antrian */}
            <div
              style={{
                padding: "clamp(1.25rem, 4vw, 1.75rem) 1rem",
                backgroundColor: "var(--primary-light)",
                borderRadius: "var(--radius-lg)",
                border: "1.5px solid var(--primary-border)",
                marginBottom: "1.25rem",
                boxShadow: "inset 0 2px 4px rgba(13, 138, 99, 0.04)",
              }}
            >
              <div
                style={{
                  fontSize: "0.75rem",
                  fontWeight: 700,
                  color: "var(--primary-hover)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                  marginBottom: "0.25rem",
                }}
              >
                Posisi Antrian Anda
              </div>

              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "clamp(2.75rem, 11vw, 3.8rem)",
                  fontWeight: 800,
                  color: "var(--primary)",
                  lineHeight: 1.1,
                  margin: "0.25rem 0",
                  letterSpacing: "-0.03em",
                }}
              >
                #{queuePosition !== null ? queuePosition : "-"}
              </div>

              <div
                style={{
                  fontSize: "0.825rem",
                  color: "var(--text-muted)",
                  marginTop: "0.35rem",
                }}
              >
                Nomor Tiket:{" "}
                <strong style={{ color: "var(--text-main)", fontFamily: "var(--font-mono)" }}>
                  {queueNumber !== null ? queueNumber : "-"}
                </strong>
              </div>
            </div>

            {/* Bar Estimasi & Status Live Network */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.65rem",
                padding: "0.9rem 1.1rem",
                backgroundColor: "var(--bg-subtle)",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-color)",
                marginBottom: "1.25rem",
                fontSize: "0.85rem",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  flexWrap: "wrap",
                  gap: "0.5rem",
                }}
              >
                <div style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "4px" }}>
                  <span>⏱</span>
                  <span>Estimasi Giliran:</span>
                </div>
                <strong style={{ color: "var(--text-main)", fontSize: "0.9rem" }}>
                  {estMinutes !== null
                    ? estMinutes <= 1
                      ? "Segera bersiap (< 1 menit)"
                      : `Sekitar ~${estMinutes} menit`
                    : "Menghitung antrian..."}
                </strong>
              </div>

              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "6px",
                  paddingTop: "0.45rem",
                  borderTop: "1px dashed var(--border-color)",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: isServerBusy ? "var(--warning)" : "var(--success)",
                    boxShadow: isServerBusy
                      ? "0 0 0 3px rgba(217, 119, 6, 0.2)"
                      : "0 0 0 3px rgba(13, 138, 99, 0.2)",
                    animation: "pulse 1.8s infinite",
                  }}
                />
                <span
                  style={{
                    color: isServerBusy ? "var(--warning)" : "var(--text-muted)",
                    fontSize: "0.775rem",
                    fontWeight: 600,
                  }}
                >
                  {isServerBusy
                    ? "Lalu lintas padat • Sesi Anda tetap aman terjaga"
                    : "Terhubung Langsung • Pembaruan Otomatis"}
                </span>
              </div>
            </div>

            {/* Kotak Petunjuk Ramah Mahasiswa */}
            <div
              style={{
                backgroundColor: "var(--primary-light)",
                border: "1px solid var(--primary-border)",
                borderRadius: "var(--radius-md)",
                padding: "0.75rem 0.9rem",
                marginBottom: "1.5rem",
                textAlign: "left",
                display: "flex",
                gap: "0.6rem",
                alignItems: "flex-start",
              }}
            >
              <span style={{ fontSize: "1.1rem", lineHeight: 1 }}>💡</span>
              <p
                style={{
                  fontSize: "0.8rem",
                  color: "var(--primary-dark)",
                  lineHeight: 1.45,
                  margin: 0,
                }}
              >
                Halaman ini <strong>otomatis beralih</strong> ke pemilihan mata kuliah begitu giliran Anda tiba.{" "}
                <em>Mohon tidak me-refresh atau menutup halaman peramban Anda.</em>
              </p>
            </div>

            {/* Tombol Aksi HP-Friendly */}
            <button
              type="button"
              className="btn btn-secondary btn-block"
              onClick={onExit}
              style={{
                width: "100%",
                padding: "0.85rem",
                minHeight: 48,
                fontSize: "0.9rem",
                fontWeight: 600,
                borderRadius: "var(--radius-md)",
              }}
            >
              Batalkan & Keluar Antrian
            </button>
          </>
        ) : (
          /* Keadaan Sesi Kedaluwarsa */
          <div style={{ padding: "0.25rem 0" }}>
            <div
              className="alert alert-warning"
              style={{
                marginBottom: "1.5rem",
                textAlign: "left",
                fontSize: "0.85rem",
                lineHeight: 1.5,
              }}
            >
              <span>
                Waktu giliran Anda telah kedaluwarsa. Anda dapat mengantri kembali secara mandiri selama portal dibuka.
              </span>
            </div>

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.75rem",
                width: "100%",
              }}
            >
              {canRequeue && (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={onRequeue}
                  style={{
                    width: "100%",
                    padding: "0.85rem",
                    minHeight: 48,
                    fontSize: "0.95rem",
                    fontWeight: 700,
                    borderRadius: "var(--radius-md)",
                  }}
                >
                  Masuk Antrian Kembali
                </button>
              )}

              <button
                type="button"
                className="btn btn-secondary"
                onClick={onExit}
                style={{
                  width: "100%",
                  padding: "0.85rem",
                  minHeight: 48,
                  fontSize: "0.9rem",
                  borderRadius: "var(--radius-md)",
                }}
              >
                Kembali ke Halaman Depan
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
