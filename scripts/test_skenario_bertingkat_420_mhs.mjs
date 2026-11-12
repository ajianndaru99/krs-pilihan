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

// Simulasi alur lengkap satu mahasiswa dari Cek NIM hingga Daftar
async function runStudentFullFlow(student, offeringsList, waveStats) {
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
        // Timeout 90 detik
        waveStats.errors.push(`[${nim}] Timeout di ruang tunggu antrian`);
        return false;
      }
    }

    // 4. Pilih Mata Kuliah secara Realistis (2-3 Matkul Pilihan + 0-1 Proyek)
    //    Terdistribusi merata berdasarkan indeks mahasiswa agar kursi tidak terpusat di satu matkul saja
    const matkulOfferings = offeringsList.filter((o) => o.jenis === "matkul");
    const proyekOfferings = offeringsList.filter((o) => o.jenis === "proyek");

    const mIndex1 = (student.index * 3) % matkulOfferings.length;
    const mIndex2 = (student.index * 3 + 7) % matkulOfferings.length;
    const pIndex = student.index % proyekOfferings.length;

    const selectedIds = [
      matkulOfferings[mIndex1].id,
      matkulOfferings[mIndex2].id,
      proyekOfferings[pIndex].id,
    ];

    // Filter unik jika ada id yang beririsan
    const uniqueIds = Array.from(new Set(selectedIds));

    // Jeda berpikir mahasiswa realistis (200 - 600 ms)
    await sleep(200 + Math.floor(Math.random() * 400));

    // 5. Submit Pendaftaran (daftar)
    const tDaftar = Date.now();
    const { data: regData, error: regErr } = await supabase.rpc("daftar", {
      p_nim: nim,
      p_token: token,
      p_offering_ids: uniqueIds,
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

  // Ambil daftar penawaran aktif
  const { data: pubData, error: pubErr } = await supabase.rpc("jadwal_kuliah_publik");
  if (pubErr || !pubData?.ok) {
    console.error("❌ Gagal mengambil data penawaran:", pubErr?.message);
    process.exit(1);
  }

  const offerings = pubData.offerings;
  console.log(`📌 Penawaran Terdeteksi: ${offerings.length} Pilihan (Total Kuota: ${offerings.reduce((s, o) => s + o.kuota, 0)} kursi)\n`);

  // Skenario Gelombang (Total 420 Mahasiswa)
  const WAVES = [
    { name: "Gelombang 1 (Pemanasan)", count: 50, startIdx: 1 },
    { name: "Gelombang 2 (Beban Sedang)", count: 100, startIdx: 51 },
    { name: "Gelombang 3 (Beban Penuh)", count: 100, startIdx: 151 },
    { name: "Gelombang 4 (Sisa Mahasiswa Hingga Tuntas)", count: 170, startIdx: 251 },
  ];

  let cumulativeSuccess = 0;
  const overallStartTime = Date.now();

  for (let w = 0; w < WAVES.length; w++) {
    const wave = WAVES[w];
    console.log(`------------------------------------------------------------------------------`);
    console.log(`🌊 MEMULAI ${wave.name.toUpperCase()} — ${wave.count} MAHASISWA SERENTAK`);
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
        daftar: [],
      },
      totalDurationMs: [],
    };

    const waveStart = Date.now();

    // Luncurkan seluruh mahasiswa dalam gelombang ini secara serentak
    const promises = waveStudents.map((std) => runStudentFullFlow(std, offerings, waveStats));
    await Promise.all(promises);

    const waveDurationSec = ((Date.now() - waveStart) / 1000).toFixed(2);
    cumulativeSuccess += waveStats.successCount;

    // Cetak Metrik Gelombang
    const tDaftar = calculateMetrics(waveStats.latencies.daftar);
    const tFlow = calculateMetrics(waveStats.totalDurationMs);

    console.log(`⏱️  Waktu Selesai Gelombang   : ${waveDurationSec} detik`);
    console.log(`👥 Sukses Mendaftar           : ${waveStats.successCount}/${wave.count} mahasiswa`);
    console.log(`🚪 Langsung Masuk Ruang Aktif : ${waveStats.directActive} orang`);
    console.log(`⏳ Masuk Ruang Tunggu         : ${waveStats.waitingQueue} orang`);
    console.log(`⚡ Promosi Batch Berhasil     : ${waveStats.promoted} orang`);
    console.log(`📈 Throughput Gelombang        : ${(waveStats.successCount / parseFloat(waveDurationSec)).toFixed(1)} mahasiswa/detik`);
    console.log(`⚡ Latensi RPC daftar()        : Min ${tDaftar.min}ms | Rata-rata ${tDaftar.avg}ms | P95 ${tDaftar.p95}ms | Max ${tDaftar.max}ms`);
    console.log(`🏁 Waktu Total Per Siswa      : Rata-rata ${(tFlow.avg / 1000).toFixed(2)}s | P95 ${(tFlow.p95 / 1000).toFixed(2)}s\n`);

    if (waveStats.errors.length > 0) {
      console.warn(`⚠️  Galat terdeteksi (${waveStats.errors.length}):`, waveStats.errors.slice(0, 3));
    }

    // Beri jeda 1 detik antar gelombang
    if (w < WAVES.length - 1) {
      console.log(`💤 Pendinginan server 1.5 detik sebelum gelombang berikutnya...\n`);
      await sleep(1500);
    }
  }

  const grandTotalSec = ((Date.now() - overallStartTime) / 1000).toFixed(2);

  console.log("==============================================================================");
  console.log("🏆 REKAPITULASI AKHIR PENGUJIAN BEBAN PENUH (420 MAHASISWA / 14 KELAS)");
  console.log("==============================================================================");
  console.log(`⏱️  Total Waktu Seluruh Gelombang : ${grandTotalSec} detik (~${(parseFloat(grandTotalSec) / 60).toFixed(1)} menit)`);
  console.log(`🎉 Total Mahasiswa Sukses         : ${cumulativeSuccess} dari 420 mahasiswa`);
  console.log(`🚀 Rata-Rata Throughput Akhir     : ${(cumulativeSuccess / parseFloat(grandTotalSec)).toFixed(1)} mahasiswa/detik`);
  console.log("==============================================================================");
}

main();
