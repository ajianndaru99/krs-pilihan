import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Metrik kustom
const failedRequests = new Rate('failed_requests');
const cekNimDuration = new Trend('cek_nim_duration_ms');
const offeringsDuration = new Trend('offerings_duration_ms');
const queueDuration = new Trend('queue_duration_ms');

// Konfigurasi target pengujian
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://vkoaezphrfojzkbpyfyw.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrb2FlenBocmZvanprYnB5Znl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTg2NDIsImV4cCI6MjEwNzU5NDY0Mn0.Ht2i5fsORSsJBdoJAONf-rQIJCNVCNsjgFhktisYUXw';

// Profil beban bertahap (Ramp up -> Peak 30 VU -> Ramp down)
export const options = {
  stages: [
    { duration: '5s', target: 15 },   // Pemanasan: naik ke 15 pengguna
    { duration: '15s', target: 30 },  // Beban puncak: 30 pengguna bersamaan
    { duration: '5s', target: 0 },    // Penurunan beban kembali ke 0
  ],
  thresholds: {
    // 95% request harus selesai di bawah 1 detik
    http_req_duration: ['p(95)<1000'],
    // Tingkat kegagalan request harus di bawah 2%
    failed_requests: ['rate<0.02'],
  },
};

const headers = {
  'Content-Type': 'application/json',
  'apikey': SUPABASE_ANON_KEY,
  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
};

// Kumpulan NIM dummy untuk simulasi pengujian
const sampleNims = [
  '2110211001', '2110211002', '2110211003', '2110211004', '2110211005',
  '2110211006', '2110211007', '2110211008', '2110211009', '2110211010'
];

export default function runLoadTest() {
  const randomNim = sampleNims[Math.floor(Math.random() * sampleNims.length)];

  // 1. Cek NIM Mahasiswa (Halaman Login Awal)
  const resCekNim = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/cek_nim`,
    JSON.stringify({ p_nim: randomNim }),
    { headers, tags: { name: 'rpc_cek_nim' } }
  );

  const cekNimOk = check(resCekNim, {
    'cek_nim: status 200': (r) => r.status === 200,
    'cek_nim: ok true': (r) => r.json() && r.json().ok === true,
  });
  failedRequests.add(!cekNimOk);
  cekNimDuration.add(resCekNim.timings.duration);

  sleep(0.3);

  // 2. Ambil Jadwal Kelas Tetap
  const resJadwal = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/daftar_kelas`,
    '{}',
    { headers, tags: { name: 'rpc_daftar_kelas' } }
  );
  const jadwalOk = check(resJadwal, {
    'daftar_kelas: status 200': (r) => r.status === 200,
  });
  failedRequests.add(!jadwalOk);

  sleep(0.3);

  // 3. Masuk Antrian (join_queue)
  const resQueue = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/join_queue`,
    JSON.stringify({ p_nim: randomNim, p_pin: '' }),
    { headers, tags: { name: 'rpc_join_queue' } }
  );
  
  const queueOk = check(resQueue, {
    'join_queue: status 200': (r) => r.status === 200,
  });
  failedRequests.add(!queueOk);
  queueDuration.add(resQueue.timings.duration);

  const queueJson = resQueue.json();
  if (queueJson && queueJson.token) {
    // 4. Jika mendapatkan token antrian, ambil daftar mata kuliah pilihan (list_offerings)
    const resOfferings = http.post(
      `${SUPABASE_URL}/rest/v1/rpc/list_offerings`,
      JSON.stringify({ p_nim: randomNim, p_token: queueJson.token }),
      { headers, tags: { name: 'rpc_list_offerings' } }
    );
    const offeringsOk = check(resOfferings, {
      'list_offerings: status 200': (r) => r.status === 200,
    });
    failedRequests.add(!offeringsOk);
    offeringsDuration.add(resOfferings.timings.duration);
  }

  // Jeda acak antar siklus tindakan (1-2 detik)
  sleep(1 + Math.random());
}
