import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/db.js';
import { config } from '../config.js';
import { handleIncomingMessage } from '../src/botHandler.js';
import { stateManager } from '../src/stateManager.js';
import { eventManager } from '../src/eventManager.js';
import { memberManager } from '../src/memberManager.js';
import { attendanceTracker } from '../src/attendanceTracker.js';

test('Alur Percakapan WhatsApp Bot (State Machine & Admin Commands)', async (t) => {
  // Nonaktifkan network delay & typing delay untuk unit test
  config.presenceTypingMs = 0;
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({ status: 'success', message: 'mocked' })
  });

  // Setup data pengujian
  const adminPhone = '6281200000001';
  const adminJid = `${adminPhone}@s.whatsapp.net`;
  const memberPhone = '6289912345678';
  const memberJid = `${memberPhone}@s.whatsapp.net`;
  const strangerPhone = '6289977778888';
  const strangerJid = `${strangerPhone}@s.whatsapp.net`;

  // Bersihkan data pengujian dari database agar terisolasi
  db.prepare('DELETE FROM members WHERE phone IN (?, ?, ?)').run(adminPhone, memberPhone, strangerPhone);
  db.prepare('DELETE FROM sessions WHERE jid IN (?, ?, ?)').run(adminJid, memberJid, strangerJid);
  db.prepare('DELETE FROM attendance_records WHERE phone IN (?, ?, ?)').run(adminPhone, memberPhone, strangerPhone);

  // Daftarkan Admin di DB
  memberManager.registerOrUpdate(adminPhone, 'Bastian Sibarani (Admin)', 'Pengurus', 'NHKBP Kayu Putih', 1);

  let lastReply = '';
  const fakeSock = {
    user: { id: `${adminPhone}:1@s.whatsapp.net`, lid: '172743634981033:1@lid' },
    sendPresenceUpdate: async () => {},
    groupFetchAllParticipating: async () => ({
      '1203630123@g.us': {
        subject: 'NHKBP Kayu Putih 2026',
        participants: [
          { id: '6281299990001@s.whatsapp.net' },
          { id: '6281299990002@s.whatsapp.net' }
        ]
      }
    }),
    sendMessage: async (jid, content) => {
      lastReply = content.text;
      return {};
    }
  };

  async function sendMsg(jid, text, pushName = undefined) {
    lastReply = '';
    await handleIncomingMessage(fakeSock, {
      messages: [{ key: { remoteJid: jid, fromMe: false }, message: { conversation: text }, pushName }]
    });
    return lastReply;
  }

  await t.test('1. Admin Help Command (dengan dan tanpa slash)', async () => {
    let r = await sendMsg(adminJid, 'help');
    assert.strictEqual(r.includes('MENU PERINTAH ADMIN'), true);

    r = await sendMsg(adminJid, '/help');
    assert.strictEqual(r.includes('MENU PERINTAH ADMIN'), true);
  });

  await t.test('2. Admin Event Management (event & setevent)', async () => {
    let r = await sendMsg(adminJid, 'event');
    assert.strictEqual(r.includes('INFO ACARA LATIHAN'), true);

    r = await sendMsg(
      adminJid,
      'setevent Latihan Paduan Suara Naposobulung | Sabtu, 29 Agustus 2026 - Pukul 19:00 WIB | Gereja HKBP Kayu Putih | Pengisian Koor Kebaktian Minggu, 30 Agustus 2026 (Pukul 10:00 WIB)'
    );
    assert.strictEqual(r.includes('BERHASIL DIPERBARUI'), true);
  });

  await t.test('3. Admin Broadcast Pengumuman Grup (umumkan)', async () => {
    const r = await sendMsg(adminJid, 'umumkan');
    assert.strictEqual(r.includes('PENGUMUMAN LATIHAN PADUAN SUARA'), true);
  });

  await t.test('4. Admin Group List & Sync (gruplist & syncgroup)', async () => {
    let r = await sendMsg(adminJid, 'gruplist');
    assert.strictEqual(r.includes('NHKBP Kayu Putih 2026'), true);

    r = await sendMsg(adminJid, 'syncgroup 1');
    assert.strictEqual(r.includes('SUKSES SINKRONISASI GRUP'), true);
  });

  await t.test('5. Cut-off Absensi (tutup & buka)', async () => {
    let r = await sendMsg(adminJid, 'tutup');
    assert.strictEqual(r.includes('ABSENSI TELAH DITUTUP'), true);

    stateManager.clearSession(memberJid);
    r = await sendMsg(memberJid, 'Halo');
    assert.strictEqual(r.includes('sudah *DITUTUP*'), true);

    r = await sendMsg(adminJid, 'buka');
    assert.strictEqual(r.includes('DIBUKA KEMBALI'), true);
  });

  await t.test('6. Alur Pendaftaran Anggota Baru, Validasi Nama & Pilihan Seksi Suara', async () => {
    stateManager.clearSession(memberJid);
    db.prepare('DELETE FROM members WHERE phone = ?').run(memberPhone);

    let r = await sendMsg(memberJid, 'Halo');
    assert.strictEqual(r.includes('Nama Lengkap'), true);

    // Coba masukkan nama tidak valid ("Iya iya")
    r = await sendMsg(memberJid, 'Iya iya');
    assert.strictEqual(r.includes('Mohon masukkan nama lengkap Anda yang jelas'), true);

    // Coba masukkan nama tidak valid ("1,2")
    r = await sendMsg(memberJid, '1,2');
    assert.strictEqual(r.includes('Mohon masukkan nama lengkap Anda yang jelas'), true);

    // Masukkan nama valid -> Bot tanya seksi suara
    r = await sendMsg(memberJid, 'Samuel Pasaribu');
    assert.strictEqual(r.includes('Samuel Pasaribu'), true);
    assert.strictEqual(r.includes('seksi suara'), true);

    // Masukkan pilihan seksi suara (Tenor)
    r = await sendMsg(memberJid, 'Tenor');
    assert.strictEqual(r.includes('Tenor'), true);
    assert.strictEqual(r.includes('Apakah Kak Samuel Pasaribu bisa hadir latihan?'), true);

    // Verifikasi tersimpan di DB
    const savedMember = memberManager.findMember(memberPhone);
    assert.strictEqual(savedMember.seksi, 'Tenor');
  });

  await t.test('7. Alur Kehadiran (Bisa Hadir -> Telat -> Estimasi Waktu)', async () => {
    let r = await sendMsg(memberJid, 'gas hadir bang');
    assert.strictEqual(r.includes('Puji Tuhan'), true);
    assert.strictEqual(r.includes('On-Time'), true);

    r = await sendMsg(memberJid, 'telat ya kak');
    assert.strictEqual(r.includes('estimasi tiba'), true);

    r = await sendMsg(memberJid, '19.45 kena macet di bypass');
    assert.strictEqual(r.includes('Bisa Hadir'), true);
    assert.strictEqual(r.includes('Telat (Estimasi: 19.45 kena macet di bypass)'), true);
    assert.strictEqual(r.includes('#ubah'), true);
  });

  await t.test('8. Alur Perubahan Kehadiran (#ubah -> Tidak Bisa -> Alasan)', async () => {
    let r = await sendMsg(memberJid, '#ubah');
    assert.strictEqual(r.includes('PERBARUI KONFIRMASI KEHADIRAN'), true);

    r = await sendMsg(memberJid, 'gak bisa hadir mendadak');
    assert.strictEqual(r.includes('alasan singkat'), true);

    r = await sendMsg(memberJid, 'Lembur kantor mendadak');
    assert.strictEqual(r.includes('Tidak Bisa Hadir'), true);
    assert.strictEqual(r.includes('Lembur kantor mendadak'), true);
  });

  await t.test('9. Admin Monitoring (rekap, pending, & riwayat)', async () => {
    let r = await sendMsg(adminJid, 'rekap');
    assert.strictEqual(r.includes('REKAP KEHADIRAN'), true);

    r = await sendMsg(adminJid, 'pending');
    assert.strictEqual(typeof r, 'string');

    r = await sendMsg(adminJid, 'riwayat');
    assert.strictEqual(r.includes('RIWAYAT ACARA'), true);
  });

  await t.test('10. Reset Sesi (reset / batal)', async () => {
    const r = await sendMsg(memberJid, 'reset');
    assert.strictEqual(r.includes('telah di-reset'), true);
  });

  await t.test('11. Verifikasi pushName tidak membypass registrasi nama resmi', async () => {
    stateManager.clearSession(strangerJid);
    db.prepare('DELETE FROM members WHERE phone = ?').run(strangerPhone);

    // Kirim pesan pertama kali dengan pushName ada di metadata WA
    let r = await sendMsg(strangerJid, 'Halo bot', 'Grace Simanjuntak');

    // Bot HARUS tetap meminta nama resmi, tidak boleh auto-register tanpa input user
    assert.strictEqual(r.includes('Nama Lengkap'), true);

    // Cek di database: nomor ini TIDAK boleh tiba-tiba terdaftar tanpa konfirmasi
    const notRegistered = memberManager.findMember(strangerPhone);
    assert.strictEqual(notRegistered, null, 'pushName tidak boleh auto-register ke tabel members');

    // User mencoba input nama sampah di WAITING_NAME_REGISTRATION
    r = await sendMsg(strangerJid, 'ok ok', 'Grace Simanjuntak');
    assert.strictEqual(r.includes('Mohon masukkan nama lengkap Anda yang jelas'), true);
  });

  // Bersihkan kembali setelah selesai
  db.prepare('DELETE FROM members WHERE phone IN (?, ?, ?)').run(adminPhone, memberPhone, strangerPhone);
  db.prepare('DELETE FROM sessions WHERE jid IN (?, ?, ?)').run(adminJid, memberJid, strangerJid);
  db.prepare('DELETE FROM attendance_records WHERE phone IN (?, ?, ?)').run(adminPhone, memberPhone, strangerPhone);
});
