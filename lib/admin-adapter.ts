import {
  AdminSystemStatus,
  Offering,
  PendaftarStudentItem,
  AdminPengajuanItem,
} from "./types";

/**
 * Normalisasi data status sistem dari RPC admin_status.
 * Menangani format lama (total_registered) dan format baru (sudah_daftar).
 */
export function normalizeAdminStatus(raw: unknown): AdminSystemStatus | null {
  if (!raw || typeof raw !== "object") return null;
  const st = raw as Partial<AdminSystemStatus> & { ok?: boolean; error?: string };
  if (st.ok === false) return null;

  const sudahDaftar = st.sudah_daftar ?? st.total_registered ?? 0;
  return {
    portal_open: Boolean(st.portal_open),
    need_matkul: st.need_matkul ?? 3,
    need_proyek: st.need_proyek ?? 1,
    session_duration_minutes: st.session_duration_minutes ?? 5,
    max_active: st.max_active ?? 30,
    max_requeue: st.max_requeue ?? 2,
    total_students: st.total_students ?? 0,
    sudah_daftar: sudahDaftar,
    active_queue: st.active_queue ?? 0,
    waiting_queue: st.waiting_queue ?? 0,
    total_registered: st.total_registered ?? sudahDaftar,
    offerings_without_schedule: st.offerings_without_schedule,
    classes_without_schedule: st.classes_without_schedule,
  };
}

/**
 * Parsing hasil RPC admin_list_offerings.
 * Mendukung format array langsung maupun pembungkus { ok: true, offerings: [...] }.
 */
export function parseOfferingsData(raw: unknown): Offering[] {
  if (Array.isArray(raw)) {
    return raw as Offering[];
  }
  if (raw && typeof raw === "object") {
    const res = raw as { ok?: boolean; offerings?: Offering[] };
    if (res.ok && Array.isArray(res.offerings)) {
      return res.offerings;
    }
  }
  return [];
}

/**
 * Parsing hasil RPC admin_list_pendaftar.
 * Mendukung array langsung maupun pembungkus { ok: true, pendaftar: [...] }.
 */
export function parsePendaftarData(raw: unknown): PendaftarStudentItem[] {
  if (Array.isArray(raw)) {
    return raw as PendaftarStudentItem[];
  }
  if (raw && typeof raw === "object") {
    const res = raw as { ok?: boolean; pendaftar?: PendaftarStudentItem[] };
    if (res.ok && Array.isArray(res.pendaftar)) {
      return res.pendaftar;
    }
  }
  return [];
}

/**
 * Konversi baris pendaftaran tabular (dari admin_export_pendaftaran)
 * ke dalam struktur PendaftarStudentItem per NIM jika list pendaftar kosong.
 */
export function parseExportFallbackPendaftar(raw: unknown): PendaftarStudentItem[] {
  let rows: Record<string, unknown>[] = [];
  if (Array.isArray(raw)) {
    rows = raw as Record<string, unknown>[];
  } else if (raw && typeof raw === "object") {
    const res = raw as { ok?: boolean; data?: Record<string, unknown>[] };
    if (Array.isArray(res.data)) {
      rows = res.data;
    }
  }

  if (rows.length === 0) return [];

  const map = new Map<string, PendaftarStudentItem>();
  for (const r of rows) {
    const nim = String(r.nim || r.NIM || "").trim();
    if (!nim) continue;

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
  }

  return Array.from(map.values());
}

/**
 * Parsing hasil RPC admin_list_pengajuan.
 */
export function parsePengajuanData(raw: unknown): AdminPengajuanItem[] {
  if (Array.isArray(raw)) {
    return raw as AdminPengajuanItem[];
  }
  if (raw && typeof raw === "object") {
    const res = raw as { ok?: boolean; pengajuan?: AdminPengajuanItem[] };
    if (res.ok && Array.isArray(res.pengajuan)) {
      return res.pengajuan;
    }
  }
  return [];
}

/**
 * Parsing hasil RPC daftar_kelas.
 */
export function parseKelasData(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map((k) => String(k).trim()).filter(Boolean);
  }
  return [];
}
