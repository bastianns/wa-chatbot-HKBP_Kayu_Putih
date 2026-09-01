import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { MemberManager } from '../src/memberManager.js';

test('isAdmin - Single Source of Truth & Exact Matching', async (t) => {
  const memDb = createDatabase(':memory:');
  const memberMgr = new MemberManager(memDb);

  // Daftarkan Admin di SQLite members
  memberMgr.registerOrUpdate('6281281277599', 'Bastian Sibarani', 'Pengurus', 'NHKBP Kayu Putih', 1);
  memberMgr.registerOrUpdate('6281398765432', 'Andi Siregar', 'Tenor', 'NHKBP Kayu Putih', 0);

  await t.test('mengenali admin yang terdaftar di database dengan exact match', () => {
    assert.strictEqual(memberMgr.isAdmin('6281281277599'), true);
    assert.strictEqual(memberMgr.isAdmin('081281277599'), true); // normalized to 6281281277599
    assert.strictEqual(memberMgr.isAdmin('6281281277599:1@s.whatsapp.net'), true);
  });

  await t.test('menolak non-admin', () => {
    assert.strictEqual(memberMgr.isAdmin('6281398765432'), false);
    assert.strictEqual(memberMgr.isAdmin('6289999999999'), false);
  });

  await t.test('menolak substring attack / false positive match', () => {
    // Pastikan matching BUKAN .includes()
    // Contoh nomor dengan substring yang sama tapi nomor berbeda
    assert.strictEqual(memberMgr.isAdmin('62812812775990'), false, 'Nomor berakhiran ekstra tidak boleh match');
    assert.strictEqual(memberMgr.isAdmin('16281281277599'), false, 'Nomor berawalan ekstra tidak boleh match');
    assert.strictEqual(memberMgr.isAdmin('8128127759'), false, 'Nomor terpotong tidak boleh match');
  });

  await t.test('mengenali admin via mapping LID permanen', () => {
    memberMgr.setLidMapping('172743634981033', '6281281277599');
    assert.strictEqual(memberMgr.isAdmin('172743634981033@lid'), true);
    assert.strictEqual(memberMgr.isAdmin('999999999999999@lid'), false);
  });

  await t.test('searchMembers - mencari anggota spesifik berdasarkan nama dan nomor', () => {
    memberMgr.registerOrUpdate('6281512345678', 'Maria Hutapea', 'Sopran', 'NHKBP Kayu Putih', 0);

    const resByName = memberMgr.searchMembers('Maria');
    assert.strictEqual(resByName.length, 1);
    assert.strictEqual(resByName[0].name, 'Maria Hutapea');
    assert.strictEqual(resByName[0].seksi, 'Sopran');

    const resByPhone = memberMgr.searchMembers('081512345678');
    assert.strictEqual(resByPhone.length, 1);
    assert.strictEqual(resByPhone[0].name, 'Maria Hutapea');

    const resNotFound = memberMgr.searchMembers('OrangTidakAda');
    assert.strictEqual(resNotFound.length, 0);
  });
});
