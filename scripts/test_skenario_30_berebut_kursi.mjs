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

// Target pengujian: Proyek Ketrampilan Biakan masal Mikrobia berguna A (ID 42, Kuota 25)
const TARGET_OFFERING_ID = 42;
const TARGET_OFFERING_NAME = "Proyek Ketrampilan Biakan masal Mikrobia berguna A";
const TARGET_KUOTA = 25;
const TOTAL_PEMINAT = 30; // 30 mahasiswa berebut 25 kursi

// Gunakan 30 mahasiswa unik (NIM 2410211001 - 2410211030 atau 2110211001 - 2110211030)
async function getAvailableNims() {
  const nims = [];
  // Cek awalan 2410211...
  for (let i = 1; i <= TOTAL_PEMINAT; i++) {
    const nim24 = `2410211${String(i).padStart(3, "0")}`;
    const { data } = await supabase.rpc("cek_nim", { p_nim: nim24 });
    if (data?.ok) {
      nims.push(nim24);
    }
  }

  if (nims.length === TOTAL_PEMINAT) return nims;

  // Fallback ke awalan 2110211...
  nims.length = 0;
  for (let i = 1; i <= TOTAL_PEMINAT; i++) {
    const nim21 = `2110211${String(i).padStart(3, "0")}`;
    const { data } = await supabase.rpc("cek_nim", { p_nim: nim21 });
    if (data?.ok) {
      nims.push(nim21);
    }
  }
  return nims;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log("==============================================================================");
  console.log("⚡ SKENARIO KHUSUS: 30 MAHASISWA BEREBUT 1 KELAS DENGAN KUOTA 25");
  console.log("==============================================================================");
  console.log(`📌 Mata Kuliah Target : ${TARGET_OFFERING_NAME} (ID: ${TARGET_OFFERING_ID})`);
  console.log(`📌 Kuota Tersedia     : ${TARGET_KUOTA} Kursi`);
  console.log(`📌 Jumlah Pendaftar   : ${TOTAL_PEMINAT} Mahasiswa Serentak`);
  console.log(`📌 Hasil Diharapkan   : Tepat 25 Mahasiswa SUKSES & Tepat 5 Mahasiswa DITOLAK`);
  console.log("==============================================================================\n");

  // 1. Ambil 30 NIM mahasiswa
  console.log("🔍 Memeriksa ketersediaan 30 akun mahasiswa uji...");
  const nims = await getAvailableNims();
  if (nims.length < TOTAL_PEMINAT) {
    console.error(`❌ Data mahasiswa belum cukup di database (${nims.length}/${TOTAL_PEMINAT}).`);
    console.error("👉 Silakan jalankan skrip SQL 'supabase/run_siapkan_420_mahasiswa_14_kelas.sql' di SQL Editor.");
    process.exit(1);
  }
  console.log(`✅ Siap menguji dengan 30 mahasiswa: ${nims[0]} s/d ${nims[nims.length - 1]}\n`);

  // 2. Tahap Masuk Antrian (Semua harus berstatus 'active' sebelum perang submit dimulai)
  console.log("🚪 Tahap 1: Mahasiswa masuk sesi antrian (Ruang Aktif kapasitas 30)...");
  const sessions = [];

  for (const nim of nims) {
    const { data: joinData, error: joinErr } = await supabase.rpc("join_queue", { p_nim: nim, p_pin: "" });
    if (joinErr || !joinData?.ok) {
      console.error(`❌ Gagal masuk antrian untuk ${nim}:`, joinErr?.message || joinData?.error);
      process.exit(1);
    }
    sessions.push({
      nim,
      token: joinData.token,
      state: joinData.state,
    });
  }

  const activeSessions = sessions.filter((s) => s.state === "active");
  console.log(`✅ Seluruh ${activeSessions.length} mahasiswa berhasil mendapatkan slot 'active' di ruang pemilihan!\n`);

  // 3. Tahap PERANG SUBMIT SERENTAK (30 Mahasiswa memanggil daftar() di milidetik yang sama)
  console.log("🚀 Tahap 2: Menembakkan 30 permintaan pendaftaran SECARA PARALEL PENUH (WAR KURSIS)...");
  console.log("⏱️  Menyelaraskan clock eksekusi...");

  const results = [];
  const triggerTime = Date.now();

  const promises = sessions.map(async (sess, idx) => {
    const tStart = Date.now();
    const { data, error } = await supabase.rpc("daftar", {
      p_nim: sess.nim,
      p_token: sess.token,
      p_offering_ids: [TARGET_OFFERING_ID],
    });
    const tEnd = Date.now();

    results.push({
      idx: idx + 1,
      nim: sess.nim,
      latencyMs: tEnd - tStart,
      success: Boolean(data?.ok),
      errorMsg: data?.error || error?.message || null,
      data,
    });
  });

  await Promise.all(promises);
  const totalDuration = Date.now() - triggerTime;

  // 4. Analisis Hasil Perang Kuota
  console.log("\n==============================================================================");
  console.log("📊 HASIL RESMI EKSEKUSI 30 MAHASISWA BEREBUT 25 KURSI");
  console.log("==============================================================================");

  const sukses = results.filter((r) => r.success);
  const gagal = results.filter((r) => !r.success);

  console.log(`⏱️  Total Durasi Perang 30 Transaksi Paralel : ${totalDuration} ms`);
  console.log(`✅ Mahasiswa Berhasil Mendaftar            : ${sukses.length} orang (Target: 25)`);
  console.log(`🛑 Mahasiswa Ditolak (Mental Kuota Penuh)   : ${gagal.length} orang (Target: 5)\n`);

  console.log("📋 DAFTAR 5 MAHASISWA YANG DITOLAK & RESPON SISTEM:");
  console.log("------------------------------------------------------------------------------");
  gagal.forEach((g, i) => {
    console.log(`${i + 1}. NIM: ${g.nim} (Latensi: ${g.latencyMs} ms)`);
    console.log(`   Pesan Respons Sistem : "${g.errorMsg}"`);
  });
  console.log("------------------------------------------------------------------------------\n");

  // 5. Verifikasi Keadaan Basis Data Riil
  console.log("🔍 Tahap 3: Verifikasi Konsistensi Database via RPC...");
  const { data: pubData } = await supabase.rpc("jadwal_kuliah_publik");
  const targetOff = pubData?.offerings?.find((o) => o.id === TARGET_OFFERING_ID);

  console.log(`📌 Kuota Terpasang di Database : ${targetOff?.kuota} kursi`);
  console.log(`📌 Jumlah Sukses Tercatat       : ${sukses.length} registrasi`);

  let isVerified = true;
  if (sukses.length === 25 && gagal.length === 5) {
    console.log("\n🎉 VERIFIKASI MATEMATIKA: SEMPURNA (Tepat 25 Lolos, Tepat 5 Mental)!");
  } else {
    console.error(`\n⚠️  ANOMALI: Sukses ${sukses.length}, Gagal ${gagal.length}`);
    isVerified = false;
  }

  // Cek apakah ada kebocoran pesan galat
  const allRejectedGotProperMsg = gagal.every((g) => g.errorMsg && g.errorMsg.includes("sudah penuh"));
  if (allRejectedGotProperMsg) {
    console.log("✅ VERIFIKASI PESAN RESPON: 100% Mahasiswa yang mental menerima pesan kuota penuh yang jelas & ramah!");
  } else {
    console.warn("⚠️  Ada pesan respons yang tidak baku:", gagal.map((g) => g.errorMsg));
    isVerified = false;
  }

  console.log("\n==============================================================================");
  console.log(isVerified ? "🏆 KESIMPULAN: SISTEM KUAT, TIDAK BOCOR, ROW-LEVEL LOCKING PostgreSQL BEKERJA TEPAT!" : "❌ ADA CATATAN VERIFIKASI!");
  console.log("==============================================================================");
}

main();
