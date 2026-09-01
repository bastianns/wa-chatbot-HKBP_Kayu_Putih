import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { EventManager } from '../src/eventManager.js';
import { AttendanceTracker } from '../src/attendanceTracker.js';
import { MemberManager } from '../src/memberManager.js';

test('Database & Riwayat Event (SQLite)', async (t) => {
  const memDb = createDatabase(':memory:');
  const memberMgr = new MemberManager(memDb);
  const eventMgr = new EventManager(memDb);
  const attTracker = new AttendanceTracker(memDb, memberMgr, eventMgr);

  await t.test('membuat dan menyimpan event baru', () => {
    const ev1 = eventMgr.updateEvent({
      namaAcara: 'Latihan Koor Minggu 1',
      waktuLatihan: 'Sabtu, 22 Agustus 2026',
      lokasi: 'Gereja HKBP',
      tujuan: 'Pelayanan Koor'
    });

    assert.strictEqual(ev1.namaAcara, 'Latihan Koor Minggu 1');
    assert.strictEqual(ev1.isClosed, false);
  });

  await t.test('mencatat kehadiran pada Event 1', () => {
    const activeEv = eventMgr.getEvent();
    attTracker.markSent('6281234567890', 'Bastian Sibarani', 'TargetKoor', activeEv.id);
    attTracker.markResponded('6281234567890', {
      nama: 'Bastian Sibarani',
      status: 'Bisa',
      keterangan: 'On-Time (19:00 WIB)',
      alasan: '-'
    }, 'RESPONDED', activeEv.id);

    const summary = attTracker.getSummary(activeEv.id);
    assert.strictEqual(summary.targetKoor.totalHadir, 1);
    assert.strictEqual(summary.targetKoor.hadirOnTime, 1);
  });

  await t.test('memulai Event 2 tanpa menghapus riwayat kehadiran Event 1', () => {
    const ev1 = eventMgr.getEvent();
    const ev2 = eventMgr.startNewEvent({
      namaAcara: 'Latihan Koor Minggu 2',
      waktuLatihan: 'Sabtu, 29 Agustus 2026',
      lokasi: 'Gereja HKBP',
      tujuan: 'Pesta Gotilon'
    });

    assert.notStrictEqual(ev1.id, ev2.id);
    assert.strictEqual(ev2.isActive, true);

    // Verifikasi Event 1 masih ada di database
    const oldEv1 = eventMgr.getEventById(ev1.id);
    assert.strictEqual(oldEv1.isActive, false);
    assert.strictEqual(oldEv1.namaAcara, 'Latihan Koor Minggu 1');

    // Verifikasi data absensi Event 1 tetap utuh
    const summaryEv1 = attTracker.getSummary(ev1.id);
    assert.strictEqual(summaryEv1.targetKoor.totalHadir, 1);
    assert.strictEqual(summaryEv1.targetKoor.hadirOnTime, 1);

    // Event 2 masih kosong absensinya
    const summaryEv2 = attTracker.getSummary(ev2.id);
    assert.strictEqual(summaryEv2.targetKoor.totalHadir, 0);

    // Pastikan getPastEvents mengembalikan kedua event
    const pastEvents = eventMgr.getPastEvents();
    assert.strictEqual(pastEvents.length, 2);
  });
});
