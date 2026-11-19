// app/api/admin-kirim-email/route.ts
// Route Handler server-side untuk kirim ulang email bukti secara batch oleh admin.
// Dipanggil dari panel "Pantau Email" di dashboard admin.
// BREVO_API_KEY tidak pernah sampai ke browser.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateKrsEmailHtml, BuktiEmailData } from "@/lib/email-template";

// Batas maksimal email per sekali klik tombol (hemat kuota Brevo gratis 300/hari)
const BATCH_MAX = 50;

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function buildAppUrl(req: NextRequest): string {
  if (process.env.NEXT_PUBLIC_APP_URL) {
    return process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  }
  const forwardedHost = req.headers.get("x-forwarded-host");
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL || process.env.VERCEL_URL;
  const hostHeader = req.headers.get("host");
  if (forwardedHost && !forwardedHost.includes("localhost")) return `https://${forwardedHost}`;
  if (vercelUrl) return `https://${vercelUrl}`;
  if (hostHeader && !hostHeader.includes("localhost")) return `https://${hostHeader}`;
  return "https://krs-pilihan.vercel.app";
}

export async function POST(req: NextRequest) {
  // 1. Verifikasi Authorization header (harus berisi Supabase access token admin)
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return NextResponse.json({ ok: false, error: "Akses ditolak." }, { status: 401 });
  }
  const accessToken = authHeader.slice(7);

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const brevoApiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "faperta@instiperjogja.ac.id";
  const fromName = process.env.EMAIL_FROM_NAME ?? "Fakultas Pertanian INSTIPER";

  if (!supabaseUrl || !supabaseAnonKey || !brevoApiKey) {
    return NextResponse.json({ ok: false, error: "Konfigurasi server tidak lengkap." }, { status: 500 });
  }

  // 2. Autentikasi: verifikasi token admin dengan Supabase Auth
  const supabaseAdmin = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ ok: false, error: "Sesi admin tidak valid." }, { status: 401 });
  }

  // 3. Cek apakah ada target_nim spesifik dari body request
  let targetNim: string | null = null;
  try {
    const body = await req.json();
    if (body && typeof body.target_nim === "string") {
      targetNim = body.target_nim.trim();
    }
  } catch {
    // Body kosong atau bukan JSON (normal saat klik tombol batch antrian)
  }

  let antrian: { nim: string; nama: string; email: string }[] = [];

  if (targetNim) {
    // Ambil data satu mahasiswa target via hasil_saya
    const { data: buktiData, error: buktiErr } = await supabaseAdmin.rpc("hasil_saya", {
      p_nim: targetNim,
      p_token: null,
    });
    const res = buktiData as {
      ok?: boolean;
      mahasiswa?: { nim: string; nama: string; email?: string };
    } | null;

    if (buktiErr || !res?.ok || !res.mahasiswa || !res.mahasiswa.email) {
      return NextResponse.json(
        { ok: false, error: "Data mahasiswa tidak ditemukan atau belum mengisi email." },
        { status: 404 }
      );
    }

    antrian = [{ nim: res.mahasiswa.nim, nama: res.mahasiswa.nama, email: res.mahasiswa.email }];
  } else {
    // Ambil antrian batch email belum terkirim (maks BATCH_MAX)
    const { data: antrianData, error: antrianError } = await supabaseAdmin.rpc(
      "admin_ambil_antrian_email",
      { p_batas: BATCH_MAX }
    );

    if (antrianError) {
      return NextResponse.json({ ok: false, error: "Gagal mengambil antrian email." }, { status: 500 });
    }

    const resAntrian = antrianData as { ok: boolean; antrian: { nim: string; nama: string; email: string }[] } | null;
    antrian = resAntrian?.antrian ?? [];

    if (antrian.length === 0) {
      return NextResponse.json({ ok: true, terkirim: 0, gagal: 0, pesan: "Tidak ada email dalam antrian." });
    }
  }

  // 4. Kirim satu per satu, catat hasil
  const appUrl = buildAppUrl(req);
  const logoUrl = "https://raw.githubusercontent.com/ajianndaru99/krs-pilihan/main/public/logo-instiper.png";

  let terkirim = 0;
  let gagal = 0;
  const gagalList: string[] = [];

  // Gunakan supabase anon untuk mengambil data pendaftaran (hasil_saya bisa diakses anon)
  const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

  for (const item of antrian) {
    if (!isValidEmail(item.email)) {
      gagal++;
      gagalList.push(`${item.nim}: email tidak valid`);
      continue;
    }

    // Ambil data pendaftaran lengkap
    const { data: buktiData, error: buktiError } = await supabaseAnon.rpc("hasil_saya", {
      p_nim: item.nim,
      p_token: null,
    });

    if (buktiError || !buktiData) {
      gagal++;
      gagalList.push(`${item.nim}: data pendaftaran tidak ditemukan`);
      continue;
    }

    const res = buktiData as {
      ok?: boolean;
      mahasiswa?: { nim: string; nama: string; kelas?: string };
      pendaftaran?: { waktu_daftar: string | null; pilihan: BuktiEmailData["pilihan"] };
    } | null;

    if (!res?.ok || !res.mahasiswa || !res.pendaftaran) {
      gagal++;
      gagalList.push(`${item.nim}: pendaftaran belum ada`);
      continue;
    }

    const emailData: BuktiEmailData = {
      nim: res.mahasiswa.nim,
      nama: res.mahasiswa.nama,
      kelas: res.mahasiswa.kelas,
      waktu_daftar: res.pendaftaran.waktu_daftar,
      pilihan: res.pendaftaran.pilihan,
      bukti_url: `${appUrl}/bukti?nim=${encodeURIComponent(item.nim)}`,
      logo_url: logoUrl,
    };

    const htmlContent = generateKrsEmailHtml(emailData);

    const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": brevoApiKey },
      body: JSON.stringify({
        sender: { email: fromAddress, name: fromName },
        to: [{ email: item.email }],
        subject: `Bukti Pemilihan KRS — ${res.mahasiswa.nama} (${item.nim})`,
        htmlContent,
      }),
    });

    if (brevoRes.ok) {
      // Tandai terkirim di DB
      try {
        await supabaseAdmin.rpc("admin_tandai_email_terkirim", { p_nim: item.nim });
      } catch {
        // Abaikan jika patch belum dieksekusi
      }
      terkirim++;
    } else {
      const status = brevoRes.status;
      gagal++;
      gagalList.push(`${item.nim}: Brevo HTTP ${status}`);
      // Jika 429 (rate limit) atau 402 (quota), hentikan sisa batch
      if (status === 429 || status === 402) {
        gagalList.push("... (sisa batch dihentikan: kuota Brevo habis hari ini)");
        break;
      }
    }
  }

  return NextResponse.json({
    ok: true,
    terkirim,
    gagal,
    total_antrian: antrian.length,
    sisa_antrian: antrian.length - terkirim,
    gagal_detail: gagalList.slice(0, 20),
  });
}

export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
