/**
 * Structured Logger Module for WhatsApp Absensi Bot
 */

const LOG_LEVELS = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3
};

const currentLevel = (process.env.LOG_LEVEL || 'info').toLowerCase();
const currentLevelWeight = LOG_LEVELS[currentLevel] ?? LOG_LEVELS.info;

function formatTimestamp() {
  return new Date().toISOString();
}

function formatMeta(meta) {
  if (!meta || Object.keys(meta).length === 0) return '';
  try {
    return ' ' + JSON.stringify(meta);
  } catch {
    return '';
  }
}

export const logger = {
  debug(context, message, meta = null) {
    if (currentLevelWeight <= LOG_LEVELS.debug) {
      console.debug(`[${formatTimestamp()}] [DEBUG] [${context}] ${message}${formatMeta(meta)}`);
    }
  },

  info(context, message, meta = null) {
    if (currentLevelWeight <= LOG_LEVELS.info) {
      console.log(`[${formatTimestamp()}] [INFO]  [${context}] ${message}${formatMeta(meta)}`);
    }
  },

  warn(context, message, meta = null) {
    if (currentLevelWeight <= LOG_LEVELS.warn) {
      console.warn(`[${formatTimestamp()}] [WARN]  [${context}] ⚠️ ${message}${formatMeta(meta)}`);
    }
  },

  error(context, message, error = null) {
    if (currentLevelWeight <= LOG_LEVELS.error) {
      const errDetail = error instanceof Error ? `\nStack: ${error.stack}` : formatMeta(error);
      console.error(`[${formatTimestamp()}] [ERROR] [${context}] ❌ ${message}${errDetail}`);
    }
  }
};
