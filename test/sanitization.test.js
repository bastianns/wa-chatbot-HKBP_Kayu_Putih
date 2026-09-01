import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFormula, sanitizePayload } from '../src/sheetsService.js';

test('sanitizeFormula - Pencegahan Formula Injection di Spreadsheet', async (t) => {
  await t.test('meng-escape string yang diawali karakter formula berbahaya', () => {
    assert.strictEqual(sanitizeFormula('=SUM(A1:A10)'), "'=SUM(A1:A10)");
    assert.strictEqual(sanitizeFormula('+62812345678'), "'+62812345678");
    assert.strictEqual(sanitizeFormula('-1000'), "'-1000");
    assert.strictEqual(sanitizeFormula('@import("http://evil.com")'), "'@import(\"http://evil.com\")");
    assert.strictEqual(sanitizeFormula('\tTabInjected'), "'\tTabInjected");
    assert.strictEqual(sanitizeFormula('\rReturnInjected'), "'\rReturnInjected");
  });

  await t.test('mempertahankan string normal tanpa prefix escape', () => {
    assert.strictEqual(sanitizeFormula('Bastian Sibarani'), 'Bastian Sibarani');
    assert.strictEqual(sanitizeFormula('Lembur kerja di kantor'), 'Lembur kerja di kantor');
    assert.strictEqual(sanitizeFormula('Hadir On-Time'), 'Hadir On-Time');
    assert.strictEqual(sanitizeFormula('19:00 WIB'), '19:00 WIB');
  });

  await t.test('menangani nilai null, undefined, dan kosong dengan aman', () => {
    assert.strictEqual(sanitizeFormula(null), '-');
    assert.strictEqual(sanitizeFormula(undefined), '-');
    assert.strictEqual(sanitizeFormula(''), '-');
    assert.strictEqual(sanitizeFormula('   '), '-');
  });
});

test('sanitizePayload - Sanitasi Keseluruhan Payload Google Sheets', async (t) => {
  await t.test('membersihkan semua field teks bebas', () => {
    const rawPayload = {
      tanggalLatihan: 'Sabtu, 29 Agustus 2026',
      namaAcara: '=HACK_ACARA',
      nomorWa: '6281234567890',
      nama: '+Bastian',
      seksi: 'Pengurus',
      status: 'Tidak Bisa',
      keterangan: '-',
      alasan: '@CMD /C calc.exe'
    };

    const sanitized = sanitizePayload(rawPayload);

    assert.strictEqual(sanitized.namaAcara, "'=HACK_ACARA");
    assert.strictEqual(sanitized.nama, "'+Bastian");
    assert.strictEqual(sanitized.alasan, "'@CMD /C calc.exe");
    assert.strictEqual(sanitized.nomorWa, '6281234567890');
    assert.strictEqual(sanitized.seksi, 'Pengurus');
  });
});
