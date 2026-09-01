import { makeWASocket, useMultiFileAuthState, DisconnectReason, fetchLatestBaileysVersion } from '@whiskeysockets/baileys';
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import qrcode from 'qrcode-terminal';
import { logger } from './logger.js';

/**
 * Mendeteksi apakah error saat kirim pesan disebabkan oleh koneksi WA terputus / socket down
 * Menggunakan state terkelola `sock._isOpen`, tidak bergantung pada struktur internal `sock.ws`
 */
export function isConnectionError(err, sock) {
  if (!sock || sock._isOpen === false) {
    return true;
  }
  if (!err) return false;

  const msg = (err.message || '').toLowerCase();
  const statusCode = (err.output?.statusCode) || (err.data?.status);

  // Kode status Disconnect / Timeout / Gateway error di Baileys / Boom
  const connectionStatusCodes = [408, 428, 440, 500, 502, 503, 504, 515];
  if (connectionStatusCodes.includes(statusCode)) {
    return true;
  }

  // Pola error message Baileys / WebSocket saat koneksi putus
  const connectionPatterns = [
    'connection closed',
    'connection lost',
    'socket connection',
    'timed out',
    'timeout',
    'websocket was closed',
    'rate-overlimit',
    'restart required',
    'stream error'
  ];

  return connectionPatterns.some((pattern) => msg.includes(pattern));
}

/**
 * Factory untuk membuat koneksi Baileys dengan retry limiter & reconnect loop terpadu
 */
export async function createWASocketSession({
  authDir = path.resolve('./auth_info_baileys'),
  showQR = false,
  maxReconnectAttempts = 3,
  onOpen = async () => {},
  onClose = () => {},
  onMessage = async () => {}
}) {
  let reconnectCount = 0;
  let isShuttingDown = false;

  async function connect() {
    const { state, saveCreds } = await useMultiFileAuthState(authDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: 'silent' }),
      printQRInTerminal: false,
      auth: state,
      generateHighQualityLinkPreview: true,
      browser: ['Ubuntu', 'Chrome', '20.0.04']
    });

    // State flag terkelola internal bot
    sock._isOpen = false;

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr && showQR) {
        console.log('📲 Silakan scan QR Code di bawah ini menggunakan WhatsApp di HP Anda:\n');
        qrcode.generate(qr, { small: true });
        console.log('\n(Buka WA di HP > Perangkat Tertaut / Linked Devices > Tautkan Perangkat)');
      }

      if (connection === 'close') {
        // Set _isOpen = false seketika saat socket tertutup
        sock._isOpen = false;

        const statusCode = (lastDisconnect?.error)?.output?.statusCode;
        const isLoggedOut = statusCode === DisconnectReason.loggedOut;
        const errorMessage = lastDisconnect?.error?.message || 'Connection lost';

        logger.warn('CONNECTION', `Koneksi terputus (${errorMessage}). Status Code: ${statusCode || 'N/A'}`);

        if (isLoggedOut) {
          logger.error('CONNECTION', 'Sesi WhatsApp telah Logout/Kedaluwarsa. Menghapus sesi lama...');
          try {
            fs.rmSync(authDir, { recursive: true, force: true });
          } catch (e) {}
          onClose({ reason: 'LOGGED_OUT', error: lastDisconnect?.error });
          return;
        }

        if (isShuttingDown) return;

        if (reconnectCount < maxReconnectAttempts) {
          reconnectCount++;
          const backoffDelay = reconnectCount * 3000; // 3s, 6s, 9s
          logger.info('CONNECTION', `Mencoba menghubungkan ulang (${reconnectCount}/${maxReconnectAttempts}) dalam ${backoffDelay / 1000} detik...`);
          setTimeout(() => connect(), backoffDelay);
        } else {
          logger.error('CONNECTION', `Batas maksimal reconnect (${maxReconnectAttempts}x) tercapai. Menghentikan proses.`);
          onClose({ reason: 'MAX_RETRIES_REACHED', error: lastDisconnect?.error });
        }
      } else if (connection === 'open') {
        // Set _isOpen = true saat socket sukses terbuka
        sock._isOpen = true;
        reconnectCount = 0; // Reset counter saat sukses terhubung
        logger.info('CONNECTION', 'WhatsApp Berhasil Terhubung!');
        await onOpen(sock);
      }
    });

    sock.ev.on('messages.upsert', async (m) => {
      try {
        await onMessage(sock, m);
      } catch (err) {
        logger.error('MESSAGE_HANDLER', 'Error handling message:', err);
      }
    });

    return {
      sock,
      close: () => {
        isShuttingDown = true;
        sock._isOpen = false;
        try {
          sock.end(undefined);
        } catch (e) {}
      }
    };
  }

  return connect();
}
