import { config } from '../config.js';
import { db } from './db.js';
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

export const broadcastService = {
  isBroadcasting() {
    return isBroadcasting;
  },

  /**
   * Mengambil atau menginisialisasi antrian broadcast_progress untuk event dan target tertentu
   */
  initBroadcastQueue(eventId, targetTag, members) {
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO broadcast_progress (event_id, target_tag, phone, name, status)
      VALUES (?, ?, ?, ?, 'PENDING')
    `);

    const initTx = db.transaction(() => {
      for (const m of members) {
        const phone = memberManager.normalizePhone(m.phone);
        if (!phone) continue;
        insertStmt.run(eventId, targetTag, phone, m.name || '');
      }
    });

    initTx();
  },

  /**
   * Menjalankan loop broadcast dengan dukungan Resume, Reconnect, dan Fast Abort saat koneksi putus
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

    // Pastikan antrian tersimpan di database untuk resume
    this.initBroadcastQueue(eventId, tag, members);

    // Ambil list yang statusnya masih PENDING atau FAILED
    const pendingRows = db.prepare(`
      SELECT * FROM broadcast_progress 
      WHERE event_id = ? AND target_tag = ? AND status != 'SENT'
      ORDER BY id ASC
    `).all(eventId, tag);

    const alreadySentCount = members.length - pendingRows.length;
    logger.info('BROADCAST', `Memulai broadcast ke [${tag}]. Total: ${members.length}, Sudah terkirim sebelumnya: ${alreadySentCount}, Sisa: ${pendingRows.length}`);

    let successCount = 0;
    let failCount = 0;
    let stoppedDueToConnection = false;

    try {
      for (let i = 0; i < pendingRows.length; i++) {
        const item = pendingRows[i];
        const phone = memberManager.normalizePhone(item.phone);
        const jid = `${phone}@s.whatsapp.net`;
        const member = memberManager.findMember(phone);
        const name = (member && isValidName(member.name)) ? member.name.trim() : (isValidName(item.name) ? item.name.trim() : '');
        const seksi = member?.seksi || 'Umum';

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
            break; // HENTIKAN LOOP SEGERA - jangan loop anggota berikutnya, jangan delay anti-ban
          } else {
            failCount++;
            logger.error('BROADCAST', `Gagal mengirim ke nomor ${phone} (error level nomor): ${errMsg}`, err);
          }
        }

        const now = new Date().toISOString();

        if (sentOk) {
          // Tandai di progress database
          db.prepare(`
            UPDATE broadcast_progress 
            SET status = 'SENT', sent_at = ?, error_message = NULL 
            WHERE event_id = ? AND target_tag = ? AND phone = ?
          `).run(now, eventId, tag, phone);

          // Tandai di attendance tracker
          attendanceTracker.markSent(phone, isValidName(name) ? name : 'Nomor Baru', seksi, eventId);
          logger.info('BROADCAST', `[${alreadySentCount + i + 1}/${members.length}] ✅ Terkirim ke: ${name || '(Nomor Baru)'} (${phone})`);
        } else {
          // Hanya tandai FAILED jika error level nomor (bukan koneksi terputus)
          db.prepare(`
            UPDATE broadcast_progress 
            SET status = 'FAILED', error_message = ? 
            WHERE event_id = ? AND target_tag = ? AND phone = ?
          `).run(errMsg, eventId, tag, phone);
        }

        if (onProgress) {
          onProgress({
            current: alreadySentCount + i + 1,
            total: members.length,
            successCount,
            failCount,
            phone,
            name,
            sentOk
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
        previouslySent: alreadySentCount,
        remainingPending: members.length - (alreadySentCount + successCount)
      };
    }

    return {
      status: 'completed',
      targetTag: tag,
      total: members.length,
      successCount,
      failCount,
      previouslySent: alreadySentCount
    };
  }
};
