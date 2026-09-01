import path from 'path';
import { config } from '../config.js';
import { eventManager } from './eventManager.js';
import { memberManager } from './memberManager.js';
import { messageTemplates } from './messageTemplates.js';
import { broadcastService } from './broadcastService.js';
import { createWASocketSession } from './connectionHelper.js';
import { logger } from './logger.js';

const AUTH_DIR = path.resolve('./auth_info_baileys');

async function main() {
  const args = process.argv.slice(2);
  let targetTag = 'all';
  let isDryRun = false;

  for (const arg of args) {
    if (arg === '--dry-run' || arg === '--preview' || arg === '-p') {
      isDryRun = true;
    } else if (!arg.startsWith('-')) {
      targetTag = arg;
    }
  }

  if (targetTag.toLowerCase() === 'target') {
    targetTag = 'TargetKoor';
  }

  const members = memberManager.getMembersByTag(targetTag);

  if (!Array.isArray(members) || members.length === 0) {
    logger.warn('BROADCAST_CLI', `Tidak ada anggota yang ditemukan untuk target: "${targetTag}".`);
    console.log('💡 Tips: Gunakan "all", "target", "Sopran", "Alto", "Tenor", "Bass", atau "Pengurus".');
    return;
  }

  const currentEvent = eventManager.getEvent();
  const totalMinutes = Math.round((members.length * 20) / 60);

  console.log('====================================================');
  console.log(`📋  RINGKASAN TARGET BROADCAST [${targetTag.toUpperCase()}]`);
  console.log('====================================================');
  console.log(`👥  Jumlah Penerima    : ${members.length} anggota`);
  console.log(`📌  Nama Acara         : ${currentEvent.namaAcara}`);
  console.log(`🗓️  Waktu Latihan      : ${currentEvent.waktuLatihan}`);
  console.log(`📍  Lokasi             : ${currentEvent.lokasi}`);
  console.log(`🎯  Tujuan             : ${currentEvent.tujuan}`);
  console.log(`🛡️  Jeda Anti-Ban      : ${config.minDelayMs / 1000}s - ${config.maxDelayMs / 1000}s per orang`);
  console.log(`⏱️  Estimasi Waktu     : ± ${totalMinutes > 0 ? totalMinutes : 1} menit`);
  console.log('----------------------------------------------------');
  console.log('💬  1. PREVIEW PESAN UNTUK ANGGOTA BARU (TANYA NAMA):');
  console.log('----------------------------------------------------');
  console.log(messageTemplates.getNewMemberGreeting(currentEvent));
  console.log('----------------------------------------------------');
  console.log('💬  2. PREVIEW PESAN UNTUK ANGGOTA YANG SUDAH TERSIMPAN:');
  console.log('----------------------------------------------------');
  console.log(messageTemplates.getKnownMemberGreeting('Bastian', currentEvent));
  console.log('----------------------------------------------------');
  console.log('📱  DAFTAR 5 PENERIMA PERTAMA:');
  members.slice(0, 5).forEach((m, idx) => {
    console.log(`   ${idx + 1}. ${m.name || '(Nama akan ditanyakan bot)'} (${m.phone}) - [${m.seksi || 'Umum'}]`);
  });
  if (members.length > 5) {
    console.log(`   ... dan ${members.length - 5} anggota lainnya.`);
  }
  console.log('====================================================\n');

  if (isDryRun) {
    console.log('🔍 [MODE PREVIEW / DRY-RUN] Selesai.');
    console.log('ℹ️  Tidak ada pesan yang dikirim ke WhatsApp.');
    console.log(`💡 Untuk mengirim sungguhan, jalankan: npm run broadcast -- ${targetTag === 'TargetKoor' ? 'target' : targetTag}\n`);
    process.exit(0);
  }

  // Koneksi Baileys dengan Reconnect & Resume Loop
  await createWASocketSession({
    authDir: AUTH_DIR,
    showQR: false,
    maxReconnectAttempts: 3,
    onOpen: async (sock) => {
      logger.info('BROADCAST_CLI', `WhatsApp terhubung! Memulai / melanjutkan pengiriman broadcast [${targetTag}]...\n`);

      const result = await broadcastService.runBroadcast({
        sock,
        targetTag
      });

      if (result.status === 'completed') {
        console.log('\n====================================================');
        console.log('🎉 SEMUA PESAN TARGET TELAH SELESAI DIKIRIM!');
        console.log(`• Berhasil Terkirim : ${result.successCount} kontak`);
        console.log(`• Gagal Terkirim    : ${result.failCount} kontak`);
        console.log(`• Sebelumnya Terkirim: ${result.previouslySent} kontak`);
        console.log('====================================================');
        console.log('💡 Bot utama (npm start) akan otomatis mencatat balasan mereka ke Google Sheets secara real-time.\n');
        process.exit(0);
      } else if (result.status === 'connection_lost') {
        logger.warn('BROADCAST_CLI', `⚠️ Broadcast terhenti di tengah jalan karena koneksi terputus. Menunggu reconnect otomatis untuk melanjutkan sisa ${result.remainingPending} kontak...`);
      }
    },
    onClose: ({ reason }) => {
      logger.error('BROADCAST_CLI', `Koneksi ditutup (${reason}). Broadcast belum selesai.`);
      process.exit(1);
    }
  });
}

main().catch((err) => {
  logger.error('BROADCAST_CLI', 'Fatal error saat broadcast CLI:', err);
  process.exit(1);
});
