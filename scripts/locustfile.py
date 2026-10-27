import os
import random
from locust import HttpUser, task, between

SUPABASE_ANON_KEY = os.getenv(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZrb2FlenBocmZvanprYnB5Znl3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTIwMTg2NDIsImV4cCI6MjEwNzU5NDY0Mn0.Ht2i5fsORSsJBdoJAONf-rQIJCNVCNsjgFhktisYUXw"
)

SAMPLE_NIMS = [
    "2110211001", "2110211002", "2110211003", "2110211004", "2110211005",
    "2110211006", "2110211007", "2110211008", "2110211009", "2110211010"
]

class StudentUser(HttpUser):
    # Jeda berpikir mahasiswa 1 - 2.5 detik
    wait_time = between(1.0, 2.5)

    def on_start(self):
        self.headers = {
            "Content-Type": "application/json",
            "apikey": SUPABASE_ANON_KEY,
            "Authorization": f"Bearer {SUPABASE_ANON_KEY}",
        }
        self.token = None
        self.nim = random.choice(SAMPLE_NIMS)

    @task(3)
    def check_student_nim(self):
        """Simulasi pengecekan NIM saat mahasiswa memasukkan form login"""
        with self.client.post(
            "/rest/v1/rpc/cek_nim",
            json={"p_nim": self.nim},
            headers=self.headers,
            name="/rpc/cek_nim",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"HTTP error {response.status_code}")

    @task(2)
    def load_schedule(self):
        """Simulasi memuat jadwal kuliah kelas tetap"""
        with self.client.post(
            "/rest/v1/rpc/daftar_kelas",
            json={},
            headers=self.headers,
            name="/rpc/daftar_kelas",
            catch_response=True
        ) as response:
            if response.status_code == 200:
                response.success()
            else:
                response.failure(f"Gagal memuat jadwal kelas: {response.status_code}")

    @task(2)
    def join_and_list_offerings(self):
        """Simulasi masuk antrian lalu memuat daftar mata kuliah"""
        with self.client.post(
            "/rest/v1/rpc/join_queue",
            json={"p_nim": self.nim, "p_pin": ""},
            headers=self.headers,
            name="/rpc/join_queue",
            catch_response=True
        ) as queue_res:
            if queue_res.status_code == 200:
                queue_data = queue_res.json()
                token = queue_data.get("token")
                if token:
                    self.token = token
                    # Jika ada token, langsung muat daftar mata kuliah
                    self.client.post(
                        "/rest/v1/rpc/list_offerings",
                        json={"p_nim": self.nim, "p_token": token},
                        headers=self.headers,
                        name="/rpc/list_offerings"
                    )
                queue_res.success()
            else:
                queue_res.failure(f"Gagal antrian: {queue_res.status_code}")
