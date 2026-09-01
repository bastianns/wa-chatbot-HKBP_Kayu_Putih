import { config } from '../config.js';
import { logger } from './logger.js';

/**
 * Sanitasi string untuk mencegah Formula Injection / CSV Injection di Google Sheets
 * Karakter berbahaya: '=', '+', '-', '@', '\t', '\r'
 */
export function sanitizeFormula(value) {
  if (value === null || value === undefined) return '-';
  if (typeof value !== 'string') {
    value = String(value);
  }
  if (value.length === 0) return '-';

  const dangerousChars = ['=', '+', '-', '@', '\t', '\r'];
  const trimmed = value.trim();

  if (dangerousChars.includes(value.charAt(0)) || (trimmed.length > 0 && dangerousChars.includes(trimmed.charAt(0)))) {
    // Escape dengan prepend single quote ' agar dianggap teks literal murni
    return `'${value}`;
  }

  return trimmed.length > 0 ? trimmed : '-';
}

/**
 * Sanitasi seluruh payload sebelum dikirim ke Google Sheets
 */
export function sanitizePayload(payload) {
  if (!payload || typeof payload !== 'object') return {};

  return {
    tanggalLatihan: sanitizeFormula(payload.tanggalLatihan),
    namaAcara: sanitizeFormula(payload.namaAcara),
    nomorWa: sanitizeFormula(payload.nomorWa),
    nama: sanitizeFormula(payload.nama),
    seksi: sanitizeFormula(payload.seksi),
    status: sanitizeFormula(payload.status),
    keterangan: sanitizeFormula(payload.keterangan),
    alasan: sanitizeFormula(payload.alasan),
  };
}

/**
 * Mengirim payload absensi ke Google Apps Script Webhook
 * @param {Object} payload 
 */
export async function sendToGoogleSheets(payload) {
  if (!config.webhookUrl || config.webhookUrl.includes('GANTI_DENGAN_DEPLOYMENT_ID_ANDA')) {
    logger.warn('SHEETS', 'Webhook URL belum diisi di .env. Data tidak dikirim ke spreadsheet.');
    return { status: 'skipped', message: 'Webhook URL not configured' };
  }

  const sanitized = sanitizePayload(payload);

  try {
    logger.info('SHEETS', `Mengirim data absensi untuk ${sanitized.nama} (${sanitized.status})...`);
    
    const response = await fetch(config.webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(sanitized),
      redirect: 'follow', // Penting untuk Google Apps Script 302 redirect
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const resJson = await response.json().catch(() => ({ status: 'success' }));
    logger.info('SHEETS', `Berhasil tersimpan di spreadsheet untuk ${sanitized.nama}: ${JSON.stringify(resJson)}`);
    return resJson;
  } catch (error) {
    logger.error('SHEETS', `Gagal mengirim data ke spreadsheet untuk ${sanitized.nama}: ${error.message}`, error);
    return { status: 'error', message: error.message };
  }
}
