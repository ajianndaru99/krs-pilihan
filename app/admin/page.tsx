"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase, Offering } from "@/lib/supabase";

interface StudentImportRow {
  nim: string;
  nama: string;
  kelas?: string;
}

interface JadwalKelasRow {
  kelas: string;
  hari: string;
  jam_mulai: string;
  jam_selesai: string;
  matkul?: string;
  ruang?: string;
}

interface JadwalPilihanRow {
  offering_id?: number;
  nama_pilihan?: string;
  hari: string;
  jam_mulai: string;
  jam_selesai: string;
  ruang?: string;
}

interface AccessRequest {
  id: number;
  nim: string;
  nama: string;
  kelas?: string;
  catatan?: string;
  status: string;
  created_at: string;
}

export default function AdminPage() {
  // Auth state
  const [session, setSession] = useState<any>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Portal & Admin Data State
  const [portalOpen, setPortalOpen] = useState(false);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [stats, setStats] = useState<{
    totalStudents: number;
    totalRegistered: number;
    activeQueueCount: number;
  }>({
    totalStudents: 0,
    totalRegistered: 0,
    activeQueueCount: 0,
  });

  // Action status
  const [loading, setLoading] = useState(false);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  // Active sub-tab
  const [activeTab, setActiveTab] = useState<"kuota" | "import" | "pengajuan" | "batal">("kuota");
  const [batalNim, setBatalNim] = useState("");

  // Check auth session on load
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Fetch admin dashboard data
  const loadAdminData = useCallback(async () => {
    if (!session) return;
    setLoading(true);
    setActionError(null);

    try {
      // 1. Get Portal Status & Stats
      const { data: statusData, error: statusErr } = await supabase.rpc("admin_status");
      if (!statusErr && statusData) {
        setPortalOpen(!!statusData.portal_open);
        setStats({
          totalStudents: statusData.total_students || 0,
          totalRegistered: statusData.total_registered || 0,
          activeQueueCount: statusData.active_queue || 0,
        });
      }

      // 2. Get Offerings
      const { data: offData } = await supabase.rpc("admin_list_offerings");
      if (offData && Array.isArray(offData)) {
        setOfferings(offData);
      }

      // 3. Get Access Requests
      const { data: reqData } = await supabase.rpc("admin_list_pengajuan");
      if (reqData && Array.isArray(reqData)) {
        setAccessRequests(reqData);
      }

      // 4. Compute Warnings for Yellow Box
      const newWarnings: string[] = [];
      if (statusData) {
        if (!statusData.total_students || statusData.total_students === 0) {
          newWarnings.push("Data mahasiswa masih kosong. Silakan impor data mahasiswa.");
        }
        if (statusData.classes_without_schedule && statusData.classes_without_schedule > 0) {
          newWarnings.push(
            `Terdapat ${statusData.classes_without_schedule} kelas tetap yang belum memiliki jadwal perkuliahan.`
          );
        }
        if (statusData.offerings_without_schedule && statusData.offerings_without_schedule > 0) {
          newWarnings.push(
            `Terdapat ${statusData.offerings_without_schedule} mata kuliah pilihan / proyek tanpa jadwal.`
          );
        }
      }
      if (reqData && reqData.filter((r: AccessRequest) => r.status === "pending").length > 0) {
        newWarnings.push(
          `Ada ${reqData.filter((r: AccessRequest) => r.status === "pending").length} pengajuan akses mahasiswa yang belum disetujui.`
        );
      }
      setWarnings(newWarnings);
    } catch (err: any) {
      setActionError(err.message || "Gagal memuat data admin.");
    } finally {
      setLoading(false);
    }
  }, [session]);

  useEffect(() => {
    if (session) {
      loadAdminData();
    }
  }, [session, loadAdminData]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setActionError(null);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      });
      if (error) {
        setActionError(error.message || "Login admin gagal. Periksa email dan password.");
      }
    } catch (err: any) {
      setActionError(err.message || "Terjadi kesalahan saat masuk.");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  // Toggle Portal Open/Close
  const handleTogglePortal = async () => {
    const nextState = !portalOpen;
    const confirmMsg = nextState
      ? "Apakah Anda yakin ingin MEMBUKA portal pemilihan untuk mahasiswa?"
      : "Apakah Anda yakin ingin MENUTUP portal pemilihan?";
    if (!confirm(confirmMsg)) return;

    setLoading(true);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc("admin_toggle_portal", {
        p_buka: nextState,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setPortalOpen(nextState);
      setActionSuccess(`Portal berhasil ${nextState ? "DIBUKA" : "DITUTUP"}.`);
      loadAdminData();
    } catch (err: any) {
      setActionError(err.message || "Gagal mengubah status portal.");
    } finally {
      setLoading(false);
    }
  };

  // Update Quota
  const handleUpdateQuota = async (offeringId: number, currentQuota: number) => {
    const input = prompt("Masukkan kuota baru:", String(currentQuota));
    if (input === null) return;
    const newQuota = parseInt(input, 10);
    if (isNaN(newQuota) || newQuota < 0) {
      alert("Masukkan angka kuota yang valid.");
      return;
    }

    try {
      const { data, error } = await supabase.rpc("admin_update_kuota", {
        p_offering_id: offeringId,
        p_kuota: newQuota,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess("Kuota berhasil diperbarui.");
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal memperbarui kuota.");
    }
  };

  // Approve Access Request
  const handleApproveAccess = async (id: number) => {
    if (!confirm("Setujui pengajuan akses mahasiswa ini?")) return;
    try {
      const { data, error } = await supabase.rpc("admin_setujui_pengajuan", {
        p_id: id,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess("Pengajuan akses berhasil disetujui.");
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal menyetujui pengajuan.");
    }
  };

  // Cancel Student Registration
  const handleBatalDaftar = async (targetNim: string) => {
    if (!targetNim.trim()) return;
    if (
      !confirm(
        `Batalkan pendaftaran untuk NIM: ${targetNim}? Mahasiswa akan dapat memilih ulang dan kuota kursinya dikembalikan.`
      )
    ) {
      return;
    }

    try {
      const { data, error } = await supabase.rpc("admin_batal_daftar", {
        p_nim: targetNim.trim(),
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess(`Pendaftaran NIM ${targetNim} berhasil dibatalkan.`);
      setBatalNim("");
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal membatalkan pendaftaran.");
    }
  };

  // Export Results to Excel
  const handleExportExcel = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase.rpc("admin_export_pendaftaran");
      if (error) throw error;
      if (!data || !Array.isArray(data)) {
        alert("Tidak ada data pendaftaran untuk diekspor.");
        return;
      }

      const ws = XLSX.utils.json_to_sheet(data);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Pendaftaran");
      XLSX.writeFile(wb, `Rekap_Pemilihan_Matkul_${new Date().toISOString().slice(0, 10)}.xlsx`);
      setActionSuccess("Data pendaftaran berhasil diekspor ke Excel.");
    } catch (err: any) {
      alert(err.message || "Gagal mengekspor data ke Excel.");
    } finally {
      setLoading(false);
    }
  };

  // Import Students Excel
  const handleImportStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const students: StudentImportRow[] = [];

      // Iterate through sheets (supports sheet per class)
      wb.SheetNames.forEach((sheetName) => {
        const sheet = wb.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet);
        rows.forEach((r) => {
          const rawNim = r.NIM || r.nim || r.Nim;
          const rawNama = r.Nama || r.nama || r.NAMA || r["Nama Mahasiswa"];
          const rawKelas = r.Kelas || r.kelas || r.KELAS || sheetName;

          if (rawNim && rawNama) {
            students.push({
              nim: String(rawNim).trim(),
              nama: String(rawNama).trim(),
              kelas: rawKelas ? String(rawKelas).trim() : undefined,
            });
          }
        });
      });

      if (students.length === 0) {
        alert("Tidak ditemukan data mahasiswa yang valid dalam file Excel.");
        return;
      }

      const { data, error } = await supabase.rpc("admin_import_students", {
        p_students: students,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess(`Berhasil mengimpor ${students.length} data mahasiswa.`);
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal memproses file Excel.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // Import Jadwal Kelas Excel
  const handleImportJadwalKelas = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const schedules: JadwalKelasRow[] = [];

      wb.SheetNames.forEach((sheetName) => {
        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
        rows.forEach((r) => {
          const kelas = r.Kelas || r.kelas || sheetName;
          const hari = r.Hari || r.hari;
          const jamMulai = r["Jam Mulai"] || r.jam_mulai || r.Mulai;
          const jamSelesai = r["Jam Selesai"] || r.jam_selesai || r.Selesai;
          const matkul = r["Mata Kuliah"] || r.matkul || r.Matkul;
          const ruang = r.Ruang || r.ruang;

          if (kelas && hari && jamMulai && jamSelesai) {
            schedules.push({
              kelas: String(kelas).trim(),
              hari: String(hari).trim(),
              jam_mulai: String(jamMulai).trim(),
              jam_selesai: String(jamSelesai).trim(),
              matkul: matkul ? String(matkul).trim() : undefined,
              ruang: ruang ? String(ruang).trim() : undefined,
            });
          }
        });
      });

      const { data, error } = await supabase.rpc("admin_import_jadwal_kelas", {
        p_jadwal: schedules,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess(`Berhasil mengimpor ${schedules.length} baris jadwal kelas.`);
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal mengimpor jadwal kelas.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // Import Jadwal Pilihan Excel
  const handleImportJadwalPilihan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const schedules: JadwalPilihanRow[] = [];

      wb.SheetNames.forEach((sheetName) => {
        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
        rows.forEach((r) => {
          const offId = r.ID || r.id || r["Offering ID"];
          const nama = r.Nama || r.nama || r["Nama Matkul"] || sheetName;
          const hari = r.Hari || r.hari;
          const jamMulai = r["Jam Mulai"] || r.jam_mulai || r.Mulai;
          const jamSelesai = r["Jam Selesai"] || r.jam_selesai || r.Selesai;
          const ruang = r.Ruang || r.ruang;

          if ((offId || nama) && hari && jamMulai && jamSelesai) {
            schedules.push({
              offering_id: offId ? Number(offId) : undefined,
              nama_pilihan: nama ? String(nama).trim() : undefined,
              hari: String(hari).trim(),
              jam_mulai: String(jamMulai).trim(),
              jam_selesai: String(jamSelesai).trim(),
              ruang: ruang ? String(ruang).trim() : undefined,
            });
          }
        });
      });

      const { data, error } = await supabase.rpc("admin_import_jadwal_pilihan", {
        p_jadwal: schedules,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess(`Berhasil mengimpor ${schedules.length} jadwal mata kuliah pilihan.`);
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal mengimpor jadwal pilihan.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // Render Login Card if not authenticated
  if (!session) {
    return (
      <div className="container" style={{ maxWidth: 450, marginTop: "4rem" }}>
        <div className="card">
          <h2 className="card-title" style={{ justifyContent: "center" }}>
            Login Admin KRS
          </h2>
          <p style={{ textAlign: "center", color: "var(--text-muted)", marginBottom: "1.5rem", fontSize: "0.9rem" }}>
            Halaman ini khusus untuk administrator program studi.
          </p>

          {actionError && (
            <div className="alert alert-danger">
              <span>⚠️ {actionError}</span>
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group">
              <label className="form-label">Email Admin</label>
              <input
                type="email"
                className="form-input"
                placeholder="admin@instiper.ac.id"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">Kata Sandi</label>
              <input
                type="password"
                className="form-input"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="btn btn-primary btn-block" disabled={authLoading}>
              {authLoading ? "Memverifikasi..." : "Masuk ke Dashboard"}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      {/* Admin Header */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "1.5rem",
          flexWrap: "wrap",
          gap: "1rem",
        }}
      >
        <div>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700 }}>Dashboard Administrator</h1>
          <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
            Login sebagai: <strong>{session?.user?.email}</strong>
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem" }}>
          <button
            type="button"
            className={`btn ${portalOpen ? "btn-danger" : "btn-success"}`}
            onClick={handleTogglePortal}
            disabled={loading}
          >
            {portalOpen ? "🛑 Tutup Portal" : "🟢 Buka Portal"}
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleExportExcel} disabled={loading}>
            📥 Ekspor Excel
          </button>
          <button type="button" className="btn btn-secondary" onClick={handleLogout}>
            Keluar
          </button>
        </div>
      </div>

      {actionSuccess && (
        <div className="alert alert-success">
          <span>✅ {actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="alert alert-danger">
          <span>⚠️ {actionError}</span>
        </div>
      )}

      {/* Kotak Peringatan Kuning (Kriteria T4: Kosong setelah data lengkap) */}
      {warnings.length > 0 ? (
        <div className="alert alert-warning" style={{ display: "block" }}>
          <div style={{ fontWeight: 700, marginBottom: "0.5rem" }}>
            ⚠️ Perhatian Admin: Terdapat {warnings.length} hal yang perlu diselesaikan:
          </div>
          <ul style={{ paddingLeft: "1.25rem", fontSize: "0.875rem" }}>
            {warnings.map((w, idx) => (
              <li key={idx} style={{ marginBottom: "0.25rem" }}>
                {w}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div className="alert alert-success">
          <span>✅ Konfigurasi Data Lengkap: Seluruh jadwal dan kuota telah siap untuk pemilihan mahasiswa.</span>
        </div>
      )}

      {/* Ringkasan Statistik */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))",
          gap: "1rem",
          marginBottom: "1.5rem",
        }}
      >
        <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Status Portal</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: portalOpen ? "var(--success)" : "var(--danger)" }}>
            {portalOpen ? "DIBUKA" : "DITUTUP"}
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Total Mahasiswa Terdaftar</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700 }}>
            {stats.totalRegistered} / {stats.totalStudents}
          </div>
        </div>

        <div className="card" style={{ padding: "1.25rem", textAlign: "center" }}>
          <div style={{ color: "var(--text-muted)", fontSize: "0.8rem" }}>Antrian Aktif Saat Ini</div>
          <div style={{ fontSize: "1.5rem", fontWeight: 700, color: "var(--primary)" }}>
            {stats.activeQueueCount}
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div
        style={{
          display: "flex",
          borderBottom: "2px solid var(--border-color)",
          marginBottom: "1.5rem",
          gap: "0.5rem",
        }}
      >
        <button
          type="button"
          onClick={() => setActiveTab("kuota")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 600,
            background: "none",
            border: "none",
            borderBottom: activeTab === "kuota" ? "3px solid var(--primary)" : "none",
            color: activeTab === "kuota" ? "var(--primary)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Kelola Kuota & Pilihan
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("import")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 600,
            background: "none",
            border: "none",
            borderBottom: activeTab === "import" ? "3px solid var(--primary)" : "none",
            color: activeTab === "import" ? "var(--primary)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Impor Data Excel
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("pengajuan")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 600,
            background: "none",
            border: "none",
            borderBottom: activeTab === "pengajuan" ? "3px solid var(--primary)" : "none",
            color: activeTab === "pengajuan" ? "var(--primary)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Pengajuan Akses ({accessRequests.filter((r) => r.status === "pending").length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("batal")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 600,
            background: "none",
            border: "none",
            borderBottom: activeTab === "batal" ? "3px solid var(--primary)" : "none",
            color: activeTab === "batal" ? "var(--primary)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Batalkan Pendaftaran NIM
        </button>
      </div>

      {/* TAB 1: KELOLA KUOTA */}
      {activeTab === "kuota" && (
        <div className="card">
          <h3 className="card-title">Daftar Pilihan Mata Kuliah & Proyek</h3>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-subtle)", textAlign: "left" }}>
                  <th style={{ padding: "10px" }}>ID</th>
                  <th style={{ padding: "10px" }}>Nama Mata Kuliah</th>
                  <th style={{ padding: "10px" }}>Jenis</th>
                  <th style={{ padding: "10px" }}>Topik</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Kuota</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Terisi</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Sisa</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {offerings.map((o) => (
                  <tr key={o.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                    <td style={{ padding: "10px" }}>{o.id}</td>
                    <td style={{ padding: "10px", fontWeight: 600 }}>{o.nama}</td>
                    <td style={{ padding: "10px", textTransform: "capitalize" }}>{o.jenis}</td>
                    <td style={{ padding: "10px" }}>{o.topik || "-"}</td>
                    <td style={{ padding: "10px", textAlign: "center", fontWeight: 700 }}>{o.kuota}</td>
                    <td style={{ padding: "10px", textAlign: "center" }}>{o.terisi}</td>
                    <td
                      style={{
                        padding: "10px",
                        textAlign: "center",
                        fontWeight: 700,
                        color: o.sisa <= 0 ? "var(--danger)" : "var(--success)",
                      }}
                    >
                      {o.sisa}
                    </td>
                    <td style={{ padding: "10px", textAlign: "center" }}>
                      <button
                        type="button"
                        className="btn btn-secondary"
                        style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                        onClick={() => handleUpdateQuota(o.id, o.kuota)}
                      >
                        Ubah Kuota
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: IMPOR EXCEL */}
      {activeTab === "import" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: "1.5rem" }}>
          {/* Impor Mahasiswa */}
          <div className="card">
            <h3 className="card-title">1. Impor Data Mahasiswa</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Format Excel: Kolom <strong>NIM</strong>, <strong>Nama</strong>, dan opsional <strong>Kelas</strong> (atau
              sheet per kelas).
            </p>
            <input
              type="file"
              accept=".xlsx, .xls"
              className="form-input"
              onChange={handleImportStudents}
              disabled={loading}
            />
          </div>

          {/* Impor Jadwal Kelas Tetap */}
          <div className="card">
            <h3 className="card-title">2. Impor Jadwal Kelas Tetap</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Format Excel: Kolom <strong>Kelas</strong>, <strong>Hari</strong>, <strong>Jam Mulai</strong>,{" "}
              <strong>Jam Selesai</strong>, <strong>Mata Kuliah</strong>.
            </p>
            <input
              type="file"
              accept=".xlsx, .xls"
              className="form-input"
              onChange={handleImportJadwalKelas}
              disabled={loading}
            />
          </div>

          {/* Impor Jadwal Pilihan */}
          <div className="card">
            <h3 className="card-title">3. Impor Jadwal Mata Kuliah Pilihan</h3>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Format Excel: Kolom <strong>ID / Nama Matkul</strong>, <strong>Hari</strong>,{" "}
              <strong>Jam Mulai</strong>, <strong>Jam Selesai</strong>, <strong>Ruang</strong>.
            </p>
            <input
              type="file"
              accept=".xlsx, .xls"
              className="form-input"
              onChange={handleImportJadwalPilihan}
              disabled={loading}
            />
          </div>
        </div>
      )}

      {/* TAB 3: PENGAJUAN AKSES */}
      {activeTab === "pengajuan" && (
        <div className="card">
          <h3 className="card-title">Daftar Pengajuan Akses Mahasiswa</h3>
          {accessRequests.length === 0 ? (
            <p style={{ color: "var(--text-muted)", padding: "1rem" }}>Tidak ada pengajuan akses saat ini.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
                <thead>
                  <tr style={{ backgroundColor: "var(--bg-subtle)", textAlign: "left" }}>
                    <th style={{ padding: "10px" }}>Waktu</th>
                    <th style={{ padding: "10px" }}>NIM</th>
                    <th style={{ padding: "10px" }}>Nama Lengkap</th>
                    <th style={{ padding: "10px" }}>Kelas</th>
                    <th style={{ padding: "10px" }}>Catatan</th>
                    <th style={{ padding: "10px" }}>Status</th>
                    <th style={{ padding: "10px", textAlign: "center" }}>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {accessRequests.map((req) => (
                    <tr key={req.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "10px" }}>{new Date(req.created_at).toLocaleDateString("id-ID")}</td>
                      <td style={{ padding: "10px", fontWeight: 600 }}>{req.nim}</td>
                      <td style={{ padding: "10px" }}>{req.nama}</td>
                      <td style={{ padding: "10px" }}>{req.kelas || "-"}</td>
                      <td style={{ padding: "10px" }}>{req.catatan || "-"}</td>
                      <td style={{ padding: "10px" }}>
                        <span
                          className={`badge ${
                            req.status === "approved"
                              ? "badge-success"
                              : req.status === "pending"
                              ? "badge-warning"
                              : "badge-danger"
                          }`}
                        >
                          {req.status}
                        </span>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        {req.status === "pending" && (
                          <button
                            type="button"
                            className="btn btn-success"
                            style={{ padding: "4px 10px", fontSize: "0.8rem" }}
                            onClick={() => handleApproveAccess(req.id)}
                          >
                            Setujui
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: BATALKAN PENDAFTARAN */}
      {activeTab === "batal" && (
        <div className="card" style={{ maxWidth: 540 }}>
          <h3 className="card-title">Batalkan Pendaftaran Mahasiswa</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
            Fitur ini digunakan jika mahasiswa salah memilih dan meminta reset dari admin prodi. Kursi yang telah
            dipilih akan dikembalikan ke kuota.
          </p>

          <div className="form-group">
            <label className="form-label">Masukkan NIM Mahasiswa</label>
            <input
              type="text"
              className="form-input"
              placeholder="Contoh: 2110211001"
              value={batalNim}
              onChange={(e) => setBatalNim(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="btn btn-danger"
            onClick={() => handleBatalDaftar(batalNim)}
            disabled={!batalNim.trim() || loading}
          >
            Batalkan Pendaftaran NIM Ini
          </button>
        </div>
      )}
    </div>
  );
}
