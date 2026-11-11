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

// 50 Mahasiswa Terdaftar (NIM 2110211001 - 2110211050)
const REGISTERED_STUDENTS = Array.from({ length: 50 }, (_, i) => ({
  nim: `2110211${String(i + 1).padStart(3, "0")}`,
  type: "registered",
  index: i + 1,
}));

// 20 Mahasiswa Tambahan / Jalur Akses (NIM 2110211051 - 2110211070)
const NEW_STUDENTS = Array.from({ length: 20 }, (_, i) => ({
  nim: `2110211${String(i + 51).padStart(3, "0")}`,
  nama: `Mahasiswa Uji ${i + 51}`,
  type: "new_request",
  index: i + 51,
}));

// Total 70 Mahasiswa Simultan
const ALL_STUDENTS = [...REGISTERED_STUDENTS, ...NEW_STUDENTS];

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
    if (student.type === "registered") {
      // 1. Cek NIM
      const t0 = Date.now();
      const { data: cekData, error: cekErr } = await supabase.rpc("cek_nim", { p_nim: nim });
      stats.latencies.cek_nim.push(Date.now() - t0);

      if (cekErr || !cekData?.ok) {
        stats.errors.push(`[${nim}] Cek NIM gagal: ${cekErr?.message || cekData?.error}`);
        return false;
      }

      // Jika sudah terdaftar, ambil bukti cetak (simulasi mahasiswa unduh bukti KRS)
      if (cekData.sudah_daftar || cekData.sudah_terdaftar) {
        stats.alreadyRegisteredCount++;
        const tHasil = Date.now();
        const { data: hasilData, error: hasilErr } = await supabase.rpc("hasil_saya", { p_nim: nim });
        stats.latencies.hasil_saya.push(Date.now() - tHasil);

        if (hasilErr || !hasilData?.ok) {
          stats.errors.push(`[${nim}] Ambil bukti KRS gagal: ${hasilErr?.message || hasilData?.error}`);
          return false;
        }
        stats.successCount++;
        stats.totalDurations.push(Date.now() - startTime);
        return true;
      }

      // 2. Jika belum, masuk antrian (Join Queue)
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

        if (pollCount > 60) {
          stats.errors.push(`[${nim}] Timeout menunggu antrian (>60 polling)`);
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

      if (validProyeks.length > 0 && selectedIds.length < 4) {
        selectedIds.push(validProyeks[0].id);
      }

      // 6. Submit Pendaftaran
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
    } else {
      // Jalur Mahasiswa Belum Terdaftar (Ajukan Akses)
      // 1. Cek NIM (harus ditolak karena belum terdaftar)
      const t0 = Date.now();
      const { data: cekData } = await supabase.rpc("cek_nim", { p_nim: nim });
      stats.latencies.cek_nim.push(Date.now() - t0);

      // 2. Mengajukan Akses NIM
      const tReq = Date.now();
      const { data: reqData, error: reqErr } = await supabase.rpc("ajukan_akses", {
        p_nim: nim,
        p_nama: student.nama,
        p_alasan: "NIM saya belum terdata saat pemilihan KRS",
        p_kontak: `0812${String(student.index).padStart(8, "0")}`,
        p_kelas: "AGR-A",
      });
      stats.latencies.ajukan_akses.push(Date.now() - tReq);

      if (reqErr || !reqData?.ok) {
        stats.errors.push(`[${nim}] Ajukan akses gagal: ${reqErr?.message || reqData?.error}`);
        return false;
      }

      stats.accessRequestCount++;
      stats.totalDurations.push(Date.now() - startTime);
      return true;
    }
  } catch (err) {
    stats.errors.push(`[${nim}] Exception unhandled: ${err.message}`);
    return false;
  }
}

async function main() {
  console.log("==================================================================");
  console.log("    SIMULASI BEBAN REALISTIK: 70 MAHASISWA SIMULTAN (KRS & AKSES)  ");
  console.log("==================================================================");
  console.log(`Target Supabase : ${url}`);
  console.log(`Total Pengguna  : 70 Mahasiswa Bersamaan (50 Mahasiswa KRS + 20 Pengajuan Akses)`);
  console.log(`Pola Akses      : Bersamaan & Bertahap`);
  console.log("------------------------------------------------------------------\n");

  const stats = {
    directActiveCount: 0,
    waitingQueueCount: 0,
    promotedToActiveCount: 0,
    successCount: 0,
    alreadyRegisteredCount: 0,
    accessRequestCount: 0,
    errors: [],
    totalDurations: [],
    latencies: {
      cek_nim: [],
      join_queue: [],
      queue_status: [],
      list_offerings: [],
      daftar: [],
      hasil_saya: [],
      ajukan_akses: [],
    },
  };

  const overallStart = Date.now();

  console.log("🚀 Meluncurkan 70 permintaan mahasiswa secara simultan...\n");

  // Jalankan 70 pengguna secara paralel
  const tasks = ALL_STUDENTS.map((st) => runStudentFlow(st, stats));
  await Promise.all(tasks);

  const overallDuration = (Date.now() - overallStart) / 1000;

  console.log("\n==================================================================");
  console.log("                 HASIL PENGUJIAN BEBAN 70 PENGGUNA                ");
  console.log("==================================================================");
  console.log(`Waktu Eksekusi Total        : ${overallDuration.toFixed(2)} detik`);
  console.log(`Total Mahasiswa Diuji       : ${ALL_STUDENTS.length}`);
  console.log(`Selesai Berhasil (Sukses)   : ${stats.successCount + stats.accessRequestCount} / ${ALL_STUDENTS.length}`);
  console.log(`- Mahasiswa KRS Selesai     : ${stats.successCount} (Termasuk ${stats.alreadyRegisteredCount} Unduh Bukti)`);
  console.log(`- Pengajuan Akses Tersimpan : ${stats.accessRequestCount} mahasiswa`);
  console.log(`Total Galat (Error)         : ${stats.errors.length}`);

  if (stats.errors.length > 0) {
    console.log("\nDaftar Galat yang Terjadi:");
    stats.errors.slice(0, 10).forEach((err) => console.log(`  ❌ ${err}`));
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
  console.log("                     RINGKASAN INTEGRITAS                         ");
  console.log("------------------------------------------------------------------");
  console.log(`Tingkat Keberhasilan: ${(((stats.successCount + stats.accessRequestCount) / ALL_STUDENTS.length) * 100).toFixed(1)}%`);
  console.log(`Rata-rata Durasi Per Pengguna: ${stats.totalDurations.length > 0 ? (stats.totalDurations.reduce((a,b)=>a+b,0) / stats.totalDurations.length).toFixed(0) : 0} ms`);
  console.log("==================================================================\n");
}

main();

