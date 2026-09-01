import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * Inisialisasi dan konfigurasi SQLite Database
 */
export function createDatabase(dbPath = config.dbPath) {
  const isMemory = dbPath === ':memory:';
  
  if (!isMemory) {
    const dir = path.dirname(path.resolve(dbPath));
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath, { timeout: 10000 });

  // Optimasi Konkurensi & Integritas
  if (!isMemory) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 10000');

  // Skema Tabel
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      applied_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nama_acara TEXT NOT NULL,
      waktu_latihan TEXT NOT NULL,
      lokasi TEXT NOT NULL,
      tujuan TEXT NOT NULL,
      target_on_time TEXT NOT NULL DEFAULT '19:00 WIB',
      batas_waktu TEXT NOT NULL DEFAULT 'Pukul 18:00 WIB',
      is_closed INTEGER NOT NULL DEFAULT 0,
      is_active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL DEFAULT '',
      seksi TEXT NOT NULL DEFAULT 'Umum',
      grup_asal TEXT DEFAULT 'NHKBP Kayu Putih',
      is_admin INTEGER NOT NULL DEFAULT 0,
      registered_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      phone TEXT NOT NULL,
      name TEXT NOT NULL DEFAULT 'Nomor Baru',
      seksi TEXT NOT NULL DEFAULT 'Umum',
      status TEXT NOT NULL DEFAULT 'WAITING_REPLY',
      attendance_choice TEXT,
      keterangan TEXT DEFAULT '-',
      alasan TEXT DEFAULT '-',
      sent_at TEXT,
      responded_at TEXT,
      last_reminded_at TEXT,
      raw_response TEXT,
      known_lid_mapping TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      UNIQUE(event_id, phone)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      jid TEXT PRIMARY KEY,
      step TEXT NOT NULL DEFAULT 'IDLE',
      data TEXT NOT NULL DEFAULT '{}',
      last_updated INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS lid_mappings (
      lid TEXT PRIMARY KEY,
      phone TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS broadcast_progress (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
      target_tag TEXT NOT NULL,
      phone TEXT NOT NULL,
      name TEXT DEFAULT '',
      status TEXT NOT NULL DEFAULT 'PENDING',
      sent_at TEXT,
      error_message TEXT,
      UNIQUE(event_id, target_tag, phone)
    );

    CREATE INDEX IF NOT EXISTS idx_members_phone ON members(phone);
    CREATE INDEX IF NOT EXISTS idx_members_seksi ON members(seksi);
    CREATE INDEX IF NOT EXISTS idx_attendance_event ON attendance_records(event_id);
    CREATE INDEX IF NOT EXISTS idx_attendance_phone ON attendance_records(phone);
    CREATE INDEX IF NOT EXISTS idx_attendance_status ON attendance_records(status);
    CREATE INDEX IF NOT EXISTS idx_lid_mappings_lid ON lid_mappings(lid);
    CREATE INDEX IF NOT EXISTS idx_broadcast_event_tag ON broadcast_progress(event_id, target_tag);
  `);

  runIncrementalMigrations(db);

  return db;
}

/**
 * Menjalankan migrasi skema inkremental
 */
export function runIncrementalMigrations(db) {
  const now = new Date().toISOString();

  // Migrasi v2: Tambah kolom last_reminded_at jika tabel sudah ada dari versi v1
  const migrationIdV2 = 'v2_add_last_reminded_at';
  const isAppliedV2 = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(migrationIdV2);

  if (!isAppliedV2) {
    const columns = db.prepare("PRAGMA table_info(attendance_records)").all();
    const hasLastReminded = columns.some((c) => c.name === 'last_reminded_at');

    if (!hasLastReminded) {
      db.exec('ALTER TABLE attendance_records ADD COLUMN last_reminded_at TEXT;');
      logger.info('DB_MIGRATION', 'Menambahkan kolom "last_reminded_at" ke tabel attendance_records.');
    }

    db.prepare('INSERT OR IGNORE INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migrationIdV2, now);
  }
}

/**
 * Migrasi otomatis dari file JSON lama ke SQLite
 * Menggunakan tabel schema_migrations dan transaksi tunggal untuk menjamin atomisitas
 */
export function migrateJsonToSqlite(db, options = {}) {
  const basePath = options.basePath || '.';
  const backup = options.backup !== false;
  const migrationId = 'v1_json_migration';

  // 1. Cek apakah migrasi sudah pernah diterapkan secara tuntas
  const isApplied = db.prepare('SELECT 1 FROM schema_migrations WHERE id = ?').get(migrationId);
  if (isApplied) {
    logger.debug('DB_MIGRATION', `Migrasi "${migrationId}" sudah pernah diterapkan. Melewati migrasi.`);
    return { applied: false, reason: 'ALREADY_APPLIED' };
  }

  const membersFile = path.resolve(basePath, 'members.json');
  const eventConfigFile = path.resolve(basePath, 'event_config.json');
  const attendanceFile = path.resolve(basePath, 'attendance_tracker.json');
  const sessionsFile = path.resolve(basePath, 'sessions.json');

  const now = new Date().toISOString();

  // Eksekusi seluruh migrasi 4 file JSON di dalam SATU transaksi atomic
  const migrationTx = db.transaction(() => {
    // 1. Migrasi Event Config
    let activeEventId = null;

    if (fs.existsSync(eventConfigFile)) {
      if (backup && !fs.existsSync(`${eventConfigFile}.bak`)) {
        fs.copyFileSync(eventConfigFile, `${eventConfigFile}.bak`);
      }
      const eventRaw = fs.readFileSync(eventConfigFile, 'utf-8');
      const ev = JSON.parse(eventRaw);

      const insertEvent = db.prepare(`
        INSERT INTO events (nama_acara, waktu_latihan, lokasi, tujuan, target_on_time, batas_waktu, is_closed, is_active, created_at, updated_at)
        VALUES (@namaAcara, @waktuLatihan, @lokasi, @tujuan, @targetOnTime, @batasWaktu, @isClosed, 1, @createdAt, @updatedAt)
      `);

      const result = insertEvent.run({
        namaAcara: ev.namaAcara || 'Latihan Paduan Suara Naposobulung',
        waktuLatihan: ev.waktuLatihan || 'Sabtu, 29 Agustus 2026 - Pukul 19:00 WIB',
        lokasi: ev.lokasi || 'Gereja HKBP Kayu Putih',
        tujuan: ev.tujuan || 'Pengisian Koor Kebaktian Minggu, 30 Agustus 2026 (Pukul 10:00 WIB)',
        targetOnTime: ev.targetOnTime || '19:00 WIB',
        batasWaktu: ev.batasWaktu || 'Pukul 18:00 WIB',
        isClosed: ev.isClosed ? 1 : 0,
        createdAt: ev.lastUpdated || now,
        updatedAt: ev.lastUpdated || now
      });

      activeEventId = result.lastInsertRowid;
      logger.info('DB_MIGRATION', `Berhasil memigrasikan event aktif (ID: ${activeEventId}) dari event_config.json`);
    }

    if (!activeEventId) {
      const insertDefaultEvent = db.prepare(`
        INSERT INTO events (nama_acara, waktu_latihan, lokasi, tujuan, target_on_time, batas_waktu, is_closed, is_active, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 0, 1, ?, ?)
      `);
      const res = insertDefaultEvent.run(
        'Latihan Paduan Suara Naposobulung',
        'Sabtu, 29 Agustus 2026 - Pukul 19:00 WIB',
        'Gereja HKBP Kayu Putih',
        'Pengisian Koor Kebaktian Minggu, 30 Agustus 2026 (Pukul 10:00 WIB)',
        '19:00 WIB',
        'Pukul 18:00 WIB',
        now,
        now
      );
      activeEventId = res.lastInsertRowid;
    }

    // 2. Migrasi Members
    if (fs.existsSync(membersFile)) {
      if (backup && !fs.existsSync(`${membersFile}.bak`)) {
        fs.copyFileSync(membersFile, `${membersFile}.bak`);
      }
      const membersRaw = fs.readFileSync(membersFile, 'utf-8');
      const members = JSON.parse(membersRaw);

      const insertMember = db.prepare(`
        INSERT OR IGNORE INTO members (phone, name, seksi, grup_asal, is_admin, registered_at, updated_at)
        VALUES (@phone, @name, @seksi, @grupAsal, @isAdmin, @registeredAt, @updatedAt)
      `);

      let inserted = 0;
      for (const m of members) {
        if (!m.phone) continue;
        let phoneClean = m.phone.toString().replace(/[^0-9]/g, '');
        if (phoneClean.startsWith('08')) phoneClean = '62' + phoneClean.slice(1);
        if (phoneClean.startsWith('+62')) phoneClean = phoneClean.slice(1);

        const isAdmin = (m.seksi === 'Pengurus') ? 1 : 0;

        insertMember.run({
          phone: phoneClean,
          name: (m.name || '').trim(),
          seksi: m.seksi || 'Umum',
          grupAsal: m.grupAsal || 'NHKBP Kayu Putih',
          isAdmin,
          registeredAt: m.registeredAt || now,
          updatedAt: now
        });
        inserted++;
      }
      logger.info('DB_MIGRATION', `Berhasil memigrasikan ${inserted} anggota dari members.json`);
    }

    // 3. Migrasi Attendance Tracker
    if (fs.existsSync(attendanceFile)) {
      if (backup && !fs.existsSync(`${attendanceFile}.bak`)) {
        fs.copyFileSync(attendanceFile, `${attendanceFile}.bak`);
      }
      const attendanceRaw = fs.readFileSync(attendanceFile, 'utf-8');
      const att = JSON.parse(attendanceRaw);

      if (att.members && typeof att.members === 'object') {
        const insertAtt = db.prepare(`
          INSERT OR REPLACE INTO attendance_records 
            (event_id, phone, name, seksi, status, attendance_choice, keterangan, alasan, sent_at, responded_at, raw_response, known_lid_mapping, created_at, updated_at)
          VALUES 
            (@eventId, @phone, @name, @seksi, @status, @attendanceChoice, @keterangan, @alasan, @sentAt, @respondedAt, @rawResponse, @knownLidMapping, @createdAt, @updatedAt)
        `);

        let count = 0;
        for (const [phone, item] of Object.entries(att.members)) {
          let phoneClean = phone.replace(/[^0-9]/g, '');
          if (phoneClean.startsWith('08')) phoneClean = '62' + phoneClean.slice(1);

          const resp = item.response || {};
          const attChoice = resp.status === 'Bisa' || resp.status === 'Tidak Bisa' ? resp.status : null;

          insertAtt.run({
            eventId: activeEventId,
            phone: phoneClean,
            name: item.name || 'Nomor Baru',
            seksi: item.seksi || 'Umum',
            status: item.status || 'WAITING_REPLY',
            attendanceChoice: attChoice,
            keterangan: resp.keterangan || '-',
            alasan: resp.alasan || '-',
            sentAt: item.sentAt || now,
            respondedAt: item.respondedAt || (item.status === 'RESPONDED' ? now : null),
            rawResponse: item.response ? JSON.stringify(item.response) : null,
            knownLidMapping: item.knownLidMapping || null,
            createdAt: item.sentAt || now,
            updatedAt: now
          });

          if (item.knownLidMapping) {
            db.prepare('INSERT OR REPLACE INTO lid_mappings (lid, phone, created_at) VALUES (?, ?, ?)')
              .run(item.knownLidMapping, phoneClean, now);
          }
          count++;
        }
        logger.info('DB_MIGRATION', `Berhasil memigrasikan ${count} data absensi dari attendance_tracker.json`);
      }
    }

    // 4. Migrasi Sessions
    if (fs.existsSync(sessionsFile)) {
      if (backup && !fs.existsSync(`${sessionsFile}.bak`)) {
        fs.copyFileSync(sessionsFile, `${sessionsFile}.bak`);
      }
      const sessionsRaw = fs.readFileSync(sessionsFile, 'utf-8');
      const sessObj = JSON.parse(sessionsRaw);

      const insertSession = db.prepare(`
        INSERT OR REPLACE INTO sessions (jid, step, data, last_updated)
        VALUES (?, ?, ?, ?)
      `);

      let count = 0;
      for (const [jid, item] of Object.entries(sessObj)) {
        insertSession.run(
          jid,
          item.step || 'IDLE',
          JSON.stringify(item.data || {}),
          item.lastUpdated || Date.now()
        );
        count++;
      }
      logger.info('DB_MIGRATION', `Berhasil memigrasikan ${count} sesi aktif dari sessions.json`);
    }

    // 5. Tandai migrasi sukses selesai di schema_migrations
    db.prepare('INSERT INTO schema_migrations (id, applied_at) VALUES (?, ?)').run(migrationId, now);
    logger.info('DB_MIGRATION', `Migrasi "${migrationId}" berhasil dituntaskan dan tercatat di schema_migrations.`);
  });

  migrationTx();
  return { applied: true, id: migrationId };
}

// Global Singleton DB
export const db = createDatabase();
migrateJsonToSqlite(db);
