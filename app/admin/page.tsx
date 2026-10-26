"use client";

import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  Offering,
  AdminSystemStatus,
  AdminPengajuanItem,
  PendaftarStudentItem,
} from "@/lib/types";
import { StudentImportRow } from "@/lib/excel-parser";
import { AdminLoginCard } from "@/components/admin/AdminLoginCard";
import { AdminHeader } from "@/components/admin/AdminHeader";
import { OfferingManager } from "@/components/admin/OfferingManager";
import { PendaftarList } from "@/components/admin/PendaftarList";
import { MasterScheduleImport } from "@/components/admin/MasterScheduleImport";
import { StudentImport } from "@/components/admin/StudentImport";
import { AccessRequestsList } from "@/components/admin/AccessRequestsList";
import { ResetDataModal } from "@/components/admin/ResetDataModal";
import { AdminModal, AdminModalState, AdminModalType } from "@/components/admin/AdminModal";

type AdminTab = "offerings" | "pendaftar" | "import_jadwal" | "import_mahasiswa" | "pengajuan" | "batal_reset";

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
  const [requests, setRequests] = useState<AdminPengajuanItem[]>([]);
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
      const st = stData as (AdminSystemStatus & { ok?: boolean }) | null;
      if (st && (st.ok === undefined || st.ok === true)) {
        const normalizedStatus: AdminSystemStatus = {
          portal_open: Boolean(st.portal_open),
          need_matkul: st.need_matkul ?? 3,
          need_proyek: st.need_proyek ?? 1,
          session_duration_minutes: st.session_duration_minutes ?? 5,
          max_active: st.max_active ?? 30,
          max_requeue: st.max_requeue ?? 2,
          total_students: st.total_students ?? 0,
          sudah_daftar: st.sudah_daftar ?? st.total_registered ?? 0,
          active_queue: st.active_queue ?? 0,
          waiting_queue: st.waiting_queue ?? 0,
          total_registered: st.total_registered ?? st.sudah_daftar ?? 0,
        };
        setStatus(normalizedStatus);
        setPortalOpen(Boolean(st.portal_open));
      }

      // 2. Offerings (Mendukung array langsung maupun objek { ok, offerings })
      const { data: offData } = await supabase.rpc("admin_list_offerings");
      if (Array.isArray(offData)) {
        setOfferings(offData as Offering[]);
      } else {
        const offRes = offData as { ok?: boolean; offerings?: Offering[] } | null;
        if (offRes?.ok && Array.isArray(offRes.offerings)) {
          setOfferings(offRes.offerings);
        }
      }

      // 3. Pendaftar (Mendukung admin_list_pendaftar dan fallback admin_export_pendaftaran)
      const { data: pendData } = await supabase.rpc("admin_list_pendaftar");
      let pendaftarList: PendaftarStudentItem[] = [];

      if (Array.isArray(pendData)) {
        pendaftarList = pendData as PendaftarStudentItem[];
      } else {
        const pendRes = pendData as { ok?: boolean; pendaftar?: PendaftarStudentItem[] } | null;
        if (pendRes?.ok && Array.isArray(pendRes.pendaftar)) {
          pendaftarList = pendRes.pendaftar;
        }
      }

      // Jika list pendaftar belum terisi, coba fallback dari admin_export_pendaftaran
      if (pendaftarList.length === 0) {
        const { data: expData } = await supabase.rpc("admin_export_pendaftaran");
        let rawList: Record<string, unknown>[] = [];
        if (Array.isArray(expData)) {
          rawList = expData as Record<string, unknown>[];
        } else if (expData && typeof expData === "object") {
          const expRes = expData as { ok?: boolean; data?: Record<string, unknown>[] };
          if (Array.isArray(expRes.data)) {
            rawList = expRes.data;
          }
        }

        if (rawList.length > 0) {
          const map = new Map<string, PendaftarStudentItem>();
          rawList.forEach((r) => {
            const nim = String(r.nim || r.NIM || "").trim();
            if (!nim) return;
            const nama = String(r.nama || r.Nama || "").trim();
            const kelas = String(r.kelas || r.Kelas || "-").trim();
            const registered_at = String(r.waktu_daftar || r["Waktu Registrasi"] || r.created_at || "");
            const offId = Number(r.offering_id || r.id || 0);
            const offNama = String(r.nama_pilihan || r["Mata Kuliah / Proyek"] || r.nama || "").trim();
            const offJenis = String(r.jenis || r.Jenis || "matkul").trim();
            const offTopik = String(r.topik || r.Topik || "").trim();

            if (!map.has(nim)) {
              map.set(nim, {
                nim,
                nama,
                kelas,
                registered_at,
                pilihan: [],
              });
            }
            if (offNama) {
              map.get(nim)!.pilihan.push({
                id: offId,
                nama: offNama,
                jenis: offJenis,
                topik: offTopik,
              });
            }
          });
          pendaftarList = Array.from(map.values());
        }
      }

      setPendaftar(pendaftarList);

      // Pastikan status.sudah_daftar mencerminkan jumlah pendaftar aktual jika sebelumnya 0
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

      // 4. Pengajuan Akses
      const { data: reqData } = await supabase.rpc("admin_list_pengajuan");
      if (Array.isArray(reqData)) {
        setRequests(reqData as AdminPengajuanItem[]);
      } else {
        const reqRes = reqData as { ok?: boolean; pengajuan?: AdminPengajuanItem[] } | null;
        if (reqRes?.ok && Array.isArray(reqRes.pengajuan)) {
          setRequests(reqRes.pengajuan);
        }
      }

      // 5. Daftar Kelas
      const { data: kData } = await supabase.rpc("daftar_kelas");
      if (Array.isArray(kData)) {
        setKelasList(kData as string[]);
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

  // Polling data admin otomatis setiap 5 detik saat admin login + sinkron saat tab aktif
  useEffect(() => {
    if (sessionUser) {
      const timer = setInterval(() => {
        void loadAdminData(true);
      }, 5000);

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
  const handleApproveRequest = async (id: number) => {
    const { error } = await supabase.rpc("admin_setujui_pengajuan", { p_id: id });
    if (error) {
      showAdminPopup("danger", "Gagal Menyetujui", error.message);
      return;
    }
    loadAdminData();
    showAdminPopup("success", "Pengajuan Disetujui", "Mahasiswa bersangkutan kini dapat login dan mendaftar.");
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
    <div className="container" style={{ maxWidth: 1240, paddingBottom: "4rem" }}>
      <AdminHeader
        portalOpen={portalOpen}
        status={status}
        onTogglePortal={handleTogglePortal}
        onLogout={handleLogout}
        onRefresh={loadAdminData}
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
            {activeTab === "offerings" && <span className="nav-chevron">&gt;</span>}
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "pendaftar" ? "active" : ""}`}
            onClick={() => setActiveTab("pendaftar")}
          >
            <span>Mahasiswa Masuk ({pendaftar.length})</span>
            {activeTab === "pendaftar" && <span className="nav-chevron">&gt;</span>}
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
            {activeTab === "import_jadwal" && <span className="nav-chevron">&gt;</span>}
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "import_mahasiswa" ? "active" : ""}`}
            onClick={() => setActiveTab("import_mahasiswa")}
          >
            <span>Data & Impor Mahasiswa</span>
            {activeTab === "import_mahasiswa" && <span className="nav-chevron">&gt;</span>}
          </button>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "pengajuan" ? "active" : ""}`}
            onClick={() => setActiveTab("pengajuan")}
          >
            <span>Pengajuan Akses ({requests.filter((r) => r.status === "pending").length})</span>
            {activeTab === "pengajuan" && <span className="nav-chevron">&gt;</span>}
          </button>

          {/* SISTEM */}
          <div style={{ fontSize: "0.72rem", fontWeight: 800, color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.08em", padding: "1.25rem 0.75rem 0.5rem" }}>
            Sistem
          </div>
          <button
            type="button"
            className={`admin-nav-item ${activeTab === "batal_reset" ? "active" : ""}`}
            onClick={() => setActiveTab("batal_reset")}
            style={{ color: activeTab === "batal_reset" ? "#ffffff" : "var(--danger)" }}
          >
            <span>Batal & Reset Data</span>
            {activeTab === "batal_reset" && <span className="nav-chevron">&gt;</span>}
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
              onSuccess={(msg) => showAdminPopup("success", "Berhasil", msg)}
              onError={(err) => showAdminPopup("danger", "Gagal", err)}
            />
          )}

          {activeTab === "pengajuan" && (
            <AccessRequestsList requests={requests} onApprove={handleApproveRequest} />
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
