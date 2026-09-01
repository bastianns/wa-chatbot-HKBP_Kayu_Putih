import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { MemberManager } from '../src/memberManager.js';
import { EventManager } from '../src/eventManager.js';
import { messageTemplates } from '../src/messageTemplates.js';

test('Broadcast - Dynamic Counts & Message Templates', async (t) => {
  const memDb = createDatabase(':memory:');
  const memberMgr = new MemberManager(memDb);
  const eventMgr = new EventManager(memDb);

  memberMgr.registerOrUpdate('6281281277599', 'Bastian Sibarani', 'Pengurus', 'NHKBP Kayu Putih', 1);
  memberMgr.registerOrUpdate('6281398765432', 'Andi Siregar', 'TargetKoor', 'NHKBP Kayu Putih', 0);
  memberMgr.registerOrUpdate('6281512345678', 'Maria Hutapea', 'TargetKoor', 'NHKBP Kayu Putih', 0);
  memberMgr.registerOrUpdate('6281901234567', 'Daniel Nainggolan', 'Umum', 'NHKBP Kayu Putih', 0);

  await t.test('menghitung jumlah anggota secara dinamis', () => {
    const counts = memberMgr.getCounts();
    assert.strictEqual(counts.totalMembers, 4);
    assert.strictEqual(counts.targetKoor, 2);
    assert.strictEqual(counts.pengurus, 1);
  });

  await t.test('menu help menampilkan jumlah anggota dinamis (bukan angka hardcoded)', () => {
    const counts = memberMgr.getCounts();
    const helpMsg = messageTemplates.getHelpMessage(counts);

    assert.strictEqual(helpMsg.includes('broadcast target* - Kirim PC ke 2 orang'), true);
    assert.strictEqual(helpMsg.includes('broadcast all* - Kirim PC ke seluruh 4 anggota'), true);
  });

  await t.test('preview pesan menggunakan template terpadu dengan jumlah dinamis', () => {
    const ev = eventMgr.getEvent();
    const counts = memberMgr.getCounts();
    const previewMsg = messageTemplates.getPreviewMessage(ev, counts);

    assert.strictEqual(previewMsg.includes('PREVIEW PESAN ABSENSI (2 TARGET KOOR)'), true);
    assert.strictEqual(previewMsg.includes('Total Penerima:* 2 orang'), true);
  });
});
