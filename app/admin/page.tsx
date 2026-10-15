"use client";

import React, { useState, useEffect, useCallback } from "react";
import * as XLSX from "xlsx";
import { supabase, Offering, OfferingSchedule } from "@/lib/supabase";

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

interface RegisteredStudent {
  nim: string;
  nama: string;
  kelas?: string | null;
  registered_at: string;
  pilihan: {
    id: number;
    nama: string;
    jenis: string;
    topik?: string | null;
    jadwal?: {
      hari: string;
      jam_mulai: string;
      jam_selesai: string;
      ruang?: string | null;
    }[];
  }[];
}

function normalizeHari(rawHari: any): string {
  if (!rawHari) return "Senin";
  const s = String(rawHari).trim().toLowerCase();
  if (s.includes("senin")) return "Senin";
  if (s.includes("selasa")) return "Selasa";
  if (s.includes("rabu")) return "Rabu";
  if (s.includes("kamis")) return "Kamis";
  if (s.includes("jumat") || s.includes("jum'at")) return "Jumat";
  if (s.includes("sabtu")) return "Sabtu";
  if (s.includes("minggu")) return "Minggu";
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function parseJamRange(
  rawJam: any,
  rawJamMulai?: any,
  rawJamSelesai?: any
): { jamMulai?: string; jamSelesai?: string } {
  const formatTime = (t: string): string => {
    let clean = t.trim().replace(".", ":");
    if (/^\d{1,2}:\d{2}$/.test(clean)) {
      const [h, m] = clean.split(":");
      return `${h.padStart(2, "0")}:${m}:00`;
    }
    if (/^\d{1,2}:\d{2}:\d{2}$/.test(clean)) {
      const [h, m, s] = clean.split(":");
      return `${h.padStart(2, "0")}:${m}:${s}`;
    }
    return clean;
  };

  // Jika jam mulai dan selesai terpisah
  if (rawJamMulai && rawJamSelesai) {
    return {
      jamMulai: formatTime(String(rawJamMulai)),
      jamSelesai: formatTime(String(rawJamSelesai)),
    };
  }

  // Jika dalam format rentang seperti "07.30-08.50" atau "07:30 - 08:50"
  if (rawJam) {
    const str = String(rawJam).trim();
    const parts = str.split("-");
    if (parts.length === 2) {
      return {
        jamMulai: formatTime(parts[0]),
        jamSelesai: formatTime(parts[1]),
      };
    }
  }

  return { jamMulai: undefined, jamSelesai: undefined };
}

// Ekstrak mahasiswa cerdas berbasis pola (mendukung file Excel hasil konversi PDF acak)
function extractStudentFromRow(
  rowObj: Record<string, any>,
  defaultKelas?: string
): StudentImportRow | null {
  const values = Object.values(rowObj).filter(
    (v) => v !== null && v !== undefined && String(v).trim() !== ""
  );
  if (values.length === 0) return null;

  let foundNim: string | null = null;
  let foundNama: string | null = null;
  let foundKelas: string | null = defaultKelas || null;

  // 1. Cek dulu apakah ada key eksplisit (NIM, Nama, dsb)
  for (const [k, v] of Object.entries(rowObj)) {
    const keyLower = k.toLowerCase().replace(/[^a-z0-9]/g, "");
    const valStr = String(v).trim();
    if (
      !foundNim &&
      (keyLower === "nim" ||
        keyLower === "npm" ||
        keyLower === "nomorinduk" ||
        keyLower === "nomhs" ||
        keyLower === "noinduk")
    ) {
      const digits = valStr.replace(/[^0-9]/g, "");
      if (digits.length >= 7 && digits.length <= 15) {
        foundNim = digits;
      }
    }
    if (
      !foundNama &&
      (keyLower === "nama" ||
        keyLower === "namamahasiswa" ||
        keyLower === "namalengkap" ||
        keyLower === "mahasiswa" ||
        keyLower === "peserta")
    ) {
      if (valStr.length >= 3 && !/^\d+$/.test(valStr.replace(/[^0-9]/g, ""))) {
        foundNama = valStr;
      }
    }
    if (
      !foundKelas &&
      (keyLower === "kelas" || keyLower === "rombel" || keyLower === "grup")
    ) {
      foundKelas = valStr;
    }
  }

  // 2. Jika belum ditemukan (misal convert PDF dengan header acak 'Col1', 'F2', atau tanpa header),
  // lakukan deteksi cerdas berdasarkan pola nilai sel:
  if (!foundNim || !foundNama) {
    for (const val of values) {
      const strVal = String(val).trim();
      const cleanDigits = strVal.replace(/[^0-9]/g, "");

      // Deteksi NIM: Angka berurutan 7 sampai 15 digit
      if (!foundNim && cleanDigits.length >= 7 && cleanDigits.length <= 15 && /^\d+$/.test(strVal.replace(/[\s\.\-]/g, ""))) {
        foundNim = cleanDigits;
        continue;
      }

      // Deteksi Nama: Teks dengan huruf latin, panjang >= 3, bukan tanggal, bukan keyword header
      if (
        !foundNama &&
        strVal.length >= 3 &&
        !/^\d+$/.test(cleanDigits) &&
        /[a-zA-Z]/.test(strVal)
      ) {
        const lower = strVal.toLowerCase();
        const isHeaderWord =
          lower === "nim" ||
          lower === "nama" ||
          lower === "npm" ||
          lower === "kelas" ||
          lower === "no" ||
          lower === "nomor" ||
          lower.includes("daftar") ||
          lower.includes("semester") ||
          lower.includes("halaman") ||
          lower.includes("presensi") ||
          lower.includes("universitas") ||
          lower.includes("fakultas") ||
          lower.includes("program studi");

        if (!isHeaderWord) {
          foundNama = strVal;
        }
      }
    }
  }

  if (foundNim && foundNama) {
    return {
      nim: foundNim,
      nama: foundNama,
      kelas: foundKelas ? foundKelas.trim() : undefined,
    };
  }

  return null;
}

export default function AdminPage() {
  // Auth state
  const [session, setSession] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [authLoading, setAuthLoading] = useState(false);

  // Portal & Admin Data State
  const [portalOpen, setPortalOpen] = useState(false);
  const [offerings, setOfferings] = useState<Offering[]>([]);
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [registeredStudents, setRegisteredStudents] = useState<RegisteredStudent[]>([]);
  const [searchPendaftar, setSearchPendaftar] = useState("");
  const [filterKelasPendaftar, setFilterKelasPendaftar] = useState("all");
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
  const [activeTab, setActiveTab] = useState<"kuota" | "pendaftar" | "import" | "pengajuan" | "batal">("kuota");
  const [batalNim, setBatalNim] = useState("");

  // Modal Offering (Tambah / Edit) State
  const [showOfferingModal, setShowOfferingModal] = useState(false);
  const [editingOfferingId, setEditingOfferingId] = useState<number | null>(null);
  const [offeringNama, setOfferingNama] = useState("");
  const [offeringJenis, setOfferingJenis] = useState<"matkul" | "proyek">("matkul");
  const [offeringTopik, setOfferingTopik] = useState("");
  const [offeringKuota, setOfferingKuota] = useState(30);
  const [newJadwalHari, setNewJadwalHari] = useState("Senin");
  const [newJadwalMulai, setNewJadwalMulai] = useState("08:00");
  const [newJadwalSelesai, setNewJadwalSelesai] = useState("09:40");
  const [newJadwalRuang, setNewJadwalRuang] = useState("");
  const [editingOfferingJadwal, setEditingOfferingJadwal] = useState<OfferingSchedule[]>([]);

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
      if (statusErr) {
        setActionError("Gagal memuat status portal: " + statusErr.message);
      } else if (statusData) {
        setPortalOpen(!!statusData.portal_open);
        setStats({
          totalStudents: statusData.total_students || 0,
          totalRegistered: statusData.total_registered || 0,
          activeQueueCount: statusData.active_queue || 0,
        });
      }

      // 2. Get Offerings
      const { data: offData, error: offErr } = await supabase.rpc("admin_list_offerings");
      if (offErr) {
        setActionError("Gagal memuat daftar matkul: " + offErr.message);
      } else if (offData && Array.isArray(offData)) {
        setOfferings(offData);
      }

      // 3. Get Access Requests
      const { data: reqData, error: reqErr } = await supabase.rpc("admin_list_pengajuan");
      if (reqErr) {
        setActionError("Gagal memuat pengajuan akses: " + reqErr.message);
      } else if (reqData && Array.isArray(reqData)) {
        setAccessRequests(reqData);
      }

      // 4. Get Registered Students (dengan fallback otomatis ke admin_export_pendaftaran)
      let studentsList: RegisteredStudent[] = [];
      const { data: regData, error: regErr } = await supabase.rpc("admin_list_pendaftar");

      if (!regErr && regData && Array.isArray(regData)) {
        studentsList = regData;
      } else {
        // Fallback: Gunakan admin_export_pendaftaran yang sudah ada di Supabase
        const { data: expData, error: expErr } = await supabase.rpc("admin_export_pendaftaran");
        if (!expErr && expData && Array.isArray(expData)) {
          const studentMap = new Map<string, RegisteredStudent>();
          expData.forEach((row: any) => {
            const rawNim = row.NIM || row.nim;
            if (!rawNim) return;
            const nimStr = String(rawNim).trim();
            if (!studentMap.has(nimStr)) {
              studentMap.set(nimStr, {
                nim: nimStr,
                nama: row.Nama || row.nama || "-",
                kelas: row.Kelas || row.kelas || null,
                registered_at:
                  row["Waktu Registrasi"] || row.waktu_registrasi || row.created_at || new Date().toISOString(),
                pilihan: [],
              });
            }
            const student = studentMap.get(nimStr)!;
            const matkulName = row["Mata Kuliah / Proyek"] || row.matkul || row.nama_pilihan;
            if (matkulName) {
              student.pilihan.push({
                id: row.id || Math.floor(Math.random() * 100000),
                nama: matkulName,
                jenis: row.Jenis || row.jenis || "matkul",
                topik: row.Topik || row.topik || null,
                jadwal: [],
              });
            }
          });
          studentsList = Array.from(studentMap.values());
        }
      }
      setRegisteredStudents(studentsList);

      // 5. Compute Warnings for Yellow Box
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

  // Handle Login (Mendukung Username atau Email)
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
        setActionError("Login admin gagal. Periksa username dan password.");
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

  // 1. Impor Mahasiswa Cerdas & Fleksibel (Mendukung file Excel biasa maupun hasil convert PDF yang acak)
  const handleImportStudents = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const studentMap = new Map<string, StudentImportRow>();

      wb.SheetNames.forEach((sheetName) => {
        const sheet = wb.Sheets[sheetName];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: "" });
        rows.forEach((r) => {
          const extracted = extractStudentFromRow(r, sheetName.includes("Sheet") ? undefined : sheetName);
          if (extracted && extracted.nim && extracted.nama) {
            // Deduplikasi berdasarkan NIM
            if (!studentMap.has(extracted.nim)) {
              studentMap.set(extracted.nim, extracted);
            }
          }
        });
      });

      const students = Array.from(studentMap.values());

      if (students.length === 0) {
        alert(
          "Tidak ditemukan data mahasiswa yang valid. Sistem mendeteksi NIM (angka 7-15 digit) dan Nama secara otomatis. Pastikan file memuat kolom nomor induk dan nama mahasiswa."
        );
        return;
      }

      const { data, error } = await supabase.rpc("admin_import_students", {
        p_students: students,
      });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess(`Berhasil mendeteksi dan mengimpor ${students.length} data mahasiswa.`);
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal memproses file Excel mahasiswa.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // 2. Impor Master Jadwal Keseluruhan (Semesteran Fakultas: Jadwal Kelas Tetap + Matkul Pilihan)
  const handleImportMasterSchedule = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      setLoading(true);
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, { type: "array" });
      const schedules: JadwalKelasRow[] = [];
      const offerings: any[] = [];

      wb.SheetNames.forEach((sheetName) => {
        const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[sheetName]);
        rows.forEach((r) => {
          const rawKelas = r.KELAS || r.Kelas || r.kelas || (sheetName.includes("Sheet") ? "" : sheetName);
          const rawHari = r.HARI || r.Hari || r.hari;
          const rawJam = r.JAM || r.Jam || r.jam || r["Waktu"] || r["Jadwal"];
          const rawJamMulai = r["Jam Mulai"] || r.jam_mulai || r.Mulai || r["JAM MULAI"];
          const rawJamSelesai = r["Jam Selesai"] || r.jam_selesai || r.Selesai || r["JAM SELESAI"];
          const matkul = r.MATKUL || r.Matkul || r["Mata Kuliah"] || r.matkul || r["Nama Matkul"] || r.Nama;
          const ruang = r.RUANG || r.Ruang || r.ruang;
          const rawKuota = r.KUOTA || r.Kuota || r.kuota || r.Kapasitas;
          const rawPilihan = r.PILIHAN || r.Pilihan || r.pilihan || r.Kategori || r.Jenis;

          const { jamMulai, jamSelesai } = parseJamRange(rawJam, rawJamMulai, rawJamSelesai);
          const hari = normalizeHari(rawHari);

          // 1. Catat ke jadwal kelas tetap (untuk proteksi bentrok jadwal mahasiswa)
          if (rawKelas && rawHari && jamMulai && jamSelesai) {
            schedules.push({
              kelas: String(rawKelas).trim(),
              hari,
              jam_mulai: jamMulai,
              jam_selesai: jamSelesai,
              matkul: matkul ? String(matkul).trim() : undefined,
              ruang: ruang ? String(ruang).trim() : undefined,
            });
          }

          // 2. Jika baris memiliki kuota atau ditandai sebagai pilihan, masukkan sebagai pilihan yang dibuka
          const isMarkedPilihan =
            Boolean(rawKuota) ||
            String(rawPilihan).toLowerCase().includes("pilihan") ||
            String(rawPilihan).toLowerCase() === "ya" ||
            String(rawPilihan).toLowerCase() === "true";

          if (matkul && isMarkedPilihan) {
            let nama = String(matkul).trim();
            if (rawKelas) {
              const kelasStr = String(rawKelas).trim();
              if (
                kelasStr &&
                !nama.toLowerCase().includes(`kelas ${kelasStr.toLowerCase()}`) &&
                !nama.toLowerCase().endsWith(` ${kelasStr.toLowerCase()}`)
              ) {
                nama = `${nama} (Kelas ${kelasStr})`;
              }
            }

            offerings.push({
              nama,
              jenis: nama.toLowerCase().includes("proyek") ? "proyek" : "matkul",
              kuota: Number(rawKuota) || 30,
              hari,
              jam_mulai: jamMulai,
              jam_selesai: jamSelesai,
              ruang: ruang ? String(ruang).trim() : undefined,
            });
          }
        });
      });

      if (schedules.length === 0) {
        alert(
          "Tidak ada baris jadwal yang valid. Pastikan kolom HARI, JAM (format 07.30-08.50), MATKUL, dan KELAS terisi."
        );
        return;
      }

      // Impor jadwal kelas ke database
      const { data: schedData, error: schedErr } = await supabase.rpc("admin_import_jadwal_kelas", {
        p_jadwal: schedules,
      });
      if (schedErr) throw schedErr;
      if (schedData?.ok === false) throw new Error(schedData.error);

      // Jika ada offerings terdeteksi dari kuota/penanda pilihan
      let offeringMsg = "";
      if (offerings.length > 0) {
        const { data: offData, error: offErr } = await supabase.rpc("admin_import_offerings", {
          p_offerings: offerings,
        });
        if (!offErr && offData?.ok) {
          offeringMsg = ` serta mendaftarkan ${offData.imported_count || offerings.length} mata kuliah pilihan`;
        }
      }

      setActionSuccess(
        `Berhasil mengimpor ${schedules.length} baris master jadwal perkuliahan${offeringMsg}.`
      );
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal mengimpor master jadwal.");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  };

  // 3. Bersihkan Seluruh Data Uji Coba Sebelum Hari-H
  const handleResetDataUji = async () => {
    const confirm1 = confirm(
      "PERINGATAN: Apakah Anda yakin ingin membersihkan seluruh data uji coba?\n\n" +
        "Tindakan ini akan:\n" +
        "1. Menghapus seluruh pendaftaran KRS uji coba\n" +
        "2. Menghapus seluruh antrian dan token sesi\n" +
        "3. Menghapus riwayat pengajuan akses uji coba\n" +
        "4. Menghapus mahasiswa dummy uji coba\n" +
        "5. Mengunci kembali portal pemilihan ke status TUTUP."
    );
    if (!confirm1) return;

    const confirm2 = confirm(
      "Konfirmasi Terakhir: Pastikan mahasiswa sungguhan belum mulai mendaftar. Lanjutkan reset bersih data uji coba?"
    );
    if (!confirm2) return;

    setLoading(true);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc("admin_reset_data_uji");
      if (error) {
        alert(
          "Gagal mereset: " +
            error.message +
            "\n\nPastikan script patch9_reset_data_uji.sql sudah dieksekusi di Supabase SQL Editor."
        );
      } else if (data?.ok) {
        setActionSuccess(
          `Data uji coba berhasil dibersihkan! (${data.pendaftaran_dihapus || 0} pendaftaran, ${
            data.antrian_dihapus || 0
          } antrian, ${data.mahasiswa_dummy_dihapus || 0} mahasiswa dummy dibersihkan).`
        );
        loadAdminData();
      }
    } catch (err: any) {
      alert(err.message || "Terjadi kesalahan saat mereset data uji.");
    } finally {
      setLoading(false);
    }
  };

  // Unduh Template Excel untuk Data Mahasiswa
  const handleDownloadStudentsTemplate = () => {
    const sampleData = [
      { NIM: "2110211001", Nama: "Ahmad Fauzi", Kelas: "SPKS G" },
      { NIM: "2110211002", Nama: "Siti Nurhaliza", Kelas: "SPKS P" },
      { NIM: "2110211003", Nama: "Budi Santoso", Kelas: "ANTAN A" },
      { NIM: "2110211004", Nama: "Dewi Lestari", Kelas: "SPKS I" },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Mahasiswa");
    XLSX.writeFile(wb, "template_data_mahasiswa.xlsx");
  };

  // Unduh Template Excel untuk Master Jadwal Keseluruhan (Format Resmi Semesteran Fakultas)
  const handleDownloadMasterScheduleTemplate = () => {
    const sampleData = [
      {
        HARI: "SENIN",
        JAM: "07.30-08.50",
        MATKUL: "Budaya Dasar dan Etika",
        SKS: 1,
        "DOSEN SEBELUM SISIPAN": "Dr. Idum Satya Santi, SP. MP",
        "DOSEN SETELAH SISIPAN": "Jajang Agus Sonjaya, S.S., M.Hum.",
        KELAS: "SPKS G",
        RUANG: "D501",
        KUOTA: "",
      },
      {
        HARI: "SENIN",
        JAM: "07.30-08.50",
        MATKUL: "Budaya Dasar dan Etika",
        SKS: 1,
        "DOSEN SEBELUM SISIPAN": "E. Nanik Kristalisasi. SP. MP",
        "DOSEN SETELAH SISIPAN": "E. Nanik Kristalisasi. SP. MP",
        KELAS: "SPKS P",
        RUANG: "D505",
        KUOTA: "",
      },
      {
        HARI: "SENIN",
        JAM: "07.30-08.50",
        MATKUL: "Dasar dasar Agroteknologi",
        SKS: 2,
        "DOSEN SEBELUM SISIPAN": "Ir. Ety Rosa Setyawati, M.Sc",
        "DOSEN SETELAH SISIPAN": "Ir. Ety Rosa Setyawati, M.Sc",
        KELAS: "SPKS I",
        RUANG: "D502",
        KUOTA: "",
      },
      {
        HARI: "SENIN",
        JAM: "07.30-08.50",
        MATKUL: "Matematika",
        SKS: 1,
        "DOSEN SEBELUM SISIPAN": "Dr. Tantri Swandari, S.Si, M.Sc.",
        "DOSEN SETELAH SISIPAN": "Dr. Tantri Swandari, S.Si, M.Sc.",
        KELAS: "ANTAN A",
        RUANG: "D108",
        KUOTA: "",
      },
      {
        HARI: "RABU",
        JAM: "10.00-11.40",
        MATKUL: "Bioteknologi Pertanian",
        SKS: 2,
        "DOSEN SEBELUM SISIPAN": "Prof. Dr. Ir. Sudarmono",
        "DOSEN SETELAH SISIPAN": "Prof. Dr. Ir. Sudarmono",
        KELAS: "A",
        RUANG: "D301",
        KUOTA: 30,
      },
      {
        HARI: "KAMIS",
        JAM: "13.00-14.40",
        MATKUL: "Smart Farming & IoT",
        SKS: 2,
        "DOSEN SEBELUM SISIPAN": "Dr. Ir. Budi Hartono",
        "DOSEN SETELAH SISIPAN": "Dr. Ir. Budi Hartono",
        KELAS: "A",
        RUANG: "Lab Komputer",
        KUOTA: 30,
      },
    ];
    const ws = XLSX.utils.json_to_sheet(sampleData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Jadwal Semester");
    XLSX.writeFile(wb, "template_master_jadwal_keseluruhan.xlsx");
  };

  // Buka Modal Tambah Pilihan Baru
  const openAddOfferingModal = () => {
    setEditingOfferingId(null);
    setOfferingNama("");
    setOfferingJenis("matkul");
    setOfferingTopik("");
    setOfferingKuota(30);
    setNewJadwalHari("Senin");
    setNewJadwalMulai("08:00");
    setNewJadwalSelesai("09:40");
    setNewJadwalRuang("");
    setEditingOfferingJadwal([]);
    setShowOfferingModal(true);
  };

  // Buka Modal Edit Pilihan
  const openEditOfferingModal = (o: Offering) => {
    setEditingOfferingId(o.id);
    setOfferingNama(o.nama);
    setOfferingJenis(o.jenis);
    setOfferingTopik(o.topik || "");
    setOfferingKuota(o.kuota);
    setNewJadwalHari("Senin");
    setNewJadwalMulai("08:00");
    setNewJadwalSelesai("09:40");
    setNewJadwalRuang("");
    setEditingOfferingJadwal(o.jadwal || []);
    setShowOfferingModal(true);
  };

  // Simpan Tambah / Edit Pilihan
  const handleSaveOffering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!offeringNama.trim()) {
      alert("Nama mata kuliah / proyek wajib diisi.");
      return;
    }
    setLoading(true);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc("admin_upsert_offering", {
        p_id: editingOfferingId,
        p_nama: offeringNama.trim(),
        p_jenis: offeringJenis,
        p_topik: offeringTopik.trim() || null,
        p_kuota: Number(offeringKuota) || 30,
      });

      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      const targetId = editingOfferingId || data.id;

      // Jika memasukkan jadwal baru
      if (newJadwalHari && newJadwalMulai && newJadwalSelesai && targetId) {
        const { data: schedData, error: schedErr } = await supabase.rpc("admin_tambah_jadwal", {
          p_offering_id: targetId,
          p_hari: newJadwalHari,
          p_jam_mulai: newJadwalMulai,
          p_jam_selesai: newJadwalSelesai,
          p_ruang: newJadwalRuang.trim() || null,
        });
        if (schedErr) throw schedErr;
        if (schedData?.ok === false) throw new Error(schedData.error);
      }

      setShowOfferingModal(false);
      setActionSuccess(
        editingOfferingId
          ? `Mata kuliah "${offeringNama}" berhasil diperbarui.`
          : `Mata kuliah "${offeringNama}" berhasil ditambahkan.`
      );
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal menyimpan mata kuliah.");
    } finally {
      setLoading(false);
    }
  };

  // Hapus Pilihan
  const handleDeleteOffering = async (id: number, nama: string) => {
    if (!confirm(`Apakah Anda yakin ingin menghapus "${nama}"? Tindakan ini tidak dapat dibatalkan.`)) {
      return;
    }
    setLoading(true);
    setActionError(null);
    try {
      const { data, error } = await supabase.rpc("admin_delete_offering", { p_id: id });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setActionSuccess(`Mata kuliah "${nama}" berhasil dihapus.`);
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal menghapus mata kuliah.");
    } finally {
      setLoading(false);
    }
  };

  // Hapus Jadwal dari Modal
  const handleDeleteScheduleInModal = async (schedId: number) => {
    if (!confirm("Hapus jadwal ini?")) return;
    try {
      const { data, error } = await supabase.rpc("admin_hapus_jadwal", { p_schedule_id: schedId });
      if (error) throw error;
      if (data?.ok === false) throw new Error(data.error);

      setEditingOfferingJadwal((prev) => prev.filter((s) => s.id !== schedId));
      loadAdminData();
    } catch (err: any) {
      alert(err.message || "Gagal menghapus jadwal.");
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
              <label className="form-label">Username Admin</label>
              <input
                type="text"
                className="form-input"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoComplete="username"
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

  const uniqueKelasList = Array.from(
    new Set(registeredStudents.map((s) => s.kelas).filter((k): k is string => Boolean(k)))
  ).sort();

  const filteredStudents = registeredStudents.filter((s) => {
    const term = searchPendaftar.toLowerCase();
    const matchSearch =
      !term ||
      s.nim.toLowerCase().includes(term) ||
      s.nama.toLowerCase().includes(term);
    const matchKelas = filterKelasPendaftar === "all" || s.kelas === filterKelasPendaftar;
    return matchSearch && matchKelas;
  });

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
            Login sebagai: <strong>{session?.user?.email?.replace(/@admin\.local$/, "")}</strong>
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
          onClick={() => setActiveTab("pendaftar")}
          style={{
            padding: "0.75rem 1.25rem",
            fontWeight: 600,
            background: "none",
            border: "none",
            borderBottom: activeTab === "pendaftar" ? "3px solid var(--primary)" : "none",
            color: activeTab === "pendaftar" ? "var(--primary)" : "var(--text-muted)",
            cursor: "pointer",
          }}
        >
          Data Mahasiswa Masuk ({registeredStudents.length})
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

      {/* TAB 1: KELOLA KUOTA & PILIHAN */}
      {activeTab === "kuota" && (
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1rem",
              flexWrap: "wrap",
              gap: "0.75rem",
            }}
          >
            <h3 className="card-title" style={{ margin: 0 }}>
              Daftar Pilihan Mata Kuliah & Proyek ({offerings.length})
            </h3>
            <button
              type="button"
              className="btn btn-primary"
              onClick={openAddOfferingModal}
              style={{ fontSize: "0.875rem", padding: "6px 14px" }}
            >
              + Tambah Pilihan Baru
            </button>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.9rem" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-subtle)", textAlign: "left" }}>
                  <th style={{ padding: "10px" }}>ID</th>
                  <th style={{ padding: "10px" }}>Nama Mata Kuliah / Proyek</th>
                  <th style={{ padding: "10px" }}>Jenis</th>
                  <th style={{ padding: "10px" }}>Topik</th>
                  <th style={{ padding: "10px" }}>Jadwal Kuliah</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Kuota</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Terisi</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Sisa</th>
                  <th style={{ padding: "10px", textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {offerings.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", padding: "2rem", color: "var(--text-muted)" }}>
                      Belum ada mata kuliah atau proyek pilihan. Silakan gunakan tombol &quot;+ Tambah Pilihan Baru&quot; atau impor dari menu Impor Data Excel.
                    </td>
                  </tr>
                ) : (
                  offerings.map((o) => (
                    <tr key={o.id} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "10px" }}>{o.id}</td>
                      <td style={{ padding: "10px", fontWeight: 600 }}>{o.nama}</td>
                      <td style={{ padding: "10px" }}>
                        <span
                          style={{
                            display: "inline-block",
                            padding: "2px 8px",
                            borderRadius: "4px",
                            fontSize: "0.75rem",
                            fontWeight: 600,
                            backgroundColor: o.jenis === "proyek" ? "#e0e7ff" : "#f1f5f9",
                            color: o.jenis === "proyek" ? "#3730a3" : "#334155",
                            textTransform: "uppercase",
                          }}
                        >
                          {o.jenis}
                        </span>
                      </td>
                      <td style={{ padding: "10px", color: "var(--text-muted)" }}>{o.topik || "-"}</td>
                      <td style={{ padding: "10px" }}>
                        {o.jadwal && o.jadwal.length > 0 ? (
                          <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                            {o.jadwal.map((j, idx) => (
                              <div
                                key={idx}
                                style={{
                                  fontSize: "0.8rem",
                                  backgroundColor: "var(--bg-subtle)",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  display: "inline-block",
                                }}
                              >
                                <strong>{j.hari}</strong> {j.jam_mulai.slice(0, 5)}-{j.jam_selesai.slice(0, 5)}
                                {j.ruang ? ` (${j.ruang})` : ""}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <span style={{ color: "#d97706", fontSize: "0.8rem", fontWeight: 600 }}>
                            ⚠️ Belum ada jadwal
                          </span>
                        )}
                      </td>
                      <td style={{ padding: "10px", textAlign: "center", fontWeight: 700 }}>{o.kuota}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>{o.terisi}</td>
                      <td
                        style={{
                          padding: "10px",
                          textAlign: "center",
                          fontWeight: 700,
                          color: o.sisa <= 0 ? "var(--danger)" : o.sisa <= 5 ? "var(--warning)" : "var(--success)",
                          backgroundColor: o.sisa <= 5 && o.sisa > 0 ? "var(--warning-light)" : undefined,
                          borderRadius: "4px",
                        }}
                        title={o.sisa <= 0 ? "Kuota penuh" : o.sisa <= 5 ? "Peringatan: Kuota menipis (≤ 5 kursi tersisa)" : "Kuota masih tersedia"}
                      >
                        {o.sisa <= 5 && o.sisa > 0 ? `⚠️ ${o.sisa}` : o.sisa}
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "center" }}>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.8rem" }}
                            onClick={() => openEditOfferingModal(o)}
                            title="Edit Mata Kuliah & Jadwal"
                          >
                            ✏️ Edit
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary"
                            style={{ padding: "4px 8px", fontSize: "0.8rem", color: "var(--danger)" }}
                            onClick={() => handleDeleteOffering(o.id, o.nama)}
                            title="Hapus Mata Kuliah"
                          >
                            🗑️
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB: DATA MAHASISWA MASUK */}
      {activeTab === "pendaftar" && (
        <div className="card">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: "1.25rem",
              flexWrap: "wrap",
              gap: "1rem",
            }}
          >
            <div>
              <h3 className="card-title" style={{ margin: 0 }}>
                Data Mahasiswa yang Telah Menyelesaikan KRS ({filteredStudents.length} Mahasiswa)
              </h3>
              <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "0.25rem", margin: 0 }}>
                Menampilkan mahasiswa yang telah memilih 4 matkul/proyek pilihan beserta rincian jadwal dan ruangan.
              </p>
            </div>

            <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
              <input
                type="text"
                className="form-input"
                placeholder="Cari NIM atau Nama..."
                value={searchPendaftar}
                onChange={(e) => setSearchPendaftar(e.target.value)}
                style={{ width: "200px", padding: "6px 12px", fontSize: "0.875rem" }}
              />

              <select
                className="form-input"
                value={filterKelasPendaftar}
                onChange={(e) => setFilterKelasPendaftar(e.target.value)}
                style={{ width: "140px", padding: "6px 12px", fontSize: "0.875rem" }}
              >
                <option value="all">Semua Kelas</option>
                {uniqueKelasList.map((k) => (
                  <option key={k} value={k}>
                    Kelas {k}
                  </option>
                ))}
              </select>

              <button
                type="button"
                className="btn btn-secondary"
                onClick={loadAdminData}
                style={{ padding: "6px 12px", fontSize: "0.875rem" }}
                title="Muat Ulang Data"
              >
                🔄 Refresh
              </button>
            </div>
          </div>

          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
              <thead>
                <tr style={{ backgroundColor: "var(--bg-subtle)", textAlign: "left" }}>
                  <th style={{ padding: "10px", width: "40px" }}>No</th>
                  <th style={{ padding: "10px", width: "120px" }}>NIM</th>
                  <th style={{ padding: "10px", width: "180px" }}>Nama Mahasiswa</th>
                  <th style={{ padding: "10px", width: "80px", textAlign: "center" }}>Kelas</th>
                  <th style={{ padding: "10px", width: "150px" }}>Waktu Selesai</th>
                  <th style={{ padding: "10px" }}>Mata Kuliah & Proyek Pilihan (4 Pilihan)</th>
                  <th style={{ padding: "10px", width: "90px", textAlign: "center" }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: "center", padding: "2.5rem", color: "var(--text-muted)" }}>
                      {registeredStudents.length === 0
                        ? "Belum ada mahasiswa yang menyelesaikan pendaftaran."
                        : "Tidak ditemukan mahasiswa yang cocok dengan filter pencarian."}
                    </td>
                  </tr>
                ) : (
                  filteredStudents.map((s, idx) => (
                    <tr key={s.nim} style={{ borderBottom: "1px solid var(--border-color)" }}>
                      <td style={{ padding: "10px", color: "var(--text-muted)" }}>{idx + 1}</td>
                      <td style={{ padding: "10px", fontWeight: 700, fontFamily: "monospace", fontSize: "0.9rem" }}>
                        {s.nim}
                      </td>
                      <td style={{ padding: "10px", fontWeight: 600 }}>{s.nama}</td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <span
                          style={{
                            padding: "2px 8px",
                            borderRadius: "4px",
                            backgroundColor: "var(--bg-subtle)",
                            fontWeight: 600,
                            fontSize: "0.8rem",
                          }}
                        >
                          {s.kelas || "-"}
                        </span>
                      </td>
                      <td style={{ padding: "10px", color: "var(--text-muted)", fontSize: "0.8rem" }}>
                        {s.registered_at
                          ? new Date(s.registered_at).toLocaleString("id-ID", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "-"}
                      </td>
                      <td style={{ padding: "10px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                          {s.pilihan && s.pilihan.length > 0 ? (
                            s.pilihan.map((p) => (
                              <div
                                key={p.id}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "space-between",
                                  backgroundColor: p.jenis === "proyek" ? "#eef2ff" : "var(--bg-subtle)",
                                  borderLeft: p.jenis === "proyek" ? "3px solid #6366f1" : "3px solid var(--primary)",
                                  padding: "4px 8px",
                                  borderRadius: "4px",
                                  fontSize: "0.8rem",
                                  gap: "0.5rem",
                                }}
                              >
                                <div>
                                  <span
                                    style={{
                                      fontSize: "0.7rem",
                                      fontWeight: 700,
                                      padding: "1px 5px",
                                      borderRadius: "3px",
                                      marginRight: "6px",
                                      backgroundColor: p.jenis === "proyek" ? "#4f46e5" : "#0284c7",
                                      color: "#fff",
                                      textTransform: "uppercase",
                                    }}
                                  >
                                    {p.jenis}
                                  </span>
                                  <strong>{p.nama}</strong>
                                  {p.topik && (
                                    <span style={{ color: "var(--text-muted)", marginLeft: "4px" }}>
                                      ({p.topik})
                                    </span>
                                  )}
                                </div>
                                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", whiteSpace: "nowrap" }}>
                                  {p.jadwal && p.jadwal.length > 0 ? (
                                    p.jadwal.map((j, jIdx) => (
                                      <span key={jIdx} style={{ marginLeft: "4px" }}>
                                        📅 {j.hari} {j.jam_mulai.slice(0, 5)}-{j.jam_selesai.slice(0, 5)}
                                        {j.ruang ? ` (${j.ruang})` : ""}
                                      </span>
                                    ))
                                  ) : (
                                    <span>-</span>
                                  )}
                                </div>
                              </div>
                            ))
                          ) : (
                            <span style={{ color: "var(--text-muted)", fontStyle: "italic" }}>
                              Belum ada pilihan mata kuliah
                            </span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: "10px", textAlign: "center" }}>
                        <button
                          type="button"
                          className="btn btn-secondary"
                          style={{
                            padding: "4px 8px",
                            fontSize: "0.75rem",
                            color: "var(--danger)",
                            borderColor: "var(--danger)",
                          }}
                          onClick={() => handleBatalDaftar(s.nim)}
                          title={`Batalkan pendaftaran dan kembalikan kuota untuk NIM ${s.nim}`}
                        >
                          Batalkan
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: IMPOR EXCEL */}
      {activeTab === "import" && (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))", gap: "1.5rem" }}>
          {/* 1. Impor Master Jadwal Keseluruhan */}
          <div className="card" style={{ border: "2px solid #3b82f6" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 className="card-title" style={{ margin: 0, color: "var(--primary)" }}>1. Impor Master Jadwal Keseluruhan</h3>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                onClick={handleDownloadMasterScheduleTemplate}
              >
                📥 Unduh Template Jadwal
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Format Excel: 1 berkas jadwal lengkap fakultas (kolom <strong>HARI</strong>, <strong>JAM</strong> format <code>07.30-08.50</code>, <strong>MATKUL</strong>, <strong>KELAS</strong>, <strong>RUANG</strong>, serta opsional <strong>KUOTA</strong>). Sistem otomatis mencatat jadwal kelas tetap untuk mencegah bentrok dan sekaligus mendaftarkan mata kuliah pilihan jika kuota diisi.
            </p>
            <input
              type="file"
              accept=".xlsx, .xls"
              className="form-input"
              onChange={handleImportMasterSchedule}
              disabled={loading}
            />
          </div>

          {/* 2. Impor Data Mahasiswa (Fleksibel PDF/Excel) */}
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem", flexWrap: "wrap", gap: "0.5rem" }}>
              <h3 className="card-title" style={{ margin: 0 }}>2. Impor Data Mahasiswa</h3>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ fontSize: "0.75rem", padding: "4px 10px" }}
                onClick={handleDownloadStudentsTemplate}
              >
                📥 Unduh Template Mahasiswa
              </button>
            </div>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "1rem" }}>
              Format Excel: Cerdas mendeteksi <strong>NIM (angka 7–15 digit)</strong> dan <strong>Nama</strong> mahasiswa secara otomatis, baik dari file Excel rapi maupun hasil konversi PDF dengan tata letak baris dan kolom yang acak.
            </p>
            <input
              type="file"
              accept=".xlsx, .xls"
              className="form-input"
              onChange={handleImportStudents}
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

          {/* Pembersihan Data Uji Coba Sebelum Hari-H */}
          <div
            style={{
              marginTop: "2rem",
              paddingTop: "1.5rem",
              borderTop: "2px dashed #fca5a5",
            }}
          >
            <h4 style={{ color: "var(--danger)", fontWeight: 700, margin: "0 0 0.5rem 0" }}>
              🧹 Bersihkan Seluruh Data Uji Coba (Sebelum Hari-H)
            </h4>
            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: "0.75rem" }}>
              Setelah selesai melakukan simulasi uji coba, gunakan tombol ini untuk mengembalikan database ke kondisi bersih sebelum mahasiswa sungguhan masuk:
            </p>
            <ul style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginBottom: "1rem", paddingLeft: "1.25rem" }}>
              <li>Menghapus seluruh pendaftaran KRS uji coba</li>
              <li>Menghapus seluruh antrian dan token sesi uji coba</li>
              <li>Menghapus seluruh pengajuan akses uji coba</li>
              <li>Menghapus data mahasiswa dummy (NIM 2110211001 s/d 2110211020)</li>
              <li>Mengunci kembali status portal menjadi TUTUP</li>
            </ul>
            <button
              type="button"
              className="btn btn-danger btn-block"
              onClick={handleResetDataUji}
              disabled={loading}
              style={{ fontWeight: 700 }}
            >
              🧹 Bersihkan Seluruh Data Uji Coba Sekarang
            </button>
          </div>
        </div>
      )}

      {/* MODAL TAMBAH / EDIT MATA KULIAH */}
      {showOfferingModal && (
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
          <div
            className="card"
            style={{
              maxWidth: 550,
              width: "100%",
              maxHeight: "90vh",
              overflowY: "auto",
              margin: 0,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 className="card-title" style={{ margin: 0 }}>
                {editingOfferingId ? "Edit Mata Kuliah / Proyek" : "Tambah Mata Kuliah / Proyek Baru"}
              </h3>
              <button
                type="button"
                style={{ background: "none", border: "none", fontSize: "1.25rem", cursor: "pointer" }}
                onClick={() => setShowOfferingModal(false)}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveOffering}>
              <div className="form-group">
                <label className="form-label">Nama Mata Kuliah / Proyek *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Bioteknologi Pertanian"
                  value={offeringNama}
                  onChange={(e) => setOfferingNama(e.target.value)}
                  required
                />
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "1rem" }}>
                <div className="form-group">
                  <label className="form-label">Jenis *</label>
                  <select
                    className="form-input"
                    value={offeringJenis}
                    onChange={(e) => setOfferingJenis(e.target.value as "matkul" | "proyek")}
                  >
                    <option value="matkul">Mata Kuliah</option>
                    <option value="proyek">Proyek Pilihan</option>
                  </select>
                </div>

                <div className="form-group">
                  <label className="form-label">Kuota Maksimal *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={offeringKuota}
                    onChange={(e) => setOfferingKuota(Number(e.target.value))}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Topik / Bidang Keilmuan (Opsional)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Agronomi, Sosial Ekonomi, Teknologi"
                  value={offeringTopik}
                  onChange={(e) => setOfferingTopik(e.target.value)}
                />
              </div>

              {/* Daftar Jadwal yang sudah ada (jika mode edit) */}
              {editingOfferingId && editingOfferingJadwal.length > 0 && (
                <div style={{ marginBottom: "1.25rem", padding: "0.75rem", backgroundColor: "var(--bg-subtle)", borderRadius: "6px" }}>
                  <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                    Jadwal Terdaftar:
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {editingOfferingJadwal.map((j) => (
                      <div
                        key={j.id || Math.random()}
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          backgroundColor: "#fff",
                          padding: "6px 10px",
                          borderRadius: "4px",
                          fontSize: "0.85rem",
                          border: "1px solid var(--border-color)",
                        }}
                      >
                        <span>
                          <strong>{j.hari}</strong> {j.jam_mulai.slice(0, 5)} - {j.jam_selesai.slice(0, 5)}
                          {j.ruang ? ` (${j.ruang})` : ""}
                        </span>
                        {j.id && (
                          <button
                            type="button"
                            style={{
                              background: "none",
                              border: "none",
                              color: "var(--danger)",
                              cursor: "pointer",
                              fontSize: "0.8rem",
                            }}
                            onClick={() => handleDeleteScheduleInModal(j.id!)}
                          >
                            Hapus
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Input Tambah Jadwal */}
              <div style={{ border: "1px dashed var(--border-color)", padding: "0.75rem", borderRadius: "6px", marginBottom: "1.25rem" }}>
                <div style={{ fontWeight: 600, fontSize: "0.875rem", marginBottom: "0.5rem" }}>
                  {editingOfferingId ? "+ Tambah Jadwal untuk Pilihan Ini" : "Jadwal Kuliah Awal (Opsional)"}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Hari</label>
                    <select
                      className="form-input"
                      value={newJadwalHari}
                      onChange={(e) => setNewJadwalHari(e.target.value)}
                    >
                      {["Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"].map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Ruang (Opsional)</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: R.204"
                      value={newJadwalRuang}
                      onChange={(e) => setNewJadwalRuang(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Jam Mulai</label>
                    <input
                      type="time"
                      className="form-input"
                      value={newJadwalMulai}
                      onChange={(e) => setNewJadwalMulai(e.target.value)}
                    />
                  </div>
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label" style={{ fontSize: "0.8rem" }}>Jam Selesai</label>
                    <input
                      type="time"
                      className="form-input"
                      value={newJadwalSelesai}
                      onChange={(e) => setNewJadwalSelesai(e.target.value)}
                    />
                  </div>
                </div>
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowOfferingModal(false)}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? "Menyimpan..." : "Simpan Pilihan"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
