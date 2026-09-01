import { config } from '../config.js';
import { stateManager } from './stateManager.js';
import { sendToGoogleSheets } from './sheetsService.js';
import { eventManager } from './eventManager.js';
import { memberManager } from './memberManager.js';
import { attendanceTracker } from './attendanceTracker.js';
import { parseAttendanceChoice, parseTimeChoice, parseSectionChoice } from './responseParser.js';
import { messageTemplates } from './messageTemplates.js';
import { broadcastService } from './broadcastService.js';
import { logger } from './logger.js';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRandomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Membersihkan input nama dari kata sapaan santai
 */
export function cleanNameInput(rawText) {
  if (!rawText || typeof rawText !== 'string') return '';
  let cleaned = rawText.trim()
    .replace(/^(nama saya|namaku|nama|saya|halo saya|halo|hai|salam)\s+/i, '')
    .replace(/\s+(aku bisa hadirr?|bisa hadirr?|hadirr?|ya kak|kak|terima kasih|makasih)$/i, '')
    .trim();
  return cleaned.length >= 2 ? cleaned : rawText.trim();
}

/**
 * Validasi nama menggunakan Allowlist berbasis pola nama orang yang wajar
 * - Minimal 2 token (kata / bagian nama)
 * - Hanya karakter alfabet, spasi, titik, apostrof, dan tanda hubung: /^[a-zA-Z .'-]+$/
 * - Menolak kata berulang (seperti "Iya iya", "halo halo") dan frasa percakapan non-nama
 */
