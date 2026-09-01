import { db as defaultDb } from './db.js';
import { config } from '../config.js';
import { logger } from './logger.js';

export class MemberManager {
  constructor(dbInstance = defaultDb) {
    this.db = dbInstance;
  }

  /**
   * Normalisasi nomor telepon: hapus @s.whatsapp.net, :device_id, @lid, +, spasi, dsb.
   */
  normalizePhone(phone) {
    if (!phone) return '';
    let clean = phone.toString().split('@')[0].split(':')[0].replace(/[^0-9]/g, '');
    if (clean.startsWith('08')) {
      clean = '62' + clean.slice(1);
    } else if (clean.startsWith('+62')) {
      clean = clean.slice(1);
    }
    return clean;
  }

  /**
   * Validasi format nomor HP Indonesia (628xxxxxxxx)
   */
  isValidIndonesianPhone(phone) {
    const clean = this.normalizePhone(phone);
    return /^628\d{8,12}$/.test(clean);
  }

  /**
   * Cek apakah pengirim adalah admin:
   * 1. Check SQLite members table (is_admin = 1 OR seksi = 'Pengurus') via exact equality
   * 2. Check lid_mappings if sender is LID and mapped phone is admin
   * 3. Fallback to config.adminNumbers (.env) via exact equality
   */
  isAdmin(phoneOrLid) {
    const clean = this.normalizePhone(phoneOrLid);
    if (!clean) return false;

    // 1. Cek langsung ke database members (Exact match)
    const dbAdmin = this.db.prepare(`
      SELECT 1 FROM members 
      WHERE phone = ? AND (is_admin = 1 OR LOWER(seksi) = 'pengurus')
      LIMIT 1
    `).get(clean);

    if (dbAdmin) return true;

    // 2. Jika pengirim adalah LID, cek mapping permanennya ke nomor HP asli
    const mappedPhone = this.getLidMapping(clean);
    if (mappedPhone) {
      const mappedAdmin = this.db.prepare(`
        SELECT 1 FROM members 
        WHERE phone = ? AND (is_admin = 1 OR LOWER(seksi) = 'pengurus')
        LIMIT 1
      `).get(mappedPhone);

      if (mappedAdmin) return true;

      if (config.adminNumbers.includes(mappedPhone)) return true;
    }

    // 3. Fallback ke .env ADMIN_NUMBERS (Exact match)
    if (config.adminNumbers.includes(clean)) return true;

    return false;
  }

  /**
   * Ambil mapping LID permanen
   */
  getLidMapping(lid) {
    const cleanLid = this.normalizePhone(lid);
    if (!cleanLid) return null;

    const row = this.db.prepare('SELECT phone FROM lid_mappings WHERE lid = ?').get(cleanLid);
    return row ? row.phone : null;
  }

  /**
   * Simpan mapping permanen LID -> Phone
   */
  setLidMapping(lid, phone) {
    const cleanLid = this.normalizePhone(lid);
    const cleanPhone = this.normalizePhone(phone);
    if (!cleanLid || !cleanPhone) return false;

    const now = new Date().toISOString();
    this.db.prepare(`
      INSERT OR REPLACE INTO lid_mappings (lid, phone, created_at)
      VALUES (?, ?, ?)
    `).run(cleanLid, cleanPhone, now);

    logger.info('MEMBER', `Mapping LID disimpan: ${cleanLid} -> ${cleanPhone}`);
    return true;
  }

  /**
   * Mencari anggota berdasarkan nomor WA atau LID terpetakan
   */
  findMember(phoneOrLid) {
    let normalized = this.normalizePhone(phoneOrLid);
    if (!normalized) return null;

    // Jika ini adalah LID yang terpetakan, cari nomor HP aslinya
    const mappedPhone = this.getLidMapping(normalized);
    if (mappedPhone) {
      normalized = mappedPhone;
    }

    const row = this.db.prepare('SELECT * FROM members WHERE phone = ?').get(normalized);
    return row || null;
  }

