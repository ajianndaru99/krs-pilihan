// ==============================================================================
// HELPER PENJADWALAN PORTAL & COUNTDOWN (WIB / ASIA/JAKARTA)
// Sistem Pemilihan KRS Mata Kuliah Pilihan — FAPERTA INSTIPER Yogyakarta
// ==============================================================================

/**
 * Format string ISO ke format tanggal dan jam Indonesia (Zona Waktu WIB).
 * Contoh: "Kamis, 26 Nov 2026, 08:00 WIB"
 */
export function formatWIBDateTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      weekday: "long",
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB";
  } catch {
    return dateStr;
  }
}

/**
 * Format jam ringkas WIB.
 * Contoh: "08:00 WIB"
 */
export function formatWIBTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "-";
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return "-";

    return new Intl.DateTimeFormat("id-ID", {
      timeZone: "Asia/Jakarta",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(d) + " WIB";
  } catch {
    return dateStr;
  }
}

export interface CountdownParts {
  totalSeconds: number;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isExpired: boolean;
  formatted: string;
}

/**
 * Pecah sisa detik menjadi hari, jam, menit, detik dan teks terformat.
 */
export function formatCountdown(totalSeconds: number): CountdownParts {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds || 0));
  const isExpired = safeSeconds <= 0;

  const days = Math.floor(safeSeconds / 86400);
  const hours = Math.floor((safeSeconds % 86400) / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  const pad = (n: number) => String(n).padStart(2, "0");

  let formatted = `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
  if (days > 0) {
    formatted = `${days}h ${formatted}`;
  }

  return {
    totalSeconds: safeSeconds,
    days,
    hours,
    minutes,
    seconds,
    isExpired,
    formatted,
  };
}

/**
 * Konversi ISO UTC date string ke format value untuk <input type="datetime-local">
 * dalam perspektif waktu lokal WIB (+07:00).
 */
export function isoToWibInput(isoStr: string | null | undefined): string {
  if (!isoStr) return "";
  try {
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return "";

    // Dapatkan bagian-bagian tanggal dalam timezone Asia/Jakarta
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Jakarta",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

    const parts = formatter.formatToParts(d);
    const getPart = (type: string) => parts.find((p) => p.type === type)?.value || "00";

    const year = getPart("year");
    const month = getPart("month");
    const day = getPart("day");
    const hour = getPart("hour");
    const minute = getPart("minute");

    return `${year}-${month}-${day}T${hour}:${minute}`;
  } catch {
    return "";
  }
}

/**
 * Konversi nilai <input type="datetime-local"> (yang diinput admin dalam waktu WIB)
 * menjadi ISO string UTC (+07:00 offset).
 */
export function wibInputToIso(inputValue: string): string | null {
  if (!inputValue || !inputValue.trim()) return null;
  try {
    // Input format: "YYYY-MM-DDTHH:mm"
    // Buat representasi dengan offset WIB +07:00
    const clean = inputValue.trim();
    const withOffset = clean.length === 16 ? `${clean}:00+07:00` : `${clean}+07:00`;
    const d = new Date(withOffset);
    if (isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
