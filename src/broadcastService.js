import { config } from '../config.js';
import { getDb } from './db.js';
import { memberManager } from './memberManager.js';
import { eventManager } from './eventManager.js';
import { stateManager } from './stateManager.js';
import { attendanceTracker } from './attendanceTracker.js';
import { messageTemplates } from './messageTemplates.js';
import { isValidName } from './botHandler.js';
import { isConnectionError } from './connectionHelper.js';
import { logger } from './logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

let isBroadcasting = false;

// Status absensi yang dianggap sudah final dan harus di-skip dari broadcast
export const FINAL_ATTENDANCE_STATUSES = ['RESPONDED', 'PARTIAL_HADIR'];

export const broadcastService = {
  get db() {
    return this._db || getDb();
  },

  set db(instance) {
    this._db = instance;
  },

  isBroadcasting() {
    return isBroadcasting;
  },

  /**
   * Pengecekan Shared Tunggal: Cek apakah nomor sudah merespon final di event aktif
   */
  isAlreadyResponded(phone, eventId) {
    const cleanPhone = memberManager.normalizePhone(phone);
    if (!cleanPhone) return false;

    const row = this.db.prepare(`
      SELECT status FROM attendance_records 
      WHERE phone = ? AND event_id = ?
      ORDER BY responded_at DESC LIMIT 1
    `).get(cleanPhone, eventId);

    return row ? FINAL_ATTENDANCE_STATUSES.includes(row.status) : false;
  },

  /**
   * Mengambil status record detail untuk keperluan log / display preview
   */
  getAttendanceRecord(phone, eventId) {
    const cleanPhone = memberManager.normalizePhone(phone);
    if (!cleanPhone) return null;

    return this.db.prepare(`
      SELECT status, attendance_choice, keterangan, name
      FROM attendance_records 
      WHERE phone = ? AND event_id = ?
      ORDER BY responded_at DESC LIMIT 1
    `).get(cleanPhone, eventId) || null;
  },

  /**
   * Mengambil atau menginisialisasi antrian broadcast_progress untuk event dan target tertentu
   */
  initBroadcastQueue(eventId, targetTag, members) {
    const insertStmt = this.db.prepare(`
      INSERT INTO broadcast_progress (event_id, target_tag, phone, name, status)
      VALUES (?, ?, ?, ?, 'PENDING')
      ON CONFLICT(event_id, target_tag, phone) DO UPDATE SET
        name = excluded.name
    `);

    const initTx = this.db.transaction(() => {
      const activePhones = [];
      for (const m of members) {
        const phone = memberManager.normalizePhone(m.phone);
        if (!phone) continue;
        activePhones.push(phone);
        insertStmt.run(eventId, targetTag, phone, m.name || '');
      }

      if (activePhones.length > 0) {
        const inClause = activePhones.map((p) => `'${p}'`).join(',');
        this.db.prepare(`
          DELETE FROM broadcast_progress
          WHERE event_id = ? AND target_tag = ? AND phone NOT IN (${inClause})
        `).run(eventId, targetTag);
      }
    });

    initTx();
  },

  /**
   * Menjalankan loop broadcast dengan dukungan Smart Skip, Resume, Reconnect, dan Fast Abort
   */
  async runBroadcast({ sock, targetTag = 'all', adminJid = null, onProgress = null }) {
    let tag = targetTag;
    if (tag.toLowerCase() === 'target') tag = 'TargetKoor';

    const members = memberManager.getMembersByTag(tag);
    if (!Array.isArray(members) || members.length === 0) {
      return {
        status: 'empty',
        message: `Tidak ada anggota yang ditemukan untuk target "${targetTag}".`
      };
    }

    if (isBroadcasting) {
      return {
        status: 'busy',
        message: 'Sedang ada proses broadcast yang berjalan di background. Mohon tunggu hingga selesai.'
      };
    }

    isBroadcasting = true;
    const currentEvent = eventManager.getEvent();
    const eventId = currentEvent.id;

    // Inisialisasi antrian jika belum ada
    this.initBroadcastQueue(eventId, tag, members);

    // Ambil list antrian yang belum selesai (filter SENT dan SKIPPED_ALREADY_RESPONDED)
    const pendingRows = this.db.prepare(`
      SELECT * FROM broadcast_progress 
      WHERE event_id = ? AND target_tag = ? AND status NOT IN ('SENT', 'SKIPPED_ALREADY_RESPONDED')
      ORDER BY id ASC
    `).all(eventId, tag);

    const alreadyDoneCount = members.length - pendingRows.length;
    logger.info('BROADCAST', `Memulai broadcast ke [${tag}]. Total: ${members.length}, Selesai sebelumnya: ${alreadyDoneCount}, Sisa antrian: ${pendingRows.length}`);

    let successCount = 0;
    let failCount = 0;
    let skippedCount = 0;
    let stoppedDueToConnection = false;

    try {
      for (let i = 0; i < pendingRows.length; i++) {
        const item = pendingRows[i];
        const phone = memberManager.normalizePhone(item.phone);
        const jid = `${phone}@s.whatsapp.net`;
        const member = memberManager.findMember(phone);
        const name = (member && isValidName(member.name)) ? member.name.trim() : (isValidName(item.name) ? item.name.trim() : '');
        const seksi = member?.seksi || 'Umum';

        // 🛡️ REAL-TIME JIT CHECK: Cek status terkini di DB SEBELUM update session atau kirim WA
        if (this.isAlreadyResponded(phone, eventId)) {
          const rec = this.getAttendanceRecord(phone, eventId);
          const foundStatus = rec ? `${rec.status} (${rec.attendance_choice || '-'})` : 'RESPONDED';
          const now = new Date().toISOString();

          this.db.prepare(`
            UPDATE broadcast_progress 
            SET status = 'SKIPPED_ALREADY_RESPONDED', sent_at = ?, error_message = ? 
            WHERE event_id = ? AND target_tag = ? AND phone = ?
          `).run(now, `Sudah absen di Event #${eventId} (Status: ${foundStatus})`, eventId, tag, phone);

          skippedCount++;
          logger.info('BROADCAST', `⏭️ [Dilewati] ${name || '(Nomor Baru)'} (${phone}) - Sudah Absen (${foundStatus})`);

          if (onProgress) {
            onProgress({
              current: alreadyDoneCount + i + 1,
              total: members.length,
              successCount,
              failCount,
              skippedCount,
              phone,
              name,
              sentOk: false,
              skipped: true
            });
          }

          // Tetap jalankan jeda anti-ban agar ritme pengiriman tetap natural
          if (i < pendingRows.length - 1) {
            const delay = getRandomDelay(config.minDelayMs, config.maxDelayMs);
            logger.debug('BROADCAST', `Jeda anti-ban ${Math.round(delay / 1000)} detik...`);
            await sleep(delay);
          }
          continue; // Lewati orang ini, jangan update session, jangan kirim WA
        }

        // Siapkan sesi percakapan hanya jika belum absen
        const session = stateManager.getSession(jid, name || 'Saudara/i');
        session.data.seksi = seksi;
        session.data.namaAcara = currentEvent.namaAcara;
        session.data.tanggalLatihan = currentEvent.waktuLatihan;

        let message = '';
        if (isValidName(name)) {
          session.step = 'WAITING_ATTENDANCE';
          session.data.nama = name;
          message = messageTemplates.getKnownMemberGreeting(name, currentEvent);
        } else {
          session.step = 'WAITING_NAME_REGISTRATION';
          session.data.nama = 'Anggota';
          message = messageTemplates.getNewMemberGreeting(currentEvent);
        }

        stateManager.updateSession(jid, session);

        // Pengiriman pesan WA
        let sentOk = false;
        let errMsg = null;
        let isConnErr = false;

        try {
          if (sock && sock.sendPresenceUpdate && config.presenceTypingMs > 0) {
            await sock.sendPresenceUpdate('composing', jid);
            await sleep(config.presenceTypingMs);
            await sock.sendPresenceUpdate('paused', jid);
          }

          if (sock && sock.sendMessage) {
            await sock.sendMessage(jid, { text: message });
          }

          sentOk = true;
          successCount++;
        } catch (err) {
          sentOk = false;
          errMsg = err.message || 'Unknown error';
          isConnErr = isConnectionError(err, sock);

          if (isConnErr) {
            logger.warn('BROADCAST', `⚠️ Koneksi WhatsApp terputus saat mencoba mengirim ke ${phone}: ${errMsg}. Menghentikan antrian broadcast segera.`);
            stoppedDueToConnection = true;
            break;
          } else {
            failCount++;
            logger.error('BROADCAST', `Gagal mengirim ke nomor ${phone} (error level nomor): ${errMsg}`, err);
          }
        }

        const now = new Date().toISOString();

        if (sentOk) {
          this.db.prepare(`
            UPDATE broadcast_progress 
            SET status = 'SENT', sent_at = ?, error_message = NULL 
            WHERE event_id = ? AND target_tag = ? AND phone = ?
          `).run(now, eventId, tag, phone);

          attendanceTracker.markSent(phone, isValidName(name) ? name : 'Nomor Baru', seksi, eventId);
          logger.info('BROADCAST', `[${alreadyDoneCount + i + 1}/${members.length}] ✅ Terkirim ke: ${name || '(Nomor Baru)'} (${phone})`);
        } else {
          this.db.prepare(`
            UPDATE broadcast_progress 
            SET status = 'FAILED', error_message = ? 
            WHERE event_id = ? AND target_tag = ? AND phone = ?
          `).run(errMsg, eventId, tag, phone);
        }

        if (onProgress) {
          onProgress({
            current: alreadyDoneCount + i + 1,
            total: members.length,
            successCount,
            failCount,
            skippedCount,
            phone,
            name,
            sentOk,
            skipped: false
          });
        }

        // Delay human-like anti-ban jika masih ada antrian berikutnya
        if (i < pendingRows.length - 1 && !stoppedDueToConnection) {
          const delay = getRandomDelay(config.minDelayMs, config.maxDelayMs);
          logger.debug('BROADCAST', `Jeda anti-ban ${Math.round(delay / 1000)} detik...`);
          await sleep(delay);
        }
      }
    } finally {
      isBroadcasting = false;
    }

    if (stoppedDueToConnection) {
      return {
        status: 'connection_lost',
        targetTag: tag,
        total: members.length,
        successCount,
        failCount,
        skippedCount,
        previouslyDone: alreadyDoneCount,
        remainingPending: members.length - (alreadyDoneCount + successCount + skippedCount)
      };
    }

    return {
      status: 'completed',
      targetTag: tag,
      total: members.length,
      successCount,
      failCount,
      skippedCount,
      previouslyDone: alreadyDoneCount
    };
  }
};
