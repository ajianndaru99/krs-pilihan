import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as fs from "fs";
import * as path from "path";

// Load .env.local
const envPath = path.resolve(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey || url.includes("placeholder")) {
  console.error("❌ NEXT_PUBLIC_SUPABASE_URL atau NEXT_PUBLIC_SUPABASE_ANON_KEY belum diisi di .env.local.");
  process.exit(1);
}

const supabase = createClient(url, anonKey);

async function runTestSuite() {
  console.log("==================================================================");
  console.log("       SUITE UJI DATABASE & KEAMANAN (KRS PILIHAN - T7 & T8)      ");
  console.log("==================================================================");
  console.log(`Target: ${url}\n`);

  let passed = 0;
  let failed = 0;

  async function assertTest(name, fn) {
    try {
      const result = await fn();
      if (result === true) {
        console.log(`✅ [LULUS] ${name}`);
        passed++;
      } else {
        console.log(`❌ [GAGAL] ${name}: ${result}`);
        failed++;
      }
    } catch (err) {
      console.log(`❌ [ERROR] ${name}: ${err.message}`);
      failed++;
    }
  }

  // --------------------------------------------------------------------------
  // 1. KEAMANAN RLS (Penolakan Akses Tabel Langsung oleh Role anon)
  // --------------------------------------------------------------------------
  console.log("--- 1. UJI KEAMANAN ROW LEVEL SECURITY (RLS) ---");

  await assertTest("RLS: Akses langsung ke tabel 'students' ditolak / kosong", async () => {
    const { data, error } = await supabase.from("students").select("*");
    return (error !== null || !data || data.length === 0) || "Data mahasiswa terbaca oleh publik anon!";
  });

  await assertTest("RLS: Akses langsung ke tabel 'queue' ditolak / kosong", async () => {
    const { data, error } = await supabase.from("queue").select("*");
    return (error !== null || !data || data.length === 0) || "Tabel antrian terbaca oleh publik anon!";
  });

  await assertTest("RLS: Akses langsung ke tabel 'registrations' ditolak / kosong", async () => {
    const { data, error } = await supabase.from("registrations").select("*");
    return (error !== null || !data || data.length === 0) || "Tabel pendaftaran terbaca oleh publik anon!";
  });

  await assertTest("RLS: Akses langsung ke tabel 'admins' ditolak / kosong", async () => {
    const { data, error } = await supabase.from("admins").select("*");
    return (error !== null || !data || data.length === 0) || "Tabel admins terbaca oleh publik anon!";
  });

  await assertTest("RLS: Akses langsung ke tabel 'settings' ditolak / kosong", async () => {
    const { data, error } = await supabase.from("settings").select("*");
    return (error !== null || !data || data.length === 0) || "Tabel settings terbaca oleh publik anon!";
  });

  // --------------------------------------------------------------------------
  // 2. KEAMANAN RPC ADMINISTRATOR (Ditolak untuk anon / non-admin)
  // --------------------------------------------------------------------------
  console.log("\n--- 2. UJI KEAMANAN RPC ADMINISTRATOR ---");

  await assertTest("Admin RPC: admin_status() ditolak untuk role anon", async () => {
    const { data, error } = await supabase.rpc("admin_status");
    if (error) return true;
    if (data && data.ok === false) return true;
    return `RPC admin_status berhasil dipanggil oleh anon: ${JSON.stringify(data)}`;
  });

  await assertTest("Admin RPC: admin_toggle_portal() ditolak untuk role anon", async () => {
    const { data, error } = await supabase.rpc("admin_toggle_portal", { p_buka: true });
    if (error) return true;
    if (data && data.ok === false) return true;
    return "RPC admin_toggle_portal berhasil dieksekusi oleh anon!";
  });

  await assertTest("Admin RPC: admin_upsert_offering() ditolak untuk role anon", async () => {
    const { data, error } = await supabase.rpc("admin_upsert_offering", {
      p_id: null,
      p_nama: "Matkul Ilegal",
      p_jenis: "matkul",
      p_topik: "Test",
      p_kuota: 10,
    });
    if (error) return true;
    if (data && data.ok === false) return true;
    return "RPC admin_upsert_offering berhasil dieksekusi oleh anon!";
  });

  await assertTest("Admin RPC: admin_delete_offering() ditolak untuk role anon", async () => {
    const { data, error } = await supabase.rpc("admin_delete_offering", { p_id: 999999 });
    if (error) return true;
    if (data && data.ok === false) return true;
    return "RPC admin_delete_offering berhasil dieksekusi oleh anon!";
  });

  await assertTest("Admin RPC: admin_list_pendaftar() ditolak untuk role anon", async () => {
    const { data, error } = await supabase.rpc("admin_list_pendaftar");
    if (error) return true;
    if (data && data.ok === false) return true;
    return "RPC admin_list_pendaftar berhasil dieksekusi oleh anon!";
  });

  await assertTest("Admin RPC: is_admin() ditolak / false untuk role anon", async () => {
    const { data, error } = await supabase.rpc("is_admin");
    if (error) return true;
    return data === false || "is_admin() menghasilkan true untuk role anon!";
  });

  await assertTest("Admin RPC: admin_reset_data_uji() ditolak untuk role anon", async () => {
    const { data, error } = await supabase.rpc("admin_reset_data_uji", {
      p_confirm_code: "RESET-DATA-UJI-SEKARANG",
    });
    if (error) return true;
    if (data && data.ok === false) return true;
    return "RPC admin_reset_data_uji berhasil dieksekusi oleh anon!";
  });

  // --------------------------------------------------------------------------
  // 3. ATURAN BISNIS MAHASISWA & PENDAFTARAN
  // --------------------------------------------------------------------------
  console.log("\n--- 3. UJI ATURAN BISNIS MAHASISWA & PENDAFTARAN ---");

  await assertTest("Bisnis: cek_nim() menolak NIM yang tidak terdaftar", async () => {
    const { data, error } = await supabase.rpc("cek_nim", { p_nim: "NIM_TIDAK_ADA_999999" });
    if (error) return `Error RPC: ${error.message}`;
    return data.ok === false || "NIM fiktif diloloskan oleh cek_nim!";
  });

  await assertTest("Bisnis: queue_status() menolak token kosong / palsu", async () => {
    const { data, error } = await supabase.rpc("queue_status", {
      p_nim: "2110211002",
      p_token: "TOKEN_PALSU_XYZ_123456",
    });
    if (error) return true;
    return data.ok === false || "Token palsu diloloskan oleh queue_status!";
  });

  let activeTestToken = "";
  await assertTest("Bisnis: join_queue() menghasilkan token aktif untuk mahasiswa valid", async () => {
    const { data, error } = await supabase.rpc("join_queue", {
      p_nim: "2110211002",
      p_pin: "",
    });
    if (error) return `Error RPC: ${error.message}`;
    if (data?.ok && data.token) {
      activeTestToken = data.token;
      return true;
    }
    return `Gagal join queue: ${JSON.stringify(data)}`;
  });

  await assertTest("Bisnis: queue_status() merespons data valid untuk token aktif", async () => {
    if (!activeTestToken) return "Token aktif belum tersedia";
    const { data, error } = await supabase.rpc("queue_status", {
      p_nim: "2110211002",
      p_token: activeTestToken,
    });
    if (error) return `Error RPC: ${error.message}`;
    return data.ok === true && (data.state === "active" || data.state === "waiting") || `Respons tidak valid: ${JSON.stringify(data)}`;
  });

  await assertTest("Bisnis: daftar() menolak pendaftaran tanpa token / sesi valid", async () => {
    const { data, error } = await supabase.rpc("daftar", {
      p_nim: "2110211002",
      p_token: "TOKEN_TIDAK_VALID_BUKAN_AKTIF",
      p_offering_ids: [1, 3, 5, 35],
    });
    if (error) return true;
    return data.ok === false || "Pendaftaran tanpa sesi valid diloloskan!";
  });

  await assertTest("Bisnis: daftar() menolak jumlah pilihan tidak sesuai (misal: 2 pilihan)", async () => {
    const { data, error } = await supabase.rpc("daftar", {
      p_nim: "2110211002",
      p_token: activeTestToken || "TOKEN_SEMBARANG",
      p_offering_ids: [1, 3],
    });
    if (error) return true;
    return data.ok === false || "Pendaftaran dengan 2 pilihan diloloskan!";
  });

  await assertTest("Bisnis: daftar() menolak topik mata kuliah kembar", async () => {
    // Offering 1 & 2 sama-sama bertopik 'Bioteknologi'
    const { data, error } = await supabase.rpc("daftar", {
      p_nim: "2110211002",
      p_token: activeTestToken || "TOKEN_SEMBARANG",
      p_offering_ids: [1, 2, 5, 35],
    });
    if (error) return true;
    return data.ok === false || "Pendaftaran dengan topik kembar diloloskan!";
  });

  await assertTest("Bisnis: daftar() menolak pendaftaran dobel pada mahasiswa yang sudah terdaftar", async () => {
    const { data, error } = await supabase.rpc("daftar", {
      p_nim: "2110211001", // Sudah terdaftar di database
      p_token: "TOKEN_APAPUN",
      p_offering_ids: [1, 3, 5, 35],
    });
    if (error) return true;
    return data.ok === false || "Pendaftaran ganda pada NIM yang sudah terdaftar diloloskan!";
  });

  await assertTest("Bisnis: hasil_saya() menolak NIM tidak terdaftar", async () => {
    const { data, error } = await supabase.rpc("hasil_saya", {
      p_nim: "NIM_TIDAK_ADA_999999",
      p_token: "TOKEN",
    });
    if (error) return `Error RPC: ${error.message}`;
    return data.ok === false || "Bukti pendaftaran keluar untuk NIM fiktif!";
  });

  await assertTest("Bisnis: daftar_kelas() merespons array JSON yang aman", async () => {
    const { data, error } = await supabase.rpc("daftar_kelas");
    if (error) return `Error RPC: ${error.message}`;
    return Array.isArray(data) || "Hasil daftar_kelas bukan array!";
  });

  // --------------------------------------------------------------------------
  // 4. UJI KONKURENSI & BEBAN PARALEL (Promise.all)
  // --------------------------------------------------------------------------
  console.log("\n--- 4. UJI KONKURENSI & BEBAN PARALEL ---");

  await assertTest("Konkurensi: 5 pemanggilan daftar() simultan pada NIM yang sama menolak pendaftaran dobel", async () => {
    const targetNim = "2110211001";
    const calls = Array.from({ length: 5 }, (_, i) =>
      supabase.rpc("daftar", {
        p_nim: targetNim,
        p_token: `PARALLEL_TOKEN_${i}`,
        p_offering_ids: [1, 3, 5, 35],
      })
    );
    const results = await Promise.all(calls);
    const successes = results.filter((res) => res.data?.ok === true);
    if (successes.length > 1) {
      return `Pelanggaran atomisitas: ${successes.length} pendaftaran paralel berhasil untuk NIM yang sama!`;
    }
    const allProtected = results.every(
      (res) => res.error !== null || (res.data && res.data.ok === false)
    );
    return allProtected || "Terdapat respons pendaftaran dobel yang tidak ditolak!";
  });

  // --------------------------------------------------------------------------
  // KESIMPULAN
  // --------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(`HASIL: ${passed} LULUS, ${failed} GAGAL dari total ${passed + failed} skenario.`);
  console.log("==================================================================");

  if (failed > 0) {
    process.exit(1);
  } else {
    console.log("🎉 SEMUA PENGUJIAN KEAMANAN & DATABASE LULUS DENGAN SEMPURNA!");
    process.exit(0);
  }
}

runTestSuite();
