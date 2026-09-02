import test from 'node:test';
import assert from 'node:assert/strict';
import { isValidName, cleanNameInput } from '../src/botHandler.js';

test('isValidName - Validasi Nama Allowlist', async (t) => {
  await t.test('menerima nama valid 2 kata atau lebih', () => {
    assert.strictEqual(isValidName('Bastian Sibarani'), true);
    assert.strictEqual(isValidName('Mery Octavina Siagian'), true);
    assert.strictEqual(isValidName('Christian Nathaniel Adventura Hutapea'), true);
    assert.strictEqual(isValidName('Daniel Nainggolan'), true);
    assert.strictEqual(isValidName("D. R. O'Connor"), true);
    assert.strictEqual(isValidName('Grace-Simanjuntak'), true);
  });

  await t.test('menolak input sampah dan kata berulang', () => {
    assert.strictEqual(isValidName('Iya iya'), false, 'Harus menolak "Iya iya"');
    assert.strictEqual(isValidName('halo halo'), false, 'Harus menolak "halo halo"');
    assert.strictEqual(isValidName('tes tes'), false, 'Harus menolak "tes tes"');
    assert.strictEqual(isValidName('ok ok'), false, 'Harus menolak "ok ok"');
  });

  await t.test('menolak angka, formula, dan tanda baca sampah', () => {
    assert.strictEqual(isValidName('1,2'), false, 'Harus menolak "1,2"');
    assert.strictEqual(isValidName('19.30'), false, 'Harus menolak "19.30"');
    assert.strictEqual(isValidName('=SUM(A1:B1)'), false, 'Harus menolak formula');
    assert.strictEqual(isValidName('User 123'), false, 'Harus menolak angka');
    assert.strictEqual(isValidName('!!!???'), false, 'Harus menolak tanda baca murni');
  });

  await t.test('menolak input kata tunggal (kurang dari 2 token)', () => {
    assert.strictEqual(isValidName('Hadir'), false);
    assert.strictEqual(isValidName('Bisa'), false);
    assert.strictEqual(isValidName('Tidak'), false);
    assert.strictEqual(isValidName('ok'), false);
    assert.strictEqual(isValidName('Bastian'), false, 'Satu kata saja harus ditolak untuk nama lengkap');
  });

  await t.test('menolak frasa non-nama / salam / respon percakapan', () => {
    assert.strictEqual(isValidName('aku bisa hadir'), false);
    assert.strictEqual(isValidName('tidak bisa hadir'), false);
    assert.strictEqual(isValidName('shalom admin'), false);
    assert.strictEqual(isValidName('selamat pagi'), false);
    assert.strictEqual(isValidName('terima kasih'), false);
  });
});

test('cleanNameInput - Pembersihan Sapaan Santai', async (t) => {
  await t.test('membersihkan prefix dan suffix sapaan', () => {
    assert.strictEqual(cleanNameInput('nama saya Bastian Sibarani'), 'Bastian Sibarani');
    assert.strictEqual(cleanNameInput('Mery Octavina Siagian aku bisa hadirr'), 'Mery Octavina Siagian');
    assert.strictEqual(cleanNameInput('halo Daniel Nainggolan kak'), 'Daniel Nainggolan');
  });
});

test('parseSectionChoice - Klasifikasi Seksi Suara & Pilihan Umum', async (t) => {
  const { parseSectionChoice } = await import('../src/responseParser.js');

  await t.test('ekspresi ketidaktahuan umum tanpa frasa spesifik TIDAK langsung menjadi Umum', () => {
    assert.strictEqual(parseSectionChoice('belum'), 'UNKNOWN', '"belum" tunggal harus UNKNOWN');
    assert.strictEqual(parseSectionChoice('belum tau nih'), 'Umum', '"belum tau" harus Umum');
    assert.strictEqual(parseSectionChoice('saya belum tahu mau masuk seksi apa'), 'Umum');
    assert.strictEqual(parseSectionChoice('belum pilih'), 'Umum');
    assert.strictEqual(parseSectionChoice('belum yakin kak'), 'Umum');
  });

  await t.test('pilihan angka dan nama seksi suara vokal terdeteksi presisi', () => {
    assert.strictEqual(parseSectionChoice('1a'), 'Sopran 1');
    assert.strictEqual(parseSectionChoice('sopran 1'), 'Sopran 1');
    assert.strictEqual(parseSectionChoice('3b'), 'Tenor 2');
    assert.strictEqual(parseSectionChoice('4'), 'Bass');
    assert.strictEqual(parseSectionChoice('5'), 'Pemusik');
    assert.strictEqual(parseSectionChoice('6'), 'Umum');
    assert.strictEqual(parseSectionChoice('jemaat umum'), 'Umum');
  });
});
