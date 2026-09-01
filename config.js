import dotenv from 'dotenv';
dotenv.config();

export const config = {
  webhookUrl: process.env.GOOGLE_SHEETS_WEBHOOK_URL || '',
  adminNumbers: (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map((num) => num.replace(/[^0-9]/g, ''))
    .filter(Boolean),
  minDelayMs: parseInt(process.env.MIN_DELAY_MS || '15000', 10),
  maxDelayMs: parseInt(process.env.MAX_DELAY_MS || '25000', 10),
  presenceTypingMs: parseInt(process.env.PRESENCE_TYPING_MS || '3000', 10),
  dbPath: process.env.DB_PATH || './absensi.db',
  logLevel: process.env.LOG_LEVEL || 'info',
};
