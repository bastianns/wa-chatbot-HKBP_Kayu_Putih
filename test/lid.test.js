import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { MemberManager } from '../src/memberManager.js';

test('LID Identity Resolution - Explicit Verification Mapping', async (t) => {
  const memDb = createDatabase(':memory:');
  const memberMgr = new MemberManager(memDb);

  // Simpan member TargetKoor dengan nomor HP asli
  memberMgr.registerOrUpdate('6281234567890', 'Benaya Bunga Simanjuntak', 'TargetKoor', 'NHKBP Kayu Putih');

  await t.test('unmapped LID tidak langsung berasumsi mencocokkan nama sembarangan', () => {
    const unmappedLid = '172743634981033';
    const mapping = memberMgr.getLidMapping(unmappedLid);
    assert.strictEqual(mapping, null, 'LID baru belum memiliki mapping');

    const memberBefore = memberMgr.findMember(unmappedLid);
    assert.strictEqual(memberBefore, null, 'LID baru tidak boleh langsung me-resolve member');
  });

  await t.test('verifikasi eksplisit nomor HP menyimpan mapping permanen', () => {
    const unmappedLid = '172743634981033';
    const realPhone = '081234567890'; // format lokal

    const success = memberMgr.setLidMapping(unmappedLid, realPhone);
    assert.strictEqual(success, true);

    // Verifikasi mapping tersimpan dan dinormalisasi
    const resolvedPhone = memberMgr.getLidMapping(unmappedLid);
    assert.strictEqual(resolvedPhone, '6281234567890');

    // findMember sekarang langsung menemukan member asli
    const resolvedMember = memberMgr.findMember(unmappedLid);
    assert.notStrictEqual(resolvedMember, null);
    assert.strictEqual(resolvedMember.name, 'Benaya Bunga Simanjuntak');
    assert.strictEqual(resolvedMember.phone, '6281234567890');
  });

  await t.test('mapping LID tidak ditimpa oleh pencocokan nama lain', () => {
    const unmappedLid = '172743634981033';
    const resolvedMember = memberMgr.findMember(unmappedLid);
    assert.strictEqual(resolvedMember.phone, '6281234567890');
  });

  await t.test('pencatatan audit history saat mapping LID ditimpa/diperbarui', () => {
    const lid = '172743634981033';
    // Timpa mapping lama ke nomor baru
    const newPhone = '081987654321';
    memberMgr.setLidMapping(lid, newPhone, 'MANUAL_CORRECTION');

    // Cek mapping terbaru
    assert.strictEqual(memberMgr.getLidMapping(lid), '6281987654321');

    // Cek tabel lid_mapping_history
    const history = memDb.prepare('SELECT * FROM lid_mapping_history WHERE lid = ? ORDER BY id ASC').all(lid);
    assert.strictEqual(history.length, 1, 'History harus mencatat 1 entri audit perubahan mapping');
    assert.strictEqual(history[0].lid, lid);
    assert.strictEqual(history[0].old_phone, '6281234567890');
    assert.strictEqual(history[0].new_phone, '6281987654321');
    assert.strictEqual(history[0].reason, 'MANUAL_CORRECTION');
    assert.notStrictEqual(history[0].changed_at, null);
  });
});

