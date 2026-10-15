"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { Offering, StudentInfo, ModalDialogState } from "@/lib/types";
import { findClashBetweenOfferings } from "@/lib/schedule-conflict";
import { InteractiveModal } from "@/components/student/InteractiveModal";
import { CheckNimCard } from "@/components/student/CheckNimCard";
import { QueueCard } from "@/components/student/QueueCard";
import { OfferingSelector } from "@/components/student/OfferingSelector";
import { AjukanAksesModal } from "@/components/student/AjukanAksesModal";

const NEED_MATKUL = 3;
const NEED_PROYEK = 1;
const QUEUE_POLL_INTERVAL_MS = 10000;

export default function StudentPage() {
  const router = useRouter();

  // Lazy Initializers untuk sinkronisasi sesi peramban
  const [nim, setNim] = useState<string>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("nim") || "";
    return "";
  });
  const [token, setToken] = useState<string>(() => {
    if (typeof window !== "undefined") return sessionStorage.getItem("token") || "";
    return "";
  });
  const [phase, setPhase] = useState<"login" | "queue" | "select">(() => {
    if (typeof window !== "undefined") {
      const savedNim = sessionStorage.getItem("nim");
      const savedToken = sessionStorage.getItem("token");
      if (savedNim && savedToken) return "queue";
    }
    return "login";
  });

  // State Verifikasi & Antrian
  const [pin, setPin] = useState("");
  const [studentInfo, setStudentInfo] = useState<StudentInfo | null>(null);
  const [queueState, setQueueState] = useState<string>("");
  const [queueNumber, setQueueNumber] = useState<number | null>(null);
  const [queuePosition, setQueuePosition] = useState<number | null>(null);
  const [estMinutes, setEstMinutes] = useState<number | null>(null);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [canRequeue, setCanRequeue] = useState<boolean>(true);

  // State Pilihan & UI
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingQuota, setIsRefreshingQuota] = useState(false);
  const [kelasList, setKelasList] = useState<string[]>([]);
  const [showAjukanModal, setShowAjukanModal] = useState(false);

  // State Modal Dialog Interaktif
  const [modalDialog, setModalDialog] = useState<ModalDialogState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  const pollTimerRef = useRef<NodeJS.Timeout | null>(null);
  const sessionEndTimeRef = useRef<number | null>(null);
  const isExitingRef = useRef(false);

  const closeModal = useCallback(() => {
    setModalDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const showPopup = useCallback(
    (
      type: "info" | "warning" | "danger" | "confirm",
      title: string,
      message: string,
      details?: { label: string; value: string }[],
      onConfirm?: () => void
    ) => {
      setModalDialog({
        isOpen: true,
        type,
        title,
        message,
        details,
        onConfirm,
        confirmText: type === "confirm" ? "Ya, Lanjutkan" : undefined,
        cancelText: type === "confirm" ? "Batal" : undefined,
      });
    },
    []
  );

  // Fetch Offerings (didefinisikan sebelum checkQueueStatus)
  const fetchOfferings = useCallback(
    async (curNim: string, curToken: string, isSilent = false) => {
      if (isExitingRef.current) return;
      if (!isSilent) setLoading(true);
      else setIsRefreshingQuota(true);

      try {
        const { data, error } = await supabase.rpc("list_offerings", {
          p_nim: curNim,
          p_token: curToken,
        });

        if (isExitingRef.current) return;

        if (error) {
          if (!isSilent) showPopup("danger", "Gagal Memuat Pilihan", error.message);
          return;
        }

        const res = (data as { ok?: boolean; error?: string; pilihan?: Offering[] }) || {};
        if (res.ok === false) {
          if (!isSilent) {
            showPopup("danger", "Akses Pilihan Ditolak", res.error || "Gagal memuat mata kuliah.");
          }
          return;
        }

        setOfferings(res.pilihan || []);
      } catch (err: unknown) {
        if (!isSilent) {
          const msg = err instanceof Error ? err.message : "Terjadi kesalahan jaringan.";
          showPopup("danger", "Kesalahan Jaringan", msg);
        }
      } finally {
        if (!isSilent) setLoading(false);
        else setIsRefreshingQuota(false);
      }
    },
    [showPopup]
  );

  // Polling status antrian
  const checkQueueStatus = useCallback(
    async (curNim: string, curToken: string) => {
      if (isExitingRef.current) return;
      if (typeof window !== "undefined" && !sessionStorage.getItem("token")) return;

      try {
        const { data, error } = await supabase.rpc("queue_status", {
          p_nim: curNim,
          p_token: curToken,
        });

        if (isExitingRef.current) return;
        if (error) return;

        interface QueueStatusResponse {
          ok?: boolean;
          state?: string;
          nomor?: number;
          posisi?: number;
          estimasi_menit?: number;
          sisa_detik?: number;
          bisa_antri_lagi?: boolean;
          error?: string;
        }

        const res = (data as QueueStatusResponse) || {};
        if (res.ok === false) {
          // Token tidak lagi valid (misal reset admin), kembalikan ke login
          sessionStorage.removeItem("nim");
          sessionStorage.removeItem("token");
          setPhase("login");
          setNim("");
          setToken("");
          return;
        }

        setQueueState(res.state || "");
        setQueueNumber(res.nomor ?? null);
        setQueuePosition(res.posisi ?? null);
        setEstMinutes(res.estimasi_menit ?? null);
        setCanRequeue(res.bisa_antri_lagi !== false);

        if (typeof res.sisa_detik === "number" && res.sisa_detik > 0) {
          setRemainingSeconds(res.sisa_detik);
          sessionEndTimeRef.current = Date.now() + res.sisa_detik * 1000;
        }

        if (res.state === "active") {
          setPhase("select");
          fetchOfferings(curNim, curToken);
        } else if (res.state === "done") {
          router.push("/bukti");
        }
      } catch {
        // Polling fail silent
      }
    },
    [fetchOfferings, router]
  );

  // Setup interval polling saat fase queue
  useEffect(() => {
    if (phase === "queue" && nim && token) {
      isExitingRef.current = false;
      const runPoll = () => {
        void checkQueueStatus(nim, token);
      };
      runPoll();
      pollTimerRef.current = setInterval(runPoll, QUEUE_POLL_INTERVAL_MS);
      return () => {
        if (pollTimerRef.current) clearInterval(pollTimerRef.current);
      };
    }
  }, [phase, nim, token, checkQueueStatus]);

  // Polling kuota otomatis setiap 10 detik saat fase select
  useEffect(() => {
    if (phase === "select" && nim && token) {
      const quotaInterval = setInterval(() => {
        void fetchOfferings(nim, token, true);
      }, 10000);
      return () => clearInterval(quotaInterval);
    }
  }, [phase, nim, token, fetchOfferings]);

  // Hitung mundur sesi aktif saat fase select
  useEffect(() => {
    if (phase === "select") {
      const timer = setInterval(() => {
        if (!sessionEndTimeRef.current) return;
        const diff = Math.max(0, Math.ceil((sessionEndTimeRef.current - Date.now()) / 1000));
        setRemainingSeconds(diff);
        if (diff <= 0) {
          clearInterval(timer);
          setPhase("queue");
          setQueueState("expired");
          showPopup("warning", "Sesi Berakhir", "Sesi pemilihan Anda telah kedaluwarsa. Silakan antri kembali.");
        }
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [phase, showPopup]);

  // Load daftar kelas saat modal ajukan dibuka
  useEffect(() => {
    if (showAjukanModal && kelasList.length === 0) {
      supabase.rpc("daftar_kelas").then(({ data }) => {
        if (Array.isArray(data)) setKelasList(data as string[]);
      });
    }
  }, [showAjukanModal, kelasList.length]);

  // Handler: Verifikasi NIM
  const handleCheckNim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nim.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("cek_nim", { p_nim: nim.trim() });
      if (error) {
        showPopup("danger", "Pengecekan Gagal", error.message);
        return;
      }
      interface CekNimResponse {
        ok: boolean;
        error?: string;
        nama_samar?: string;
        kelas?: string;
        sudah_daftar?: boolean;
      }
      const res = (data as CekNimResponse) || { ok: false };
      if (!res.ok) {
        showPopup("danger", "NIM Tidak Ditemukan", res.error || "NIM belum terdaftar.");
        return;
      }
      if (res.sudah_daftar) {
        showPopup("info", "Pendaftaran Selesai", "Anda sudah menyelesaikan pendaftaran KRS.", undefined, () => {
          sessionStorage.setItem("nim", nim.trim());
          router.push("/bukti");
        });
        return;
      }
      setStudentInfo({
        nama_samar: res.nama_samar,
        kelas: res.kelas,
        sudah_terdaftar: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      showPopup("danger", "Kesalahan", msg);
    } finally {
      setLoading(false);
    }
  };

  // Handler: Masuk Antrian
  const handleJoinQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nim.trim() || !pin.trim()) return;
    isExitingRef.current = false;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("join_queue", {
        p_nim: nim.trim(),
        p_pin: pin.trim(),
      });
      if (error) {
        showPopup("danger", "Gagal Masuk Antrian", error.message);
        return;
      }
      interface JoinQueueResponse {
        ok: boolean;
        error?: string;
        state?: string;
        token?: string;
        nomor?: number;
        posisi?: number;
        estimasi_menit?: number;
        sisa_detik?: number;
      }
      const res = (data as JoinQueueResponse) || { ok: false };
      if (!res.ok) {
        showPopup("warning", "Akses Antrian Ditolak", res.error || "Gagal bergabung ke antrian.");
        return;
      }
      const curToken = res.token || "";
      setToken(curToken);
      sessionStorage.setItem("nim", nim.trim());
      sessionStorage.setItem("token", curToken);

      if (res.state === "active") {
        setPhase("select");
        if (typeof res.sisa_detik === "number") {
          setRemainingSeconds(res.sisa_detik);
          sessionEndTimeRef.current = Date.now() + res.sisa_detik * 1000;
        }
        fetchOfferings(nim.trim(), curToken);
      } else {
        setPhase("queue");
        setQueueState(res.state || "waiting");
        setQueueNumber(res.nomor ?? null);
        setQueuePosition(res.posisi ?? null);
        setEstMinutes(res.estimasi_menit ?? null);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan koneksi.";
      showPopup("danger", "Kesalahan Antrian", msg);
    } finally {
      setLoading(false);
    }
  };

  // Handler: Toggle Offering Selection with Real-time Clash Protection
  const handleToggleOffering = (offering: Offering) => {
    if (selectedIds.includes(offering.id)) {
      setSelectedIds((prev) => prev.filter((id) => id !== offering.id));
      return;
    }
    const selectedItems = offerings.filter((o) => selectedIds.includes(o.id));
    const matkulCount = selectedItems.filter((o) => o.jenis === "matkul").length;
    const proyekCount = selectedItems.filter((o) => o.jenis === "proyek").length;

    if (offering.jenis === "matkul" && matkulCount >= NEED_MATKUL) {
      showPopup("warning", "Batas Pilihan Matkul", `Anda hanya dapat memilih maksimal ${NEED_MATKUL} mata kuliah.`);
      return;
    }
    if (offering.jenis === "proyek" && proyekCount >= NEED_PROYEK) {
      showPopup("warning", "Batas Pilihan Proyek", `Anda hanya dapat memilih maksimal ${NEED_PROYEK} proyek terapan.`);
      return;
    }
    if (offering.bentrok_kelas) {
      showPopup("danger", "Bentrok Jadwal Kelas Tetap", `Mata kuliah "${offering.nama}" bentrok dengan jadwal kelas tetap Anda.`);
      return;
    }
    const clash = findClashBetweenOfferings(offering, selectedItems);
    if (clash.hasClash) {
      showPopup("danger", "Bentrok Antar Pilihan", `Jadwal ${offering.nama} bentrok dengan pilihan "${clash.conflictWith}":\n${clash.detail}`);
      return;
    }
    setSelectedIds((prev) => [...prev, offering.id]);
  };

  // Handler: Submit Final Registration
  const handleSubmitSelection = () => {
    const selectedItems = offerings.filter((o) => selectedIds.includes(o.id));
    const details = selectedItems.map((item, idx) => ({
      label: `Pilihan #${idx + 1} (${item.jenis})`,
      value: item.nama,
    }));

    showPopup(
      "confirm",
      "Konfirmasi Simpan KRS",
      "Pastikan mata kuliah dan proyek pilihan Anda sudah sesuai. Pilihan tidak dapat diubah kembali setelah disimpan.",
      details,
      async () => {
        setIsSubmitting(true);
        try {
          const { data, error } = await supabase.rpc("daftar", {
            p_nim: nim.trim(),
            p_token: token.trim(),
            p_offering_ids: selectedIds,
          });
          if (error) {
            showPopup("danger", "Gagal Mendaftar", error.message);
            return;
          }
          const res = (data as { ok?: boolean; error?: string }) || {};
          if (res.ok) {
            router.push("/bukti");
          } else {
            showPopup("danger", "Pendaftaran Ditolak", res.error || "Gagal menyimpan pendaftaran.");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan koneksi.";
          showPopup("danger", "Kesalahan", msg);
        } finally {
          setIsSubmitting(false);
        }
      }
    );
  };

  // Handler: Keluar / Logout dengan Konfirmasi & Bersihkan State Secara Tuntas
  const handleRequestExit = () => {
    showPopup(
      "confirm",
      "Konfirmasi Keluar",
      "Apakah Anda yakin ingin keluar dari portal pemilihan? Sesi antrian Anda akan dihentikan dan Anda akan kembali ke halaman awal.",
      undefined,
      () => {
        isExitingRef.current = true;
        if (pollTimerRef.current) {
          clearInterval(pollTimerRef.current);
          pollTimerRef.current = null;
        }
        if (typeof window !== "undefined") {
          sessionStorage.clear();
        }
        setPhase("login");
        setNim("");
        setToken("");
        setPin("");
        setStudentInfo(null);
        setSelectedIds([]);
        setOfferings([]);
        setQueueState("");
        setQueueNumber(null);
        setQueuePosition(null);
        setRemainingSeconds(null);
        router.replace("/");
      }
    );
  };

  return (
    <div className="container" style={{ maxWidth: 1080 }}>
      {phase !== "login" && (
        <header
          className="header-banner"
          style={{
            display: "flex",
            alignItems: "center",
            gap: "1.25rem",
            marginBottom: "2rem",
            flexWrap: "wrap",
          }}
        >
          <Image
            src="/logo-instiper.png"
            alt="Logo INSTIPER"
            width={64}
            height={64}
            priority
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 260 }}>
            <div
              style={{
                fontSize: "0.75rem",
                fontWeight: 700,
                color: "var(--primary)",
                letterSpacing: "0.05em",
                textTransform: "uppercase",
                marginBottom: "0.2rem",
              }}
            >
              Institut Pertanian STIPER Yogyakarta • Fakultas Pertanian
            </div>
            <h1 style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-main)", margin: 0, letterSpacing: "-0.02em" }}>
              Sistem Pemilihan Mata Kuliah Pilihan
            </h1>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem", margin: 0 }}>
              Portal Resmi Pendaftaran Mata Kuliah & Proyek Pilihan Semester Berjalan
            </p>
          </div>
        </header>
      )}

      {phase === "login" && (
        <CheckNimCard
          nim={nim}
          setNim={setNim}
          pin={pin}
          setPin={setPin}
          studentInfo={studentInfo}
          loading={loading}
          onCheckNim={handleCheckNim}
          onJoinQueue={handleJoinQueue}
          onResetVerification={() => setStudentInfo(null)}
          onOpenAjukanModal={() => setShowAjukanModal(true)}
        />
      )}

      {phase === "queue" && (
        <QueueCard
          queueState={queueState}
          queueNumber={queueNumber}
          queuePosition={queuePosition}
          estMinutes={estMinutes}
          canRequeue={canRequeue}
          onRequeue={() => handleJoinQueue({ preventDefault: () => {} } as React.FormEvent)}
          onExit={handleRequestExit}
        />
      )}

      {phase === "select" && (
        <OfferingSelector
          offerings={offerings}
          selectedIds={selectedIds}
          remainingSeconds={remainingSeconds}
          needMatkul={NEED_MATKUL}
          needProyek={NEED_PROYEK}
          isSubmitting={isSubmitting}
          isRefreshingQuota={isRefreshingQuota}
          onRefreshQuota={() => fetchOfferings(nim, token, true)}
          onToggleOffering={handleToggleOffering}
          onSubmitSelection={handleSubmitSelection}
          onLogout={handleRequestExit}
        />
      )}

      <InteractiveModal dialog={modalDialog} onClose={closeModal} />

      <AjukanAksesModal
        isOpen={showAjukanModal}
        onClose={() => setShowAjukanModal(false)}
        kelasList={kelasList}
        initialNim={nim}
        onSuccess={(msg) => showPopup("info", "Pengajuan Terkirim", msg)}
        onError={(err) => showPopup("danger", "Pengajuan Gagal", err)}
      />

      <footer
        style={{
          marginTop: "3rem",
          paddingTop: "1.5rem",
          borderTop: "1px solid var(--border-color)",
          textAlign: "center",
          fontSize: "0.8rem",
          color: "var(--text-muted)",
        }}
      >
        <p>
          Institut Pertanian STIPER (INSTIPER) Yogyakarta — Fakultas Pertanian
        </p>
        <p style={{ fontSize: "0.75rem", color: "var(--text-light)", marginTop: "0.25rem" }}>
          Sistem Informasi Pemilihan KRS Pilihan & Proyek Semester
        </p>
      </footer>
    </div>
  );
}
