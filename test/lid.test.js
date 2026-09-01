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
});
