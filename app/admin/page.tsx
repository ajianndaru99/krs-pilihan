"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Offering,
  AdminSystemStatus,
  AdminPengajuanItem,
  PendaftarStudentItem,
  MasterStudentItem,
  StudentComplaintItem,
  SystemLogItem,
  AdminAlertItem,
} from "@/lib/types";
import {
  normalizeAdminStatus,
  parseOfferingsData,
  parsePendaftarData,
  parseExportFallbackPendaftar,
  parsePengajuanData,
  parseKelasData,
  parseMasterStudentsData,
  parseComplaintsData,
  parseLogsData,
  parseAlertsData,
} from "@/lib/admin-adapter";
import { StudentImportRow } from "@/lib/excel-parser";
import { AdminLoginCard } from "@/components/admin/AdminLoginCard";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { OfferingManager } from "@/components/admin/OfferingManager";
import { PendaftarList } from "@/components/admin/PendaftarList";
import { MasterScheduleImport } from "@/components/admin/MasterScheduleImport";
import { StudentImport } from "@/components/admin/StudentImport";
import { AccessRequestsList } from "@/components/admin/AccessRequestsList";
import { ComplaintManager } from "@/components/admin/ComplaintManager";
import { ResetDataModal } from "@/components/admin/ResetDataModal";
import { SystemLogsViewer } from "@/components/admin/SystemLogsViewer";
import { AdminModal, AdminModalState, AdminModalType } from "@/components/admin/AdminModal";

const ADMIN_POLL_INTERVAL_MS = 10000;

type AdminTab = "offerings" | "pendaftar" | "import_jadwal" | "import_mahasiswa" | "pengajuan" | "complaints" | "logs" | "batal_reset";

interface SupabaseUserSession {
  email?: string;
}

