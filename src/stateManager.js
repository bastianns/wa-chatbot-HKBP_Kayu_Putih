import { getDb } from './db.js';

export class StateManager {
  constructor(dbInstance = null, timeoutMinutes = 1440) { // 24 jam timeout
    this._db = dbInstance;
    this.timeoutMs = timeoutMinutes * 60 * 1000;
  }

  get db() {
    return this._db || getDb();
  }

  set db(instance) {
    this._db = instance;
  }

  /**
   * Mengambil session user atau membuat session baru jika belum ada / expired
   */
  getSession(userId, defaultName = '') {
    const now = Date.now();
    const row = this.db.prepare('SELECT * FROM sessions WHERE jid = ?').get(userId);

    if (row) {
      if (now - row.last_updated > this.timeoutMs) {
        // Session expired -> bersihkan
        this.clearSession(userId);
      } else {
        try {
          const parsedData = JSON.parse(row.data);
          // Perbarui last_updated
          this.db.prepare('UPDATE sessions SET last_updated = ? WHERE jid = ?').run(now, userId);
          return {
            step: row.step,
            data: parsedData,
            lastUpdated: now
          };
        } catch {
          this.clearSession(userId);
        }
      }
    }

    const defaultSession = {
      step: 'IDLE',
      data: {
        nama: defaultName || 'Anggota',
        nomorWa: userId.split('@')[0],
        tanggalLatihan: new Date().toLocaleDateString('id-ID', {
          timeZone: 'Asia/Jakarta',
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        }),
        status: '',
        keterangan: '-',
        alasan: '-'
      },
      lastUpdated: now
    };

    this.db.prepare(`
      INSERT OR REPLACE INTO sessions (jid, step, data, last_updated)
      VALUES (?, ?, ?, ?)
    `).run(userId, defaultSession.step, JSON.stringify(defaultSession.data), now);

    return defaultSession;
  }

  /**
   * Update session user
   */
  updateSession(userId, updates) {
    const session = this.getSession(userId);
    if (updates.step) session.step = updates.step;
    if (updates.data) session.data = updates.data;
    session.lastUpdated = Date.now();

    this.db.prepare(`
      UPDATE sessions 
      SET step = ?, data = ?, last_updated = ?
      WHERE jid = ?
    `).run(session.step, JSON.stringify(session.data), session.lastUpdated, userId);

    return session;
  }

  /**
   * Hapus session user (selesai percakapan)
   */
  clearSession(userId) {
    this.db.prepare('DELETE FROM sessions WHERE jid = ?').run(userId);
  }
}

export const stateManager = new StateManager();
