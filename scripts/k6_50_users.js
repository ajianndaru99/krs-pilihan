import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';

// Metrik Kustom K6
const failedRequests = new Rate('failed_requests');
const activeQueueCount = new Counter('queue_active_granted');
const waitingQueueCount = new Counter('queue_waiting_assigned');
const joinQueueDuration = new Trend('join_queue_duration_ms');
const cekNimDuration = new Trend('cek_nim_duration_ms');
const listOfferingsDuration = new Trend('list_offerings_duration_ms');

// Konfigurasi Target Supabase
const SUPABASE_URL = __ENV.SUPABASE_URL || 'https://vkoaezphrfojzkbpyfyw.supabase.co';
const SUPABASE_ANON_KEY = __ENV.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrb2FlenBocmZvanprYnB5Znl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTg2NDIsImV4cCI6MjEwNzU5NDY0Mn0.Ht2i5fsORSsJBdoJAONf-rQIJCNVCNsjgFhktisYUXw';

// 50 Pengguna Serentak (Spike ke 50 VU, bertahan 20 detik)
export const options = {
  scenarios: {
    serentak_50_user: {
      executor: 'constant-vus',
      vus: 50,
      duration: '20s',
    },
  },
  thresholds: {
    // 95% request harus di bawah 1 detik
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

const sampleNims = [
  '2110211001', '2110211002', '2110211003', '2110211004', '2110211005',
  '2110211006', '2110211007', '2110211008', '2110211009', '2110211010'
];

export default function run50UsersTest() {
  // Setiap VU mengambil NIM secara dinamis
  const studentNim = sampleNims[__VU % sampleNims.length];

  // 1. Cek NIM Mahasiswa
  const resCekNim = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/cek_nim`,
    JSON.stringify({ p_nim: studentNim }),
    { headers, tags: { name: 'rpc_cek_nim' } }
  );
  const cekNimOk = check(resCekNim, {
    'cek_nim 200': (r) => r.status === 200,
  });
  failedRequests.add(!cekNimOk);
  cekNimDuration.add(resCekNim.timings.duration);

  // 2. Ambil Jadwal Kelas Tetap
  const resJadwal = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/daftar_kelas`,
    '{}',
    { headers, tags: { name: 'rpc_daftar_kelas' } }
  );
  check(resJadwal, { 'daftar_kelas 200': (r) => r.status === 200 });

  // 3. Masuk Antrian (join_queue) bersamaan
  const resQueue = http.post(
    `${SUPABASE_URL}/rest/v1/rpc/join_queue`,
    JSON.stringify({ p_nim: studentNim, p_pin: '' }),
    { headers, tags: { name: 'rpc_join_queue' } }
  );
  const queueOk = check(resQueue, {
    'join_queue 200': (r) => r.status === 200,
  });
  failedRequests.add(!queueOk);
  joinQueueDuration.add(resQueue.timings.duration);

  const qData = resQueue.json();
  if (qData && qData.token) {
    if (qData.state === 'active') {
      activeQueueCount.add(1);
      // Jika aktif, langsung akses katalog mata kuliah pilihan
      const resOfferings = http.post(
        `${SUPABASE_URL}/rest/v1/rpc/list_offerings`,
        JSON.stringify({ p_nim: studentNim, p_token: qData.token }),
        { headers, tags: { name: 'rpc_list_offerings' } }
      );
      check(resOfferings, { 'list_offerings 200': (r) => r.status === 200 });
      listOfferingsDuration.add(resOfferings.timings.duration);
    } else if (qData.state === 'waiting') {
      waitingQueueCount.add(1);
      // Jika waiting, polling status antrian
      const resStatus = http.post(
        `${SUPABASE_URL}/rest/v1/rpc/queue_status`,
        JSON.stringify({ p_nim: studentNim, p_token: qData.token }),
        { headers, tags: { name: 'rpc_queue_status' } }
      );
      check(resStatus, { 'queue_status 200': (r) => r.status === 200 });
    }
  }

  // Jeda acak 1-2 detik antar iterasi pengguna
  sleep(1.0 + Math.random() * 1.0);
}
