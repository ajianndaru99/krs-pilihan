"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase, Offering } from "@/lib/supabase";

const NEED_MATKUL = 3;
const NEED_PROYEK = 1;
const QUEUE_POLL_INTERVAL_MS = 10000;

function isTimeClash(
  j1: { hari: string; jam_mulai: string; jam_selesai: string },
  j2: { hari: string; jam_mulai: string; jam_selesai: string }
): boolean {
  if (j1.hari.trim().toLowerCase() !== j2.hari.trim().toLowerCase()) {
    return false;
  }
  // Standardize time comparison (HH:MM:SS or HH:MM)
  const padTime = (t: string) => (t.length === 5 ? `${t}:00` : t);
  const start1 = padTime(j1.jam_mulai);
  const end1 = padTime(j1.jam_selesai);
  const start2 = padTime(j2.jam_mulai);
  const end2 = padTime(j2.jam_selesai);

  return start1 < end2 && start2 < end1;
}

export default function StudentPage() {
  const router = useRouter();

  // Navigation / Phase
  // 1: login, 2: queue, 3: select
  const [phase, setPhase] = useState<"login" | "queue" | "select">("login");

  // Login & Verification State
  const [nim, setNim] = useState("");
  const [pin, setPin] = useState("");
  const [studentInfo, setStudentInfo] = useState<{
    nama_samar?: string;
    kelas?: string;
    butuh_pin?: boolean;
    sudah_terdaftar?: boolean;
  } | null>(null);

  // Queue State
  const [token, setToken] = useState("");
  const [queueState, setQueueState] = useState<string>("");
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [estMinutes, setEstMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [canRequeue, setCanRequeue] = useState<boolean>(true);

  // Offerings / Selection State
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Ajukan Akses Modal State
  const [showAjukanModal, setShowAjukanModal] = useState(false);
  const [ajukanNim, setAjukanNim] = useState("");
  const [ajukanNama, setAjukanNama] = useState("");
  const [ajukanKelas, setAjukanKelas] = useState("");
  const [ajukanCatatan, setAjukanCatatan] = useState("");
  const [kelasList, setKelasList] = useState<string[]>([]);

  // UI status
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Read saved session storage on client mount
  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedNim = sessionStorage.getItem("nim");
      const savedToken = sessionStorage.getItem("token");
      if (savedNim && savedToken) {
        setNim(savedNim);
        setToken(savedToken);
        setPhase("queue");
      }
    }
  }, []);

  // Poll queue status
  const checkQueueStatus = useCallback(
    async (curNim: string, curToken: string) => {
      try {
        const { data, error } = await supabase.rpc("queue_status", {
          p_nim: curNim,
          p_token: curToken,
        });

        if (error) {
          setErrorMessage(error.message || "Gagal mengambil status antrian.");
          return;
        }

        const res = data || {};
        if (res.ok === false) {
          setErrorMessage(res.error || "Gagal memverifikasi status antrian.");
          return;
        }

        setQueueState(res.state || "");
        setQueueNumber(res.nomor ?? null);
        setQueuePosition(res.posisi ?? null);
        setEstMinutes(res.estimasi_menit ?? null);
        setRemainingSeconds(res.sisa_detik ?? null);
        setCanRequeue(res.bisa_antri_lagi !== false);

        if (res.state === "active") {
          setPhase("select");
          fetchOfferings(curNim, curToken);
        } else if (res.state === "done") {
          router.push("/bukti");
        }
      } catch (err: any) {
        setErrorMessage(err.message || "Kesalahan jaringan saat polling antrian.");
      }
    },
    [router]
  );

  // Setup 10-second polling during queue phase
  useEffect(() => {
    if (phase === "queue" && nim && token) {
      checkQueueStatus(nim, token);

      pollTimerRef.current = setInterval(() => {
        checkQueueStatus(nim, token);
      }, QUEUE_POLL_INTERVAL_MS);

      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [phase, nim, token, checkQueueStatus]);

  // Handle countdown timer for active selection session
  useEffect(() => {
    if (phase === "select" && remainingSeconds !== null && remainingSeconds > 0) {
      const countdown = setInterval(() => {
        setRemainingSeconds((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(countdown);
            setPhase("queue");
            setQueueState("expired");
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
      return () => clearInterval(countdown);
    }
  }, [phase, remainingSeconds]);

  // Fetch Offerings when active
  const fetchOfferings = async (curNim: string, curToken: string) => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.rpc("list_offerings", {
        p_nim: curNim,
        p_token: curToken,
      });

      if (error) {
        setErrorMessage(error.message || "Gagal memuat mata kuliah.");
        return;
      }

      const res = data || {};
      if (res.ok === false) {
        setErrorMessage(res.error || "Tidak dapat memuat daftar mata kuliah.");
        return;
      }

      setOfferings(res.pilihan || []);
    } catch (err: any) {
      setErrorMessage(err.message || "Kesalahan koneksi saat memuat pilihan.");
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Check NIM
  const handleCheckNim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nim.trim()) {
      setErrorMessage("Silakan masukkan NIM terlebih dahulu.");
      return;
    }
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.rpc("cek_nim", {
        p_nim: nim.trim(),
      });

      if (error) {
        setErrorMessage(error.message || "Terjadi kesalahan saat memeriksa NIM.");
        return;
      }

      const res = data || {};
      if (res.ok === false) {
        setErrorMessage(res.error || "NIM tidak ditemukan dalam daftar mahasiswa.");
        return;
      }

      setStudentInfo(res);
      if (res.sudah_terdaftar) {
        setSuccessMessage("Anda sudah terdaftar. Silakan lihat bukti pendaftaran.");
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal menghubungi server.");
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Join Queue
  const handleJoinQueue = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.rpc("join_queue", {
        p_nim: nim.trim(),
        p_pin: pin.trim() || null,
      });

      if (error) {
        setErrorMessage(error.message || "Gagal masuk antrian.");
        return;
      }

      const res = data || {};
      if (res.ok === false) {
        setErrorMessage(res.error || "Gagal masuk antrian.");
        return;
      }

      const newToken = res.token;
      setToken(newToken);
      setQueueState(res.state || "waiting");

      if (typeof window !== "undefined") {
        sessionStorage.setItem("nim", nim.trim());
        sessionStorage.setItem("token", newToken);
      }

      if (res.state === "active") {
        setPhase("select");
        fetchOfferings(nim.trim(), newToken);
      } else {
        setPhase("queue");
        checkQueueStatus(nim.trim(), newToken);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Gagal bergabung dengan antrian.");
    } finally {
      setLoading(false);
    }
  };

  // Toggle selection with conflict and topic check
  const toggleOffering = (offering: Offering) => {
    if (selectedIds.includes(offering.id)) {
      setSelectedIds(selectedIds.filter((id) => id !== offering.id));
      return;
    }

    // Check quota
    if (offering.sisa <= 0) {
      alert("Kuota untuk pilihan ini sudah habis.");
      return;
    }

    // Check class schedule conflict (from server database)
    if (offering.bentrok) {
      alert("Pilihan ini bentrok dengan jadwal kelas tetap Anda.");
      return;
    }

    const selectedOfferings = offerings.filter((o) => selectedIds.includes(o.id));
    const matkulCount = selectedOfferings.filter((o) => o.jenis === "matkul").length;
    const proyekCount = selectedOfferings.filter((o) => o.jenis === "proyek").length;

    if (offering.jenis === "matkul" && matkulCount >= NEED_MATKUL) {
      alert(`Anda hanya dapat memilih maksimal ${NEED_MATKUL} mata kuliah.`);
      return;
    }

    if (offering.jenis === "proyek" && proyekCount >= NEED_PROYEK) {
      alert(`Anda hanya dapat memilih maksimal ${NEED_PROYEK} proyek.`);
      return;
    }

    // Check duplicate topics
    const duplicateTopic = selectedOfferings.some(
      (o) => o.topik && offering.topik && o.topik.trim().toLowerCase() === offering.topik.trim().toLowerCase()
    );
    if (duplicateTopic) {
      alert(`Anda tidak dapat memilih lebih dari satu mata kuliah dengan topik '${offering.topik}'.`);
      return;
    }

    // Check schedule clashes between selected offerings
    for (const selected of selectedOfferings) {
      for (const jNew of offering.jadwal || []) {
        for (const jSel of selected.jadwal || []) {
          if (isTimeClash(jNew, jSel)) {
            alert(
              `Jadwal bentrok dengan '${selected.nama}' pada ${jNew.hari} (${jNew.jam_mulai} - ${jNew.jam_selesai}).`
            );
            return;
          }
        }
      }
    }

    setSelectedIds([...selectedIds, offering.id]);
  };

  // Step 5: Submit Registration
  const handleSubmitRegistration = async () => {
    const selectedOfferings = offerings.filter((o) => selectedIds.includes(o.id));
    const matkulCount = selectedOfferings.filter((o) => o.jenis === "matkul").length;
    const proyekCount = selectedOfferings.filter((o) => o.jenis === "proyek").length;

    if (matkulCount !== NEED_MATKUL || proyekCount !== NEED_PROYEK) {
      alert(`Syarat pendaftaran belum lengkap: Wajib ${NEED_MATKUL} Matkul dan ${NEED_PROYEK} Proyek.`);
      return;
    }

    if (!confirm("Pastikan pilihan Anda sudah benar. Pilihan yang sudah dikirim tidak dapat diubah sendiri. Lanjutkan?")) {
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const { data, error } = await supabase.rpc("daftar", {
        p_nim: nim.trim(),
        p_token: token,
        p_offering_ids: selectedIds,
      });

      if (error) {
        setErrorMessage(error.message || "Gagal melakukan pendaftaran.");
        setIsSubmitting(false);
        return;
      }

      const res = data || {};
      if (res.ok === false) {
        setErrorMessage(res.error || "Pendaftaran ditolak oleh sistem.");
        setIsSubmitting(false);
        return;
      }

      // Success! Redirect to bukti
      router.push("/bukti");
    } catch (err: any) {
      setErrorMessage(err.message || "Terjadi kesalahan saat memproses pendaftaran.");
      setIsSubmitting(false);
    }
  };

  // Load classes for Ajukan Akses
  const openAjukanModal = async () => {
    setShowAjukanModal(true);
    setAjukanNim(nim);
    try {
      const { data } = await supabase.rpc("daftar_kelas");
      if (data && Array.isArray(data)) {
        setKelasList(data);
      }
    } catch {
      // fallback
    }
  };

  const handleAjukanSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ajukanNim.trim() || !ajukanNama.trim()) {
      alert("NIM dan Nama wajib diisi.");
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("ajukan_akses", {
        p_nim: ajukanNim.trim(),
        p_nama: ajukanNama.trim(),
        p_kelas: ajukanKelas.trim() || null,
        p_catatan: ajukanCatatan.trim() || null,
      });

      if (error) {
        alert(error.message || "Gagal mengajukan akses.");
        return;
      }
      const res = data || {};
      if (res.ok === false) {
        alert(res.error || "Pengajuan gagal diproses.");
        return;
      }
      alert("Pengajuan berhasil dikirim. Mohon menunggu persetujuan admin prodi.");
      setShowAjukanModal(false);
    } catch (err: any) {
      alert(err.message || "Terjadi galat.");
    } finally {
      setLoading(false);
    }
  };

  const selectedOfferings = offerings.filter((o) => selectedIds.includes(o.id));
  const matkulCount = selectedOfferings.filter((o) => o.jenis === "matkul").length;
  const proyekCount = selectedOfferings.filter((o) => o.jenis === "proyek").length;
  const isFormComplete = matkulCount === NEED_MATKUL && proyekCount === NEED_PROYEK;

  return (
    <div className="container">
      <header className="header-banner">
        <h1>Sistem Pemilihan Mata Kuliah Pilihan</h1>
        <p>Portal resmi pemilihan 3 Mata Kuliah Pilihan dan 1 Proyek Fakultas Pertanian</p>
      </header>

      {errorMessage && (
        <div className="alert alert-danger" role="alert">
          <span>⚠️ {errorMessage}</span>
        </div>
      )}

      {successMessage && (
        <div className="alert alert-success" role="alert">
          <span>✅ {successMessage}</span>
        </div>
      )}

      {/* PHASE 1: LOGIN & IDENTIFIKASI */}
      {phase === "login" && (
        <div className="card" style={{ maxWidth: 540, margin: "0 auto" }}>
          <h2 className="card-title">Identifikasi Mahasiswa</h2>

          {!studentInfo ? (
            <form onSubmit={handleCheckNim}>
              <div className="form-group">
                <label htmlFor="nimInput" className="form-label">
                  Nomor Induk Mahasiswa (NIM)
                </label>
                <input
                  id="nimInput"
                  type="text"
                  className="form-input"
                  placeholder="Contoh: 2110211001"
                  value={nim}
                  onChange={(e) => setNim(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>

              <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
                {loading ? "Memeriksa..." : "Periksa Identitas"}
              </button>

              <div style={{ marginTop: "1.25rem", textAlign: "center" }}>
                <button
                  type="button"
                  onClick={openAjukanModal}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--primary)",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "0.875rem",
                  }}
                >
                  NIM belum terdaftar? Ajukan akses di sini
                </button>
              </div>
            </form>
          ) : (
            <div>
              <div
                style={{
                  background: "var(--bg-subtle)",
                  padding: "1rem",
                  borderRadius: "var(--radius-md)",
                  marginBottom: "1.25rem",
                }}
              >
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)" }}>Nama Terverifikasi:</div>
                <div style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--primary)" }}>
                  {studentInfo.nama_samar || "Mahasiswa"}
                </div>
                {studentInfo.kelas && (
                  <div style={{ fontSize: "0.875rem", marginTop: "0.25rem" }}>
                    Kelas: <strong>{studentInfo.kelas}</strong>
                  </div>
                )}
              </div>

              {studentInfo.sudah_terdaftar ? (
                <div>
                  <p style={{ marginBottom: "1rem", fontSize: "0.95rem" }}>
                    Anda telah menyelesaikan pemilihan mata kuliah pilihan.
                  </p>
                  <button
                    type="button"
                    className="btn btn-success btn-block"
                    onClick={() => router.push("/bukti")}
                  >
                    Lihat Bukti Pendaftaran
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => {
                      setStudentInfo(null);
                      setNim("");
                    }}
                  >
                    Ganti NIM
                  </button>
                </div>
              ) : (
                <div>
                  {studentInfo.butuh_pin && (
                    <div className="form-group">
                      <label htmlFor="pinInput" className="form-label">
                        PIN Akses (dari Prodi)
                      </label>
                      <input
                        id="pinInput"
                        type="password"
                        className="form-input"
                        placeholder="Masukkan PIN"
                        value={pin}
                        onChange={(e) => setPin(e.target.value)}
                        disabled={loading}
                      />
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn btn-primary btn-block"
                    onClick={handleJoinQueue}
                    disabled={loading}
                  >
                    {loading ? "Menghubungkan..." : "Konfirmasi & Masuk Antrian"}
                  </button>

                  <button
                    type="button"
                    className="btn btn-secondary btn-block"
                    style={{ marginTop: "0.5rem" }}
                    onClick={() => setStudentInfo(null)}
                    disabled={loading}
                  >
                    Kembali
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* PHASE 2: RUANG ANTRIAN (QUEUE) */}
      {phase === "queue" && (
        <div className="card" style={{ maxWidth: 600, margin: "0 auto", textAlign: "center" }}>
          <h2 className="card-title" style={{ justifyContent: "center" }}>
            <span className="pulse-dot"></span> Ruang Antrian Pemilihan
          </h2>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Sistem membatasi jumlah mahasiswa yang memilih bersamaan demi kelancaran server dan jaminan kuota riil.
          </p>

          <div className="queue-box">
            {queueState === "menunggu_undian" ? (
              <div>
                <span className="badge badge-warning" style={{ fontSize: "0.9rem", padding: "0.5rem 1rem" }}>
                  Menunggu Pengundian Antrian
                </span>
                <p style={{ marginTop: "1rem", color: "var(--text-muted)" }}>
                  Nomor antrian akan diundi secara acak dan adil oleh sistem. Mohon tidak menutup halaman ini.
                </p>
              </div>
            ) : queueState === "waiting" ? (
              <div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-muted)", textTransform: "uppercase" }}>
                  Nomor Antrian Anda
                </div>
                <div className="queue-number">#{queueNumber ?? "-"}</div>
                <div style={{ display: "flex", justifyContent: "center", gap: "1.5rem", marginTop: "1rem" }}>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Posisi dalam Antrian</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>{queuePosition ?? "-"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>Estimasi Menunggu</div>
                    <div style={{ fontSize: "1.25rem", fontWeight: 700 }}>
                      {estMinutes !== null ? `~${estMinutes} menit` : "-"}
                    </div>
                  </div>
                </div>
              </div>
            ) : queueState === "expired" ? (
              <div>
                <span className="badge badge-danger" style={{ fontSize: "0.9rem", padding: "0.5rem 1rem" }}>
                  Sesi Kedaluwarsa
                </span>
                <p style={{ marginTop: "1rem", color: "var(--text-muted)" }}>
                  Waktu pemilihan Anda telah habis sebelum pendaftaran dikirimkan.
                </p>
                {canRequeue && (
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ marginTop: "1rem" }}
                    onClick={handleJoinQueue}
                    disabled={loading}
                  >
                    Antri Kembali
                  </button>
                )}
              </div>
            ) : (
              <div>
                <p>Status: {queueState || "Memverifikasi..."}</p>
              </div>
            )}
          </div>

          <div style={{ fontSize: "0.8rem", color: "var(--text-light)" }}>
            Halaman diperbarui secara otomatis setiap 10 detik.
          </div>
        </div>
      )}

      {/* PHASE 3: PEMILIHAN MATA KULIAH (ACTIVE) */}
      {phase === "select" && (
        <div>
          {/* Sticky Session Bar */}
          <div
            style={{
              position: "sticky",
              top: 10,
              zIndex: 100,
              background: "var(--bg-surface)",
              border: "2px solid var(--primary)",
              borderRadius: "var(--radius-md)",
              padding: "1rem 1.25rem",
              marginBottom: "1.5rem",
              boxShadow: "var(--shadow-lg)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <span className="badge badge-success">Sesi Aktif</span>
              <span style={{ marginLeft: "0.75rem", fontWeight: 600 }}>
                Pilihan: {matkulCount}/{NEED_MATKUL} Matkul | {proyekCount}/{NEED_PROYEK} Proyek
              </span>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
              {remainingSeconds !== null && (
                <div
                  style={{
                    fontWeight: 700,
                    color: remainingSeconds < 60 ? "var(--danger)" : "var(--primary)",
                    fontSize: "0.95rem",
                  }}
                >
                  ⏱️ Sisa Waktu: {Math.floor(remainingSeconds / 60)}:
                  {String(remainingSeconds % 60).padStart(2, "0")}
                </div>
              )}

              <button
                type="button"
                className="btn btn-primary"
                onClick={handleSubmitRegistration}
                disabled={!isFormComplete || isSubmitting}
              >
                {isSubmitting ? "Mengirim Pendaftaran..." : "Kirim Pendaftaran"}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="card" style={{ textAlign: "center", padding: "3rem" }}>
              <p>Memuat daftar mata kuliah pilihan...</p>
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: "1.5rem" }}>
              {/* Seksi Mata Kuliah */}
              <div className="card">
                <h3 className="card-title">
                  1. Pilih {NEED_MATKUL} Mata Kuliah Pilihan ({matkulCount}/{NEED_MATKUL})
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                  Pilih mata kuliah dengan topik yang berbeda dan pastikan tidak bentrok dengan jadwal kelas.
                </p>

                {offerings
                  .filter((o) => o.jenis === "matkul")
                  .map((offering) => {
                    const isSelected = selectedIds.includes(offering.id);
                    const isFull = offering.sisa <= 0;
                    const isBentrok = offering.bentrok;
                    const isDisabled = (isFull || isBentrok) && !isSelected;

                    return (
                      <div
                        key={offering.id}
                        className={`offering-card ${isSelected ? "selected" : ""} ${
                          isDisabled ? "disabled" : ""
                        }`}
                        onClick={() => toggleOffering(offering)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-main)" }}>
                              {offering.nama}
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                              {offering.topik && (
                                <span className="badge badge-secondary">Topik: {offering.topik}</span>
                              )}
                              {isBentrok && <span className="badge badge-danger">Bentrok Jadwal Kelas</span>}
                              {isFull && <span className="badge badge-danger">Kuota Penuh</span>}
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                color: isFull ? "var(--danger)" : "var(--success)",
                              }}
                            >
                              Sisa Kursi: {offering.sisa}
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              style={{ marginTop: "0.5rem", transform: "scale(1.2)" }}
                            />
                          </div>
                        </div>

                        {offering.jadwal && offering.jadwal.length > 0 && (
                          <div
                            style={{
                              marginTop: "0.5rem",
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                              borderTop: "1px dashed var(--border-color)",
                              paddingTop: "0.5rem",
                            }}
                          >
                            📅{" "}
                            {offering.jadwal
                              .map((j) => `${j.hari}, ${j.jam_mulai} - ${j.jam_selesai}${j.ruang ? ` (${j.ruang})` : ""}`)
                              .join(" | ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Seksi Proyek */}
              <div className="card">
                <h3 className="card-title">
                  2. Pilih {NEED_PROYEK} Proyek ({proyekCount}/{NEED_PROYEK})
                </h3>
                <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
                  Setiap mahasiswa wajib memilih tepat satu penugasan proyek.
                </p>

                {offerings
                  .filter((o) => o.jenis === "proyek")
                  .map((offering) => {
                    const isSelected = selectedIds.includes(offering.id);
                    const isFull = offering.sisa <= 0;
                    const isBentrok = offering.bentrok;
                    const isDisabled = (isFull || isBentrok) && !isSelected;

                    return (
                      <div
                        key={offering.id}
                        className={`offering-card ${isSelected ? "selected" : ""} ${
                          isDisabled ? "disabled" : ""
                        }`}
                        onClick={() => toggleOffering(offering)}
                      >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: "1.05rem", color: "var(--text-main)" }}>
                              {offering.nama}
                            </div>
                            <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem", flexWrap: "wrap" }}>
                              <span className="badge badge-primary">Jenis: Proyek</span>
                              {offering.topik && (
                                <span className="badge badge-secondary">Topik: {offering.topik}</span>
                              )}
                              {isBentrok && <span className="badge badge-danger">Bentrok Jadwal</span>}
                              {isFull && <span className="badge badge-danger">Kuota Penuh</span>}
                            </div>
                          </div>

                          <div style={{ textAlign: "right" }}>
                            <div
                              style={{
                                fontSize: "0.85rem",
                                fontWeight: 700,
                                color: isFull ? "var(--danger)" : "var(--success)",
                              }}
                            >
                              Sisa Kursi: {offering.sisa}
                            </div>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              readOnly
                              style={{ marginTop: "0.5rem", transform: "scale(1.2)" }}
                            />
                          </div>
                        </div>

                        {offering.jadwal && offering.jadwal.length > 0 && (
                          <div
                            style={{
                              marginTop: "0.5rem",
                              fontSize: "0.8rem",
                              color: "var(--text-muted)",
                              borderTop: "1px dashed var(--border-color)",
                              paddingTop: "0.5rem",
                            }}
                          >
                            📅{" "}
                            {offering.jadwal
                              .map((j) => `${j.hari}, ${j.jam_mulai} - ${j.jam_selesai}${j.ruang ? ` (${j.ruang})` : ""}`)
                              .join(" | ")}
                          </div>
                        )}
                      </div>
                    );
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODAL AJUKAN AKSES */}
      {showAjukanModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 999,
            padding: "1rem",
          }}
        >
          <div className="card" style={{ maxWidth: 500, width: "100%", margin: 0 }}>
            <h3 className="card-title">Pengajuan Akses / Koreksi NIM</h3>
            <form onSubmit={handleAjukanSubmit}>
              <div className="form-group">
                <label className="form-label">NIM</label>
                <input
                  type="text"
                  className="form-input"
                  value={ajukanNim}
                  onChange={(e) => setAjukanNim(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Nama Lengkap</label>
                <input
                  type="text"
                  className="form-input"
                  value={ajukanNama}
                  onChange={(e) => setAjukanNama(e.target.value)}
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kelas (Opsional)</label>
                {kelasList.length > 0 ? (
                  <select
                    className="form-select"
                    value={ajukanKelas}
                    onChange={(e) => setAjukanKelas(e.target.value)}
                  >
                    <option value="">-- Pilih Kelas --</option>
                    {kelasList.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: Agroteknologi A"
                    value={ajukanKelas}
                    onChange={(e) => setAjukanKelas(e.target.value)}
                  />
                )}
              </div>

              <div className="form-group">
                <label className="form-label">Catatan / Alasan</label>
                <textarea
                  className="form-textarea"
                  rows={3}
                  placeholder="Keterangan pengajuan, misal: mahasiswa transfer, belum masuk daftar..."
                  value={ajukanCatatan}
                  onChange={(e) => setAjukanCatatan(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", gap: "0.75rem", justifyContent: "flex-end", marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAjukanModal(false)}
                  disabled={loading}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Mengirim..." : "Kirim Pengajuan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
