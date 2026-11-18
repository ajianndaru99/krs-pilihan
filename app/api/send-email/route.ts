// app/api/send-email/route.ts
// Route Handler server-side untuk pengiriman email bukti KRS via Brevo
// PENTING: file ini hanya berjalan di server. BREVO_API_KEY tidak pernah sampai ke browser.

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { generateKrsEmailHtml, BuktiEmailData } from "@/lib/email-template";

// Konstanta
const RATE_LIMIT_MAX = 3;        // maksimal pengiriman per NIM
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // dalam 10 menit

// Rate limiter in-memory sederhana: { nim -> { count, firstRequestAt } }
const rateLimitMap = new Map<string, { count: number; firstAt: number }>();

function checkRateLimit(nim: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(nim);

  if (!entry || now - entry.firstAt > RATE_LIMIT_WINDOW_MS) {
    // Jendela waktu baru
    rateLimitMap.set(nim, { count: 1, firstAt: now });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // sudah melebihi batas
  }

  entry.count += 1;
  return true;
}

// Validasi format email dengan regex
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(req: NextRequest) {
  // 1. Parse body
  let nim: string;
  let emailTujuan: string;
  try {
    const body = (await req.json()) as { nim?: unknown; email_tujuan?: unknown };
    nim = typeof body.nim === "string" ? body.nim.trim() : "";
    emailTujuan = typeof body.email_tujuan === "string" ? body.email_tujuan.trim() : "";
  } catch {
    return NextResponse.json({ ok: false, error: "Format permintaan tidak valid." }, { status: 400 });
  }

  // 2. Validasi input
  if (!nim) {
    return NextResponse.json({ ok: false, error: "NIM wajib diisi." }, { status: 400 });
  }
  if (!emailTujuan || !isValidEmail(emailTujuan)) {
    return NextResponse.json({ ok: false, error: "Alamat email tidak valid." }, { status: 400 });
  }

  // 3. Cek rate limit
  if (!checkRateLimit(nim)) {
    return NextResponse.json(
      { ok: false, error: "Terlalu banyak permintaan. Coba lagi dalam beberapa menit." },
      { status: 429 }
    );
  }

  // 4. Ambil data resmi dari Supabase di sisi server (bukan dari klien)
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json({ ok: false, error: "Konfigurasi server tidak lengkap." }, { status: 500 });
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey);
  const { data: rpcData, error: rpcError } = await supabase.rpc("hasil_saya", {
    p_nim: nim,
    p_token: null,
  });

  if (rpcError) {
    return NextResponse.json(
      { ok: false, error: "Gagal mengambil data pendaftaran dari sistem." },
      { status: 500 }
    );
  }

  const res = rpcData as {
    ok?: boolean;
    error?: string;
    mahasiswa?: { nim: string; nama: string; kelas?: string };
    pendaftaran?: {
      waktu_daftar: string | null;
      pilihan: BuktiEmailData["pilihan"];
    };
  } | null;

  if (!res || res.ok === false) {
    return NextResponse.json(
      { ok: false, error: res?.error || "Mahasiswa belum memiliki pendaftaran yang tercatat." },
      { status: 404 }
    );
  }

  if (!res.mahasiswa || !res.pendaftaran) {
    return NextResponse.json({ ok: false, error: "Data pendaftaran tidak lengkap." }, { status: 500 });
  }

  // 5. Siapkan data email
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get("host")}`;
  const buktiUrl = `${appUrl}/bukti?nim=${encodeURIComponent(nim)}`;

  const emailData: BuktiEmailData = {
    nim: res.mahasiswa.nim,
    nama: res.mahasiswa.nama,
    kelas: res.mahasiswa.kelas,
    waktu_daftar: res.pendaftaran.waktu_daftar,
    pilihan: res.pendaftaran.pilihan,
    bukti_url: buktiUrl,
  };

  const htmlContent = generateKrsEmailHtml(emailData);

  // 6. Kirim via Brevo REST API (native fetch, nol dependensi tambahan)
  const brevoApiKey = process.env.BREVO_API_KEY;
  const fromAddress = process.env.EMAIL_FROM_ADDRESS ?? "faperta@instiperjogja.ac.id";
  const fromName = process.env.EMAIL_FROM_NAME ?? "Fakultas Pertanian INSTIPER";

  if (!brevoApiKey) {
    return NextResponse.json({ ok: false, error: "Konfigurasi email server belum siap." }, { status: 500 });
  }

  const brevoPayload = {
    sender: { email: fromAddress, name: fromName },
    to: [{ email: emailTujuan }],
    subject: `Bukti Pemilihan KRS — ${res.mahasiswa.nama} (${nim})`,
    htmlContent,
  };

  const brevoRes = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "api-key": brevoApiKey,
    },
    body: JSON.stringify(brevoPayload),
  });

  if (!brevoRes.ok) {
    const errText = await brevoRes.text().catch(() => "");
    console.error("[send-email] Brevo error:", brevoRes.status, errText);
    return NextResponse.json(
      { ok: false, error: "Pengiriman email gagal. Coba lagi sebentar lagi." },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true, email: emailTujuan });
}

// Hanya izinkan metode POST
export async function GET() {
  return NextResponse.json({ ok: false, error: "Method not allowed." }, { status: 405 });
}
