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
import { OfferingSelector, getCourseBaseName } from "@/components/student/OfferingSelector";
import { AjukanAksesModal } from "@/components/student/AjukanAksesModal";
import { LaporKendalaModal } from "@/components/student/LaporKendalaModal";

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
  const [registeredData, setRegisteredData] = useState<{
    nim: string;
    nama?: string;
    kelas?: string;
    token?: string;
    pesan_admin?: string;
    status_kendala?: string;
    alasan_kendala?: string;
  } | null>(null);
  const [networkWarning, setNetworkWarning] = useState<string | null>(null);
  const [adminNotice, setAdminNotice] = useState<{
    type: "pending" | "rejected" | "info";
    title: string;
    message: string;
    instruction?: string;
  } | null>(null);

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
              "Saat ini mahasiswa lain sedang menunggu antrian. Anda memiliki waktu maksimal 5 MENIT untuk menyelesaikan pemilihan mata kuliah Anda."
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
                "Saat ini mahasiswa lain sedang menunggu antrian. Anda memiliki waktu maksimal 5 MENIT untuk menyelesaikan pemilihan mata kuliah Anda."
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
        sudah_terdaftar?: boolean;
        token?: string;
        pesan_admin?: string;
        status_kendala?: string;
        status_pengajuan?: string;
        alasan_kendala?: string;
        tipe_pesan?: string;
      }
      const res = (data as CekNimResponse) || { ok: false };

      // Jika NIM belum terdaftar dan memiliki riwayat pengajuan akses (pending / rejected)
      if (!res.ok && res.status_pengajuan) {
        if (res.status_pengajuan === "rejected") {
          setAdminNotice({
            type: "rejected",
            title: "Pengajuan Akses Ditolak",
            message: res.pesan_admin || "Pengajuan akses Anda belum dapat disetujui oleh admin.",
            instruction: "Silakan datang langsung ke Loket Admin FAPERTA untuk verifikasi lebih lanjut.",
          });
        } else {
          setAdminNotice({
            type: "pending",
            title: "Pengajuan Akses Sedang Diproses",
            message: res.pesan_admin
              ? `Pesan dari Admin: "${res.pesan_admin}"`
              : "Pengajuan verifikasi akses Anda sedang menunggu persetujuan admin prodi.",
            instruction: "Mohon menunggu atau hubungi Loket Admin FAPERTA jika mendesak.",
          });
        }
        return;
      }

      if (!res.ok) {
        setAdminNotice(null);
        showPopup(
          "danger",
          "NIM Tidak Ditemukan",
          res.error || "NIM belum terdaftar di sistem pemilihan mata kuliah.",
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

      // Bersihkan notice jika NIM valid
      setAdminNotice(null);

      const isRegistered = res.sudah_daftar || res.sudah_terdaftar;
      if (isRegistered) {
        if (typeof window !== "undefined") {
          sessionStorage.setItem("nim", nim.trim());
          localStorage.setItem("krs_saved_nim", nim.trim());
        }
        setRegisteredData({
          nim: nim.trim(),
          nama: res.nama || res.nama_samar || "",
          kelas: res.kelas || "",
          token: res.token,
          pesan_admin: res.pesan_admin,
          status_kendala: res.status_kendala,
          alasan_kendala: res.alasan_kendala,
        });
        setShowRegisteredModal(true);
        return;
      }

      setStudentInfo({
        nama: res.nama || res.nama_samar,
        nama_samar: res.nama || res.nama_samar,
        kelas: res.kelas,
        sudah_terdaftar: false,
        pesan_admin: res.pesan_admin,
        status_kendala: res.status_kendala,
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

  // Handler: Toggle Offering Selection with Real-time Clash & Duplicate Protection
  const handleToggleOffering = (offering: Offering, replaceOfferingId?: number) => {
    // Jika offering sudah terpilih dan bukan pergantian kelas: toggle off (unselect)
    if (selectedIds.includes(offering.id) && !replaceOfferingId) {
      setSelectedIds((prev) => prev.filter((id) => id !== offering.id));
      return;
    }

    // Jika ada replaceOfferingId, filter keluar ID yang digantikan
    const activeSelectedIds = replaceOfferingId
      ? selectedIds.filter((id) => id !== replaceOfferingId)
      : selectedIds;

    const selectedItems = offerings.filter((o) => activeSelectedIds.includes(o.id));

    // Batas maksimal 4 mata kuliah terpilih
    if (activeSelectedIds.length >= 4) {
      showPopup("warning", "Batas Pilihan", "Anda hanya dapat memilih maksimal 4 mata kuliah.");
      return;
    }

    // Anti-duplikasi kelas untuk mata kuliah yang sama
    const offeringBase = getCourseBaseName(offering.nama);
    const isDuplicateCourse = selectedItems.some((item) => getCourseBaseName(item.nama) === offeringBase);
    if (isDuplicateCourse) {
      showPopup(
        "warning",
        "Mata Kuliah Sudah Dipilih",
        `Anda sudah memilih mata kuliah "${offering.nama}" di kelas lain. Setiap pilihan mata kuliah harus berbeda.`
      );
      return;
    }

    if (offering.bentrok_kelas) {
      showPopup("danger", "Bentrok Jadwal Kelas", `Mata kuliah "${offering.nama}" bentrok dengan jadwal kelas Anda.`);
      return;
    }
    const clash = findClashBetweenOfferings(offering, selectedItems);
    if (clash.hasClash) {
      showPopup("danger", "Bentrok Antar Pilihan", `Jadwal ${offering.nama} bentrok dengan pilihan "${clash.conflictWith}":\n${clash.detail}`);
      return;
    }

    setSelectedIds((prev) => {
      const base = replaceOfferingId ? prev.filter((id) => id !== replaceOfferingId) : prev;
      return [...base, offering.id];
    });
  };

  // Handler: Submit Final Registration
  const handleSubmitSelection = () => {
    if (selectedIds.length < 1 || selectedIds.length > 4) {
      showPopup("warning", "Jumlah Pilihan Belum Sesuai", "Silakan pilih minimal 1 dan maksimal 4 mata kuliah.");
      return;
    }

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
        label: `Pilihan #${idx + 1} • ${item.jenis === "matkul" ? "Mata Kuliah" : "Proyek Terapan"} (Kelas ${item.kelas || "A"})`,
        value: item.nama,
        schedule: scheduleText,
      };
    });

    showPopup(
      "confirm",
      "Konfirmasi Simpan Pilihan",
      "Pastikan mata kuliah pilihan Anda sudah sesuai (minimal 1, maksimal 4). Pilihan tidak dapat diubah kembali setelah disimpan.",
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
              const checkRes = checkData as { ok?: boolean; pendaftaran?: { pilihan?: unknown[] } } | null;
              const hasPilihan = Boolean(checkRes?.ok && checkRes?.pendaftaran?.pilihan && checkRes.pendaftaran.pilihan.length > 0);
              if (hasPilihan) {
                if (typeof window !== "undefined") {
                  sessionStorage.removeItem("krs_selected_ids");
                  localStorage.setItem("krs_saved_nim", nim.trim());
                }
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
            if (typeof window !== "undefined") {
              sessionStorage.removeItem("krs_selected_ids");
              localStorage.setItem("krs_saved_nim", nim.trim());
            }
            router.push("/bukti");
          } else {
            // Jika ditolak karena sudah pernah terdaftar, cek apakah bukti pendaftaran benar-benar ada
            if (res.error && res.error.toLowerCase().includes("sudah pernah")) {
              try {
                const { data: checkData } = await supabase.rpc("hasil_saya", {
                  p_nim: nim.trim(),
                  p_token: token.trim(),
                });
                const checkRes = checkData as { ok?: boolean; pendaftaran?: { pilihan?: unknown[] } } | null;
                const hasPilihan = Boolean(checkRes?.ok && checkRes?.pendaftaran?.pilihan && checkRes.pendaftaran.pilihan.length > 0);
                if (hasPilihan) {
                  if (typeof window !== "undefined") {
                    sessionStorage.removeItem("krs_selected_ids");
                    localStorage.setItem("krs_saved_nim", nim.trim());
                  }
                  router.push("/bukti");
                  return;
                }
              } catch {
                // Lanjut ke popup error
              }
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
            const checkRes = checkData as { ok?: boolean; pendaftaran?: { pilihan?: unknown[] } } | null;
            const hasPilihan = Boolean(checkRes?.ok && checkRes?.pendaftaran?.pilihan && checkRes.pendaftaran.pilihan.length > 0);
            if (hasPilihan) {
              if (typeof window !== "undefined") {
                sessionStorage.removeItem("krs_selected_ids");
                localStorage.setItem("krs_saved_nim", nim.trim());
              }
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
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            textAlign: "center",
            gap: "0.2rem",
            marginBottom: "0.85rem",
            padding: "0.65rem 0.85rem",
            width: "100%",
          }}
        >
          <div
            className="logo-container"
            style={{
              display: "flex",
              justifyContent: "center",
              alignItems: "center",
              width: "100%",
              margin: "0 auto",
            }}
          >
            <Image
              src="/logo-instiper.png"
              alt="Logo INSTIPER"
              width={38}
              height={38}
              priority
              style={{
                objectFit: "contain",
                display: "block",
                margin: "0 auto",
                width: 38,
                height: 38,
              }}
            />
          </div>
          <div
            style={{
              fontSize: "clamp(0.72rem, 2.6vw, 0.8rem)",
              fontWeight: 700,
              color: "var(--primary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              margin: "0.1rem auto 0.05rem",
              textAlign: "center",
              width: "100%",
            }}
          >
            Fakultas Pertanian INSTIPER Yogyakarta
          </div>
          <h1
            style={{
              fontSize: "clamp(1.05rem, 3.8vw, 1.25rem)",
              fontWeight: 800,
              color: "var(--text-main)",
              margin: "0 auto",
              letterSpacing: "-0.02em",
              textAlign: "center",
              lineHeight: 1.25,
              maxWidth: 420,
              width: "100%",
            }}
          >
            Sistem Pemilihan Mata Kuliah Pilihan
          </h1>
        </header>
      )}

      {phase === "login" && (
        <CheckNimCard
          nim={nim}
          setNim={setNim}
          studentInfo={studentInfo}
          loading={loading}
          adminNotice={adminNotice}
          onClearNotice={() => setAdminNotice(null)}
          onCheckNim={handleCheckNim}
          onJoinQueue={handleJoinQueue}
          onResetVerification={() => {
            setStudentInfo(null);
            setAdminNotice(null);
          }}
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
            <div style={{ textAlign: "center", marginBottom: "1rem" }}>
              <h3 style={{ fontSize: "1.15rem", fontWeight: 800, color: "var(--text-main)", margin: "0 0 0.35rem 0" }}>
                Status : Pendaftaran telah Selesai
              </h3>
              <p style={{ fontSize: "0.875rem", color: "var(--text-muted)", margin: 0 }}>
                Mahasiswa <strong>{registeredData.nama || registeredData.nim}</strong> ({registeredData.nim})
                {registeredData.kelas && registeredData.kelas !== "-" ? ` • Kelas ${registeredData.kelas}` : ""}
              </p>
            </div>

            {/* Kotak Balasan / Catatan Admin Jika Ada */}
            {registeredData.pesan_admin && (
              <div
                style={{
                  backgroundColor: "#eff6ff",
                  border: "1.5px solid #93c5fd",
                  borderRadius: "var(--radius-lg)",
                  padding: "0.85rem 1rem",
                  marginBottom: "1rem",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                    fontWeight: 800,
                    fontSize: "0.85rem",
                    color: "#1e40af",
                    marginBottom: "0.25rem",
                  }}
                >
                  <span>💬</span>
                  <span>Balasan / Catatan Admin Akademik:</span>
                </div>
                <div style={{ fontSize: "0.875rem", color: "#1e3a8a", lineHeight: 1.45, fontWeight: 600 }}>
                  &ldquo;{registeredData.pesan_admin}&rdquo;
                </div>
              </div>
            )}

            <div
              style={{
                backgroundColor: "var(--bg-subtle)",
                borderRadius: "var(--radius-md)",
                padding: "0.85rem 1rem",
                marginBottom: "1.25rem",
                border: "1px solid var(--border-color)",
                fontSize: "0.825rem",
              }}
            >
              <div style={{ fontWeight: 700, color: "var(--text-main)", marginBottom: "0.3rem" }}>
                Pilihan Tindakan Anda:
              </div>
              <ul style={{ margin: 0, paddingLeft: "1.2rem", color: "var(--text-muted)", lineHeight: 1.5 }}>
                <li>Melihat dan mencetak lembar Tanda Bukti Pemilihan Anda.</li>
                <li>Jika terjadi salah pilih atau kendala mendesak, ajukan perbaikan langsung ke Admin Akademik.</li>
              </ul>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-primary btn-block"
                onClick={() => {
                  if (typeof window !== "undefined") {
                    sessionStorage.setItem("nim", registeredData.nim);
                    localStorage.setItem("krs_saved_nim", registeredData.nim);
                    if (registeredData.token) {
                      sessionStorage.setItem("token", registeredData.token);
                    }
                  }
                  setShowRegisteredModal(false);
                  router.push("/bukti");
                }}
                style={{ padding: "0.85rem", fontSize: "0.95rem" }}
              >
                📄 Lihat Tanda Bukti Pemilihan Anda
              </button>

              {registeredData.status_kendala === "rejected" ? (
                <div
                  style={{
                    padding: "0.85rem 1rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "#fef2f2",
                    border: "1.5px solid #f87171",
                    color: "#991b1b",
                    fontSize: "0.825rem",
                    textAlign: "center",
                    fontWeight: 700,
                    lineHeight: 1.45,
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.35rem", marginBottom: "0.2rem" }}>
                    <span>⛔</span>
                    <span>Laporan Kendala Ditolak Admin</span>
                  </div>
                  <div style={{ fontSize: "0.775rem", fontWeight: 500, color: "#7f1d1d" }}>
                    {registeredData.pesan_admin ? (
                      <span>Alasan Penolakan: &ldquo;{registeredData.pesan_admin}&rdquo;</span>
                    ) : (
                      <span>Laporan kendala Anda telah ditolak oleh Admin Akademik. Keputusan admin bersifat final.</span>
                    )}
                  </div>
                  <div style={{ fontSize: "0.72rem", color: "#991b1b", marginTop: "0.35rem", opacity: 0.85 }}>
                    Tidak dapat mengajukan laporan kendala kembali.
                  </div>
                </div>
              ) : registeredData.status_kendala === "pending" ? (
                <div
                  style={{
                    padding: "0.75rem 1rem",
                    borderRadius: "var(--radius-md)",
                    backgroundColor: "#fffbeb",
                    border: "1.5px dashed #f59e0b",
                    color: "#92400e",
                    fontSize: "0.825rem",
                    textAlign: "center",
                    fontWeight: 700,
                    lineHeight: 1.4,
                  }}
                >
                  <span>⏳ Laporan Kendala Anda Sedang Ditinjau Admin</span>
                  <div style={{ fontSize: "0.75rem", fontWeight: 500, marginTop: "2px", opacity: 0.9 }}>
                    Mohon menunggu tanggapan admin sebelum mengirim laporan baru.
                  </div>
                </div>
              ) : (
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
                  ⚠️ Laporkan Kendala / Ajukan Permohonan Reset
                </button>
              )}

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

      {phase !== "select" && (
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
            Sistem Informasi Pemilihan Mata Kuliah Pilihan Semester Berjalan
          </p>
        </footer>
      )}
    </div>
    </>
  );
}
