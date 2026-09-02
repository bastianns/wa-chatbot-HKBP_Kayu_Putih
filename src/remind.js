import path from 'path';
import { config } from '../config.js';
import { getDb, migrateJsonToSqlite } from './db.js';
import { eventManager } from './eventManager.js';
import { attendanceTracker } from './attendanceTracker.js';
import { resolveReminderState } from './botHandler.js';
import { createWASocketSession, isConnectionError } from './connectionHelper.js';
import { logger } from './logger.js';

const AUTH_DIR = path.resolve('./auth_info_baileys');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function main() {
  // Inisialisasi eksplisit database dan migrasi
  const db = getDb();
  migrateJsonToSqlite(db);

  const currentEvent = eventManager.getEvent();

  await createWASocketSession({
    authDir: AUTH_DIR,
    showQR: false,
    maxReconnectAttempts: 3,
    onOpen: async (sock) => {
      // Query pending members dengan cooldown 30 menit untuk mencegah double reminder saat auto-reconnect
      const pendingMembers = attendanceTracker.getPendingMembers(currentEvent.id, 30);

      if (pendingMembers.length === 0) {
        logger.info('REMIND_CLI', '🎉 Tidak ada anggota pending yang perlu dikirimi pengingat saat ini (semua sudah merespon atau baru saja diingatkan).');
        process.exit(0);
      }

      console.log('====================================================');
      console.log(`🔔  MEMULAI PENGIRIMAN REMINDER / FOLLOW-UP`);
      console.log(`👥  Jumlah Anggota Siap Diingatkan: ${pendingMembers.length} orang (Cooldown 30 menit aktif)`);
      console.log(`📌  Acara: ${currentEvent.namaAcara}`);
      console.log(`🛡️  Anti-Ban Delay: ${config.minDelayMs / 1000}s - ${config.maxDelayMs / 1000}s per pesan`);
      console.log('====================================================\n');

      let successCount = 0;
      let failCount = 0;
      let connectionLost = false;

      for (let i = 0; i < pendingMembers.length; i++) {
        const item = pendingMembers[i];
        const target = resolveReminderState(item.phone, item, currentEvent);

        try {
          if (sock.sendPresenceUpdate && config.presenceTypingMs > 0) {
            await sock.sendPresenceUpdate('composing', target.jid);
            await sleep(config.presenceTypingMs);
            await sock.sendPresenceUpdate('paused', target.jid);
          }

          if (sock.sendMessage) {
            await sock.sendMessage(target.jid, { text: target.reminderMsg });
          }

          // Catat timestamp last_reminded_at di database
          attendanceTracker.markReminded(target.phone, currentEvent.id);

          successCount++;
          logger.info('REMIND_CLI', `[${i + 1}/${pendingMembers.length}] 🔔 State: [${target.step}] Terkirim ke: ${target.name} (${target.phone})`);
        } catch (err) {
          if (isConnectionError(err, sock)) {
            logger.warn('REMIND_CLI', `⚠️ Koneksi WhatsApp terputus saat mengirim reminder ke ${target.phone}. Menghentikan antrian reminder untuk menunggu reconnect.`);
            connectionLost = true;
            break;
          } else {
            failCount++;
            logger.error('REMIND_CLI', `[${i + 1}/${pendingMembers.length}] ❌ Gagal ke: ${target.phone}`, err);
          }
        }

        if (i < pendingMembers.length - 1 && !connectionLost) {
          const delay = getRandomDelay(config.minDelayMs, config.maxDelayMs);
          logger.debug('REMIND_CLI', `Jeda aman anti-ban ${Math.round(delay / 1000)} detik...`);
          await sleep(delay);
        }
      }

      if (!connectionLost) {
        console.log('\n====================================================');
        console.log('🎉 SEMUA PESAN REMINDER TELAH SELESAI DIKIRIM!');
        console.log(`• Berhasil Terkirim: ${successCount} pesan`);
        console.log(`• Gagal Terkirim   : ${failCount} pesan`);
        console.log('====================================================\n');
        process.exit(0);
      }
    },
    onClose: ({ reason }) => {
      logger.error('REMIND_CLI', `Koneksi ditutup (${reason}). Reminder belum selesai.`);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  logger.error('REMIND_CLI', 'Fatal error saat remind CLI:', err);
  process.exit(1);
});
