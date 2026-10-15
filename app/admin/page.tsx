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
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  // Data Dashboard
  const [activeTab, setActiveTab] = useState<AdminTab>("offerings");
  const [portalOpen, setPortalOpen] = useState(false);
  const [status, setStatus] = useState<AdminSystemStatus | null>(null);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [pendaftar, setPendaftar] = useState<PendaftarStudentItem[]>([]);
  const [requests, setRequests] = useState<AdminPengajuanItem[]>([]);
  const [kelasList, setKelasList] = useState<string[]>([]);

  // Muat data dashboard admin
  const loadAdminData = useCallback(async () => {
    try {
      // 1. Status sistem
      const { data: stData } = await supabase.rpc("admin_status");
      const st = stData as (AdminSystemStatus & { ok?: boolean }) | null;
      if (st?.ok) {
        setStatus(st);
        setPortalOpen(st.portal_open);
      }

      // 2. Offerings
      const { data: offData } = await supabase.rpc("admin_list_offerings");
      const offRes = offData as { ok?: boolean; offerings?: Offering[] } | null;
      if (offRes?.ok && offRes.offerings) {
        setOfferings(offRes.offerings);
      }

      // 3. Pendaftar
      const { data: pendData } = await supabase.rpc("admin_list_pendaftar");
      const pendRes = pendData as { ok?: boolean; pendaftar?: PendaftarStudentItem[] } | null;
      if (pendRes?.ok && pendRes.pendaftar) {
        setPendaftar(pendRes.pendaftar);
      } else {
        // Fallback export jika list_pendaftar belum ada
        const { data: expData } = await supabase.rpc("admin_export_pendaftaran");
        interface ExpItem {
          nim: string;
          nama: string;
          kelas: string;
          offering_id: number;
          nama_pilihan: string;
          jenis: string;
          topik: string;
          waktu_daftar: string;
        }
        const expRes = expData as { ok?: boolean; data?: ExpItem[] } | null;
        if (expRes?.ok && expRes.data) {
          const map = new Map<string, PendaftarStudentItem>();
          expRes.data.forEach((r) => {
            if (!map.has(r.nim)) {
              map.set(r.nim, {
                nim: r.nim,
                nama: r.nama,
                kelas: r.kelas,
                registered_at: r.waktu_daftar,
                pilihan: [],
              });
            }
            map.get(r.nim)!.pilihan.push({
              id: r.offering_id,
              nama: r.nama_pilihan,
              jenis: r.jenis,
              topik: r.topik,
            });
          });
          setPendaftar(Array.from(map.values()));
        }
      }

      // 4. Pengajuan Akses
      const { data: reqData } = await supabase.rpc("admin_list_pengajuan");
      const reqRes = reqData as { ok?: boolean; pengajuan?: AdminPengajuanItem[] } | null;
      if (reqRes?.ok && reqRes.pengajuan) {
        setRequests(reqRes.pengajuan);
      }

      // 5. Daftar Kelas
      const { data: kData } = await supabase.rpc("daftar_kelas");
      if (Array.isArray(kData)) {
        setKelasList(kData as string[]);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Gagal memuat data admin.";
      setActionError(msg);
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

  // Handler Toggle Portal
  const handleTogglePortal = async () => {
    const nextState = !portalOpen;
    const confirmMsg = nextState
      ? "Apakah Anda yakin ingin MEMBUKA portal pemilihan untuk mahasiswa?"
      : "Apakah Anda yakin ingin MENUTUP portal pemilihan?";
    if (!confirm(confirmMsg)) return;

    try {
      const { data, error } = await supabase.rpc("admin_toggle_portal", { p_buka: nextState });
      if (error) {
        alert("Gagal mengubah status portal: " + error.message);
        return;
      }
      const res = data as { ok?: boolean; error?: string } | null;
      if (res?.ok) {
        setPortalOpen(nextState);
        loadAdminData();
      } else {
        alert(res?.error || "Gagal mengubah portal.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Kesalahan koneksi.";
      alert(msg);
    }
  };

  // Handler Kuota
  const handleUpdateKuota = async (offeringId: number, newKuota: number) => {
    const { error } = await supabase.rpc("admin_update_kuota", {
      p_offering_id: offeringId,
      p_kuota: newKuota,
    });
    if (error) {
      alert("Gagal mengubah kuota: " + error.message);
      return;
    }
    loadAdminData();
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
      alert("Gagal menyimpan pilihan: " + error.message);
      return;
    }
    loadAdminData();
  };

  // Handler Delete Offering
  const handleDeleteOffering = async (id: number) => {
    if (!confirm("Hapus mata kuliah / proyek ini?")) return;
    const { error } = await supabase.rpc("admin_delete_offering", { p_id: id });
    if (error) {
      alert("Gagal menghapus: " + error.message);
      return;
    }
    loadAdminData();
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
      alert("Gagal menambah jadwal: " + error.message);
      return;
    }
    loadAdminData();
  };

  // Handler Delete Schedule
  const handleDeleteSchedule = async (scheduleId: number) => {
    const { error } = await supabase.rpc("admin_hapus_jadwal", { p_schedule_id: scheduleId });
    if (error) {
      alert("Gagal menghapus jadwal: " + error.message);
      return;
    }
    loadAdminData();
  };

  // Handler Setujui Pengajuan
  const handleApproveRequest = async (id: number) => {
    const { error } = await supabase.rpc("admin_setujui_pengajuan", { p_id: id });
    if (error) {
      alert("Gagal menyetujui pengajuan: " + error.message);
      return;
    }
    loadAdminData();
  };

  // Handler Batalkan Pendaftaran Per NIM
  const handleBatalDaftar = async (nim: string) => {
    const { error } = await supabase.rpc("admin_batal_daftar", { p_nim: nim });
    if (error) {
      alert("Gagal membatalkan: " + error.message);
      return;
    }
    alert(`Pendaftaran NIM ${nim} berhasil dibatalkan.`);
    loadAdminData();
  };

  // Handler Reset Data Uji Coba
  const handleResetDataUji = async (confirmCode: string) => {
    const { data, error } = await supabase.rpc("admin_reset_data_uji", {
      p_confirm_code: confirmCode,
    });
    if (error) {
      alert("Gagal mereset: " + error.message);
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
      alert(
        `Reset data uji sukses! (${res.pendaftaran_dihapus || 0} pendaftaran, ${
          res.antrian_dihapus || 0
        } antrian, ${res.mahasiswa_dummy_dihapus || 0} mahasiswa dummy dibersihkan).`
      );
      loadAdminData();
    } else {
      alert(res?.error || "Gagal mereset data uji.");
    }
  };

  if (checkingAuth) {
    return (
      <div className="container" style={{ textAlign: "center", paddingTop: "5rem" }}>
        <p>Memeriksa sesi administrator...</p>
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
    <div className="container" style={{ maxWidth: 1140, paddingBottom: "4rem" }}>
      <AdminHeader
        portalOpen={portalOpen}
        status={status}
        onTogglePortal={handleTogglePortal}
        onLogout={handleLogout}
      />

      {actionSuccess && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          <span>✓ {actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          <span>⚠️ {actionError}</span>
        </div>
      )}

      {/* Navigasi Tab Admin */}
      <div
        style={{
          display: "flex",
          gap: "0.5rem",
          overflowX: "auto",
          paddingBottom: "0.5rem",
          marginBottom: "1.5rem",
          borderBottom: "1px solid var(--border-color)",
        }}
      >
        <button
          type="button"
          className={activeTab === "offerings" ? "btn btn-primary" : "btn btn-secondary"}
          onClick={() => setActiveTab("offerings")}
        >
          📚 Kelola Pilihan & Kuota ({offerings.length})
        </button>
        <button
          type="button"
          className={activeTab === "pendaftar" ? "btn btn-primary" : "btn btn-secondary"}
          onClick={() => setActiveTab("pendaftar")}
        >
          📋 Mahasiswa Masuk ({pendaftar.length})
        </button>
        <button
          type="button"
          className={activeTab === "import_jadwal" ? "btn btn-primary" : "btn btn-secondary"}
          onClick={() => setActiveTab("import_jadwal")}
        >
          🏛️ Impor Master Jadwal
        </button>
        <button
          type="button"
          className={activeTab === "import_mahasiswa" ? "btn btn-primary" : "btn btn-secondary"}
          onClick={() => setActiveTab("import_mahasiswa")}
        >
          👨‍🎓 Impor Data Mahasiswa
        </button>
        <button
          type="button"
          className={activeTab === "pengajuan" ? "btn btn-primary" : "btn btn-secondary"}
          onClick={() => setActiveTab("pengajuan")}
        >
          📩 Pengajuan Akses ({requests.filter((r) => r.status === "pending").length})
        </button>
        <button
          type="button"
          className={activeTab === "batal_reset" ? "btn btn-danger" : "btn btn-secondary"}
          onClick={() => setActiveTab("batal_reset")}
        >
          ⚙️ Batal & Reset Data
        </button>
      </div>

      {/* Isi Tab Aktif */}
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
        <PendaftarList pendaftar={pendaftar} kelasList={kelasList} />
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
          onSuccess={(msg) => setActionSuccess(msg)}
          onError={(err) => setActionError(err)}
        />
      )}

      {activeTab === "import_mahasiswa" && (
        <StudentImport
          onImportStudents={async (studs: StudentImportRow[]) => {
            const { data } = await supabase.rpc("admin_import_students", {
              p_students: studs,
            });
            loadAdminData();
            return (data as { inserted: number; updated: number }) || { inserted: 0, updated: 0 };
          }}
          onSuccess={(msg) => setActionSuccess(msg)}
          onError={(err) => setActionError(err)}
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
  );
}