export default function AdminPage() {
  const [sessionUser, setSessionUser] = useState<SupabaseUserSession | null>(null);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Form Login
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Data Dashboard
  const [activeTab, setActiveTab] = useState<AdminTab>("offerings");
  const [portalOpen, setPortalOpen] = useState(false);
  const [status, setStatus] = useState<AdminSystemStatus | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [pendaftar, setPendaftar] = useState<PendaftarStudentItem[]>([]);
  const [students, setStudents] = useState<MasterStudentItem[]>([]);
  const [requests, setRequests] = useState<AdminPengajuanItem[]>([]);
  const [complaints, setComplaints] = useState<StudentComplaintItem[]>([]);
  const [logs, setLogs] = useState<SystemLogItem[]>([]);
  const lastAlertIdRef = useRef<number | null>(null);
  const [incomingAlert, setIncomingAlert] = useState<AdminAlertItem | null>(null);
  const [kelasList, setKelasList] = useState<string[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>("");

  // Modal Dialog Interaktif Admin
  const [adminModal, setAdminModal] = useState<AdminModalState>({
    isOpen: false,
    type: "info",
    title: "",
    message: "",
  });

  const closeModal = useCallback(() => {
    setAdminModal((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const showAdminPopup = useCallback(
    (
      type: AdminModalType,
      title: string,
      message: string,
      details?: { label: string; value: string }[],
      onConfirm?: () => void
    ) => {
      setAdminModal({
        isOpen: true,
        type,
        title,
        message,
        details,
        onConfirm,
        confirmText: type === "confirm" || type === "danger" ? "Ya, Lanjutkan" : undefined,
        cancelText: "Batal",
      });
    },
    []
  );

  // Muat data dashboard admin
  const loadAdminData = useCallback(async (isSilent = false) => {
    if (!isSilent) setIsRefreshing(true);
    try {
      // 1. Status sistem
      const { data: stData } = await supabase.rpc("admin_status");
      const normalizedStatus = normalizeAdminStatus(stData);
      if (normalizedStatus) {
        setStatus(normalizedStatus);
        setPortalOpen(normalizedStatus.portal_open);
      }

      // 2. Offerings
      const { data: offData } = await supabase.rpc("admin_list_offerings");
      setOfferings(parseOfferingsData(offData));

      // 3. Pendaftar
      const { data: pendData } = await supabase.rpc("admin_list_pendaftar");
      let pendaftarList = parsePendaftarData(pendData);
      if (pendaftarList.length === 0) {
        const { data: expData } = await supabase.rpc("admin_export_pendaftaran");
        pendaftarList = parseExportFallbackPendaftar(expData);
      }
      setPendaftar(pendaftarList);

      if (pendaftarList.length > 0) {
        setStatus((prev) => {
          if (!prev) return prev;
          if (prev.sudah_daftar === 0 || !prev.sudah_daftar) {
            return {
              ...prev,
              sudah_daftar: pendaftarList.length,
              total_registered: pendaftarList.length,
            };
          }
          return prev;
        });
      }

      // 4. Master Mahasiswa (RPC admin_list_students dengan fallback)
      const { data: studData } = await supabase.rpc("admin_list_students");
      let parsedStudents = parseMasterStudentsData(studData);
      if (parsedStudents.length === 0 && pendaftarList.length > 0) {
        parsedStudents = pendaftarList.map((p) => ({
          nim: p.nim,
          nama: p.nama,
          kelas: p.kelas || "-",
          registered_at: p.registered_at || null,
          has_registered: true,
        }));
      }
      setStudents(parsedStudents);

      // 5. Pengajuan Akses
      const { data: reqData } = await supabase.rpc("admin_list_pengajuan");
      setRequests(parsePengajuanData(reqData));

      // 6. Daftar Kelas
      const { data: kData } = await supabase.rpc("daftar_kelas");
      setKelasList(parseKelasData(kData));

      // 7. Laporan Kendala Mahasiswa (Complaints)
      try {
        const { data: compData, error: compErr } = await supabase.rpc("admin_list_complaints");
        if (!compErr) {
          setComplaints(parseComplaintsData(compData));
        }
      } catch {
        // Fallback aman jika patch13 belum dieksekusi di database server
      }

      // 8. Log Aktivitas Database & Sistem
      try {
        const { data: logData, error: logErr } = await supabase.rpc("admin_list_logs", { p_limit: 100 });
        if (!logErr) {
          const parsedLogs = parseLogsData(logData);
          setLogs(parsedLogs);
          if (lastAlertIdRef.current === null) {
            const maxLogId = parsedLogs.reduce((max, item) => (item.id > max ? item.id : max), 0);
            lastAlertIdRef.current = maxLogId;
          }
        }
      } catch {
        // Fallback aman jika patch31 belum dieksekusi di database server
      }

      setLastSyncTime(new Date().toLocaleTimeString("id-ID"));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat data admin.";
      if (!isSilent) setActionError(msg);
    } finally {
      if (!isSilent) setIsRefreshing(false);
    }
  }, []);

  // Cek sesi Auth Supabase saat mount
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSessionUser(session?.user || null);
      setCheckingAuth(false);
      if (session?.user) {
        loadAdminData();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSessionUser(session?.user || null);
      if (session?.user) {
        loadAdminData();
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [loadAdminData]);

  // Polling data admin otomatis setiap 10 detik saat admin login + sinkron saat tab aktif
  useEffect(() => {
    if (sessionUser) {
      const timer = setInterval(() => {
        void loadAdminData(true);
      }, ADMIN_POLL_INTERVAL_MS);

      const handleVisibilityChange = () => {
        if (typeof document !== "undefined" && document.visibilityState === "visible") {
          void loadAdminData(true);
        }
      };

      document.addEventListener("visibilitychange", handleVisibilityChange);

      return () => {
        clearInterval(timer);
        document.removeEventListener("visibilitychange", handleVisibilityChange);
      };
    }
  }, [sessionUser, loadAdminData]);

  // Polling Pop-up Notifikasi jika ada data mental / error baru (setiap 10 detik)
  useEffect(() => {
    if (!sessionUser) return;

    const pollAlerts = async () => {
      try {
        const isFirstCursorSync = lastAlertIdRef.current === null;
        const cursorId = lastAlertIdRef.current ?? 0;

        const { data: alertRes, error: alertErr } = await supabase.rpc("admin_get_latest_alerts", {
          p_after_id: cursorId,
        });
        if (alertErr) return;

        const resObj = alertRes as { ok?: boolean; latest_id?: number } | null;
        if (resObj?.ok === false) return;

        if (typeof resObj?.latest_id === "number" && resObj.latest_id > cursorId) {
          lastAlertIdRef.current = resObj.latest_id;
        } else if (isFirstCursorSync) {
          lastAlertIdRef.current = typeof resObj?.latest_id === "number" ? resObj.latest_id : 0;
        }

        // Jangan tampilkan pop-up untuk log historis saat halaman baru dimuat
        if (isFirstCursorSync) return;

        const parsedAlerts = parseAlertsData(alertRes);
        if (parsedAlerts.length > 0) {
          const firstError = parsedAlerts.find((a) => a.level === "error" || a.level === "warning");
          if (firstError) {
            setIncomingAlert(firstError);
          }
          void loadAdminData(true);
        }
      } catch {
        // Abaikan jika RPC belum aktif di database
      }
    };

    const alertInterval = setInterval(() => {
      void pollAlerts();
    }, ADMIN_POLL_INTERVAL_MS);

    return () => {
      clearInterval(alertInterval);
    };
  }, [sessionUser, loadAdminData]);

  // Handler Login Admin
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setActionError(null);
    try {
      const cleanUsername = username.trim();
      const normalizedEmail = cleanUsername.includes("@")
        ? cleanUsername.toLowerCase()
        : `${cleanUsername.toLowerCase()}@admin.local`;

      const { error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password: password.trim(),
      });

      if (error) {
        setActionError("Login admin gagal. Periksa username dan password Anda.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Terjadi kesalahan saat masuk.";
      setActionError(msg);
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setSessionUser(null);
  };

  // Handler Toggle Portal dengan Custom Interactive Modal
  const handleTogglePortal = () => {
    const nextState = !portalOpen;
    showAdminPopup(
      nextState ? "confirm" : "danger",
      nextState ? "Buka Portal Pemilihan" : "Tutup Portal Pemilihan",
      nextState
        ? "Apakah Anda yakin ingin MEMBUKA portal pemilihan? Mahasiswa dapat langsung masuk dan memilih mata kuliah."
        : "Apakah Anda yakin ingin MENUTUP portal pemilihan? Mahasiswa baru tidak akan dapat mendaftar.",
      undefined,
      async () => {
        try {
          const { data, error } = await supabase.rpc("admin_toggle_portal", { p_buka: nextState });
          if (error) {
            showAdminPopup("danger", "Gagal Mengubah Portal", error.message);
            return;
          }
          const res = data as { ok?: boolean; error?: string } | null;
          if (res?.ok) {
            setPortalOpen(nextState);
            loadAdminData();
            showAdminPopup(
              "success",
              "Status Portal Diperbarui",
              nextState ? "Portal pemilihan mahasiswa berhasil DIBUKA." : "Portal pemilihan berhasil DITUTUP."
            );
          } else {
            showAdminPopup("danger", "Gagal", res?.error || "Gagal mengubah portal.");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan koneksi.";
          showAdminPopup("danger", "Kesalahan", msg);
        }
      }
    );
  };

  // Handler Sapu Sesi Menggantung / Idle
  const handleSapuSesi = () => {
    showAdminPopup(
      "confirm",
      "Sapukan Sesi Aktif Tertahan?",
      "Sesi aktif yang menggantung akan dibersihkan dan slot antrian yang menunggu (jika ada) akan dipromosikan. Mahasiswa yang masih memilih tetap dilindungi otomatis jika slot masih tersedia.",
      undefined,
      async () => {
        try {
          setIsRefreshing(true);
          const { data, error } = await supabase.rpc("admin_sapu_sesi");
          if (error) {
            showAdminPopup("danger", "Gagal Menyapu Sesi", error.message);
            return;
          }
          const res = data as { ok?: boolean; message?: string; error?: string } | null;
          if (res?.ok) {
            showAdminPopup("info", "Pembersihan Sesi Selesai", res.message || "Sesi aktif tertahan berhasil dibersihkan.");
            await loadAdminData(true);
          } else {
            showAdminPopup("danger", "Gagal", res?.error || "Gagal menyapu sesi.");
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Kesalahan koneksi.";
          showAdminPopup("danger", "Kesalahan", msg);
        } finally {
          setIsRefreshing(false);
        }
      }
    );
  };

  // Handler Kuota
  const handleUpdateKuota = async (offeringId: number, newKuota: number) => {
    const { error } = await supabase.rpc("admin_update_kuota", {
      p_offering_id: offeringId,
      p_kuota: newKuota,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Mengubah Kuota", error.message);
      return;
    }
    loadAdminData();
    showAdminPopup("success", "Kuota Diperbarui", `Kapasitas kuota berhasil diubah menjadi ${newKuota}.`);
  };

  // Handler Upsert Offering
  const handleUpsertOffering = async (
    id: number | null,
    nama: string,
    topik: string,
    jenis: "matkul" | "proyek",
    kuota: number
  ) => {
    const { error } = await supabase.rpc("admin_upsert_offering", {
      p_id: id,
      p_nama: nama,
      p_topik: topik,
      p_jenis: jenis,
      p_kuota: kuota,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Menyimpan", error.message);
      return;
    }
    loadAdminData();
    showAdminPopup("success", "Berhasil", `Pilihan "${nama}" berhasil disimpan.`);
  };

  // Handler Delete Offering
  const handleDeleteOffering = async (id: number) => {
    const { error } = await supabase.rpc("admin_delete_offering", { p_id: id });
    if (error) {
      showAdminPopup("danger", "Gagal Menghapus", error.message);
      return;
    }
    loadAdminData();
    showAdminPopup("success", "Berhasil", "Mata kuliah pilihan berhasil dihapus.");
  };

  // Handler Add Schedule
  const handleAddSchedule = async (
    offeringId: number,
    hari: string,
    jamMulai: string,
    jamSelesai: string,
    ruang: string
  ) => {
    const { error } = await supabase.rpc("admin_tambah_jadwal", {
      p_offering_id: offeringId,
      p_hari: hari,
      p_jam_mulai: jamMulai,
      p_jam_selesai: jamSelesai,
      p_ruang: ruang,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Menambah Jadwal", error.message);
      return;
    }
    loadAdminData();
    showAdminPopup("success", "Jadwal Disimpan", `Jadwal ${hari} (${jamMulai} - ${jamSelesai}) berhasil ditambahkan.`);
  };

  // Handler Delete Schedule
  const handleDeleteSchedule = async (scheduleId: number) => {
    const { error } = await supabase.rpc("admin_hapus_jadwal", { p_schedule_id: scheduleId });
    if (error) {
      showAdminPopup("danger", "Gagal Menghapus Jadwal", error.message);
      return;
    }
    loadAdminData();
  };

  // Handler Setujui Pengajuan
  const handleApproveRequest = async (id: number, catatan?: string) => {
    const { data, error } = await supabase.rpc("admin_setujui_pengajuan", {
      p_id: id,
      p_catatan: catatan || null,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Menyetujui", error.message);
      throw error;
    }
    const res = data as { ok?: boolean; error?: string } | null;
    if (res?.ok === false) {
      showAdminPopup("danger", "Gagal Menyetujui", res.error || "Gagal menyetujui pengajuan.");
      throw new Error(res.error || "Gagal menyetujui.");
    }
    loadAdminData();
    showAdminPopup("success", "Pengajuan Disetujui", "Mahasiswa bersangkutan kini dapat login dan mendaftar.");
  };

  // Handler Tolak Pengajuan
  const handleRejectRequest = async (id: number, catatan: string) => {
    const { data, error } = await supabase.rpc("admin_tolak_pengajuan", {
      p_id: id,
      p_catatan: catatan,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Menolak Pengajuan", error.message);
      throw error;
    }
    const res = data as { ok?: boolean; error?: string } | null;
    if (res?.ok === false) {
      showAdminPopup("danger", "Gagal Menolak", res.error || "Gagal memproses penolakan.");
      throw new Error(res.error || "Gagal menolak.");
    }
    loadAdminData();
    showAdminPopup("success", "Pengajuan Ditolak", "Pengajuan akses mahasiswa telah ditolak dengan catatan yang tersimpan.");
  };

  // Handler Balas Pengajuan
  const handleReplyRequest = async (id: number, catatan: string) => {
    const { data, error } = await supabase.rpc("admin_balas_pengajuan", {
      p_id: id,
      p_catatan: catatan,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Menyimpan Balasan", error.message);
      throw error;
    }
    const res = data as { ok?: boolean; error?: string } | null;
    if (res?.ok === false) {
      showAdminPopup("danger", "Gagal Menyimpan", res.error || "Gagal memproses pesan.");
      throw new Error(res.error || "Gagal menyimpan balasan.");
    }
    loadAdminData();
    showAdminPopup("success", "Pesan Balasan Tersimpan", "Pesan akan muncul saat mahasiswa memasukkan NIM di halaman login.");
  };

  // Handler Balas Kendala Mahasiswa
  const handleReplyComplaint = async (id: number, catatan: string) => {
    const { data, error } = await supabase.rpc("admin_balas_kendala", {
      p_id: id,
      p_catatan: catatan,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Menyimpan Balasan Kendala", error.message);
      throw error;
    }
    const res = data as { ok?: boolean; error?: string } | null;
    if (res?.ok === false) {
      showAdminPopup("danger", "Gagal Menyimpan", res.error || "Gagal memproses pesan kendala.");
      throw new Error(res.error || "Gagal menyimpan pesan kendala.");
    }
    loadAdminData(true);
    showAdminPopup("success", "Balasan Kendala Tersimpan", "Pesan dari admin berhasil disimpan dan dapat dibaca oleh mahasiswa.");
  };

  // Handler Batalkan Pendaftaran Per NIM
  const handleBatalDaftar = async (nim: string) => {
    const { error } = await supabase.rpc("admin_batal_daftar", { p_nim: nim });
    if (error) {
      showAdminPopup("danger", "Gagal Membatalkan", error.message);
      return;
    }
    loadAdminData();
    showAdminPopup("success", "Pendaftaran Dibatalkan", `Pendaftaran untuk NIM ${nim} berhasil dibatalkan dan kuota dikembalikan.`);
  };

  // Handler Batal Daftar dari Tabel Mahasiswa (dengan konfirmasi dialog)
  const handleBatalDaftarWithConfirm = async (nim: string, nama: string) => {
    showAdminPopup(
      "danger",
      "Batalkan Pemilihan KRS",
      `Apakah Anda yakin ingin membatalkan pemilihan KRS untuk ${nama} (${nim})? Seluruh kuota kelas yang dipilih akan dikembalikan dan mahasiswa dapat memilih ulang.`,
      undefined,
      async () => {
        await handleBatalDaftar(nim);
      }
    );
  };

  // Handler Update Mahasiswa
  const handleUpdateStudent = async (nim: string, nama: string, kelas: string) => {
    const { error: updErr } = await supabase.rpc("admin_update_student", {
      p_nim: nim,
      p_nama: nama,
      p_kelas: kelas,
    });

    if (updErr) {
      // Fallback via admin_import_students
      const { error: impErr } = await supabase.rpc("admin_import_students", {
        p_students: [{ nim, nama, kelas: kelas || undefined }],
      });
      if (impErr) {
        showAdminPopup("danger", "Gagal Memperbarui Mahasiswa", impErr.message);
        throw impErr;
      }
    }

    loadAdminData();
    showAdminPopup("success", "Berhasil", `Data mahasiswa ${nama} (${nim}) berhasil disimpan.`);
  };

  // Handler Delete Mahasiswa
  const handleDeleteStudent = async (nim: string) => {
    const { error } = await supabase.rpc("admin_delete_student", { p_nim: nim });
    if (error) {
      showAdminPopup("danger", "Gagal Menghapus Mahasiswa", error.message);
      throw error;
    }
    loadAdminData();
    showAdminPopup("success", "Berhasil", `Mahasiswa dengan NIM ${nim} berhasil dihapus.`);
  };

  // Handler Reset Data Uji Coba
  const handleResetDataUji = async (confirmCode: string) => {
    const { data, error } = await supabase.rpc("admin_reset_data_uji", {
      p_confirm_code: confirmCode,
    });
    if (error) {
      showAdminPopup("danger", "Gagal Mereset Data Uji", error.message);
      return;
    }
    interface ResetResponse {
      ok?: boolean;
      error?: string;
      message?: string;
      pendaftaran_dihapus?: number;
      antrian_dihapus?: number;
      mahasiswa_dummy_dihapus?: number;
    }
    const res = data as ResetResponse | null;
    if (res?.ok) {
      loadAdminData();
      showAdminPopup(
        "success",
        "Pembersihan Data Selesai",
        `Data uji coba dibersihkan: ${res.pendaftaran_dihapus || 0} pendaftaran, ${
          res.antrian_dihapus || 0
        } antrian, dan ${res.mahasiswa_dummy_dihapus || 0} mahasiswa dummy.`
      );
    } else {
      showAdminPopup("danger", "Gagal Reset", res?.error || "Gagal mereset data uji.");
    }
  };

  // Handler Resolve Complaint (Setujui & Reset KRS / Tolak)
  const handleResolveComplaint = async (
    id: number,
    action: "reset_and_batal" | "reject",
    catatan?: string
  ) => {
    const { data, error } = await supabase.rpc("admin_resolve_complaint", {
      p_id: id,
      p_action: action,
      p_catatan: catatan || null,
    });
    if (error) {
      throw new Error(error.message);
    }
    const res = data as { ok?: boolean; error?: string; message?: string } | null;
    if (res && res.ok === false) {
      throw new Error(res.error || "Gagal memproses laporan kendala.");
    }
    loadAdminData(true);
  };

  // Handler Bersihkan Seluruh Riwayat Log
  const handleClearLogs = async () => {
    showAdminPopup(
      "confirm",
      "Bersihkan Seluruh Riwayat Log?",
      "Seluruh riwayat log aktivitas database dan catatan pendaftaran mental akan dihapus permanen.",
      undefined,
      async () => {
        const { data, error } = await supabase.rpc("admin_clear_logs");
        if (error) {
          showAdminPopup("danger", "Gagal Membersihkan Log", error.message);
          return;
        }
        const res = data as { ok?: boolean; error?: string } | null;
        if (res && res.ok === false) {
          showAdminPopup("danger", "Gagal Membersihkan Log", res.error || "Gagal membersihkan log.");
          return;
        }
        lastAlertIdRef.current = 0;
        setLogs([]);
        showAdminPopup("success", "Berhasil", "Seluruh riwayat log berhasil dibersihkan.");
      }
    );
  };

  if (checkingAuth) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <div className="spinner spinner-primary spinner-lg" style={{ marginBottom: "1rem" }} />
        <p style={{ color: "var(--text-muted)" }}>Memeriksa sesi administrator...</p>
      </div>
    );
  }

  if (!sessionUser) {
    return (
      <AdminLoginCard
        username={username}
        setUsername={setUsername}
        password={password}
        setPassword={setPassword}
        authLoading={authLoading}
        actionError={actionError}
        onLogin={handleLogin}
      />
    );
  }

  return (
    <div className="container" style={{ maxWidth: "min(1480px, 98vw)", paddingBottom: "4rem" }}>
      <AdminHeader
        portalOpen={portalOpen}
        status={status}
        onTogglePortal={handleTogglePortal}
        onLogout={handleLogout}
        onRefresh={loadAdminData}
        onSapuSesi={handleSapuSesi}
        isRefreshing={isRefreshing}
        lastSyncTime={lastSyncTime}
      />

      {actionError && (
        <div className="alert alert-danger" style={{ marginBottom: "1.5rem" }}>
          <span>{actionError}</span>
        </div>
      )}

      {/* Admin Workbench Layout with Sidebar (Reference Gambar 3) */}
      <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
        {/* Sidebar Nav */}
        <nav
          className="card"
          style={{
            width: 270,
            flexShrink: 0,
            padding: "1.25rem 0.85rem",
            borderRadius: "var(--radius-xl)",
            backgroundColor: "#ffffff",
            marginBottom: "1.5rem",
          }}
        >
          {/* MENU UTAMA */}
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "0.25rem 0.75rem 0.5rem" }}>
            Menu Utama
          </div>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "offerings" ? "active" : ""}`}
            onClick={() => setActiveTab("offerings")}
          >
            <span>Kelola Kuota ({offerings.length})</span>
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "pendaftar" ? "active" : ""}`}
            onClick={() => setActiveTab("pendaftar")}
          >
            <span>Mahasiswa Masuk ({pendaftar.length})</span>
          </button>

          {/* DATA MASTER */}
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "1.25rem 0.75rem 0.5rem" }}>
            Data Master
          </div>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "import_jadwal" ? "active" : ""}`}
            onClick={() => setActiveTab("import_jadwal")}
          >
            <span>Impor Master Jadwal</span>
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "import_mahasiswa" ? "active" : ""}`}
            onClick={() => setActiveTab("import_mahasiswa")}
          >
            <span>Data & Impor Mahasiswa ({students.length})</span>
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "pengajuan" ? "active" : ""}`}
            onClick={() => setActiveTab("pengajuan")}
          >
            <span>Pengajuan Akses ({requests.filter((r) => r.status === "pending").length})</span>
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "complaints" ? "active" : ""}`}
            onClick={() => setActiveTab("complaints")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "0.5rem" }}>
              <span>Laporan Kendala ({complaints.filter((c) => c.status === "pending").length})</span>
              {complaints.filter((c) => c.status === "pending").length > 0 && (
                <span
                  style={{
                    backgroundColor: "var(--warning)",
                    color: "#ffffff",
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  {complaints.filter((c) => c.status === "pending").length} Baru
                </span>
              )}
            </div>
          </button>

          {/* SISTEM */}
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "1.25rem 0.75rem 0.5rem" }}>
            Sistem
          </div>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "logs" ? "active" : ""}`}
            onClick={() => setActiveTab("logs")}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", gap: "0.5rem" }}>
              <span>Log & Notifikasi Sistem</span>
              {logs.filter((l) => l.level === "error").length > 0 && (
                <span
                  style={{
                    backgroundColor: "var(--danger)",
                    color: "#ffffff",
                    fontSize: "0.68rem",
                    fontWeight: 800,
                    padding: "1px 6px",
                    borderRadius: "var(--radius-full)",
                  }}
                >
                  {logs.filter((l) => l.level === "error").length} Mental
                </span>
              )}
            </div>
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "batal_reset" ? "active" : ""}`}
            onClick={() => setActiveTab("batal_reset")}
            style={{ color: activeTab === "batal_reset" ? "#ffffff" : "var(--danger)" }}
          >
            <span>Batal & Reset Data</span>
          </button>
        </nav>

        {/* Content Area */}
        <div style={{ flex: 1, minWidth: 320, width: "100%" }}>
          {activeTab === "offerings" && (
            <OfferingManager
              offerings={offerings}
              onUpdateKuota={handleUpdateKuota}
              onUpsertOffering={handleUpsertOffering}
              onDeleteOffering={handleDeleteOffering}
              onAddSchedule={handleAddSchedule}
              onDeleteSchedule={handleDeleteSchedule}
            />
          )}

          {activeTab === "pendaftar" && (
            <PendaftarList
              pendaftar={pendaftar}
              kelasList={kelasList}
              onBatalDaftar={handleBatalDaftar}
            />
          )}

          {activeTab === "import_jadwal" && (
            <MasterScheduleImport
              onImportOfferings={async (offs) => {
                const { data } = await supabase.rpc("admin_import_offerings", {
                  p_offerings: offs,
                });
                loadAdminData();
                return (data as { inserted: number; updated: number }) || { inserted: 0, updated: 0 };
              }}
              onImportClassSchedules={async (scheds) => {
                const { data } = await supabase.rpc("admin_import_jadwal_kelas", {
                  p_jadwal: scheds,
                });
                loadAdminData();
                return (data as { inserted: number }) || { inserted: 0 };
              }}
              onSuccess={(msg) => showAdminPopup("success", "Impor Berhasil", msg)}
              onError={(err) => showAdminPopup("danger", "Impor Gagal", err)}
            />
          )}

          {activeTab === "import_mahasiswa" && (
            <StudentImport
              students={students}
              kelasList={kelasList}
              onImportStudents={async (studs: StudentImportRow[]) => {
                const { data, error } = await supabase.rpc("admin_import_students", {
                  p_students: studs,
                });
                if (error) {
                  throw new Error(error.message);
                }
                const res = data as { ok?: boolean; error?: string; inserted?: number; updated?: number } | null;
                if (res && res.ok === false) {
                  throw new Error(res.error || "Gagal memproses data mahasiswa.");
                }
                loadAdminData();
                return { inserted: res?.inserted || 0, updated: res?.updated || 0 };
              }}
              onUpdateStudent={handleUpdateStudent}
              onDeleteStudent={handleDeleteStudent}
              onBatalDaftar={handleBatalDaftarWithConfirm}
              onSuccess={(msg) => showAdminPopup("success", "Berhasil", msg)}
              onError={(err) => showAdminPopup("danger", "Gagal", err)}
            />
          )}

          {activeTab === "pengajuan" && (
            <AccessRequestsList
              requests={requests}
              onApprove={handleApproveRequest}
              onReject={handleRejectRequest}
              onReply={handleReplyRequest}
            />
          )}

          {activeTab === "complaints" && (
            <ComplaintManager
              complaints={complaints}
              onResolveComplaint={handleResolveComplaint}
              onReplyComplaint={handleReplyComplaint}
              onSuccess={(msg) => showAdminPopup("success", "Berhasil", msg)}
              onError={(err) => showAdminPopup("danger", "Gagal", err)}
            />
          )}

          {activeTab === "logs" && (
            <SystemLogsViewer
              logs={logs}
              onRefresh={() => loadAdminData(false)}
              onClearLogs={handleClearLogs}
              isRefreshing={isRefreshing}
            />
          )}

          {activeTab === "batal_reset" && (
            <ResetDataModal
              portalOpen={portalOpen}
              onBatalDaftar={handleBatalDaftar}
              onResetDataUji={handleResetDataUji}
            />
          )}
        </div>
      </div>

      <AdminModal modal={adminModal} onClose={closeModal} />

      {/* POP-UP PERINGATAN DATA PENDAFTARAN MENTAL (Otomatis & Real-time) */}
      {incomingAlert && (
        <div
          className="modal-backdrop"
          onClick={() => setIncomingAlert(null)}
          style={{ zIndex: 9999, backgroundColor: "rgba(15, 23, 42, 0.75)" }}
        >
          <div
            className="modal-content"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 480,
              border: "2.5px solid #ef4444",
              borderRadius: "var(--radius-lg)",
              boxShadow: "0 25px 50px -12px rgba(239, 68, 68, 0.4)",
              backgroundColor: "#ffffff",
              padding: "1.75rem 1.5rem",
            }}
          >
            <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
              <div style={{ fontSize: "2.5rem", marginBottom: "0.35rem" }}>🚨</div>
              <h3 style={{ fontSize: "1.25rem", fontWeight: 800, color: "#b91c1c", margin: 0, letterSpacing: "-0.01em" }}>
                PERINGATAN: DATA PENDAFTARAN MENTAL!
              </h3>
              <p style={{ fontSize: "0.825rem", color: "var(--text-muted)", margin: "4px 0 0 0" }}>
                Sistem mendeteksi ada mahasiswa yang pendaftarannya ditolak oleh database.
              </p>
            </div>

            <div
              style={{
                backgroundColor: "#fef2f2",
                border: "1px solid #fecaca",
                borderRadius: "var(--radius-md)",
                padding: "0.85rem 1rem",
                marginBottom: "1.25rem",
                fontSize: "0.85rem",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <span style={{ color: "#991b1b" }}>Waktu Kejadian:</span>
                <strong style={{ color: "#7f1d1d" }}>{incomingAlert.created_at}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.35rem" }}>
                <span style={{ color: "#991b1b" }}>NIM Mahasiswa:</span>
                <strong style={{ color: "#7f1d1d" }}>{incomingAlert.nim}</strong>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                <span style={{ color: "#991b1b" }}>Nama:</span>
                <strong style={{ color: "#7f1d1d" }}>{incomingAlert.nama}</strong>
              </div>
              <div style={{ borderTop: "1px dashed #fca5a5", paddingTop: "0.5rem" }}>
                <span style={{ color: "#991b1b", display: "block", fontSize: "0.775rem", fontWeight: 700 }}>
                  Penyebab Mental / Galat:
                </span>
                <div style={{ color: "#991b1b", fontWeight: 700, marginTop: "2px", lineHeight: 1.4 }}>
                  {incomingAlert.pesan}
                </div>
              </div>
            </div>

            <div style={{ display: "flex", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setActiveTab("logs");
                  setIncomingAlert(null);
                }}
                style={{
                  flex: 1,
                  backgroundColor: "#dc2626",
                  borderColor: "#b91c1c",
                  fontWeight: 800,
                  fontSize: "0.875rem",
                  padding: "0.75rem",
                }}
              >
                📋 Periksa di Log Aktivitas
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setIncomingAlert(null)}
                style={{ padding: "0.75rem 1.25rem", fontSize: "0.875rem" }}
              >
                Tutup
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
          Panel Manajemen Administrator KRS Semester Berjalan
        </p>
      </footer>
    </div>
  );
}
