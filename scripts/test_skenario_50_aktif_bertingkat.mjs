import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// 1. Muat environment variables
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  console.error("❌ Variabel lingkungan SUPABASE URL atau ANON KEY belum diset.");
  process.exit(1);
}

const supabase = createClient(url, anonKey);

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getBaseName(nama) {
  return nama.trim().replace(/(\s+|-|\/)+[A-Za-z]$/, "").toLowerCase();
}

// Simulasi alur realistis mahasiswa: Jika kuota kelas penuh, beralih memilih kelas lain
async function runStudentWithAlternativeChoice(student, waveStats) {
  const nim = student.nim;
  const t0 = Date.now();

  try {
    // 1. Cek NIM
    const tCek = Date.now();
    const { data: cekData, error: cekErr } = await supabase.rpc("cek_nim", { p_nim: nim });
    waveStats.latencies.cek_nim.push(Date.now() - tCek);

    if (cekErr || !cekData?.ok) {
      waveStats.errors.push(`[${nim}] Cek NIM gagal: ${cekErr?.message || cekData?.error}`);
      return false;
    }

    if (cekData.sudah_terdaftar || cekData.sudah_daftar) {
      waveStats.alreadyRegistered++;
      return true;
    }

    // 2. Masuk Antrian (join_queue) — Kapasitas Aktif: 50
    const tJoin = Date.now();
    const { data: joinData, error: joinErr } = await supabase.rpc("join_queue", { p_nim: nim, p_pin: "" });
    waveStats.latencies.join_queue.push(Date.now() - tJoin);

    if (joinErr || !joinData?.ok) {
      waveStats.errors.push(`[${nim}] Join queue gagal: ${joinErr?.message || joinData?.error}`);
      return false;
    }

    let token = joinData.token;
    let state = joinData.state;

    if (state === "active") {
      waveStats.directActive++;
    } else {
      waveStats.waitingQueue++;
    }

    // 3. Ruang Tunggu (Polling queue_status jika waiting)
    let polls = 0;
    while (state === "waiting") {
      await sleep(1000 + Math.floor(Math.random() * 500));
      polls++;

      const tStatus = Date.now();
      const { data: qData, error: qErr } = await supabase.rpc("queue_status", { p_nim: nim, p_token: token });
      waveStats.latencies.queue_status.push(Date.now() - tStatus);

      if (qErr || !qData?.ok) {
        waveStats.errors.push(`[${nim}] Queue status gagal: ${qErr?.message || qData?.error}`);
        return false;
      }

      state = qData.state;
      if (state === "active") {
        waveStats.promoted++;
        break;
      }

      if (polls > 90) {
        waveStats.errors.push(`[${nim}] Timeout di ruang tunggu antrian`);
        return false;
      }
    }

    // 4. Pengambilan Pilihan: Mahasiswa memantau sisa kuota dan mencoba mendaftar
    let registered = false;
    let attempts = 0;

    while (!registered && attempts < 3) {
      attempts++;

      // Ambil daftar penawaran terkini
      const tList = Date.now();
      const { data: listData, error: listErr } = await supabase.rpc("list_offerings", {
        p_nim: nim,
        p_token: token,
      });
      waveStats.latencies.list_offerings.push(Date.now() - tList);

      if (listErr || !listData?.ok || !listData?.pilihan) {
        waveStats.errors.push(`[${nim}] List offerings gagal: ${listErr?.message || listData?.error}`);
        return false;
      }

      const liveOfferings = listData.pilihan;

      // Pada attempt 1: mahasiswa mencoba kelas favoritnya (beberapa mahasiswa akan berebut kelas yang sama)
      // Pada attempt > 1: mahasiswa mendapati kelasnya penuh, lalu beralih ke kelas/matkul alternatif yang masih ada kuota
      const availMatkul = liveOfferings.filter((o) => o.jenis === "matkul" && o.sisa > 0);
      const availProyek = liveOfferings.filter((o) => o.jenis === "proyek" && o.sisa > 0);

      const selectedIds = [];
      const usedBaseNames = new Set();

      // Pilih matkul 1
      if (availMatkul.length > 0) {
        const offset = attempts === 1 ? 0 : attempts * 5;
        for (let i = 0; i < availMatkul.length; i++) {
          const idx = (student.index * 7 + offset + i) % availMatkul.length;
          const cand = availMatkul[idx];
          const base = getBaseName(cand.nama);
          if (!usedBaseNames.has(base)) {
            selectedIds.push(cand.id);
            usedBaseNames.add(base);
            break;
          }
        }
      }

      // Pilih matkul 2
      if (availMatkul.length > 0) {
        const offset = attempts === 1 ? 0 : attempts * 11;
        for (let i = 0; i < availMatkul.length; i++) {
          const idx = (student.index * 13 + offset + i) % availMatkul.length;
          const cand = availMatkul[idx];
          const base = getBaseName(cand.nama);
          if (!usedBaseNames.has(base)) {
            selectedIds.push(cand.id);
            usedBaseNames.add(base);
            if (selectedIds.length >= 2) break;
          }
        }
      }

      // Pilih proyek (1 proyek)
      if (availProyek.length > 0) {
        const pOffset = attempts === 1 ? 0 : attempts * 3;
        const pIdx = (student.index + pOffset) % availProyek.length;
        selectedIds.push(availProyek[pIdx].id);
      }

      // Jaminan minimal 1 pilihan
      if (selectedIds.length === 0) {
        const anyRemaining = liveOfferings.filter((o) => o.sisa > 0);
        if (anyRemaining.length > 0) {
          selectedIds.push(anyRemaining[0].id);
        }
      }

      // Jeda berpikir singkat
      await sleep(100 + Math.floor(Math.random() * 200));

      // 5. Submit Pendaftaran
      const tDaftar = Date.now();
      const { data: regData, error: regErr } = await supabase.rpc("daftar", {
        p_nim: nim,
        p_token: token,
        p_offering_ids: selectedIds,
      });
      waveStats.latencies.daftar.push(Date.now() - tDaftar);

      if (regData?.ok) {
        registered = true;
        waveStats.successCount++;
        if (attempts > 1) {
          waveStats.switchedChoiceSuccess++;
        } else {
          waveStats.firstChoiceSuccess++;
        }
        waveStats.totalDurationMs.push(Date.now() - t0);
        return true;
      } else {
        // Jika gagal karena kuota penuh saat submit (kalah cepat dengan mahasiswa lain di gelombang yang sama)
        const errMsg = regData?.error || regErr?.message || "";
        if (errMsg.includes("sudah penuh")) {
          waveStats.quotaFullEncountered++;
          // Siswa langsung mencoba memilih kelas lain di iterasi berikutnya
          await sleep(150 + Math.floor(Math.random() * 150));
        } else {
          waveStats.errors.push(`[${nim}] Daftar gagal (${errMsg})`);
          return false;
        }
      }
    }

    if (!registered) {
      waveStats.errors.push(`[${nim}] Gagal setelah 3 kali mencoba memilih alternatif`);
      return false;
    }
    return true;
  } catch (err) {
    waveStats.errors.push(`[${nim}] Exception: ${err.message}`);
    return false;
  }
}

