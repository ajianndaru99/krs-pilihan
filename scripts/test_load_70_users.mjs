import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load environment variables
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey || url.includes("placeholder")) {
  console.error("❌ Variabel lingkungan NEXT_PUBLIC_SUPABASE_URL atau ANON KEY belum diset.");
  process.exit(1);
}

const supabase = createClient(url, anonKey);

// 70 Mahasiswa Unik (NIM 2110211001 - 2110211070)
const STUDENTS = Array.from({ length: 70 }, (_, i) => ({
  nim: `2110211${String(i + 1).padStart(3, "0")}`,
  index: i + 1,
}));

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function calculatePercentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

async function runStudentFlow(student, stats) {
  const startTime = Date.now();
  const nim = student.nim;

  try {
    // 1. Cek NIM
    const t0 = Date.now();
    const { data: cekData, error: cekErr } = await supabase.rpc("cek_nim", { p_nim: nim });
    stats.latencies.cek_nim.push(Date.now() - t0);

    if (cekErr || !cekData?.ok) {
      stats.errors.push(`[${nim}] Cek NIM gagal: ${cekErr?.message || cekData?.error}`);
      return false;
    }

    if (cekData.sudah_daftar || cekData.sudah_terdaftar) {
      stats.alreadyRegisteredCount++;
      return true;
    }

    // 2. Join Queue
    const t1 = Date.now();
    const { data: joinData, error: joinErr } = await supabase.rpc("join_queue", { p_nim: nim, p_pin: "" });
    stats.latencies.join_queue.push(Date.now() - t1);

    if (joinErr || !joinData?.ok) {
      stats.errors.push(`[${nim}] Join queue gagal: ${joinErr?.message || joinData?.error}`);
      return false;
    }

    let token = joinData.token;
    let state = joinData.state;

    if (state === "active") {
      stats.directActiveCount++;
    } else if (state === "waiting") {
      stats.waitingQueueCount++;
    }

    // 3. Menunggu giliran jika masuk antrian waiting
    let pollCount = 0;
    while (state === "waiting") {
      await sleep(1000 + Math.floor(Math.random() * 500));
      pollCount++;

      const t2 = Date.now();
      const { data: qStatus, error: qErr } = await supabase.rpc("queue_status", { p_nim: nim, p_token: token });
      stats.latencies.queue_status.push(Date.now() - t2);

      if (qErr || !qStatus?.ok) {
        stats.errors.push(`[${nim}] Polling queue_status gagal: ${qErr?.message || qStatus?.error}`);
        return false;
      }

      state = qStatus.state;
      if (state === "active") {
        stats.promotedToActiveCount++;
        break;
      }

      if (pollCount > 90) {
        stats.errors.push(`[${nim}] Timeout menunggu antrian (>90 polling)`);
        return false;
      }
    }

    // 4. Ambil Daftar Mata Kuliah
    const t3 = Date.now();
    const { data: offRes, error: offErr } = await supabase.rpc("list_offerings", { p_nim: nim, p_token: token });
    stats.latencies.list_offerings.push(Date.now() - t3);

    const offerings = offRes?.pilihan || (Array.isArray(offRes) ? offRes : []);
    if (offErr || !offRes?.ok || offerings.length === 0) {
      stats.errors.push(`[${nim}] Ambil offerings gagal: ${offErr?.message || offRes?.error || 'Pilihan kosong'}`);
      return false;
    }

    // 5. Pilih Matkul Bebas Bentrok
    const selectedIds = [];
    const chosenTopics = new Set();
    const chosenSchedules = [];

    const isConflict = (schedArr1, schedArr2) => {
      for (const s1 of schedArr1) {
        for (const s2 of schedArr2) {
          if (s1.hari && s2.hari && s1.hari.trim().toLowerCase() === s2.hari.trim().toLowerCase()) {
            if (s1.jam_mulai < s2.jam_selesai && s2.jam_mulai < s1.jam_selesai) {
              return true;
            }
          }
        }
      }
      return false;
    };

    const validMatkuls = offerings.filter((o) => o.jenis === "matkul" && o.terisi < o.kuota && !o.bentrok && !o.bentrok_kelas);
    const validProyeks = offerings.filter((o) => o.jenis === "proyek" && o.terisi < o.kuota && !o.bentrok && !o.bentrok_kelas);

    const getBaseCourseName = (o) => {
      const raw = o.nama ? o.nama.trim() : "";
      return raw.replace(/\s+[A-D]$/, "").trim() || raw;
    };

    for (const m of validMatkuls) {
      const topic = m.topik || getBaseCourseName(m);
      if (!chosenTopics.has(topic)) {
        const mSched = m.jadwal || [];
        if (!isConflict(mSched, chosenSchedules)) {
          selectedIds.push(m.id);
          chosenTopics.add(topic);
          chosenSchedules.push(...mSched);
          if (selectedIds.length === 3) break;
        }
      }
    }

    if (selectedIds.length === 0) {
      stats.errors.push(`[${nim}] Tidak dapat menemukan matkul pilihan bebas bentrok (terpilih: 0)`);
      return false;
    }

    // Tambahkan 1 proyek jika tersedia dan tidak bentrok
    if (validProyeks.length > 0 && selectedIds.length < 4) {
      selectedIds.push(validProyeks[0].id);
    }

    // 6. Submit Pendaftaran (jalur tulis transaksi utama)
    const t4 = Date.now();
    const { data: regData, error: regErr } = await supabase.rpc("daftar", {
      p_nim: nim,
      p_token: token,
      p_offering_ids: selectedIds,
    });
    stats.latencies.daftar.push(Date.now() - t4);

    if (regErr || !regData?.ok) {
      stats.errors.push(`[${nim}] Pendaftaran gagal: ${regErr?.message || regData?.error}`);
      return false;
    }

    // 7. Ambil Bukti Pendaftaran
    const t5 = Date.now();
    const { data: hasilData, error: hasilErr } = await supabase.rpc("hasil_saya", { p_nim: nim });
    stats.latencies.hasil_saya.push(Date.now() - t5);

    if (hasilErr || !hasilData?.ok) {
      stats.errors.push(`[${nim}] Ambil bukti pendaftaran gagal: ${hasilErr?.message || hasilData?.error}`);
      return false;
    }

    stats.successCount++;
    stats.totalDurations.push(Date.now() - startTime);
    return true;
  } catch (err) {
    stats.errors.push(`[${nim}] Exception unhandled: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("==================================================================");
  console.log("    SIMULASI BEBAN REALISTIK PENUH: 70 MAHASISWA JALUR TULIS     ");
  console.log("==================================================================");
  console.log(`Target Supabase : ${url}`);
  console.log(`Jumlah Pengguna : 70 Mahasiswa Unik (NIM 2110211001 - 2110211070)`);
  console.log(`Alur Pengujian  : Cek NIM -> Antrian (Slot 30 + Waiting 40) -> Daftar -> Bukti`);
  console.log("------------------------------------------------------------------\n");

  const stats = {
    directActiveCount: 0,
    waitingQueueCount: 0,
    promotedToActiveCount: 0,
    successCount: 0,
    alreadyRegisteredCount: 0,
    errors: [],
    totalDurations: [],
    latencies: {
      cek_nim: [],
      join_queue: [],
      queue_status: [],
      list_offerings: [],
      daftar: [],
      hasil_saya: [],
    },
  };

  const overallStart = Date.now();

  console.log("🚀 Meluncurkan 70 mahasiswa secara serentak ke dalam sistem...\n");

  // Luncurkan 70 mahasiswa serentak
  const tasks = STUDENTS.map((st) => runStudentFlow(st, stats));
  await Promise.all(tasks);

  const overallDuration = (Date.now() - overallStart) / 1000;

  console.log("\n==================================================================");
  console.log("                 HASIL PENGUJIAN BEBAN 70 MAHASISWA               ");
  console.log("==================================================================");
  console.log(`Waktu Eksekusi Total        : ${overallDuration.toFixed(2)} detik`);
  console.log(`Total Mahasiswa Diuji       : ${STUDENTS.length}`);
  console.log(`Pendaftaran Berhasil (ok)   : ${stats.successCount}`);
  console.log(`Sudah Terdaftar Sebelumnya  : ${stats.alreadyRegisteredCount}`);
  console.log(`Masuk Langsung Slot Aktif   : ${stats.directActiveCount} mahasiswa (Batas max_active: 30)`);
  console.log(`Masuk Antrian Waiting       : ${stats.waitingQueueCount} mahasiswa`);
  console.log(`Berhasil Dipromosikan       : ${stats.promotedToActiveCount} mahasiswa`);
  console.log(`Total Galat (Error)         : ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log("\nDaftar Galat yang Terjadi:");
    stats.errors.slice(0, 10).forEach((err) => console.log(`  ❌ ${err}`));
    if (stats.errors.length > 10) {
      console.log(`  ...dan ${stats.errors.length - 10} galat lainnya.`);
    }
  }

  console.log("\n------------------------------------------------------------------");
  console.log("                   STATISTIK LATENSI PER RPC (ms)                 ");
  console.log("------------------------------------------------------------------");
  console.log("RPC Endpoint         | Req Count | Avg (ms) | P50 (ms) | P95 (ms) | Max (ms)");
  console.log("---------------------|-----------|----------|----------|----------|---------");

  for (const [endpoint, latencies] of Object.entries(stats.latencies)) {
    if (latencies.length > 0) {
      const avg = Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length);
      const p50 = calculatePercentile(latencies, 50);
      const p95 = calculatePercentile(latencies, 95);
      const max = Math.max(...latencies);
      console.log(
        `${endpoint.padEnd(20)} | ${String(latencies.length).padStart(9)} | ${String(avg).padStart(8)} | ${String(p50).padStart(8)} | ${String(p95).padStart(8)} | ${String(max).padStart(7)}`
      );
    }
  }

  console.log("\n------------------------------------------------------------------");
  console.log("                 VERIFIKASI INTEGRITAS KRS PER PENGGUNA           ");
  console.log("------------------------------------------------------------------");

  let verifiedCount = 0;
  let invalidChoicesCount = 0;
  for (const st of STUDENTS) {
    const { data: bukti } = await supabase.rpc("hasil_saya", { p_nim: st.nim });
    if (bukti?.ok && bukti?.pendaftaran?.pilihan) {
      const choices = bukti.pendaftaran.pilihan;
      if (choices.length >= 1 && choices.length <= 4) {
        verifiedCount++;
      } else {
        invalidChoicesCount++;
      }
    }
  }

  console.log(`Mahasiswa Terverifikasi Bukti Sah : ${verifiedCount} / ${STUDENTS.length}`);
  if (invalidChoicesCount === 0) {
    console.log("✅ INTEGRITAS PILIHAN AMAN: Semua pendaftar memiliki 1 s/d 4 mata kuliah sah!");
  } else {
    console.log(`❌ PELANGGARAN ATURAN JUMLAH: ${invalidChoicesCount} mahasiswa memiliki jumlah pilihan tidak valid!`);
  }
  console.log("==================================================================\n");
}

main();
