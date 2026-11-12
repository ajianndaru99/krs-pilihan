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

// Helper pembersih base name
function getBaseName(nama) {
  return nama.trim().replace(/(\s+|-|\/)+[A-Za-z]$/, "").toLowerCase();
}

// Simulasi alur lengkap satu mahasiswa dari Cek NIM hingga Daftar
async function runStudentFullFlow(student, waveStats) {
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

    // 2. Masuk Antrian (join_queue)
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
      await sleep(1000 + Math.floor(Math.random() * 500)); // Polling wajar 1-1.5 detik
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

    // 4. Ambil Daftar Mata Kuliah Real-time via list_offerings
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

    const livePilihan = listData.pilihan;

    // Filter penawaran yang masih memiliki sisa kuota (sisa > 0)
    const availMatkul = livePilihan.filter((o) => o.jenis === "matkul" && o.sisa > 0);
    const availProyek = livePilihan.filter((o) => o.jenis === "proyek" && o.sisa > 0);

    // Pilih 2 matkul yang beda nama dasar & 1 proyek jika ada
    const selectedIds = [];
    const usedBaseNames = new Set();

    // Pilih matkul 1
    for (let i = 0; i < availMatkul.length; i++) {
      const idx = (student.index * 7 + i) % availMatkul.length;
      const cand = availMatkul[idx];
      const base = getBaseName(cand.nama);
      if (!usedBaseNames.has(base)) {
        selectedIds.push(cand.id);
        usedBaseNames.add(base);
        break;
      }
    }

    // Pilih matkul 2
    for (let i = 0; i < availMatkul.length; i++) {
      const idx = (student.index * 13 + i) % availMatkul.length;
      const cand = availMatkul[idx];
      const base = getBaseName(cand.nama);
      if (!usedBaseNames.has(base)) {
        selectedIds.push(cand.id);
        usedBaseNames.add(base);
        if (selectedIds.length >= 2) break;
      }
    }

    // Pilih proyek 1
    if (availProyek.length > 0) {
      const pIdx = student.index % availProyek.length;
      selectedIds.push(availProyek[pIdx].id);
    }

    // Jika karena kuota menipis pilihan kurang dari 1, ambil yang mana saja yang masih sisa
    if (selectedIds.length === 0) {
      const remainingAny = livePilihan.filter((o) => o.sisa > 0);
      if (remainingAny.length > 0) {
        selectedIds.push(remainingAny[0].id);
      }
    }

    // Jeda berpikir mahasiswa realistis (100 - 300 ms)
    await sleep(100 + Math.floor(Math.random() * 200));

    // 5. Submit Pendaftaran (daftar)
    const tDaftar = Date.now();
    const { data: regData, error: regErr } = await supabase.rpc("daftar", {
      p_nim: nim,
      p_token: token,
      p_offering_ids: selectedIds,
    });
    waveStats.latencies.daftar.push(Date.now() - tDaftar);

    if (regErr || !regData?.ok) {
      waveStats.errors.push(`[${nim}] Daftar gagal: ${regErr?.message || regData?.error}`);
      return false;
    }

    waveStats.successCount++;
    waveStats.totalDurationMs.push(Date.now() - t0);
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
  console.log("🔥 PENGUJIAN BEBAN BERTINGKAT: 50 ANAK, 100 ANAK, S.D. 420 MAHASISWA (14 KELAS)");
  console.log("==============================================================================");

  // Skenario Gelombang (Total 420 Mahasiswa)
  // Gelombang 1: 50 mhs (NIM 2410211001 - 2410211050)
  // Gelombang 2: 100 mhs (NIM 2410211051 - 2410211150)
  // Gelombang 3: 100 mhs (NIM 2410211151 - 2410211250)
  // Gelombang 4: 170 mhs (NIM 2410211251 - 2410211420)
  const WAVES = [
    { name: "Gelombang 1 (50 Anak Serentak)", count: 50, startIdx: 1 },
    { name: "Gelombang 2 (100 Anak Serentak)", count: 100, startIdx: 51 },
    { name: "Gelombang 3 (100 Anak Serentak)", count: 100, startIdx: 151 },
    { name: "Gelombang 4 (170 Anak Serentak - Habiskan Seluruh Data)", count: 170, startIdx: 251 },
  ];

  let cumulativeSuccess = 0;
  let cumulativeAlreadyRegistered = 0;
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

    // Luncurkan seluruh mahasiswa dalam gelombang ini secara serentak
    const promises = waveStudents.map((std) => runStudentFullFlow(std, waveStats));
    await Promise.all(promises);

    const waveDurationSec = ((Date.now() - waveStart) / 1000).toFixed(2);
    cumulativeSuccess += waveStats.successCount;
    cumulativeAlreadyRegistered += waveStats.alreadyRegistered;

    // Cetak Metrik Gelombang
    const tDaftar = calculateMetrics(waveStats.latencies.daftar);
    const tFlow = calculateMetrics(waveStats.totalDurationMs);
    const totalProcessed = waveStats.successCount + waveStats.alreadyRegistered;

    console.log(`⏱️  Waktu Selesai Gelombang   : ${waveDurationSec} detik`);
    console.log(`👥 Mahasiswa Sukses Mendaftar : ${waveStats.successCount} orang (Sudah terdaftar sebelumnya: ${waveStats.alreadyRegistered} orang)`);
    console.log(`🚪 Langsung Masuk Ruang Aktif : ${waveStats.directActive} orang`);
    console.log(`⏳ Masuk Ruang Tunggu         : ${waveStats.waitingQueue} orang`);
    console.log(`⚡ Promosi Batch Berhasil     : ${waveStats.promoted} orang`);
    console.log(`📈 Kecepatan Pemrosesan       : ${(totalProcessed / Math.max(0.1, parseFloat(waveDurationSec))).toFixed(1)} mahasiswa/detik`);
    console.log(`⚡ Latensi RPC daftar()        : Min ${tDaftar.min}ms | Rata-rata ${tDaftar.avg}ms | P95 ${tDaftar.p95}ms | Max ${tDaftar.max}ms`);
    if (tFlow.avg > 0) {
      console.log(`🏁 Waktu Total Per Mahasiswa  : Rata-rata ${(tFlow.avg / 1000).toFixed(2)}s | P95 ${(tFlow.p95 / 1000).toFixed(2)}s\n`);
    } else {
      console.log(`🏁 Seluruhnya telah terdaftar sebelumnya.\n`);
    }

    if (waveStats.errors.length > 0) {
      console.warn(`⚠️  Pesan sistem (${waveStats.errors.length}):`, waveStats.errors.slice(0, 3));
    }

    // Beri jeda 1 detik antar gelombang
    if (w < WAVES.length - 1) {
      console.log(`💤 Pendinginan server 1.5 detik sebelum gelombang berikutnya...\n`);
      await sleep(1500);
    }
  }

  const grandTotalSec = ((Date.now() - overallStartTime) / 1000).toFixed(2);
  const totalAkhir = cumulativeSuccess + cumulativeAlreadyRegistered;

  console.log("==============================================================================");
  console.log("🏆 REKAPITULASI AKHIR PENGUJIAN BEBAN PENUH (420 MAHASISWA / 14 KELAS)");
  console.log("==============================================================================");
  console.log(`⏱️  Total Waktu Seluruh Gelombang : ${grandTotalSec} detik (~${(parseFloat(grandTotalSec) / 60).toFixed(1)} menit)`);
  console.log(`🎉 Total Mahasiswa Sukses         : ${totalAkhir} dari 420 mahasiswa`);
  console.log(`🚀 Rata-Rata Throughput Akhir     : ${(totalAkhir / parseFloat(grandTotalSec)).toFixed(1)} mahasiswa/detik`);
  console.log("==============================================================================");
}

main();
