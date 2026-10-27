"use client";

import { useState } from "react";
import { Offering, OfferingSchedule } from "@/lib/types";

interface OfferingManagerProps {
  offerings: Offering[];
  onUpdateKuota: (offeringId: number, newKuota: number) => Promise<void>;
  onUpsertOffering: (
    id: number | null,
    nama: string,
    topik: string,
    jenis: "matkul" | "proyek",
    kuota: number
  ) => Promise<void>;
  onDeleteOffering: (id: number) => Promise<void>;
  onAddSchedule: (
    offeringId: number,
    hari: string,
    jamMulai: string,
    jamSelesai: string,
    ruang: string
  ) => Promise<void>;
  onDeleteSchedule: (scheduleId: number) => Promise<void>;
}

export function OfferingManager({
  offerings,
  onUpdateKuota,
  onUpsertOffering,
  onDeleteOffering,
  onAddSchedule,
  onDeleteSchedule,
}: OfferingManagerProps) {
  const [search, setSearch] = useState("");
  const [filterJenis, setFilterJenis] = useState<"all" | "matkul" | "proyek">("all");

  // Upsert Modal State
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [nama, setNama] = useState("");
  const [topik, setTopik] = useState("");
  const [jenis, setJenis] = useState<"matkul" | "proyek">("matkul");
  const [kuota, setKuota] = useState(30);

  // Quick Kuota Modal State
  const [kuotaModalItem, setKuotaModalItem] = useState<Offering | null>(null);
  const [newKuotaInput, setNewKuotaInput] = useState<number>(30);
  const [savingKuota, setSavingKuota] = useState(false);

  // Delete Offering Modal State
  const [offeringToDelete, setOfferingToDelete] = useState<Offering | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Schedule Modal
  const [activeOfferingForSchedule, setActiveOfferingForSchedule] = useState<Offering | null>(null);
  const [schedHari, setSchedHari] = useState("Senin");
  const [schedMulai, setSchedMulai] = useState("08:00");
  const [schedSelesai, setSchedSelesai] = useState("09:40");
  const [schedRuang, setSchedRuang] = useState("");
  const [savingSchedule, setSavingSchedule] = useState(false);

  const filtered = offerings.filter((o) => {
    const matchSearch =
      o.nama.toLowerCase().includes(search.toLowerCase()) ||
      (o.kelas && o.kelas.toLowerCase().includes(search.toLowerCase()));
    const matchJenis = filterJenis === "all" || o.jenis === filterJenis;
    return matchSearch && matchJenis;
  });

  const handleOpenAdd = () => {
    setEditId(null);
    setNama("");
    setTopik("");
    setJenis("matkul");
    setKuota(30);
    setShowModal(true);
  };

  const handleOpenEdit = (o: Offering) => {
    setEditId(o.id);
    setNama(o.nama);
    setTopik(o.topik || "");
    setJenis(o.jenis);
    setKuota(o.kuota);
    setShowModal(true);
  };

  const handleSaveOffering = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!nama.trim()) return;
    await onUpsertOffering(editId, nama.trim(), topik.trim(), jenis, kuota);
    setShowModal(false);
  };

  const handleSaveQuickKuota = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!kuotaModalItem || newKuotaInput <= 0) return;
    setSavingKuota(true);
    try {
      await onUpdateKuota(kuotaModalItem.id, newKuotaInput);
      setKuotaModalItem(null);
    } finally {
      setSavingKuota(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!offeringToDelete) return;
    setDeleting(true);
    try {
      await onDeleteOffering(offeringToDelete.id);
      setOfferingToDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const handleAddScheduleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeOfferingForSchedule) return;
    setSavingSchedule(true);
    try {
      await onAddSchedule(
        activeOfferingForSchedule.id,
        schedHari,
        schedMulai,
        schedSelesai,
        schedRuang.trim()
      );
      setSchedRuang("");
      setActiveOfferingForSchedule(null);
    } finally {
      setSavingSchedule(false);
    }
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "1rem",
          flexWrap: "wrap",
          marginBottom: "1.25rem",
        }}
      >
        <div style={{ display: "flex", gap: "0.75rem", flex: 1, minWidth: 260 }}>
          <input
            type="text"
            className="form-control"
            placeholder="Cari mata kuliah atau kelas (A-E)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="form-control"
            style={{ width: 140 }}
            value={filterJenis}
            onChange={(e) => setFilterJenis(e.target.value as "all" | "matkul" | "proyek")}
          >
            <option value="all">Semua Jenis</option>
            <option value="matkul">Mata Kuliah</option>
            <option value="proyek">Proyek Terapan</option>
          </select>
        </div>

        <button type="button" className="btn btn-primary" onClick={handleOpenAdd}>
          + Tambah Pilihan Baru
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "1rem" }}>
        {filtered.map((item) => (
          <div
            key={item.id}
            className="card"
            style={{
              padding: "1.25rem",
              borderRadius: "var(--radius-md)",
              display: "flex",
              flexDirection: "column",
              justifyContent: "space-between",
            }}
          >
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "0.5rem" }}>
                <span
                  style={{
                    fontSize: "0.75rem",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 8px",
                    borderRadius: "var(--radius-full)",
                    backgroundColor: item.jenis === "matkul" ? "#e0f2fe" : "#fef3c7",
                    color: item.jenis === "matkul" ? "#0369a1" : "#b45309",
                  }}
                >
                  {item.jenis === "matkul" ? "Mata Kuliah" : "Proyek"}
                </span>

                <span style={{ fontSize: "0.85rem", fontWeight: 700 }}>
                  Terisi: {item.terisi} / {item.kuota}
                </span>
              </div>

              <h3 style={{ fontSize: "1.05rem", fontWeight: 700, color: "var(--text-body)", marginBottom: "0.25rem" }}>
                {item.nama}
              </h3>
              <div style={{ fontSize: "0.85rem", color: "var(--text-body)", marginBottom: "0.75rem" }}>
                Kelas:{" "}
                <span
                  style={{
                    fontWeight: 800,
                    padding: "2px 8px",
                    backgroundColor: "#f1f5f9",
                    borderRadius: "var(--radius-sm)",
                    color: "var(--primary)",
                  }}
                >
                  {item.kelas || (item.jenis === "proyek" ? "Semua" : "A")}
                </span>
              </div>

              {/* Jadwal Terplot */}
              <div
                style={{
                  backgroundColor: "var(--bg-subtle)",
                  padding: "0.5rem 0.75rem",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.8rem",
                  marginBottom: "1rem",
                }}
              >
                <div style={{ fontWeight: 600, color: "var(--text-muted)", marginBottom: "0.25rem" }}>
                  Jadwal Terplot:
                </div>
                {item.jadwal && item.jadwal.length > 0 ? (
                  item.jadwal.map((j: OfferingSchedule, idx: number) => (
                    <div
                      key={j.id ?? `${item.id}-${j.hari}-${j.jam_mulai}-${idx}`}
                      style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "2px" }}
                    >
                      <span>
                        • {j.hari}, {j.jam_mulai} - {j.jam_selesai} {j.ruang ? `(${j.ruang})` : ""}
                      </span>
                      {j.id && (
                        <button
                          type="button"
                          onClick={() => onDeleteSchedule(j.id!)}
                          style={{
                            background: "none",
                            border: "none",
                            color: "var(--danger)",
                            cursor: "pointer",
                            fontSize: "0.75rem",
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  ))
                ) : (
                  <span style={{ color: "var(--text-light)" }}>Belum ada jadwal</span>
                )}
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: "0.35rem",
                borderTop: "1px solid var(--border-color)",
                paddingTop: "0.75rem",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.45rem 0.2rem", fontSize: "0.78rem", textAlign: "center" }}
                onClick={() => setActiveOfferingForSchedule(item)}
              >
                + Jadwal
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.45rem 0.2rem", fontSize: "0.78rem", textAlign: "center" }}
                onClick={() => {
                  setKuotaModalItem(item);
                  setNewKuotaInput(item.kuota);
                }}
              >
                Kuota
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: "0.45rem 0.2rem", fontSize: "0.78rem", textAlign: "center" }}
                onClick={() => handleOpenEdit(item)}
              >
                Ubah
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                style={{
                  padding: "0.45rem 0.2rem",
                  fontSize: "0.78rem",
                  textAlign: "center",
                  color: "var(--danger)",
                  borderColor: "#fecaca",
                }}
                onClick={() => setOfferingToDelete(item)}
              >
                Hapus
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Modal Quick Edit Kuota */}
      {kuotaModalItem && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 400, padding: "1.75rem", backgroundColor: "#fff" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.35rem" }}>
              Ubah Kuota Kursi
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              {kuotaModalItem.nama} (Terisi saat ini: {kuotaModalItem.terisi})
            </p>

            <form onSubmit={handleSaveQuickKuota}>
              <div className="form-group">
                <label className="form-label">Kapasitas Kuota Baru</label>
                <input
                  type="number"
                  className="form-control"
                  min={1}
                  value={newKuotaInput}
                  onChange={(e) => setNewKuotaInput(parseInt(e.target.value, 10) || 1)}
                  autoFocus
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setKuotaModalItem(null)}
                  disabled={savingKuota}
                >
                  Batal
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingKuota}>
                  {savingKuota ? "Menyimpan..." : "Simpan Kuota"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Confirm Delete Offering */}
      {offeringToDelete && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 440, padding: "1.75rem", backgroundColor: "#fff" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--danger)", marginBottom: "0.5rem" }}>
              Hapus Pilihan
            </h3>
            <p style={{ fontSize: "0.9rem", color: "var(--text-main)", marginBottom: "1.25rem" }}>
              Apakah Anda yakin ingin menghapus <strong>{offeringToDelete.nama}</strong> beserta seluruh jadwal
              perkuliahannya?
            </p>

            <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem" }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setOfferingToDelete(null)}
                disabled={deleting}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
                disabled={deleting}
              >
                {deleting ? "Menghapus..." : "Ya, Hapus Pilihan"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Upsert Offering */}
      {showModal && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 480, padding: "1.75rem", backgroundColor: "#fff" }}>
            <h3 style={{ fontSize: "1.15rem", fontWeight: 700, marginBottom: "1rem" }}>
              {editId ? "Ubah Mata Kuliah / Proyek" : "Tambah Pilihan Baru"}
            </h3>

            <form onSubmit={handleSaveOffering}>
              <div className="form-group">
                <label className="form-label">Nama Pilihan</label>
                <input
                  type="text"
                  className="form-control"
                  value={nama}
                  onChange={(e) => setNama(e.target.value)}
                  placeholder="Contoh: Bioteknologi Tanaman"
                  required
                />
              </div>

              <div className="form-group">
                <label className="form-label">Kelas (A - E / Semua)</label>
                <input
                  type="text"
                  className="form-control"
                  value={topik}
                  onChange={(e) => setTopik(e.target.value.toUpperCase())}
                  placeholder="Contoh: A, B, C, D, E, atau Semua"
                />
              </div>

              <div className="form-group">
                <label className="form-label">Jenis</label>
                <select
                  className="form-control"
                  value={jenis}
                  onChange={(e) => setJenis(e.target.value as "matkul" | "proyek")}
                >
                  <option value="matkul">Mata Kuliah</option>
                  <option value="proyek">Proyek Terapan</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Jumlah Kuota Kursi</label>
                <input
                  type="number"
                  className="form-control"
                  value={kuota}
                  min={1}
                  onChange={(e) => setKuota(parseInt(e.target.value, 10) || 1)}
                  required
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Add Schedule */}
      {activeOfferingForSchedule && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(15, 23, 42, 0.65)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 99999,
            padding: "1rem",
            animation: "fadeIn 0.15s ease-out",
          }}
        >
          <div className="card" style={{ width: "100%", maxWidth: 440, padding: "1.75rem", backgroundColor: "#fff" }}>
            <h3 style={{ fontSize: "1.1rem", fontWeight: 700, marginBottom: "0.25rem" }}>
              Tambah Jadwal Pertemuan
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "1rem" }}>
              {activeOfferingForSchedule.nama}
            </p>

            <form onSubmit={handleAddScheduleSubmit}>
              <div className="form-group">
                <label className="form-label">Hari</label>
                <select
                  className="form-control"
                  value={schedHari}
                  onChange={(e) => setSchedHari(e.target.value)}
                >
                  <option value="Senin">Senin</option>
                  <option value="Selasa">Selasa</option>
                  <option value="Rabu">Rabu</option>
                  <option value="Kamis">Kamis</option>
                  <option value="Jumat">Jumat</option>
                  <option value="Sabtu">Sabtu</option>
                </select>
              </div>

              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0.75rem" }}>
                <div className="form-group">
                  <label className="form-label">Jam Mulai</label>
                  <input
                    type="time"
                    className="form-control"
                    value={schedMulai}
                    onChange={(e) => setSchedMulai(e.target.value)}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Jam Selesai</label>
                  <input
                    type="time"
                    className="form-control"
                    value={schedSelesai}
                    onChange={(e) => setSchedSelesai(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="form-label">Ruang Kuliah (Opsional)</label>
                <input
                  type="text"
                  className="form-control"
                  placeholder="Contoh: R. Sidang 1"
                  value={schedRuang}
                  onChange={(e) => setSchedRuang(e.target.value)}
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.75rem", marginTop: "1.25rem" }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setActiveOfferingForSchedule(null)}
                  disabled={savingSchedule}
                >
                  Tutup
                </button>
                <button type="submit" className="btn btn-primary" disabled={savingSchedule}>
                  {savingSchedule ? "Menyimpan..." : "Simpan Jadwal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