  /**
   * Mendaftarkan atau memperbarui data anggota
   */
  registerOrUpdate(phone, name, seksi = 'Umum', grupAsal = 'NHKBP Kayu Putih', isAdmin = null) {
    const normalized = this.normalizePhone(phone);
    if (!normalized) return null;

    const now = new Date().toISOString();
    const existing = this.findMember(normalized);

    const isAdm = isAdmin !== null ? (isAdmin ? 1 : 0) : ((seksi === 'Pengurus') ? 1 : (existing?.is_admin || 0));

    if (existing) {
      const updatedName = (name && name.length >= 2) ? name.trim() : existing.name;
      const updatedSeksi = (seksi && seksi !== 'Umum') ? seksi : existing.seksi;
      const updatedGrup = grupAsal || existing.grup_asal;

      this.db.prepare(`
        UPDATE members 
        SET name = ?, seksi = ?, grup_asal = ?, is_admin = ?, updated_at = ?
        WHERE phone = ?
      `).run(updatedName, updatedSeksi, updatedGrup, isAdm, now, normalized);
    } else {
      this.db.prepare(`
        INSERT INTO members (phone, name, seksi, grup_asal, is_admin, registered_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(normalized, (name || '').trim(), seksi || 'Umum', grupAsal || 'NHKBP Kayu Putih', isAdm, now, now);
    }

    return this.findMember(normalized);
  }

  /**
   * Batch sync anggota dari Grup WhatsApp
   */
  syncFromGroup(participants, groupSubject) {
    let addedCount = 0;
    const now = new Date().toISOString();

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO members (phone, name, seksi, grup_asal, is_admin, registered_at, updated_at)
      VALUES (?, '', 'Umum', ?, 0, ?, ?)
    `);

    const syncTx = this.db.transaction((parts) => {
      for (const p of parts) {
        const phone = this.normalizePhone(p.id);
        if (!phone) continue;
        const info = insertStmt.run(phone, groupSubject, now, now);
        if (info.changes > 0) {
          addedCount++;
        }
      }
    });

    syncTx(participants);
    logger.info('MEMBER', `Sync grup "${groupSubject}": ${addedCount} nomor baru ditambahkan.`);
    return addedCount;
  }

  /**
   * Mengambil daftar anggota berdasarkan filter seksi/grup
   */
  getMembersByTag(tag = 'all') {
    if (!tag || tag.toLowerCase() === 'all') {
      return this.db.prepare('SELECT * FROM members ORDER BY id ASC').all();
    }

    const cleanTag = tag.trim().toLowerCase();
    return this.db.prepare(`
      SELECT * FROM members 
      WHERE LOWER(seksi) = ? OR LOWER(grup_asal) LIKE ?
      ORDER BY id ASC
    `).all(cleanTag, `%${cleanTag}%`);
  }

  /**
   * Cari anggota spesifik berdasarkan nama atau nomor HP
   */
  searchMembers(keyword, limit = 15) {
    if (!keyword) return [];
    const clean = keyword.trim().toLowerCase();
    const cleanPhone = this.normalizePhone(keyword);

    const query = `
      SELECT * FROM members 
      WHERE LOWER(name) LIKE ? OR phone LIKE ?
      ORDER BY name ASC
      LIMIT ?
    `;

    const searchName = `%${clean}%`;
    const searchPhone = cleanPhone ? `%${cleanPhone}%` : `%${clean}%`;

    return this.db.prepare(query).all(searchName, searchPhone, limit);
  }

  /**
   * Mengambil ringkasan jumlah anggota per tag/kategori untuk template dinamis
   */
  getCounts() {
    const totalMembers = this.db.prepare('SELECT COUNT(*) as c FROM members').get().c;
    const targetKoor = this.db.prepare("SELECT COUNT(*) as c FROM members WHERE LOWER(seksi) = 'targetkoor'").get().c;
    const pengurus = this.db.prepare("SELECT COUNT(*) as c FROM members WHERE is_admin = 1 OR LOWER(seksi) = 'pengurus'").get().c;

    return {
      totalMembers,
      targetKoor: targetKoor > 0 ? targetKoor : totalMembers,
      pengurus
    };
  }
}

export const memberManager = new MemberManager();
