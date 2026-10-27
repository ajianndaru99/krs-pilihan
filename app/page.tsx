"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import { Offering, StudentInfo, ModalDialogState, ModalDetailItem, ModalActionLink } from "@/lib/types";
import { findClashBetweenOfferings } from "@/lib/schedule-conflict";
import { InteractiveModal } from "@/components/student/InteractiveModal";
import { CheckNimCard } from "@/components/student/CheckNimCard";
import { QueueCard } from "@/components/student/QueueCard";
import { OfferingSelector } from "@/components/student/OfferingSelector";
import { AjukanAksesModal } from "@/components/student/AjukanAksesModal";
import { LaporKendalaModal } from "@/components/student/LaporKendalaModal";

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
  const [selectedIds, setSelectedIds] = useState<number[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const saved = sessionStorage.getItem("krs_selected_ids");
        if (saved) return JSON.parse(saved) as number[];
      } catch {
        return [];
      }
    }
    return [];
  });
  const [loading, setLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isRefreshingQuota, setIsRefreshingQuota] = useState(false);
  const [kelasList, setKelasList] = useState<string[]>(() => {
    if (typeof window !== "undefined") {
      try {
        const cached = sessionStorage.getItem("krs_cached_daftar_kelas");
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed as string[];
        }
      } catch {
        // Abaikan parsing galat
      }
    }
    return [];
  });
  const [showAjukanModal, setShowAjukanModal] = useState(false);
  const [showLaporModal, setShowLaporModal] = useState(false);
  const [showRegisteredModal, setShowRegisteredModal] = useState(false);
  const [registeredData, setRegisteredData] = useState<{ nim: string; nama?: string; kelas?: string } | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);

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
  const pollFailCountRef = useRef(0);
  const isPollingInFlightRef = useRef(false);
  const [isServerBusy, setIsServerBusy] = useState(false);
  const [hasQueue, setHasQueue] = useState(false);
  const hasShownQueueAlertRef = useRef(false);

  // Simpan selectedIds ke sessionStorage agar pilihan tidak hilang saat refresh
  useEffect(() => {
    if (typeof window !== "undefined") {
      if (selectedIds.length > 0) {
        sessionStorage.setItem("krs_selected_ids", JSON.stringify(selectedIds));
      } else {
        sessionStorage.removeItem("krs_selected_ids");
      }
    }
  }, [selectedIds]);

  // Sinkronisasi sesi: jika sessionStorage tidak memiliki token aktif, kembalikan ke login
  useEffect(() => {
    if (typeof window !== "undefined") {
      const curToken = sessionStorage.getItem("token");
      const curNim = sessionStorage.getItem("nim");
      if ((!curToken || !curNim) && phase !== "login") {
        const timer = setTimeout(() => {
          setPhase("login");
          setNim("");
          setToken("");
          setStudentInfo(null);
          setSelectedIds([]);
        }, 0);
        return () => clearTimeout(timer);
      }
    }
  }, [phase]);

  // Pelepasan otomatis sesi aktif saat tab/browser ditutup oleh mahasiswa
  useEffect(() => {
    const handlePageHide = () => {
      if (typeof window === "undefined") return;
      const curNim = sessionStorage.getItem("nim");
      const curToken = sessionStorage.getItem("token");
      if (curNim && curToken) {
        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
        const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
        if (supabaseUrl && anonKey) {
          fetch(`${supabaseUrl}/rest/v1/rpc/batal_sesi_antrian`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: anonKey,
              Authorization: `Bearer ${anonKey}`,
            },
            body: JSON.stringify({ p_nim: curNim, p_token: curToken }),
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
    };
  }, []);

  const closeModal = useCallback(() => {
    setModalDialog((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const showPopup = useCallback(
    (
      type: "info" | "warning" | "danger" | "confirm",
      title: string,
      message: string,
      details?: ModalDetailItem[],
      onConfirm?: () => void,
      actionLink?: ModalActionLink
    ) => {
      setModalDialog({
        isOpen: true,
        type,
        title,
        message,
        details,
        actionLink,
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

        interface ListOfferingsResponse {
          ok?: boolean;
          error?: string;
          pilihan?: Offering[];
          ada_antrian?: boolean;
          sisa_detik?: number;
        }

        const res = (data as ListOfferingsResponse) || {};
        if (res.ok === false) {
          if (!isSilent) {
            showPopup("danger", "Akses Pilihan Ditolak", res.error || "Gagal memuat mata kuliah.");
          }
          return;
        }

        setOfferings(res.pilihan || []);

        if (res.ada_antrian) {
          setHasQueue(true);
          if (!hasShownQueueAlertRef.current) {
            hasShownQueueAlertRef.current = true;
            showPopup(
              "warning",
              "PERHATIAN!",
              "Saat ini mahasiswa lain sedang menunggu antrian. Anda memiliki waktu maksimal 5 MENIT untuk menyelesaikan pemilihan KRS Anda."
            );
          }
          if (typeof res.sisa_detik === "number" && res.sisa_detik > 0) {
            setRemainingSeconds(res.sisa_detik);
            sessionEndTimeRef.current = Date.now() + res.sisa_detik * 1000;
          }
        } else {
          setHasQueue(false);
        }
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

  // Polling status antrian dengan proteksi in-flight, adaptive delay, dan jitter
  const checkQueueStatus = useCallback(
    async (curNim: string, curToken: string): Promise<boolean> => {
      if (isExitingRef.current) return false;
      if (typeof window !== "undefined" && !sessionStorage.getItem("token")) return false;
      if (isPollingInFlightRef.current) return false;

      isPollingInFlightRef.current = true;
      const startTime = Date.now();

      try {
        const { data, error } = await supabase.rpc("queue_status", {
          p_nim: curNim,
          p_token: curToken,
        });

        const elapsed = Date.now() - startTime;
        // Jika server membutuhkan waktu > 1.8 detik untuk merespons, tandai bahwa traffic sedang padat
        setIsServerBusy(elapsed > 1800);

        if (isExitingRef.current) return false;
        if (error) {
          pollFailCountRef.current += 1;
          if (pollFailCountRef.current >= 3) {
            setNetworkWarning("Koneksi ke server padat. Sistem tetap mengamankan giliran Anda...");
          }
          return false;
        }

        pollFailCountRef.current = 0;
        setNetworkWarning(null);

        interface QueueStatusResponse {
          ok?: boolean;
          state?: string;
          nomor?: number;
          posisi?: number;
          estimasi_menit?: number;
          sisa_detik?: number;
          bisa_antri_lagi?: boolean;
          ada_antrian?: boolean;
          error?: string;
        }

        const res = (data as QueueStatusResponse) || {};
        if (res.ok === false) {
          // Token tidak lagi valid (misal reset admin), kembalikan ke login
          sessionStorage.removeItem("nim");
          sessionStorage.removeItem("token");
          sessionStorage.removeItem("krs_selected_ids");
          setPhase("login");
          setNim("");
          setToken("");
          return false;
        }

        setQueueState(res.state || "");
        setQueueNumber(res.nomor ?? null);
        setQueuePosition(res.posisi ?? null);
        setEstMinutes(res.estimasi_menit ?? null);
        setCanRequeue(res.bisa_antri_lagi !== false);

        if (typeof res.ada_antrian === "boolean") {
          setHasQueue(res.ada_antrian);
        }

        if (typeof res.sisa_detik === "number" && res.sisa_detik > 0) {
          setRemainingSeconds(res.sisa_detik);
          sessionEndTimeRef.current = Date.now() + res.sisa_detik * 1000;
        }

        if (res.state === "active") {
          setPhase("select");
          if (res.ada_antrian) {
            setHasQueue(true);
            if (!hasShownQueueAlertRef.current) {
              hasShownQueueAlertRef.current = true;
              showPopup(
                "warning",
                "PERHATIAN!",
                "Saat ini mahasiswa lain sedang menunggu antrian. Anda memiliki waktu maksimal 5 MENIT untuk menyelesaikan pemilihan KRS Anda."
              );
            }
          } else {
            setHasQueue(false);
          }
          fetchOfferings(curNim, curToken);
          return false; // Berhenti polling antrian ruang tunggu
        } else if (res.state === "done") {
          router.push("/bukti");
          return false;
        }

        return true; // Lanjutkan polling
      } catch (err: unknown) {
        pollFailCountRef.current += 1;
        if (pollFailCountRef.current >= 3) {
          const msg = err instanceof Error ? err.message : "Gangguan jaringan";
          setNetworkWarning(`Koneksi terganggu (${msg}). Sistem tetap mencoba menghubungkan kembali...`);
        }
        return true;
      } finally {
        isPollingInFlightRef.current = false;
      }
    },
    [fetchOfferings, router, showPopup]
  );

  // Setup chained polling saat fase queue (Anti-overlap + Jitter + Adaptive delay)
  useEffect(() => {
    if (phase === "queue" && nim && token) {
      isExitingRef.current = false;
      let isMounted = true;
      let timerId: NodeJS.Timeout | null = null;

      const scheduleNextPoll = (delayMs: number) => {
        if (!isMounted) return;
        timerId = setTimeout(async () => {
          if (!isMounted) return;
          const shouldContinue = await checkQueueStatus(nim, token);
          if (shouldContinue && isMounted) {
            // Adaptive delay: jika server sibuk, beri jeda lebih lama (14-16s)
            // Tambahkan jitter acak 0-2500ms agar 300 mahasiswa tidak menembak di detik yang sama
            const jitter = Math.floor(Math.random() * 2500);
            const baseDelay = isServerBusy ? 14000 : QUEUE_POLL_INTERVAL_MS;
            scheduleNextPoll(baseDelay + jitter);
          }
        }, delayMs);
      };

      // Jalankan polling pertama secara asinkron lewat timer terpisah
      timerId = setTimeout(() => {
        if (!isMounted) return;
        void checkQueueStatus(nim, token).then((shouldContinue) => {
          if (shouldContinue && isMounted) {
            const jitter = Math.floor(Math.random() * 2000);
            scheduleNextPoll(QUEUE_POLL_INTERVAL_MS + jitter);
          }
        });
      }, 0);

      return () => {
        isMounted = false;
        if (timerId) clearTimeout(timerId);
      };
    }
  }, [phase, nim, token, checkQueueStatus, isServerBusy]);

  // Polling kuota otomatis saat fase select dengan chained timeout & anti-overlap
  useEffect(() => {
    if (phase === "select" && nim && token) {
      let isMounted = true;
      let timerId: NodeJS.Timeout | null = null;

      const scheduleQuotaPoll = () => {
        if (!isMounted) return;
        // Jitter 10s + 0-3s
        const delay = 10000 + Math.floor(Math.random() * 3000);
        timerId = setTimeout(async () => {
          if (!isMounted) return;
          await fetchOfferings(nim, token, true);
          if (isMounted) scheduleQuotaPoll();
        }, delay);
      };

      scheduleQuotaPoll();

      return () => {
        isMounted = false;
        if (timerId) clearTimeout(timerId);
      };
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

  // Load daftar kelas saat modal ajukan dibuka jika belum terisi
  useEffect(() => {
    if (showAjukanModal && kelasList.length === 0) {
      let isMounted = true;
      supabase.rpc("daftar_kelas").then(({ data }) => {
        if (isMounted && Array.isArray(data)) {
          setKelasList(data as string[]);
          if (typeof window !== "undefined") {
            sessionStorage.setItem("krs_cached_daftar_kelas", JSON.stringify(data));
          }
        }
      });
      return () => {
        isMounted = false;
      };
    }
  }, [showAjukanModal, kelasList.length]);

  // Deteksi status koneksi offline perangkat
  const [isOffline, setIsOffline] = useState(() => {
    if (typeof navigator !== "undefined") {
      return !navigator.onLine;
    }
    return false;
  });
  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Handler: Verifikasi NIM
  const handleCheckNim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nim.trim()) return;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("cek_nim", { p_nim: nim.trim() });
      if (error) {
        showPopup("danger", "Pengecekan Gagal", error.message, undefined, undefined, {
          text: "Mengalami kendala? Laporkan ke Admin di Sini",
          action: () => setShowLaporModal(true),
          icon: "💬",
        });
        return;
      }
      interface CekNimResponse {
        ok: boolean;
        error?: string;
        nama?: string;
        nama_samar?: string;
        kelas?: string;
        sudah_daftar?: boolean;
      }
      const res = (data as CekNimResponse) || { ok: false };
      if (!res.ok) {
        showPopup(
          "danger",
          "NIM Tidak Ditemukan",
          res.error || "NIM belum terdaftar di sistem KRS.",
          undefined,
          undefined,
          {
            text: "NIM Belum Terdaftar? Ajukan Verifikasi Akses di Sini",
            action: () => setShowAjukanModal(true),
            icon: "📝",
          }
        );
        return;
      }
      if (res.sudah_daftar) {
        setRegisteredData({
          nim: nim.trim(),
          nama: res.nama || res.nama_samar || "",
          kelas: res.kelas || "",
        });
        setShowRegisteredModal(true);
        return;
      }
      setStudentInfo({
        nama: res.nama || res.nama_samar,
        nama_samar: res.nama || res.nama_samar,
        kelas: res.kelas,
        sudah_terdaftar: false,
      });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan.";
      showPopup("danger", "Kesalahan", msg, undefined, undefined, {
        text: "Laporkan Kendala Sistem ke Admin",
        action: () => setShowLaporModal(true),
        icon: "💬",
      });
    } finally {
      setLoading(false);
    }
  };

  // Handler: Masuk Antrian (Cukup dengan NIM, PIN bersifat opsional)
  const handleJoinQueue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nim.trim()) return;
    isExitingRef.current = false;
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("join_queue", {
        p_nim: nim.trim(),
        p_pin: pin.trim() || null,
      });
      if (error) {
        showPopup("danger", "Gagal Masuk Antrian", error.message, undefined, undefined, {
          text: "Mengalami Kendala? Laporkan ke Admin di Sini",
          action: () => setShowLaporModal(true),
          icon: "💬",
        });
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
        showPopup(
          "warning",
          "Akses Antrian Ditolak",
          res.error || "Gagal bergabung ke antrian.",
          undefined,
          undefined,
          {
            text: "Mengalami kendala? Laporkan Kendala / Hubungi Admin",
            action: () => setShowLaporModal(true),
            icon: "💬",
          }
        );
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
    const details = selectedItems.map((item, idx) => {
      const scheduleText =
        item.jadwal && item.jadwal.length > 0
          ? item.jadwal
              .map(
                (j) =>
                  `${j.hari}, ${j.jam_mulai.slice(0, 5)} - ${j.jam_selesai.slice(0, 5)}${
                    j.ruang ? ` (${j.ruang})` : ""
                  }`
              )
              .join("; ")
          : "Jadwal belum ditentukan";

      return {
        label: `Pilihan #${idx + 1} • ${item.jenis === "matkul" ? "Mata Kuliah" : "Proyek Terapan"}`,
        value: item.nama,
        subValue: item.topik ? `Topik: ${item.topik}` : undefined,
        schedule: scheduleText,
      };
    });

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
            // Verifikasi apakah transaksi sebenarnya sudah berhasil tersimpan di server
            try {
              const { data: checkData } = await supabase.rpc("hasil_saya", {
                p_nim: nim.trim(),
                p_token: token.trim(),
              });
              const checkRes = checkData as { ok?: boolean } | null;
              if (checkRes?.ok) {
                if (typeof window !== "undefined") sessionStorage.removeItem("krs_selected_ids");
                router.push("/bukti");
                return;
              }
            } catch {
              // Abaikan dan tampilkan pesan error asli
            }

            showPopup("danger", "Gagal Mendaftar", error.message);
            return;
          }

          const res = (data as { ok?: boolean; error?: string }) || {};
          if (res.ok) {
            if (typeof window !== "undefined") sessionStorage.removeItem("krs_selected_ids");
            router.push("/bukti");
          } else {
            // Jika ditolak karena sudah pernah terdaftar, cek bukti pendaftaran
            if (res.error && res.error.toLowerCase().includes("sudah pernah")) {
              if (typeof window !== "undefined") sessionStorage.removeItem("krs_selected_ids");
              router.push("/bukti");
              return;
            }
            showPopup("danger", "Pendaftaran Ditolak", res.error || "Gagal menyimpan pendaftaran.");
          }
        } catch (err: unknown) {
          // Galat jaringan saat submit: verifikasi status akhir pendaftaran di server
          try {
            const { data: checkData } = await supabase.rpc("hasil_saya", {
              p_nim: nim.trim(),
              p_token: token.trim(),
            });
            const checkRes = checkData as { ok?: boolean } | null;
            if (checkRes?.ok) {
              if (typeof window !== "undefined") sessionStorage.removeItem("krs_selected_ids");
              router.push("/bukti");
              return;
            }
          } catch {
            // Fallback ke notifikasi retry aman
          }

          const msg = err instanceof Error ? err.message : "Kesalahan koneksi.";
          showPopup("danger", "Kesalahan Jaringan", `${msg}. Pilihan Anda tetap aman tersimpan, silakan periksa koneksi dan coba tekan Simpan kembali.`);
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

        // Lepaskan sesi aktif di database seketika agar kuota antrian tidak tertahan 5 menit
        if (nim && token) {
          void supabase.rpc("batal_sesi_antrian", { p_nim: nim, p_token: token }).then(() => {}, () => {});
        }

        if (typeof window !== "undefined") {
          sessionStorage.clear();
        }
        hasShownQueueAlertRef.current = false;
        setHasQueue(false);
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
    <>
      {isOffline && (
        <div
          role="status"
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: "#b91c1c",
            color: "#ffffff",
            textAlign: "center",
            padding: "0.55rem 1rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <span>Koneksi internet terputus. Sesi Anda tetap tersimpan, sistem akan terhubung otomatis saat online kembali.</span>
        </div>
      )}
      {networkWarning && !isOffline && (
        <div
          role="status"
          style={{
            position: "sticky",
            top: 0,
            left: 0,
            right: 0,
            backgroundColor: "#d97706",
            color: "#ffffff",
            textAlign: "center",
            padding: "0.55rem 1rem",
            fontSize: "0.85rem",
            fontWeight: 600,
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "0.5rem",
            boxShadow: "0 2px 8px rgba(0,0,0,0.2)",
          }}
        >
          <span>{networkWarning}</span>
        </div>
      )}
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
            width={42}
            height={42}
            priority
            style={{ objectFit: "contain", flexShrink: 0 }}
          />
          <div style={{ flex: 1, minWidth: 260 }}>
            <h1 style={{ fontSize: "1.45rem", fontWeight: 800, color: "var(--text-main)", margin: 0, letterSpacing: "-0.02em" }}>
              Sistem Pemilihan Mata Kuliah Pilihan
            </h1>
          </div>
        </header>
      )}

      {phase === "login" && (
        <CheckNimCard
          nim={nim}
          setNim={setNim}
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
          isServerBusy={isServerBusy}
          studentName={studentInfo?.nama || studentInfo?.nama_samar}
          onRequeue={() => handleJoinQueue({ preventDefault: () => {} } as React.FormEvent)}
          onExit={handleRequestExit}
        />
      )}

      {phase === "select" && (
        <OfferingSelector
          offerings={offerings}
          selectedIds={selectedIds}
          remainingSeconds={remainingSeconds}
          hasQueue={hasQueue}
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

      <LaporKendalaModal
        isOpen={showLaporModal}
        nim={registeredData?.nim || nim}
        nama={registeredData?.nama || studentInfo?.nama_samar || ""}
        onClose={() => setShowLaporModal(false)}
        onSuccess={(msg) => showPopup("info", "Laporan Terkirim", msg)}
        onError={(err) => showPopup("danger", "Gagal Mengirim Laporan", err)}
      />

      {/* Modal Interaktif Khusus Mahasiswa yang Sudah Menyelesaikan Pendaftaran */}
      {showRegisteredModal && registeredData && (
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
            zIndex: 9999,
            padding: "1rem",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div
            className="card"
            style={{
              width: "100%",
              maxWidth: 480,
              maxHeight: "min(84vh, 600px)",
              overflowY: "auto",
              margin: "auto 0",
              backgroundColor: "#ffffff",
              boxShadow: "0 25px 50px -12px rgba(0, 0, 0, 0.25)",
              borderRadius: "var(--radius-xl)",
              padding: "1.25rem 1.5rem",
              border: "1.5px solid var(--primary-border)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", marginBottom: "0.75rem" }}>
              <span
                style={{
                  fontSize: "0.7rem",
                  fontWeight: 800,
                  padding: "3px 10px",
                  borderRadius: "var(--radius-full)",
                  backgroundColor: "var(--success-light)",
                  color: "var(--success)",
                  border: "1px solid var(--success-border)",
                  letterSpacing: "0.06em",
                }}
              >
                STATUS: TERDAFTAR
              </span>
              <h3 style={{ fontSize: "1.2rem", fontWeight: 800, color: "var(--text-main)", margin: 0 }}>
                Pendaftaran Telah Selesai
              </h3>
            </div>

            <p style={{ fontSize: "0.9rem", color: "var(--text-body)", lineHeight: 1.5, marginBottom: "1.25rem" }}>
              Mahasiswa <strong>{registeredData.nama || registeredData.nim}</strong> ({registeredData.nim}) telah menyelesaikan pendaftaran KRS pilihan.
            </p>

            <div
              style={{
                backgroundColor: "var(--bg-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "1rem",
                marginBottom: "1.5rem",
                border: "1px solid var(--border-color)",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ fontWeight: 700, color: "var(--text-main)", marginBottom: "0.35rem" }}>
                Pilihan Tindakan Anda:
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-muted)", lineHeight: 1.6 }}>
                <li>Melihat dan mencetak lembar Tanda Bukti KRS Anda.</li>
                <li>Jika terjadi salah pilih atau kendala mendesak, ajukan perbaikan langsung ke Admin Akademik.</li>
              </ul>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => {
                  sessionStorage.setItem("nim", registeredData.nim);
                  setShowRegisteredModal(false);
                  router.push("/bukti");
                }}
                style={{ padding: "0.85rem", fontSize: "0.95rem" }}
              >
                📄 Lihat Tanda Bukti KRS Anda
              </button>

              <button
                type="button"
                className="btn btn-secondary btn-block"
                onClick={() => {
                  setShowRegisteredModal(false);
                  setShowLaporModal(true);
                }}
                style={{
                  padding: "0.75rem",
                  fontSize: "0.875rem",
                  borderColor: "var(--warning-border)",
                  color: "var(--warning)",
                  backgroundColor: "var(--warning-light)",
                }}
              >
                ⚠️ Laporkan Kendala / Ajukan Reset KRS
              </button>

              <button
                type="button"
                className="btn"
                onClick={() => setShowRegisteredModal(false)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--text-muted)",
                  fontSize: "0.825rem",
                  padding: "0.4rem",
                  cursor: "pointer",
                }}
              >
                Tutup Jendela Ini
              </button>
            </div>
          </div>
        </div>
      )}

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
    </>
  );
}
