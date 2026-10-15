// ==============================================================================
// LOGIKA MURNI: DETEKSI BENTROK JADWAL & PARSER WAKTU
// ==============================================================================

import type { Offering } from "./types";

/**
 * Normalisasi format jam ke HH:MM:SS
 */
export function normalizeTime(t: string): string {
  const clean = t.trim().replace(".", ":");
  const parts = clean.split(":");
  if (parts.length === 2) {
    const hh = parts[0].padStart(2, "0");
    const mm = parts[1].padStart(2, "0");
    return `${hh}:${mm}:00`;
  }
  if (parts.length === 3) {
    const hh = parts[0].padStart(2, "0");
    const mm = parts[1].padStart(2, "0");
    const ss = parts[2].padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  }
  return clean;
}

/**
 * Memeriksa apakah dua slot jadwal mengalami bentrok (hari sama dan jam beririsan)
 */
export function isTimeClash(
  j1: { hari: string; jam_mulai: string; jam_selesai: string },
  j2: { hari: string; jam_mulai: string; jam_selesai: string }
): boolean {
  if (j1.hari.trim().toLowerCase() !== j2.hari.trim().toLowerCase()) {
    return false;
  }
  const start1 = normalizeTime(j1.jam_mulai);
  const end1 = normalizeTime(j1.jam_selesai);
  const start2 = normalizeTime(j2.jam_mulai);
  const end2 = normalizeTime(j2.jam_selesai);

  return start1 < end2 && start2 < end1;
}

/**
 * Mencari bentrok antar pilihan terpilih
 */
export function findClashBetweenOfferings(
  target: Offering,
  selectedOfferings: Offering[]
): { hasClash: boolean; conflictWith?: string; detail?: string } {
  for (const sel of selectedOfferings) {
    if (sel.id === target.id) continue;
    for (const jTarget of target.jadwal) {
      for (const jSel of sel.jadwal) {
        if (isTimeClash(jTarget, jSel)) {
          return {
            hasClash: true,
            conflictWith: sel.nama,
            detail: `${jTarget.hari} (${jTarget.jam_mulai} - ${jTarget.jam_selesai}) beririsan dengan ${sel.nama} (${jSel.jam_mulai} - ${jSel.jam_selesai})`,
          };
        }
      }
    }
  }
  return { hasClash: false };
}

/**
 * Parsing rentang jam (misal: "07.30 - 08.50" atau "07:30-08:50")
 */
export function parseJamRange(rawJam: string): { jam_mulai: string; jam_selesai: string } | null {
  if (!rawJam || typeof rawJam !== "string") return null;
  const parts = rawJam.split(/[-–—]/);
  if (parts.length < 2) return null;

  const start = normalizeTime(parts[0]);
  const end = normalizeTime(parts[1]);
  if (!start || !end) return null;

  return { jam_mulai: start, jam_selesai: end };
}