test('Alur Konfirmasi Double Check LID Mapping (botHandler)', async (t) => {
  const { handleIncomingMessage } = await import('../src/botHandler.js');
  const { stateManager } = await import('../src/stateManager.js');
  const { eventManager } = await import('../src/eventManager.js');
  const { memberManager } = await import('../src/memberManager.js');
  const { attendanceTracker } = await import('../src/attendanceTracker.js');

  const testDb = createDatabase(':memory:');
  memberManager.db = testDb;
  stateManager.db = testDb;
  eventManager.db = testDb;
  attendanceTracker.db = testDb;

  // Daftarkan member valid di database
  memberManager.registerOrUpdate('6281210176004', 'Benaya Bunga Simanjuntak', 'Sopran', 'NHKBP Kayu Putih');

  const lidUser = '203920903241884';
  const lidJid = `${lidUser}@lid`;

  let sentMessages = [];
  const fakeSock = {
    user: { id: '6281200000001:1@s.whatsapp.net' },
    sendPresenceUpdate: async () => {},
    sendMessage: async (jid, content) => {
      sentMessages.push(content.text);
      return {};
    }
  };

  async function sendMsg(text) {
    sentMessages = [];
    await handleIncomingMessage(fakeSock, {
      messages: [{ key: { remoteJid: lidJid, fromMe: false }, message: { conversation: text } }]
    });
    return sentMessages.join('\n\n');
  }

  await t.test('1. Pengirim LID baru memicu permintaan input nomor HP', async () => {
    const r = await sendMsg('Halo bot');
    assert.strictEqual(r.includes('Nomor HP WhatsApp'), true);
    const session = stateManager.getSession(`${lidUser}@s.whatsapp.net`);
    assert.strictEqual(session.step, 'WAITING_LID_PHONE_CONFIRMATION');
  });

  await t.test('2. Input nomor HP anggota terdaftar memicu konfirmasi double check dan TIDAK langsung setLidMapping', async () => {
    const r = await sendMsg('081210176004');
    assert.strictEqual(r.includes('Kami akan memetakan nomor WhatsApp Anda ke data *Benaya Bunga Simanjuntak*'), true);
    assert.strictEqual(r.includes('6281****004'), true, 'Nomor harus disamarkan');
    assert.strictEqual(r.includes('Ketik *ya* untuk konfirmasi, atau *bukan* untuk mengulang'), true);

    // Assert mapping di database MASIH NULL (belum terpanggil)
    const mapping = memberManager.getLidMapping(lidUser);
    assert.strictEqual(mapping, null, 'setLidMapping TIDAK boleh dipanggil sebelum konfirmasi!');

    const session = stateManager.getSession(`${lidUser}@s.whatsapp.net`);
    assert.strictEqual(session.step, 'WAITING_LID_PHONE_CONFIRM_DOUBLE_CHECK');
  });

  await t.test('3. Menjawab "bukan" membatalkan pemetaan dan mengembalikan ke WAITING_LID_PHONE_CONFIRMATION tanpa setLidMapping', async () => {
    const r = await sendMsg('bukan');
    assert.strictEqual(r.includes('pemetaan dibatalkan'), true);
    assert.strictEqual(r.includes('Nomor HP WhatsApp'), true);

    // Assert mapping di database TETAP NULL
    const mapping = memberManager.getLidMapping(lidUser);
    assert.strictEqual(mapping, null, 'setLidMapping TIDAK boleh dipanggil saat user membalas "bukan"');

    const session = stateManager.getSession(`${lidUser}@s.whatsapp.net`);
    assert.strictEqual(session.step, 'WAITING_LID_PHONE_CONFIRMATION');
    assert.strictEqual(session.data.candidatePhone, undefined);
  });

  await t.test('4. Mengulang input nomor dan menjawab "ya" sukses mengeksekusi setLidMapping', async () => {
    // Input nomor lagi
    await sendMsg('081210176004');
    const sessionCheck = stateManager.getSession(`${lidUser}@s.whatsapp.net`);
    assert.strictEqual(sessionCheck.step, 'WAITING_LID_PHONE_CONFIRM_DOUBLE_CHECK');

    // Jawab YA
    const r = await sendMsg('ya');
    assert.strictEqual(r.includes('berhasil diverifikasi'), true);
    assert.strictEqual(r.includes('Kak *Benaya Bunga Simanjuntak*'), true);

    // Assert mapping di database SEKARANG TERISI
    const mapping = memberManager.getLidMapping(lidUser);
    assert.strictEqual(mapping, '6281210176004', 'setLidMapping HARUS terpanggil setelah user menjawab "ya"');

    const sessionFinal = stateManager.getSession(`${lidUser}@s.whatsapp.net`);
    assert.strictEqual(sessionFinal.step, 'WAITING_ATTENDANCE');
    assert.strictEqual(sessionFinal.data.nama, 'Benaya Bunga Simanjuntak');
  });
});
