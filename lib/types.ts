// ==============================================================================
// TIPE DATA UMUM (SHARED TYPES)
// ==============================================================================

export interface OfferingSchedule {
  id?: number;
  hari: string;
  jam_mulai: string;
  jam_selesai: string;
  ruang?: string;
}

export interface Offering {
  id: number;
  nama: string;
  kelas?: string;
  topik?: string;
  jenis: "matkul" | "proyek";
  kuota: number;
  terisi: number;
  sisa: number;
  bentrok?: boolean;
  bentrok_kelas?: boolean;
  jadwal: OfferingSchedule[];
}

export interface StudentInfo {
  nama?: string;
  nama_samar?: string;
  kelas?: string;
  butuh_pin?: boolean;
  sudah_terdaftar?: boolean;
  token?: string;
  pesan_admin?: string;
  status_kendala?: string;
  status_pengajuan?: string;
  alasan_kendala?: string;
  tipe_pesan?: string;
}

export interface ModalDetailItem {
  label: string;
  value: string;
  subValue?: string;
  schedule?: string;
}

export interface ModalActionLink {
  text: string;
  action: () => void;
  icon?: string;
}

export interface ModalDialogState {
  isOpen: boolean;
  type: "info" | "warning" | "danger" | "confirm";
  title: string;
  message: string;
  details?: ModalDetailItem[];
  actionLink?: ModalActionLink;
  onConfirm?: () => void;
  confirmText?: string;
  cancelText?: string;
}

export interface PendaftarOfferingItem {
  id: number;
  nama: string;
  jenis: string;
  kelas?: string;
  topik?: string;
}

export interface PendaftarStudentItem {
  nim: string;
  nama: string;
  kelas: string;
  registered_at?: string;
  pilihan: PendaftarOfferingItem[];
}

export interface AdminPengajuanItem {
  id: number;
  nim: string;
  nama: string;
  kelas: string;
  alasan: string;
  kontak: string;
  status: string;
  catatan_admin?: string;
  created_at: string;
  resolved_at?: string | null;
}

export interface AdminSystemStatus {
  portal_open: boolean;
  need_matkul: number;
  need_proyek: number;
  session_duration_minutes: number;
  max_active: number;
  max_requeue: number;
  total_students: number;
  sudah_daftar: number;
  active_queue: number;
  waiting_queue: number;
  total_registered?: number;
  offerings_without_schedule?: number;
  classes_without_schedule?: number;
}

export interface MasterStudentItem {
  nim: string;
  nama: string;
  kelas: string;
  registered_at: string | null;
  has_registered: boolean;
}

export interface StudentComplaintItem {
  id: number;
  nim: string;
  nama: string;
  kelas: string;
  kategori: string;
  alasan: string;
  kontak: string;
  status: "pending" | "resolved" | "rejected";
  catatan_admin?: string;
  created_at: string;
  resolved_at?: string;
}

export interface SystemLogItem {
  id: number;
  created_at: string;
  level: "info" | "success" | "warning" | "error";
  event_type: string;
  nim: string;
  nama: string;
  pesan: string;
  detail?: Record<string, unknown>;
}

export interface AdminAlertItem {
  id: number;
  created_at: string;
  level: "info" | "success" | "warning" | "error";
  event_type: string;
  nim: string;
  nama: string;
  pesan: string;
}

