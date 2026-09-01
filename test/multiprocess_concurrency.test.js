import test from 'node:test';
import assert from 'node:assert/strict';
import { fork } from 'child_process';
import path from 'path';
import fs from 'fs';
import { createDatabase } from '../src/db.js';
import { EventManager } from '../src/eventManager.js';

test('Multi-Process Concurrency - True Inter-Process SQLite Atomic Testing', async (t) => {
  const dbPath = path.resolve('./test_multiprocess.sqlite');

  // Bersihkan sisa file uji jika ada
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
    if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
  } catch (e) {}

  // Master process menginisialisasi database fisik
  const masterDb = createDatabase(dbPath);
  const eventMgr = new EventManager(masterDb);
  const ev = eventMgr.updateEvent({
    namaAcara: 'Latihan Uji Konkurensi Lintas Proses',
    waktuLatihan: 'Sabtu, 29 Agustus 2026',
    lokasi: 'Gereja HKBP',
    tujuan: 'Multi-Process Testing'
  });
  const eventId = ev.id;
  const targetPhone = '6281299998888';

  await t.test('dua proses Node terpisah mengeksekusi markResponded secara simultan ke file fisik yang sama', async () => {
    const workerScript = path.resolve('./test/worker_child.js');

    function runWorker(status, choice, keterangan) {
      return new Promise((resolve, reject) => {
        const child = fork(workerScript, [dbPath, String(eventId), targetPhone, status, choice, keterangan], {
          stdio: 'pipe'
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (d) => { stdout += d.toString(); });
        child.stderr.on('data', (d) => { stderr += d.toString(); });

        child.on('exit', (code) => {
          resolve({
            pid: child.pid,
            code,
            stdout,
            stderr
          });
        });

        child.on('error', reject);
      });
    }

    // Picu kedua proses anak secara simultan (Promise.all)
    console.log(`[Master PID:${process.pid}] Memulai 2 proses anak untuk eksekusi konkurensi simultan...`);
    const [w1, w2] = await Promise.all([
      runWorker('PARTIAL_HADIR', 'Bisa', 'Hadir (Menunggu jam)'),
      runWorker('RESPONDED', 'Bisa', 'On-Time (19:00 WIB)')
    ]);

    console.log(`\n--- OUTPUT PROSES ANAK 1 (PID: ${w1.pid}) ---`);
    console.log(w1.stdout.trim());
    if (w1.stderr) console.error(w1.stderr.trim());

    console.log(`\n--- OUTPUT PROSES ANAK 2 (PID: ${w2.pid}) ---`);
    console.log(w2.stdout.trim());
    if (w2.stderr) console.error(w2.stderr.trim());

    // Verifikasi kedua proses keluar dengan exit code 0
    assert.strictEqual(w1.code, 0, `Proses 1 (PID ${w1.pid}) gagal dengan exit code ${w1.code}`);
    assert.strictEqual(w2.code, 0, `Proses 2 (PID ${w2.pid}) gagal dengan exit code ${w2.code}`);

    // Verifikasi data di SQLite: harus TEPAT 1 baris (tidak duplikat)
    const count = masterDb.prepare('SELECT COUNT(*) as c FROM attendance_records WHERE event_id = ? AND phone = ?').get(eventId, targetPhone).c;
    assert.strictEqual(count, 1, `Harus ada tepat 1 baris, ditemukan ${count}`);

    const record = masterDb.prepare('SELECT * FROM attendance_records WHERE event_id = ? AND phone = ?').get(eventId, targetPhone);
    assert.strictEqual(record.phone, targetPhone);
    assert.strictEqual(record.attendance_choice, 'Bisa');

    console.log(`\n[Master PID:${process.pid}] ✅ Verifikasi Database Berhasil: Tepat 1 record unik tersimpan konsisten.`);
    console.log(JSON.stringify(record, null, 2));
  });

  masterDb.close();

  // Cleanup file database fisik pengujian
  try {
    if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
    if (fs.existsSync(`${dbPath}-wal`)) fs.unlinkSync(`${dbPath}-wal`);
    if (fs.existsSync(`${dbPath}-shm`)) fs.unlinkSync(`${dbPath}-shm`);
  } catch (e) {}
});
