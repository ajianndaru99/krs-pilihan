import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://placeholder.supabase.co";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "placeholder-anon-key";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export interface RpcResponse<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
  [key: string]: unknown;
}

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
  topik: string;
  jenis: "matkul" | "proyek";
  kuota: number;
  terisi: number;
  sisa: number;
  bentrok?: boolean;
  jadwal: OfferingSchedule[];
}