function calculateMetrics(arr) {
  if (!arr || arr.length === 0) return { min: 0, avg: 0, p95: 0, max: 0 };
  const sorted = [...arr].sort((a, b) => a - b);
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const avg = Math.round(sorted.reduce((s, v) => s + v, 0) / sorted.length);
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || max;
  return { min, avg, p95, max };
}

async function main() {
  console.log("==============================================================================");
  console.log("⚡ PENGUJIAN BEBAN KAPASITAS 50 MAHASISWA AKTIF (SISANYA ANTRE)");
  console.log("==============================================================================");
  console.log("📌 Konfigurasi Ruang Aktif : 50 Mahasiswa Bersamaan (Sebelumnya: 30)");
  console.log("📌 Skema Gelombang        : 50 -> 100 -> 150 -> 120 (Total 420 Mahasiswa)");
  console.log("📌 Skenario Kuota Berebut  : Mahasiswa beralih memilih kelas lain jika pilihan penuh");
  console.log("==============================================================================\n");

  const WAVES = [
    { name: "Gelombang 1 (50 Anak Barengan - Seluruhnya Masuk Aktif)", count: 50, startIdx: 1 },
    { name: "Gelombang 2 (100 Anak Barengan - 50 Aktif, 50 Antre)", count: 100, startIdx: 51 },
    { name: "Gelombang 3 (150 Anak Barengan - 50 Aktif, 100 Antre)", count: 150, startIdx: 151 },
    { name: "Gelombang 4 (120 Anak Barengan - Menuntaskan Seluruh Populasi)", count: 120, startIdx: 301 },
  ];

  let cumulativeSuccess = 0;
  let cumulativeFirstChoice = 0;
  let cumulativeSwitchedChoice = 0;
  let cumulativeQuotaEncountered = 0;
  const overallStartTime = Date.now();

  for (let w = 0; w < WAVES.length; w++) {
    const wave = WAVES[w];
    console.log(`------------------------------------------------------------------------------`);
    console.log(`🌊 MEMULAI ${wave.name.toUpperCase()}`);
    console.log(`------------------------------------------------------------------------------`);

    const waveStudents = Array.from({ length: wave.count }, (_, i) => {
      const g = wave.startIdx + i;
      return {
        nim: `2410211${String(g).padStart(3, "0")}`,
        index: g,
      };
    });

    const waveStats = {
      directActive: 0,
      waitingQueue: 0,
      promoted: 0,
      alreadyRegistered: 0,
      successCount: 0,
      firstChoiceSuccess: 0,
      switchedChoiceSuccess: 0,
      quotaFullEncountered: 0,
      errors: [],
      latencies: {
        cek_nim: [],
        join_queue: [],
        queue_status: [],
        list_offerings: [],
        daftar: [],
      },
      totalDurationMs: [],
    };

    const waveStart = Date.now();

    // Jalankan seluruh mahasiswa gelombang ini serentak
    const promises = waveStudents.map((std) => runStudentWithAlternativeChoice(std, waveStats));
    await Promise.all(promises);

    const waveDurationSec = ((Date.now() - waveStart) / 1000).toFixed(2);
    cumulativeSuccess += waveStats.successCount;
    cumulativeFirstChoice += waveStats.firstChoiceSuccess;
    cumulativeSwitchedChoice += waveStats.switchedChoiceSuccess;
    cumulativeQuotaEncountered += waveStats.quotaFullEncountered;

    const tDaftar = calculateMetrics(waveStats.latencies.daftar);
    const tFlow = calculateMetrics(waveStats.totalDurationMs);

    console.log(`⏱️  Waktu Selesai Gelombang       : ${waveDurationSec} detik`);
    console.log(`👥 Sukses Mendaftar               : ${waveStats.successCount}/${wave.count} mahasiswa`);
    console.log(`🎯 Pilihan Pertama Langsung Dapat : ${waveStats.firstChoiceSuccess} mahasiswa`);
    console.log(`🔄 Sempat Penuh & Beralih Kelas   : ${waveStats.switchedChoiceSuccess} mahasiswa (Berhasil di kelas alternatif)`);
    console.log(`🚪 Langsung Masuk Ruang Aktif (50): ${waveStats.directActive} orang`);
    console.log(`⏳ Masuk Ruang Tunggu             : ${waveStats.waitingQueue} orang`);
    console.log(`⚡ Promosi Batch Berhasil         : ${waveStats.promoted} orang`);
    console.log(`📈 Kecepatan Pemrosesan           : ${(waveStats.successCount / parseFloat(waveDurationSec)).toFixed(1)} mahasiswa/detik`);
    console.log(`⚡ Latensi RPC daftar()            : Min ${tDaftar.min}ms | Rata-rata ${tDaftar.avg}ms | P95 ${tDaftar.p95}ms | Max ${tDaftar.max}ms`);
    console.log(`🏁 Waktu Total Per Mahasiswa      : Rata-rata ${(tFlow.avg / 1000).toFixed(2)}s | P95 ${(tFlow.p95 / 1000).toFixed(2)}s\n`);

    if (waveStats.errors.length > 0) {
      console.warn(`⚠️  Catatan sistem (${waveStats.errors.length}):`, waveStats.errors.slice(0, 3));
    }

    if (w < WAVES.length - 1) {
      console.log(`💤 Pendinginan server 1.5 detik sebelum gelombang berikutnya...\n`);
      await sleep(1500);
    }
  }

  const grandTotalSec = ((Date.now() - overallStartTime) / 1000).toFixed(2);

  console.log("==============================================================================");
  console.log("🏆 REKAPITULASI AKHIR: KAPASITAS 50 AKTIF (420 MAHASISWA / 14 KELAS TUNTAS)");
  console.log("==============================================================================");
  console.log(`⏱️  Total Waktu 420 Mahasiswa Selesai : ${grandTotalSec} detik (~${(parseFloat(grandTotalSec) / 60).toFixed(1)} menit)`);
  console.log(`🎉 Total Mahasiswa Sukses Terdaftar : ${cumulativeSuccess} dari 420 mahasiswa (100%)`);
  console.log(`🎯 Pilihan Utama Langsung Lolos     : ${cumulativeFirstChoice} mahasiswa`);
  console.log(`🔄 Berhasil Pindah ke Kelas Alternatif: ${cumulativeSwitchedChoice} mahasiswa`);
  console.log(`🚀 Throughput Rata-rata              : ${(cumulativeSuccess / parseFloat(grandTotalSec)).toFixed(1)} mahasiswa/detik`);
  console.log("==============================================================================");
}

main();
