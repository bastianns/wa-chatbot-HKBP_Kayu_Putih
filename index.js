import path from 'path';
import { handleIncomingMessage } from './src/botHandler.js';
import { config } from './config.js';
import { getDb, migrateJsonToSqlite } from './src/db.js';
import { eventManager } from './src/eventManager.js';
import { memberManager } from './src/memberManager.js';
import { createWASocketSession } from './src/connectionHelper.js';
import { logger } from './src/logger.js';

const AUTH_DIR = path.resolve('./auth_info_baileys');

function checkSecurityAndConfig() {
  const isDefaultWebhook = !config.webhookUrl || config.webhookUrl.includes('GANTI_DENGAN_DEPLOYMENT_ID_ANDA');
  if (isDefaultWebhook) {
    logger.warn('STARTUP', 'Google Sheets Webhook URL belum diisi atau masih menggunakan nilai default di .env!');
  }

  // Peringatan keamanan untuk pengembang
  console.log('\n🔒 [KEAMANAN & PRIVASI]');
  console.log('Pastikan file .env dan database/JSON anggota sudah ada di .gitignore.');
  console.log('⚠️ Jika URL Webhook Google Apps Script pernah dibagikan atau terekspos di repo publik,');
  console.log('   SEGERA lakukan Redeploy Web App di Google Apps Script dan perbarui .env!\n');
}

async function startBot() {
  checkSecurityAndConfig();

  // Inisialisasi eksplisit database dan migrasi
  const db = getDb();
  migrateJsonToSqlite(db);

  const ev = eventManager.getEvent();
  const counts = memberManager.getCounts();

  console.log('====================================================');
  console.log('🤖  WHATSAPP BOT ABSENSI & GOOGLE SHEETS AKTIF (SQLITE EDITION)');
  console.log(`📌  Kegiatan   : ${ev.namaAcara}`);
  console.log(`🗓️  Waktu Acara: ${ev.waktuLatihan}`);
  console.log(`📍  Lokasi     : ${ev.lokasi}`);
  console.log(`🎯  Tujuan     : ${ev.tujuan}`);
  console.log(`👥  Database   : ${counts.totalMembers} total anggota (${counts.targetKoor} Target Koor, ${counts.pengurus} Pengurus/Admin)`);
  console.log('====================================================\n');

  await createWASocketSession({
    authDir: AUTH_DIR,
    showQR: true,
    maxReconnectAttempts: 10,
    onOpen: async (sock) => {
      console.log('\n✅ BERHASIL TERHUBUNG KE WHATSAPP!');
      console.log(`👤 Bot siap menerima pesan dan mencatat absensi real-time.`);
      console.log(`📡 URL Google Sheets: ${config.webhookUrl ? 'Terkonfigurasi' : '⚠️ Belum diisi di .env'}`);
      console.log(`🛠️ Admin Terdaftar  : ${counts.pengurus} pengurus di database SQLite`);
      console.log('----------------------------------------------------\n');
    },
    onClose: ({ reason }) => {
      if (reason === 'LOGGED_OUT') {
        console.log('🧹 Sesi WhatsApp kedaluwarsa. Memulai ulang bot untuk QR Code baru...\n');
        setTimeout(() => startBot(), 2000);
      }
    },
    onMessage: async (sock, m) => {
      await handleIncomingMessage(sock, m);
    }
  });
}

// Jalankan Bot
startBot().catch((err) => {
  logger.error('MAIN', 'Fatal Error saat inisialisasi bot:', err);
  setTimeout(() => startBot(), 5000);
});
