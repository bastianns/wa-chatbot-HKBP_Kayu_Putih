import { getDb } from './db.js';
import { logger } from './logger.js';

export class EventManager {
  constructor(dbInstance = null) {
    this._db = dbInstance;
  }

  get db() {
    return this._db || getDb();
  }

  set db(instance) {
    this._db = instance;
  }

  /**
   * Mengambil event yang sedang aktif
   */
  getEvent() {
    let row = this.db.prepare('SELECT * FROM events WHERE is_active = 1 ORDER BY id DESC LIMIT 1').get();

    if (!row) {
      // Fallback buat default event jika belum ada
      const now = new Date().toISOString();
      const insert = this.db.prepare(`
        INSERT INTO events (nama_acara, waktu_latihan, lokasi, tujuan, target_on_time, batas_waktu, is_closed, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
      `);
      const info = insert.run(
        'Latihan Paduan Suara Naposobulung',
        'Sabtu, 29 Agustus 2026 - Pukul 19:00 WIB',
        'Gereja HKBP Kayu Putih',
        'Pengisian Koor Kebaktian Minggu, 30 Agustus 2026 (Pukul 10:00 WIB)',
        '19:00 WIB',
        'Pukul 18:00 WIB',
        now,
        now
      );
      row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(info.lastInsertRowid);
    }

    return {
      id: row.id,
      namaAcara: row.nama_acara,
      waktuLatihan: row.waktu_latihan,
      lokasi: row.lokasi,
      tujuan: row.tujuan,
      targetOnTime: row.target_on_time,
      batasWaktu: row.batas_waktu,
      isClosed: Boolean(row.is_closed),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Mengambil event berdasarkan ID
   */
  getEventById(id) {
    const row = this.db.prepare('SELECT * FROM events WHERE id = ?').get(id);
    if (!row) return null;

    return {
      id: row.id,
      namaAcara: row.nama_acara,
      waktuLatihan: row.waktu_latihan,
      lokasi: row.lokasi,
      tujuan: row.tujuan,
      targetOnTime: row.target_on_time,
      batasWaktu: row.batas_waktu,
      isClosed: Boolean(row.is_closed),
      isActive: Boolean(row.is_active),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  /**
   * Mengambil riwayat semua event (untuk /riwayat)
   */
  getPastEvents(limit = 10) {
    const rows = this.db.prepare('SELECT * FROM events ORDER BY id DESC LIMIT ?').all(limit);
    return rows.map((r) => ({
      id: r.id,
      namaAcara: r.nama_acara,
      waktuLatihan: r.waktu_latihan,
      lokasi: r.lokasi,
      tujuan: r.tujuan,
      targetOnTime: r.target_on_time,
      batasWaktu: r.batas_waktu,
      isClosed: Boolean(r.is_closed),
      isActive: Boolean(r.is_active),
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));
  }

  /**
   * Memperbarui info event aktif saat ini
   */
  updateEvent({ namaAcara, waktuLatihan, lokasi, tujuan, targetOnTime, batasWaktu }) {
    const current = this.getEvent();
    const now = new Date().toISOString();

    const updatedNama = namaAcara ? namaAcara.trim() : current.namaAcara;
    const updatedWaktu = waktuLatihan ? waktuLatihan.trim() : current.waktuLatihan;
    const updatedLokasi = lokasi ? lokasi.trim() : current.lokasi;
    const updatedTujuan = tujuan ? tujuan.trim() : current.tujuan;
    const updatedTarget = targetOnTime ? targetOnTime.trim() : current.targetOnTime;
    const updatedBatas = batasWaktu ? batasWaktu.trim() : current.batasWaktu;

    this.db.prepare(`
      UPDATE events 
      SET nama_acara = ?, waktu_latihan = ?, lokasi = ?, tujuan = ?, target_on_time = ?, batas_waktu = ?, is_closed = 0, updated_at = ?
      WHERE id = ?
    `).run(updatedNama, updatedWaktu, updatedLokasi, updatedTujuan, updatedTarget, updatedBatas, now, current.id);

    logger.info('EVENT', `Event ID #${current.id} diperbarui: ${updatedNama}`);
    return this.getEvent();
  }

  /**
   * Memulai event baru tanpa menghapus riwayat event lama
   */
  startNewEvent({ namaAcara, waktuLatihan, lokasi, tujuan, targetOnTime, batasWaktu }) {
    const now = new Date().toISOString();

    const startTx = this.db.transaction(() => {
      // Nonaktifkan event yang lama
      this.db.prepare('UPDATE events SET is_active = 0, updated_at = ? WHERE is_active = 1').run(now);

      // Buat event baru
      const insert = this.db.prepare(`
        INSERT INTO events (nama_acara, waktu_latihan, lokasi, tujuan, target_on_time, batas_waktu, is_closed, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
      `);

      const result = insert.run(
        namaAcara || 'Latihan Paduan Suara Naposobulung',
        waktuLatihan || 'Pukul 19:00 WIB',
        lokasi || 'Gereja HKBP Kayu Putih',
        tujuan || 'Pelayanan Koor',
        targetOnTime || '19:00 WIB',
        batasWaktu || 'Pukul 18:00 WIB',
        now,
        now
      );

      return result.lastInsertRowid;
    });

    const newId = startTx();
    logger.info('EVENT', `Event baru dimulai (ID: #${newId}): ${namaAcara}`);
    return this.getEventById(newId);
  }

  /**
   * Mengatur status buka/tutup absensi
   */
  setClosed(isClosed) {
    const current = this.getEvent();
    const now = new Date().toISOString();
    this.db.prepare('UPDATE events SET is_closed = ?, updated_at = ? WHERE id = ?')
      .run(isClosed ? 1 : 0, now, current.id);

    logger.info('EVENT', `Status absensi event ID #${current.id} diubah ke: ${isClosed ? 'DITUTUP' : 'DIBUKA'}`);
    return this.getEvent();
  }

  /**
   * Format teks pengumuman siap share ke grup WhatsApp
   */
  getAnnouncementText(botNumber = '') {
    const ev = this.getEvent();
    const cleanNumber = botNumber.replace(/[^0-9]/g, '');
    const linkWa = cleanNumber ? `https://wa.me/${cleanNumber}?text=Absen` : 'Ketik *Absen* ke nomor bot ini';
    return (
      `📢 *PENGUMUMAN ${ev.namaAcara.toUpperCase()}*\n\n` +
      `🗓️ *Waktu:* ${ev.waktuLatihan}\n` +
      `📍 *Lokasi:* ${ev.lokasi}\n` +
      `🎯 *Tujuan:* ${ev.tujuan}\n` +
      `⏳ *Batas Pengisian:* ${ev.batasWaktu || 'Pukul 18:00 WIB'}\n\n` +
      `Rekan-rekan Naposo dimohon mengisi konfirmasi kehadiran dengan klik link di bawah ini:\n` +
      `👉 ${linkWa}\n\n` +
      `Terima kasih dan Tuhan memberkati! ✨`
    );
  }
}

export const eventManager = new EventManager();
