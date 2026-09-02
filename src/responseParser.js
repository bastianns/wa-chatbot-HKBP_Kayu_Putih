/**
 * Smart NLP & Fuzzy Response Parser untuk pesan WhatsApp Bahasa Indonesia / Sehari-hari
 */

export function parseAttendanceChoice(rawText) {
  if (!rawText) return 'UNKNOWN';
  const text = rawText.toLowerCase().trim();

  // Handle negasi khusus seperti "tidak telat", "gak telat", "ga telat" -> ini konfirmasi kehadiran
  if (/\b(tidak telat|gak telat|ga telat|nggak telat|ngga telat)\b/i.test(text)) {
    return 'BISA';
  }

  // Pola 'Tidak Bisa Hadir' (Gunakan Regex Word Boundary agar 'ga' tidak bentrok dengan 'gas' / 'tugas')
  const tidakPatterns = [
    /\b(2|tidak|tidak bisa|ngga|nggak|ga|gak|gak bisa|ga bisa|gabisa|absen|skip|izin|halangan|berhalangan|tidak hadir|gk bisa|skip dulu|blm bisa|belum bisa|ndak bisa|gaikut|ga ikut|absen dulu|g bisa|tdk bisa)\b/i
  ];

  // Pola 'Bisa Hadir'
  const bisaPatterns = [
    /\b(1|bisa|hadir|datang|ikut|gas|gass|aman|siap|bisa dong|hadir kak|hadir bang|bisa hadir|ikut latihan|ya|yes|pasti hadir|hadirr|bisaa|oke|ok|siap hadir|bisa ikut|hadir koor)\b/i
  ];

  // Prioritaskan cek kata-kata negatif / tidak bisa terlebih dahulu (misal: "tidak bisa", "ga bisa")
  if (/\b(tidak|gak|ngga|nggak|gabisa|skip|izin|halangan|berhalangan|absen)\b/i.test(text)) {
    if (/\b(tidak bisa|gak bisa|ga bisa|nggak bisa|ngga bisa|belum bisa|blm bisa|tidak hadir|gak hadir)\b/i.test(text)) {
      return 'TIDAK_BISA';
    }
  }

  for (const pattern of tidakPatterns) {
    if (pattern.test(text)) {
      return 'TIDAK_BISA';
    }
  }

  for (const pattern of bisaPatterns) {
    if (pattern.test(text)) {
      return 'BISA';
    }
  }

  return 'UNKNOWN';
}

export function parseTimeChoice(rawText) {
  if (!rawText) return 'UNKNOWN';
  const text = rawText.toLowerCase().trim();

  // Negasi: "gak telat", "tidak telat" -> ON_TIME
  if (/\b(tidak telat|gak telat|ga telat|nggak telat|ngga telat|bukan telat)\b/i.test(text)) {
    return 'ON_TIME';
  }

  const telatPatterns = [
    /\b(b|telat|terlambat|ngaret|agak telat|nyusul|nyusul ya|agak malam|telat dikit|telatt|agak telat kak|agak ngaret|nyampe jam|bisa tapi telat)\b/i,
    /\b(19\.[1-5][0-9]|19:[1-5][0-9]|20\.[0-5][0-9]|20:[0-5][0-9]|jam 8|jam 20|setengah 8|set 8)\b/i
  ];

  const onTimePatterns = [
    /\b(a|on-time|ontime|on time|tepat waktu|tepat|aman|jam 7|jam 19|jam 19\.00|jam 19:00|19\.00|19:00|pas waktu|pas|iya ontime|ya on time|on-time kak|tepat jam 7|on)\b/i
  ];

  for (const pattern of telatPatterns) {
    if (pattern.test(text) || text.includes('telat') || text.includes('ngaret') || text.includes('nyusul')) {
      return 'TELAT';
    }
  }

  for (const pattern of onTimePatterns) {
    if (pattern.test(text) || text.includes('on-time') || text.includes('ontime') || text.includes('on time') || text.includes('tepat waktu')) {
      return 'ON_TIME';
    }
  }

  return 'UNKNOWN';
}

export function parseSectionChoice(rawText) {
  if (!rawText) return 'UNKNOWN';
  const text = rawText.toLowerCase().trim();

  // Sopran 1 & 2
  if (text === '1a' || text.includes('sopran 1') || text.includes('soprano 1') || text.includes('s1')) return 'Sopran 1';
  if (text === '1b' || text.includes('sopran 2') || text.includes('soprano 2') || text.includes('s2')) return 'Sopran 2';
  if (text === '1' || text.includes('sopran') || text.includes('soprano')) return 'Sopran';

  // Alto 1 & 2
  if (text === '2a' || text.includes('alto 1') || text.includes('a1')) return 'Alto 1';
  if (text === '2b' || text.includes('alto 2') || text.includes('a2')) return 'Alto 2';
  if (text === '2' || text.includes('alto')) return 'Alto';

  // Tenor 1 & 2
  if (text === '3a' || text.includes('tenor 1') || text.includes('t1')) return 'Tenor 1';
  if (text === '3b' || text.includes('tenor 2') || text.includes('t2')) return 'Tenor 2';
  if (text === '3' || text.includes('tenor')) return 'Tenor';

  // Bass 1 & 2
  if (text === '4a' || text.includes('bass 1') || text.includes('bas 1') || text.includes('b1')) return 'Bass 1';
  if (text === '4b' || text.includes('bass 2') || text.includes('bas 2') || text.includes('b2')) return 'Bass 2';
  if (text === '4' || text.includes('bass') || text.includes('bas')) return 'Bass';

  // Pemusik
  if (text === '5' || text.includes('musik') || text.includes('pemusik') || text.includes('musisi') || text.includes('keyboard') || text.includes('gitar') || text.includes('drum')) return 'Pemusik';

  // Umum
  if (text === '6' || text.includes('umum') || text.includes('jemaat') || /\bbelum (tau|tahu|pilih|yakin|menentukan)\b/i.test(text)) return 'Umum';

  return 'UNKNOWN';
}