export function isValidName(name) {
  if (!name || typeof name !== 'string') return false;
  const trimmed = name.trim();

  // Panjang wajar nama orang
  if (trimmed.length < 4 || trimmed.length > 60) return false;

  // Strict allowlist pattern (hanya huruf, spasi, titik, apostrof, dan strip)
  if (!/^[a-zA-Z .'-]+$/.test(trimmed)) return false;

  // Pisahkan token berdasarkan spasi atau tanda hubung
  const tokens = trimmed.split(/[\s-]+/).filter(Boolean);
  if (tokens.length < 2) return false;

  // Validasi kata kunci percakapan non-nama
  const nonNameKeywords = new Set([
    'iya', 'ya', 'tidak', 'gak', 'ngga', 'nggak', 'bisa', 'hadir', 'absen',
    'ok', 'oke', 'kak', 'kakak', 'bang', 'min', 'admin', 'pengurus', 'bot',
    'halo', 'hai', 'hello', 'shalom', 'salam', 'pagi', 'siang', 'sore', 'malam',
    'tes', 'test', 'siap', 'gas', 'gass', 'ikut', 'izin', 'skip', 'datang',
    'latihan', 'koor', 'gereja', 'naposo', 'terima', 'kasih', 'makasih', 'ulang', 'batal'
  ]);

  const cleanTokens = tokens.map((t) => t.toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean);
  if (cleanTokens.length < 2) return false;

  // Tolak jika semua token sama (misal: "Iya iya", "tes tes")
  const firstToken = cleanTokens[0];
  const allIdentical = cleanTokens.every((t) => t === firstToken);
  if (allIdentical) return false;

  // Tolak jika mengandung kata kunci respon absensi / sapaan non-nama
  const hasKeyword = cleanTokens.some((t) => nonNameKeywords.has(t));
  if (hasKeyword) return false;

  // Pastikan minimal ada 1 token dengan panjang >= 2 huruf
  const hasLongToken = cleanTokens.some((t) => t.length >= 2);
  if (!hasLongToken) return false;

  return true;
}

/**
 * Helper untuk mengirim pesan WA dengan simulasi mengetik
 */
async function sendMessage(sock, jid, text) {
  try {
    if (sock.sendPresenceUpdate && config.presenceTypingMs > 0) {
      await sock.sendPresenceUpdate('composing', jid);
      await sleep(Math.min(config.presenceTypingMs, 300));
      await sock.sendPresenceUpdate('paused', jid);
    }
    if (sock.sendMessage) {
      await sock.sendMessage(jid, { text });
    }
  } catch (err) {
    logger.error('BOT_HANDLER', `Gagal mengirim pesan ke ${jid}: ${err.message}`, err);
  }
}

/**
 * Helper untuk menentukan pesan reminder dan menyelaraskan state percakapan user
 */
export function resolveReminderState(phone, trackerItem, currentEvent) {
  const cleanPhone = memberManager.normalizePhone(phone);
  const jid = `${cleanPhone}@s.whatsapp.net`;
  const member = memberManager.findMember(cleanPhone);
  const session = stateManager.getSession(jid);

  let name = '';
  if (isValidName(member?.name)) {
    name = member.name.trim();
  } else if (isValidName(trackerItem?.name)) {
    name = trackerItem.name.trim();
  } else if (isValidName(session.data?.nama)) {
    name = session.data.nama.trim();
  }

  session.data.seksi = member?.seksi || trackerItem?.seksi || session.data?.seksi || 'Umum';
  session.data.namaAcara = currentEvent.namaAcara;
  session.data.tanggalLatihan = currentEvent.waktuLatihan;

  // 1. Jika belum tahu nama -> ulang dari awal (tanya nama)
  if (!name) {
    session.step = 'WAITING_NAME_REGISTRATION';
    session.data.nama = 'Anggota';
    stateManager.updateSession(jid, session);

    const reminderMsg =
      `Shalom rekan-rekan Naposo HKBP Kayu Putih! 👋✨\n\n` +
      `Sekadar mengingatkan untuk pendataan kehadiran latihan paduan suara *${currentEvent.namaAcara}* (${currentEvent.waktuLatihan}). 🙏\n\n` +
      `Sebelum kami catat, boleh minta tolong ketikkan *Nama Lengkap* Anda terlebih dahulu?`;

    return {
      phone: cleanPhone,
      jid,
      name: '(Belum Ada Nama)',
      step: 'WAITING_NAME_REGISTRATION',
      reminderMsg
    };
  }

  // 2. Jika nama sudah diketahui -> lanjutkan dari state terakhir
  session.data.nama = name;

  if (session.step === 'WAITING_ONTIME' || (trackerItem?.status === 'PARTIAL_HADIR' && session.step !== 'WAITING_LATE_TIME')) {
    session.step = 'WAITING_ONTIME';
    stateManager.updateSession(jid, session);

    const reminderMsg =
      `Shalom Kak *${name}*! 🙏\n\n` +
      `Terima kasih sebelumnya sudah konfirmasi *Bisa Hadir* untuk *${currentEvent.namaAcara}*.\n\n` +
      `Sekadar mengingatkan, apakah Kakak bisa hadir *on-time* (${currentEvent.targetOnTime})?\n\n` +
      `Balas dengan huruf atau kata:\n` +
      `*A.* Ya, On-Time ⏰\n` +
      `*B.* Telat ⏳`;

    return { phone: cleanPhone, jid, name, step: 'WAITING_ONTIME', reminderMsg };
  }

  if (session.step === 'WAITING_LATE_TIME') {
    stateManager.updateSession(jid, session);

    const reminderMsg =
      `Shalom Kak *${name}*! 🙏\n\n` +
      `Sekadar mengingatkan untuk konfirmasi estimasi jam tiba Kakak di latihan *${currentEvent.namaAcara}* yaa 🕒\n\n` +
      `_(Contoh: Ketik *19.30*, *Jam 8 malam*, atau *19.45 kena macet*)_`;

    return { phone: cleanPhone, jid, name, step: 'WAITING_LATE_TIME', reminderMsg };
  }

  if (session.step === 'WAITING_REASON' || trackerItem?.status === 'PARTIAL_TIDAK') {
    session.step = 'WAITING_REASON';
    stateManager.updateSession(jid, session);

    const reminderMsg =
      `Shalom Kak *${name}*! 🙏\n\n` +
      `Terima kasih sudah konfirmasi. Sekadar mengingatkan untuk mencantumkan alasan singkat ketidakhadiran Kakak yaa. 🙏\n\n` +
      `_(Contoh: Sakit / Lembur kerja / Ada acara keluarga)_`;

    return { phone: cleanPhone, jid, name, step: 'WAITING_REASON', reminderMsg };
  }

  session.step = 'WAITING_ATTENDANCE';
  stateManager.updateSession(jid, session);

  const reminderMsg =
    `Shalom Kak *${name}*! 🙏\n\n` +
    `Sekadar mengingatkan untuk konfirmasi kehadiran *${currentEvent.namaAcara}* (${currentEvent.waktuLatihan}) yaa..\n\n` +
    `*Apakah Kak ${name} bisa hadir latihan?*\n\n` +
    `Silakan balas dengan angka atau kata:\n` +
    `*1.* Bisa Hadir ✅\n` +
    `*2.* Tidak Bisa Hadir ❌\n\n` +
    `Mohon bantuannya untuk membalas agar pengurus bisa mendata kehadiran dengan baik. Terima kasih! ✨`;

  return { phone: cleanPhone, jid, name, step: 'WAITING_ATTENDANCE', reminderMsg };
}

/**
 * Handle Background Reminder dari chat WhatsApp Admin
 */
async function startBackgroundReminder(sock, adminJid) {
  const pendingMembers = attendanceTracker.getPendingMembers();

  if (pendingMembers.length === 0) {
    await sendMessage(sock, adminJid, `🎉 Hebat! Semua anggota sudah membalas atau belum ada sesi broadcast aktif.`);
    return;
  }

  if (broadcastService.isBroadcasting()) {
    await sendMessage(sock, adminJid, `⚠️ Sedang ada pengiriman pesan yang berjalan. Mohon tunggu sebentar.`);
    return;
  }

  const currentEvent = eventManager.getEvent();

  await sendMessage(
    sock,
    adminJid,
    `🔔 *MEMULAI PENGIRIMAN REMINDER KE ${pendingMembers.length} ANGGOTA*\n\n` +
    `_Bot sedang mengirimkan chat pengingat sesuai progress state terakhir masing-masing anggota..._`
  );

  (async () => {
    let successCount = 0;
    let failCount = 0;

    for (let i = 0; i < pendingMembers.length; i++) {
      const item = pendingMembers[i];
      const target = resolveReminderState(item.phone, item, currentEvent);

      try {
        await sendMessage(sock, target.jid, target.reminderMsg);
        successCount++;
        logger.info('REMINDER', `[${i + 1}/${pendingMembers.length}] 🔔 State: ${target.step} | Terkirim ke: ${target.name} (${target.phone})`);
      } catch (err) {
        failCount++;
        logger.error('REMINDER', `[${i + 1}/${pendingMembers.length}] ❌ Gagal ke: ${target.phone}`, err);
      }

      if (i < pendingMembers.length - 1) {
        const delay = getRandomDelay(config.minDelayMs, config.maxDelayMs);
        await sleep(delay);
      }
    }

    await sendMessage(
      sock,
      adminJid,
      `🎉 *REMINDER SELESAI TERKIRIM!*\n\n` +
      `• *Berhasil Terkirim:* ${successCount} pesan\n` +
      `• *Gagal:* ${failCount} pesan\n\n` +
      `Semua pesan reminder telah dikirim sesuai state terakhir masing-masing anggota.`
    );
  })().catch((err) => {
    logger.error('REMINDER', 'Error in reminder loop:', err);
  });
}

/**
 * Handle pesan masuk dari WhatsApp
 */
export async function handleIncomingMessage(sock, m) {
  if (!m.messages || m.messages.length === 0) return;

  const msg = m.messages[0];
  const remoteJid = msg.key.remoteJid;
  if (!remoteJid) return;

  const botNumber = sock.user?.id ? memberManager.normalizePhone(sock.user.id) : '';
  const botLid = sock.user?.lid ? memberManager.normalizePhone(sock.user.lid) : '';
  const senderPhone = memberManager.normalizePhone(remoteJid);
  const isLidSender = remoteJid.endsWith('@lid') || (!remoteJid.endsWith('@g.us') && !/^628\d{8,12}$/.test(senderPhone));

  // Cek apakah nomor ini adalah akun bot itu sendiri
  const isSelf = senderPhone === botNumber || (botLid && senderPhone === botLid);
  const userIsAdmin = memberManager.isAdmin(senderPhone) || isSelf;

  // Abaikan pesan dari bot ke orang lain agar tidak looping
  if (msg.key.fromMe && !isSelf) return;

  // Ekstrak teks pesan
  const messageContent =
    msg.message?.conversation ||
    msg.message?.extendedTextMessage?.text ||
    msg.message?.buttonsResponseMessage?.selectedButtonId ||
    msg.message?.listResponseMessage?.singleSelectReply?.selectedRowId ||
    '';

  const rawText = messageContent.trim();
  if (!rawText) return;

  const cleanText = rawText.toLowerCase().trim();
  logger.info('INBOUND', `Dari: ${senderPhone} (${remoteJid}) | Admin: ${userIsAdmin ? 'YA' : 'TIDAK'} | Pesan: "${rawText}"`);

  // =========================================================================
  // 1. ADMIN COMMANDS
  // =========================================================================
  if (userIsAdmin) {
    // help / /help / admin / /admin / menu
    if (cleanText === '/help' || cleanText === 'help' || cleanText === '/admin' || cleanText === 'admin' || cleanText === 'menu') {
      const adminMember = memberManager.findMember(senderPhone);
      const adminName = adminMember?.name ? adminMember.name.split(' ')[0] : 'Pengurus';
      const counts = memberManager.getCounts();
      const helpMsg = messageTemplates.getHelpMessage(counts, adminName);
      await sendMessage(sock, remoteJid, helpMsg);
      return;
    }

    // broadcast [tag]
    if (cleanText.startsWith('/broadcast') || cleanText.startsWith('broadcast')) {
      const targetTag = cleanText.replace(/^\/?broadcast/i, '').trim() || 'target';
      let tag = targetTag;
      if (tag.toLowerCase() === 'target') tag = 'TargetKoor';

      const members = memberManager.getMembersByTag(tag);
      if (!Array.isArray(members) || members.length === 0) {
        await sendMessage(
          sock,
          remoteJid,
          `⚠️ Tidak ada anggota yang ditemukan untuk target *"${targetTag}"*.\n\n💡 _Gunakan: broadcast target, broadcast all, broadcast pengurus, dsb._`
        );
        return;
      }

      if (broadcastService.isBroadcasting()) {
        await sendMessage(sock, remoteJid, `⚠️ Sedang ada proses broadcast yang berjalan di background. Mohon tunggu hingga selesai.`);
        return;
      }

      const currentEvent = eventManager.getEvent();
      const totalMinutes = Math.round((members.length * 20) / 60);

      await sendMessage(
        sock,
        remoteJid,
        `📢 *MEMULAI BROADCAST KE [${tag.toUpperCase()}]*\n\n` +
        `👥 *Jumlah Target:* ${members.length} anggota\n` +
        `📌 *Acara:* ${currentEvent.namaAcara}\n` +
        `🛡️ *Jeda Aman:* 15-25 detik per orang\n` +
        `⏱️ *Estimasi Waktu:* ± ${totalMinutes > 0 ? totalMinutes : 1} menit\n\n` +
        `_Bot sedang mengirimkan chat ke setiap orang di background. Anda akan menerima laporan jika sudah selesai!_ 🚀`
      );

      // Jalankan asinkron
      broadcastService.runBroadcast({
        sock,
        targetTag: tag,
        adminJid: remoteJid
      }).then(async (res) => {
        if (res.status === 'completed') {
          await sendMessage(
            sock,
            remoteJid,
            `🎉 *BROADCAST SELESAI!*\n\n` +
            `• *Target:* ${res.targetTag}\n` +
            `• *Berhasil Terkirim:* ${res.successCount} pesan\n` +
            `• *Gagal:* ${res.failCount} pesan\n\n` +
            `Setiap ada anggota yang membalas, datanya otomatis masuk ke Google Sheets. Ketik *rekap* kapan saja untuk memantau kehadiran!`
          );
        }
      }).catch((err) => {
        logger.error('BROADCAST', 'Error in background broadcast:', err);
      });

      return;
    }

    // remind / /remind
    if (cleanText === '/remind' || cleanText === 'remind') {
      await startBackgroundReminder(sock, remoteJid);
      return;
    }

    // preview / /preview
    if (cleanText === '/preview' || cleanText === 'preview') {
      const ev = eventManager.getEvent();
      const counts = memberManager.getCounts();
      const previewMsg = messageTemplates.getPreviewMessage(ev, counts);
      await sendMessage(sock, remoteJid, previewMsg);
      return;
    }

    // gruplist / /gruplist
    if (cleanText === '/gruplist' || cleanText === 'gruplist') {
      try {
        const groups = sock.groupFetchAllParticipating ? await sock.groupFetchAllParticipating() : {};
        const groupList = Object.values(groups);

        if (groupList.length === 0) {
          await sendMessage(sock, remoteJid, `⚠️ Bot belum dimasukkan ke grup WhatsApp manapun. Silakan masukkan nomor bot ke grup Anda terlebih dahulu.`);
          return;
        }

        let listText = `📋 *DAFTAR GRUP WHATSAPP YANG DIIKUTI BOT (${groupList.length} Grup):*\n\n`;
        groupList.forEach((g, idx) => {
          listText += `*${idx + 1}.* ${g.subject} (${g.participants?.length || 0} anggota)\n`;
        });
        listText += `\n💡 _Ketik *syncgroup [Nomor]* untuk otomatis menarik anggota grup._ (Contoh: *syncgroup 1*)`;

        await sendMessage(sock, remoteJid, listText);
      } catch (err) {
        await sendMessage(sock, remoteJid, `❌ Gagal mengambil daftar grup: ${err.message}`);
      }
      return;
    }

    // syncgroup / /syncgroup
    if (cleanText.startsWith('/syncgroup') || cleanText.startsWith('syncgroup')) {
      try {
        const groups = sock.groupFetchAllParticipating ? await sock.groupFetchAllParticipating() : {};
        const groupList = Object.values(groups);

        if (groupList.length === 0) {
          await sendMessage(sock, remoteJid, `⚠️ Bot belum dimasukkan ke grup WhatsApp manapun.`);
          return;
        }

        const query = cleanText.replace(/^\/?syncgroup/i, '').trim();
        let targetGroup = null;

        const idx = parseInt(query, 10) - 1;
        if (!isNaN(idx) && idx >= 0 && groupList[idx]) {
          targetGroup = groupList[idx];
        } else if (query.length > 0) {
          targetGroup = groupList.find((g) => g.subject.toLowerCase().includes(query));
        }

        if (!targetGroup) {
          let listText = `⚠️ *Grup "${query}" tidak ditemukan.*\n\n📋 *Berikut grup yang tersedia:*\n`;
          groupList.forEach((g, i) => {
            listText += `*${i + 1}.* ${g.subject} (${g.participants?.length || 0} anggota)\n`;
          });
          listText += `\n👉 Silakan ketik nomor yang sesuai (contoh: *syncgroup 1*).`;
          await sendMessage(sock, remoteJid, listText);
          return;
        }

        const added = memberManager.syncFromGroup(targetGroup.participants || [], targetGroup.subject);

        await sendMessage(
          sock,
          remoteJid,
          `✅ *SUKSES SINKRONISASI GRUP!*\n\n` +
          `• *Grup:* ${targetGroup.subject}\n` +
          `• *Total Anggota Grup:* ${targetGroup.participants?.length || 0} orang\n` +
          `• *Nomor Baru Ditambahkan:* ${added} nomor\n\n` +
          `Semua nomor telah tersimpan di database bot! Anda bisa langsung ketik *broadcast all* di WA ini untuk menyapa mereka satu per satu.`
        );
      } catch (err) {
        await sendMessage(sock, remoteJid, `❌ Gagal sinkronisasi grup: ${err.message}`);
      }
      return;
    }

    // tutup / /tutup
    if (cleanText === '/tutup' || cleanText === 'tutup') {
      eventManager.setClosed(true);
      await sendMessage(sock, remoteJid, `🔒 *ABSENSI TELAH DITUTUP.*\nAnggota yang mencoba mengisi absensi akan diberi tahu bahwa batas waktu sudah selesai.`);
      return;
    }

    // buka / /buka
    if (cleanText === '/buka' || cleanText === 'buka') {
      eventManager.setClosed(false);
      await sendMessage(sock, remoteJid, `🔓 *ABSENSI TELAH DIBUKA KEMBALI.*\nAnggota sekarang bisa mengisi konfirmasi kehadiran.`);
      return;
    }

    // event / /event
    if (cleanText === '/event' || cleanText === 'event') {
      const ev = eventManager.getEvent();
      const eventMsg =
        `📌 *INFO ACARA LATIHAN SAAT INI*\n\n` +
        `• *Acara:* ${ev.namaAcara}\n` +
        `• *Waktu:* ${ev.waktuLatihan}\n` +
        `• *Lokasi:* ${ev.lokasi}\n` +
        `• *Tujuan:* ${ev.tujuan}\n` +
        `• *Target On-Time:* ${ev.targetOnTime}\n` +
        `• *Batas Pengisian:* ${ev.batasWaktu || 'Pukul 18:00 WIB'}\n` +
        `• *Status Pendaftaran:* ${ev.isClosed ? '🔴 DITUTUP' : '🟢 DIBUKA'}\n\n` +
        `_Ketik *setevent* untuk mengubah info di atas._`;
      await sendMessage(sock, remoteJid, eventMsg);
      return;
    }

    // setevent / /setevent
    if (cleanText.startsWith('/setevent') || cleanText.startsWith('setevent')) {
      const content = rawText.replace(/^\/?setevent/i, '').trim();
      const parts = content.split('|').map((p) => p.trim());

      if (parts.length < 2) {
        await sendMessage(
          sock,
          remoteJid,
          `⚠️ Format salah.\n\n*Format yang benar:*\nsetevent [Nama Acara] | [Waktu Latihan] | [Lokasi] | [Tujuan]\n\n*Contoh:*\nsetevent Latihan Koor Naposo | Sabtu, 29 Agustus 2026 19.00 WIB | Gereja HKBP Kayu Putih | Pengisian Koor Minggu 30 Agustus 2026 Jam 10.00`
        );
        return;
      }

      const updated = eventManager.updateEvent({
        namaAcara: parts[0] || 'Latihan Koor',
        waktuLatihan: parts[1] || 'Pukul 19:00 WIB',
        lokasi: parts[2] || 'Gereja HKBP Kayu Putih',
        tujuan: parts[3] || 'Pelayanan Koor',
        targetOnTime: '19:00 WIB'
      });

      attendanceTracker.startNewEvent(updated.namaAcara, updated.waktuLatihan);

      const confirmMsg =
        `✅ *INFO ACARA BERHASIL DIPERBARUI!*\n\n` +
        `• *Acara:* ${updated.namaAcara}\n` +
        `• *Waktu:* ${updated.waktuLatihan}\n` +
        `• *Lokasi:* ${updated.lokasi}\n` +
        `• *Tujuan:* ${updated.tujuan}\n\n` +
        `Ketik *umumkan* untuk mendapatkan teks broadcast grup.`;

      await sendMessage(sock, remoteJid, confirmMsg);
      return;
    }

    // rekap / /rekap
    if (cleanText === '/rekap' || cleanText === 'rekap') {
      const summary = attendanceTracker.getSummary();
      const ev = eventManager.getEvent();
      const rekapMsg = messageTemplates.getRekapMessage(ev, summary);
      await sendMessage(sock, remoteJid, rekapMsg);
      return;
    }

    // pending / /pending
    if (cleanText === '/pending' || cleanText === 'pending') {
      const pendingList = attendanceTracker.getPendingMembers();
      if (pendingList.length === 0) {
        await sendMessage(sock, remoteJid, `🎉 Semua anggota sudah membalas lengkap atau belum ada broadcast yang dikirim.`);
        return;
      }

      let textList = `📋 *DAFTAR ANGGOTA BELUM MEMBALAS / BELUM LENGKAP (${pendingList.length} Orang):*\n\n`;
      pendingList.forEach((m, idx) => {
        const noteBadge = m.note ? `\n   ↳ _(${m.note})_` : '';
        textList += `*${idx + 1}.* *${m.name || 'Nomor Baru'}* (${m.seksi || 'Umum'}) - ${m.phone}${noteBadge}\n`;
      });
      textList += `\n💡 _Tips: Ketik *remind* di WA ini untuk mengirim reminder otomatis ke mereka._`;

      await sendMessage(sock, remoteJid, textList);
      return;
    }

    // anggota / /anggota [seksi] / member / /member
    if (cleanText.startsWith('/anggota') || cleanText.startsWith('anggota') || cleanText.startsWith('/member') || cleanText.startsWith('member')) {
      const tag = cleanText.replace(/^\/?(anggota|member)/i, '').trim() || 'all';
      const members = memberManager.getMembersByTag(tag);
      const msg = messageTemplates.getMemberListMessage(members, tag);
      await sendMessage(sock, remoteJid, msg);
      return;
    }

    // cari / /cari [nama / nomor] / cek / /cek
    if (cleanText.startsWith('/cari') || cleanText.startsWith('cari') || cleanText.startsWith('/cek') || cleanText.startsWith('cek')) {
      const keyword = rawText.replace(/^\/?(cari|cek)/i, '').trim();
      if (!keyword) {
        await sendMessage(
          sock,
          remoteJid,
          `⚠️ Mohon sertakan nama atau nomor HP yang ingin dicari.\n\n*Contoh:*\n• *cari Bastian*\n• *cari Ruth*\n• *cari 0812*`
        );
        return;
      }

      const results = memberManager.searchMembers(keyword);
      const currentEvent = eventManager.getEvent();
      const records = attendanceTracker.getEventAttendance(currentEvent.id);
      const attendanceMap = {};
      records.forEach((r) => {
        attendanceMap[r.phone] = r;
      });

      const msg = messageTemplates.getMemberSearchResultMessage(keyword, results, attendanceMap);
      await sendMessage(sock, remoteJid, msg);
      return;
    }

    // riwayat / /riwayat [ID]
    if (cleanText.startsWith('/riwayat') || cleanText.startsWith('riwayat')) {
      const param = cleanText.replace(/^\/?riwayat/i, '').trim();

      if (param) {
        const eventId = parseInt(param, 10);
        const ev = eventManager.getEventById(eventId);
        if (!ev) {
          await sendMessage(sock, remoteJid, `⚠️ Acara dengan ID #${param} tidak ditemukan.`);
          return;
        }

        const summary = attendanceTracker.getSummary(eventId);
        const detailMsg = messageTemplates.getRekapMessage(ev, summary);
        await sendMessage(sock, remoteJid, detailMsg);
        return;
      }

      const pastEvents = eventManager.getPastEvents(10);
      const eventsWithSummary = pastEvents.map((ev) => {
        const sum = attendanceTracker.getSummary(ev.id);
        return {
          id: ev.id,
          namaAcara: ev.namaAcara,
          waktuLatihan: ev.waktuLatihan,
          isActive: ev.isActive,
          totalHadir: sum.targetKoor.totalHadir,
          totalTidakHadir: sum.targetKoor.totalTidakHadir,
          overallTotalResponded: sum.overallTotalResponded
        };
      });

      const historyMsg = messageTemplates.getHistoryListMessage(eventsWithSummary);
      await sendMessage(sock, remoteJid, historyMsg);
      return;
    }

    // umumkan / /umumkan / link / /link
    if (cleanText === '/umumkan' || cleanText === 'umumkan' || cleanText === '/link' || cleanText === 'link') {
      const announcement = eventManager.getAnnouncementText(botNumber);
      await sendMessage(sock, remoteJid, announcement);
      return;
    }
  }

  // Jika pesan dari grup
  if (remoteJid.endsWith('@g.us')) {
    if (cleanText === '!link' || cleanText === '!absen' || cleanText === 'link' || cleanText === 'absen') {
      const announcement = eventManager.getAnnouncementText(botNumber);
      await sendMessage(sock, remoteJid, announcement);
    }
    return;
  }

  // =========================================================================
  // 2. CEK STATUS PENUTUPAN / CUT-OFF DEADLINE
  // =========================================================================
  const currentEvent = eventManager.getEvent();
  if (currentEvent.isClosed && !userIsAdmin) {
    const closedMsg = messageTemplates.getClosedMessage(currentEvent);
    await sendMessage(sock, remoteJid, closedMsg);
    return;
  }

  // =========================================================================
  // 3. ALUR PERCAKAPAN PERSONAL (PRIVATE CHAT)
  // =========================================================================

  // Resolusi Identitas
  let member = memberManager.findMember(senderPhone);
  let knownName = (member && isValidName(member.name)) ? member.name.trim() : (isValidName(msg.pushName) ? msg.pushName.trim() : '');
  let seksi = member ? member.seksi : (userIsAdmin ? 'Pengurus' : 'Umum');
  let effectivePhone = member?.phone || senderPhone;

  const sessionKey = `${senderPhone}@s.whatsapp.net`;
  const session = stateManager.getSession(sessionKey, knownName || 'Saudara/i');
  session.data.seksi = seksi;
  session.data.nomorWa = effectivePhone;

  // Jika admin, pastikan tidak tersangkut di WAITING_NAME_REGISTRATION / WAITING_LID
  if (userIsAdmin && (session.step === 'WAITING_NAME_REGISTRATION' || session.step === 'WAITING_LID_PHONE_CONFIRMATION')) {
    session.step = 'IDLE';
  }

  // Handle Konfirmasi Nomor HP untuk Pengirim LID yang Belum Terpetakan
  if (session.step === 'WAITING_LID_PHONE_CONFIRMATION') {
    const inputPhone = rawText.replace(/[^0-9+]/g, '');
    if (memberManager.isValidIndonesianPhone(inputPhone)) {
      const normalizedInput = memberManager.normalizePhone(inputPhone);
      memberManager.setLidMapping(senderPhone, normalizedInput);

      const resolvedMember = memberManager.findMember(normalizedInput);
      if (resolvedMember && isValidName(resolvedMember.name)) {
        session.data.nama = resolvedMember.name;
        session.data.seksi = resolvedMember.seksi || 'Umum';
        session.data.nomorWa = normalizedInput;
        session.step = 'WAITING_ATTENDANCE';
        stateManager.updateSession(sessionKey, session);

        await sendMessage(sock, remoteJid, messageTemplates.getLidVerificationSuccess(normalizedInput));
        await sendMessage(sock, remoteJid, messageTemplates.getKnownMemberGreeting(resolvedMember.name, currentEvent));
        return;
      } else {
        session.data.nomorWa = normalizedInput;
        session.step = 'WAITING_NAME_REGISTRATION';
        stateManager.updateSession(sessionKey, session);

        await sendMessage(sock, remoteJid, messageTemplates.getLidVerificationSuccess(normalizedInput));
        await sendMessage(sock, remoteJid, messageTemplates.getNewMemberGreeting(currentEvent));
        return;
      }
    } else {
      await sendMessage(sock, remoteJid, `Mohon masukkan format nomor HP WhatsApp yang benar yaa (contoh: *08123456789* atau *628123456789*). 🙏`);
      return;
    }
  }

  // Jika pengirim adalah LID baru dan belum terpetakan sama sekali (bukan admin dan bukan nomor terdaftar)
  if (isLidSender && !memberManager.getLidMapping(senderPhone) && !member && session.step === 'IDLE') {
    session.step = 'WAITING_LID_PHONE_CONFIRMATION';
    stateManager.updateSession(sessionKey, session);
    await sendMessage(sock, remoteJid, messageTemplates.getLidVerificationRequest());
    return;
  }

  // Command #ubah / ubah / edit / ganti (Mengubah RSVP)
  if (cleanText === '#ubah' || cleanText === 'ubah' || cleanText === 'edit' || cleanText === 'ganti') {
    stateManager.clearSession(sessionKey);
    const reSession = stateManager.getSession(sessionKey, knownName || 'Saudara/i');
    reSession.step = 'WAITING_ATTENDANCE';
    reSession.data.nama = knownName || 'Saudara/i';
    reSession.data.namaAcara = currentEvent.namaAcara;
    reSession.data.tanggalLatihan = currentEvent.waktuLatihan;
    stateManager.updateSession(sessionKey, reSession);

    const reAskMsg =
      `🔄 *PERBARUI KONFIRMASI KEHADIRAN*\n\n` +
      `Halo Kak *${reSession.data.nama}*, silakan pilih kembali kehadiran Anda untuk *${currentEvent.namaAcara}*:\n\n` +
      `*1.* Bisa Hadir ✅\n` +
      `*2.* Tidak Bisa Hadir ❌`;

    await sendMessage(sock, remoteJid, reAskMsg);
    return;
  }

  // Command reset / batal
  if (cleanText === 'ulang' || cleanText === 'reset' || cleanText === '/batal' || cleanText === 'batal') {
    stateManager.clearSession(sessionKey);
    await sendMessage(
      sock,
      remoteJid,
      `🔄 Sesi absensi Anda telah di-reset.\n\nKetik *Absen* kapan saja untuk memulai kembali.`
    );
    return;
  }

  const isGenericGreeting = ['halo', 'hallo', 'hello', 'hai', 'hi', 'p', 'tes', 'test', 'absen', 'shalom', 'salam', 'pagi', 'siang', 'sore', 'malam'].includes(cleanText);

  switch (session.step) {
    case 'IDLE': {
      const hasValidMemberName = member && isValidName(member.name);
      if (!userIsAdmin && !hasValidMemberName) {
        const inputName = cleanNameInput(rawText);
        if (isValidName(inputName) && !isGenericGreeting) {
          memberManager.registerOrUpdate(effectivePhone, inputName, 'Umum', 'NHKBP Kayu Putih');
          session.data.nama = inputName;
          session.data.namaAcara = currentEvent.namaAcara;
          session.data.tanggalLatihan = currentEvent.waktuLatihan;
          session.step = 'WAITING_ATTENDANCE';
          stateManager.updateSession(sessionKey, session);

          const greetDirectNameMsg =
            `Senang berkenalan dengan Kak *${inputName}*! ✨\n` +
            `Data nama Kakak sudah tersimpan di database Naposo HKBP Kayu Putih.\n\n` +
            `Untuk persiapan *${currentEvent.namaAcara}*:\n` +
            `🗓️ *Waktu:* ${currentEvent.waktuLatihan}\n` +
            `📍 *Lokasi:* ${currentEvent.lokasi}\n` +
            `🎯 *Tujuan:* ${currentEvent.tujuan}\n\n` +
            `*Apakah Kak ${inputName} bisa hadir latihan?*\n\n` +
            `Silakan balas dengan angka atau kata:\n` +
            `*1.* Bisa Hadir ✅\n` +
            `*2.* Tidak Bisa Hadir ❌`;

          await sendMessage(sock, remoteJid, greetDirectNameMsg);
          return;
        }

        session.step = 'WAITING_NAME_REGISTRATION';
        stateManager.updateSession(sessionKey, session);

        const askNameMsg = messageTemplates.getNewMemberGreeting(currentEvent);
        await sendMessage(sock, remoteJid, askNameMsg);
        return;
      }

      session.step = 'WAITING_ATTENDANCE';
      session.data.nama = knownName || 'Saudara/i';
      session.data.namaAcara = currentEvent.namaAcara;
      session.data.tanggalLatihan = currentEvent.waktuLatihan;
      stateManager.updateSession(sessionKey, session);

      const adminHint = userIsAdmin ? `\n\n_(💡 Anda login sebagai Admin. Ketik *help* atau */help* untuk menu perintah admin)_` : '';
      const welcomeMsg = messageTemplates.getKnownMemberGreeting(knownName || 'Saudara/i', currentEvent, adminHint);

      await sendMessage(sock, remoteJid, welcomeMsg);
      break;
    }

    case 'WAITING_NAME_REGISTRATION': {
      const inputName = cleanNameInput(rawText);
      if (!isValidName(inputName) || isGenericGreeting) {
        await sendMessage(sock, remoteJid, `Mohon masukkan nama lengkap Anda yang jelas yaa (minimal 2 kata). 🙏\n\nContoh: *Bastian Sibarani*`);
        return;
      }

      session.data.nama = inputName;
      session.data.namaAcara = currentEvent.namaAcara;
      session.data.tanggalLatihan = currentEvent.waktuLatihan;
      session.step = 'WAITING_SECTION_REGISTRATION';
      stateManager.updateSession(sessionKey, session);

      const askSectionMsg = messageTemplates.getAskSectionMessage(inputName);
      await sendMessage(sock, remoteJid, askSectionMsg);
      break;
    }

    case 'WAITING_SECTION_REGISTRATION': {
      const sectionChoice = parseSectionChoice(rawText);
      if (sectionChoice === 'UNKNOWN') {
        await sendMessage(
          sock,
          remoteJid,
          `Mohon pilih seksi suara Anda dengan angka atau kata:\n` +
          `*1.* Sopran 🎼\n` +
          `*2.* Alto 🎶\n` +
          `*3.* Tenor 🎤\n` +
          `*4.* Bass 🎵\n` +
          `*5.* Pemusik 🎹\n` +
          `*6.* Umum / Jemaat`
        );
        return;
      }

      memberManager.registerOrUpdate(effectivePhone, session.data.nama, sectionChoice, 'NHKBP Kayu Putih');
      session.data.seksi = sectionChoice;
      session.step = 'WAITING_ATTENDANCE';
      stateManager.updateSession(sessionKey, session);

      const greetNewMemberMsg =
        `Pilihan seksi suara Kak *${session.data.nama}* berhasil dicatat: *${sectionChoice}*! ✨\n\n` +
        `Untuk persiapan *${currentEvent.namaAcara}*:\n` +
        `🗓️ *Waktu:* ${currentEvent.waktuLatihan}\n` +
        `📍 *Lokasi:* ${currentEvent.lokasi}\n` +
        `🎯 *Tujuan:* ${currentEvent.tujuan}\n\n` +
        `*Apakah Kak ${session.data.nama} bisa hadir latihan?*\n\n` +
        `Silakan balas dengan angka atau kata:\n` +
        `*1.* Bisa Hadir ✅\n` +
        `*2.* Tidak Bisa Hadir ❌`;

      await sendMessage(sock, remoteJid, greetNewMemberMsg);
      break;
    }

    case 'WAITING_ATTENDANCE': {
      const choice = parseAttendanceChoice(rawText);

      if (choice === 'BISA') {
        session.data.status = 'Bisa';
        session.data.keterangan = 'Hadir (Menunggu konfirmasi jam)';
        session.data.alasan = '-';
        session.step = 'WAITING_ONTIME';
        stateManager.updateSession(sessionKey, session);

        // 1. Simpan respon awal ke Google Sheets (Consistent Await)
        await sendToGoogleSheets(session.data);

        // 2. Catat ke Local Tracker
        attendanceTracker.markResponded(effectivePhone, session.data, 'PARTIAL_HADIR');

        const askOnTimeMsg = messageTemplates.getAskOnTimeMessage(currentEvent);
        await sendMessage(sock, remoteJid, askOnTimeMsg);
      } else if (choice === 'TIDAK_BISA') {
        session.data.status = 'Tidak Bisa';
        session.data.keterangan = '-';
        session.data.alasan = '-';
        session.step = 'WAITING_REASON';
        stateManager.updateSession(sessionKey, session);

        // 1. Simpan respon awal ke Google Sheets (Consistent Await)
        await sendToGoogleSheets(session.data);

        // 2. Catat ke Local Tracker
        attendanceTracker.markResponded(effectivePhone, session.data, 'PARTIAL_TIDAK');

        const askReasonMsg = messageTemplates.getAskReasonMessage();
        await sendMessage(sock, remoteJid, askReasonMsg);
      } else {
        await sendMessage(
          sock,
          remoteJid,
          `Maaf Kak *${session.data.nama}*, bot belum paham maksud pesan Anda. 🙏\n\n` +
          `Mohon jawab dengan:\n` +
          `*1.* Bisa Hadir ✅ (atau ketik *Bisa*)\n` +
          `*2.* Tidak Bisa Hadir ❌ (atau ketik *Tidak*)`
        );
      }
      break;
    }

    case 'WAITING_ONTIME': {
      const timeChoice = parseTimeChoice(rawText);

      if (timeChoice === 'ON_TIME') {
        session.data.keterangan = `On-Time (${currentEvent.targetOnTime})`;
        session.data.alasan = '-';

        // 1. Update ke Google Sheets
        await sendToGoogleSheets(session.data);

        // 2. Update status ke RESPONDED
        attendanceTracker.markResponded(effectivePhone, session.data, 'RESPONDED');

        const successMsg = messageTemplates.getSuccessOnTimeMessage(session.data.nama, currentEvent);
        await sendMessage(sock, remoteJid, successMsg);
        stateManager.clearSession(sessionKey);
      } else if (timeChoice === 'TELAT') {
        session.step = 'WAITING_LATE_TIME';
        stateManager.updateSession(sessionKey, session);

        const askLateMsg = messageTemplates.getAskLateTimeMessage();
        await sendMessage(sock, remoteJid, askLateMsg);
      } else {
        await sendMessage(
          sock,
          remoteJid,
          `Mohon balas dengan:\n` +
          `*A.* Ya, On-Time ⏰\n` +
          `*B.* Telat ⏳`
        );
      }
      break;
    }

    case 'WAITING_LATE_TIME': {
      if (rawText.length < 2) {
        await sendMessage(sock, remoteJid, `Mohon ketik estimasi jam tiba Anda (contoh: *19.30*).`);
        return;
      }

      session.data.keterangan = `Telat (Estimasi: ${rawText})`;
      session.data.alasan = '-';

      // 1. Update ke Google Sheets
      await sendToGoogleSheets(session.data);

      // 2. Update status ke RESPONDED
      attendanceTracker.markResponded(effectivePhone, session.data, 'RESPONDED');

      const successLateMsg = messageTemplates.getSuccessLateMessage(session.data.nama, currentEvent, rawText);
      await sendMessage(sock, remoteJid, successLateMsg);
      stateManager.clearSession(sessionKey);
      break;
    }

    case 'WAITING_REASON': {
      if (rawText.length < 2) {
        await sendMessage(sock, remoteJid, `Mohon ketikkan alasan singkat Anda yaa.`);
        return;
      }

      session.data.keterangan = '-';
      session.data.alasan = rawText;

      // 1. Update ke Google Sheets
      await sendToGoogleSheets(session.data);

      // 2. Update status ke RESPONDED
      attendanceTracker.markResponded(effectivePhone, session.data, 'RESPONDED');

      const successReasonMsg = messageTemplates.getSuccessReasonMessage(session.data.nama, rawText);
      await sendMessage(sock, remoteJid, successReasonMsg);
      stateManager.clearSession(sessionKey);
      break;
    }

    default: {
      stateManager.clearSession(sessionKey);
      break;
    }
  }
}
