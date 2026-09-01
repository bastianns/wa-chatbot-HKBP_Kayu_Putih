import test from 'node:test';
import assert from 'node:assert/strict';
import { isConnectionError } from '../src/connectionHelper.js';
import { createDatabase } from '../src/db.js';
import { AttendanceTracker } from '../src/attendanceTracker.js';
import { MemberManager } from '../src/memberManager.js';
import { EventManager } from '../src/eventManager.js';

test('isConnectionError - Robustness terhadap Struktur Socket Baileys', async (t) => {
  await t.test('saat sock._isOpen === true dan sock.ws tidak ada (undefined), tidak otomatis return true', () => {
    // Mock socket tanpa properti internal sock.ws sama sekali
    const fakeSockWithoutWs = {
      _isOpen: true,
      sendMessage: async () => {}
    };

    // 1. Error level nomor (misal nomor tidak terdaftar / invalid JID)
    const numberError = new Error('item-not-found');
    assert.strictEqual(
      isConnectionError(numberError, fakeSockWithoutWs),
      false,
      'Error level nomor tidak boleh dianggap connection error saat socket open'
    );

    const badRequestError = { output: { statusCode: 400 }, message: 'Bad Request' };
    assert.strictEqual(
      isConnectionError(badRequestError, fakeSockWithoutWs),
      false,
      'HTTP 400 Bad Request tidak boleh dianggap connection error saat socket open'
    );

    // 2. Error level koneksi (misal timeout / stream error)
    const timeoutError = new Error('Timed Out');
    assert.strictEqual(
      isConnectionError(timeoutError, fakeSockWithoutWs),
      true,
      'Timeout error harus terdeteksi sebagai connection error'
    );

    const boomDisconnectError = { output: { statusCode: 428 }, message: 'Connection Required' };
    assert.strictEqual(
      isConnectionError(boomDisconnectError, fakeSockWithoutWs),
      true,
      'Boom status 428 harus terdeteksi sebagai connection error'
    );

    const boom515Error = { output: { statusCode: 515 }, message: 'Stream error: restart required' };
    assert.strictEqual(
      isConnectionError(boom515Error, fakeSockWithoutWs),
      true,
      'Boom status 515 harus terdeteksi sebagai connection error'
    );
  });

  await t.test('saat sock._isOpen === false, selalu return true untuk fast abort', () => {
    const closedSock = { _isOpen: false };
    const anyError = new Error('item-not-found');

    assert.strictEqual(
      isConnectionError(anyError, closedSock),
      true,
      'Harus return true saat socket berstatus tertutup'
    );
  });

  await t.test('saat sock null/undefined, selalu return true', () => {
    assert.strictEqual(isConnectionError(new Error('any'), null), true);
    assert.strictEqual(isConnectionError(new Error('any'), undefined), true);
  });
});

test('Reminder Cooldown - Proteksi Anti-Double Reminder saat Auto-Reconnect', async (t) => {
  const memDb = createDatabase(':memory:');
  const memMgr = new MemberManager(memDb);
  const eventMgr = new EventManager(memDb);
  const tracker = new AttendanceTracker(memDb, memMgr, eventMgr);

  const ev = eventMgr.getEvent();
  const phone1 = '6281211112222';
  const phone2 = '6281233334444';
  const phone3 = '6281255556666';

  // Inisialisasi 3 anggota TargetKoor
  tracker.markSent(phone1, 'Anggota 1', 'TargetKoor', ev.id);
  tracker.markSent(phone2, 'Anggota 2', 'TargetKoor', ev.id);
  tracker.markSent(phone3, 'Anggota 3', 'TargetKoor', ev.id);

  // Simulasi riwayat reminder:
  // - phone1: baru diingatkan 5 menit lalu (masih dalam cooldown 30 menit)
  // - phone2: diingatkan 45 menit lalu (sudah lewat cooldown 30 menit)
  // - phone3: belum pernah diingatkan sama sekali
  const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const fortyFiveMinsAgo = new Date(Date.now() - 45 * 60 * 1000).toISOString();

  memDb.prepare('UPDATE attendance_records SET last_reminded_at = ? WHERE phone = ?').run(fiveMinsAgo, phone1);
  memDb.prepare('UPDATE attendance_records SET last_reminded_at = ? WHERE phone = ?').run(fortyFiveMinsAgo, phone2);

  await t.test('getPendingMembers dengan cooldown 30 menit mengecualikan nomor yang baru diingatkan', () => {
    const pendingWithCooldown = tracker.getPendingMembers(ev.id, 30);

    // phone1 harus dilewati (cooldown aktif), phone2 dan phone3 harus masuk
    const pendingPhones = pendingWithCooldown.map((p) => p.phone);
    assert.strictEqual(pendingPhones.includes(phone1), false, 'Nomor yang baru diingatkan 5 menit lalu harus dilewati');
    assert.strictEqual(pendingPhones.includes(phone2), true, 'Nomor yang diingatkan 45 menit lalu harus tetap masuk');
    assert.strictEqual(pendingPhones.includes(phone3), true, 'Nomor yang belum pernah diingatkan harus masuk');
    assert.strictEqual(pendingWithCooldown.length, 2);
  });

  await t.test('markReminded memperbarui timestamp last_reminded_at secara tepat', () => {
    tracker.markReminded(phone3, ev.id);

    // phone3 sekarang baru saja diingatkan
    const pendingAfter = tracker.getPendingMembers(ev.id, 30);
    const pendingPhonesAfter = pendingAfter.map((p) => p.phone);

    assert.strictEqual(pendingPhonesAfter.includes(phone3), false, 'Setelah markReminded, phone3 harus masuk cooldown');
    assert.strictEqual(pendingAfter.length, 1); // hanya phone2 yang tersisa
  });
});
