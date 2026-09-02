import test from 'node:test';
import assert from 'node:assert/strict';
import { createDatabase } from '../src/db.js';
import { config } from '../config.js';
import { broadcastService, FINAL_ATTENDANCE_STATUSES } from '../src/broadcastService.js';
import { memberManager } from '../src/memberManager.js';
import { eventManager } from '../src/eventManager.js';
import { attendanceTracker } from '../src/attendanceTracker.js';
import { stateManager } from '../src/stateManager.js';

test('Smart Skip Broadcast Service - Comprehensive Verification Suite', async (t) => {
  // Nonaktifkan network delay & typing delay untuk unit test
  config.minDelayMs = 0;
  config.maxDelayMs = 0;
  config.presenceTypingMs = 0;

  const memDb = createDatabase(':memory:');
  broadcastService.db = memDb;
  memberManager.db = memDb;
  eventManager.db = memDb;
  attendanceTracker.db = memDb;
  stateManager.db = memDb;

  // Setup Event #1 (Lama) dan Event #2 (Aktif)
  const event1 = eventManager.startNewEvent({
    namaAcara: 'Latihan Event 1 (Lama)',
    waktuLatihan: 'Sabtu, 29 Agustus 2026'
  });
  const event1Id = event1.id;

  // Setup 4 Anggota Target Koor
  memberManager.registerOrUpdate('6281210176004', 'Benaya Bunga Simanjuntak', 'TargetKoor', 'Target Khusus Latihan');
  memberManager.registerOrUpdate('6281210948567', 'Nathanael Josua', 'TargetKoor', 'Target Khusus Latihan');
  memberManager.registerOrUpdate('6282311927079', 'Christian Hutapea', 'TargetKoor', 'Target Khusus Latihan');
  memberManager.registerOrUpdate('6285218300134', 'Andrew Hutahaean', 'TargetKoor', 'Target Khusus Latihan');

  // Event 1: Benaya & Nathanael RESPONDED di Event 1
  attendanceTracker.markResponded('6281210176004', { nama: 'Benaya Bunga Simanjuntak', status: 'Bisa' }, 'RESPONDED', event1Id);
  attendanceTracker.markResponded('6281210948567', { nama: 'Nathanael Josua', status: 'Bisa' }, 'RESPONDED', event1Id);

  // Buat Event 2 (Aktif Sekarang)
  const event2 = eventManager.startNewEvent({
    namaAcara: 'Latihan Event 2 (Aktif)',
    waktuLatihan: 'Kamis, 3 September 2026'
  });
  const event2Id = event2.id;

  // Di Event 2: Hanya Benaya yang SUDAH absen (RESPONDED) sebelum broadcast dimulai
  attendanceTracker.markResponded('6281210176004', { nama: 'Benaya Bunga Simanjuntak', status: 'Bisa' }, 'RESPONDED', event2Id);

  await t.test('6.a Orang dengan status RESPONDED di event AKTIF -> di-skip, tidak dikirim pesan', async () => {
    const isSkipped = broadcastService.isAlreadyResponded('6281210176004', event2Id);
    assert.equal(isSkipped, true, 'Benaya harus terdeteksi sudah respon di Event 2');
  });

  await t.test('6.b Orang dengan status RESPONDED di event LAMA tapi belum respon di event aktif -> TETAP dikirim', async () => {
    // Nathanael RESPONDED di Event 1, tapi BELUM di Event 2
    const nathanaelInEv1 = broadcastService.isAlreadyResponded('6281210948567', event1Id);
    const nathanaelInEv2 = broadcastService.isAlreadyResponded('6281210948567', event2Id);

    assert.equal(nathanaelInEv1, true, 'Nathanael tercatat respon di Event 1');
    assert.equal(nathanaelInEv2, false, 'Nathanael TIDAK boleh ter-skip di Event 2 karena belum absen di Event 2');
  });

  await t.test('6.c Real-Time JIT Race Condition: Orang yang baru RESPONDED di tengah-tengah loop broadcast langsung di-skip', async () => {
    // Siapkan mock socket yang merekam pesan keluar
    const sentMessages = [];
    const mockSock = {
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, content) => {
        sentMessages.push({ jid, text: content.text });
      }
    };

    // Pasang callback progress: saat broadcast memproses orang ke-1 (Nathanael), Christian (orang ke-2) tiba-tiba absen mandiri di DB!
    const result = await broadcastService.runBroadcast({
      sock: mockSock,
      targetTag: 'TargetKoor',
      onProgress: ({ current, phone }) => {
        if (phone === '6281210948567') {
          // Simulasi: Christian (6282311927079) chat ke bot dan tersimpan RESPONDED sebelum giliran loop-nya tiba!
          attendanceTracker.markResponded('6282311927079', { nama: 'Christian Hutapea', status: 'Bisa' }, 'RESPONDED', event2Id);
        }
      }
    });

    assert.equal(result.status, 'completed');
    // Total 4: Benaya di-skip (sudah dari awal), Christian di-skip (real-time JIT saat loop jalan), Nathanael & Andrew terkirim
    assert.equal(result.skippedCount, 2, 'Harus ada 2 orang yang di-skip (Benaya & Christian)');
    assert.equal(result.successCount, 2, 'Harus ada 2 orang yang terkirim pesan (Nathanael & Andrew)');

    // Verifikasi pesan WhatsApp yang benar-benar terkirim
    const sentJids = sentMessages.map((m) => m.jid);
    assert.ok(sentJids.includes('6281210948567@s.whatsapp.net'), 'Nathanael harus menerima pesan');
    assert.ok(sentJids.includes('6285218300134@s.whatsapp.net'), 'Andrew harus menerima pesan');
    assert.ok(!sentJids.includes('6281210176004@s.whatsapp.net'), 'Benaya TIDAK boleh menerima pesan');
    assert.ok(!sentJids.includes('6282311927079@s.whatsapp.net'), 'Christian TIDAK boleh menerima pesan (terselamatkan oleh real-time check)');

    // Verifikasi status di broadcast_progress
    const christianProgress = memDb.prepare('SELECT status FROM broadcast_progress WHERE phone = ? AND event_id = ?').get('6282311927079', event2Id);
    assert.equal(christianProgress.status, 'SKIPPED_ALREADY_RESPONDED');
  });

  await t.test('6.d Preview dan Real Broadcast menghasilkan angka skip dan to-send yang identik', async () => {
    // Reset database untuk pengujian komparasi preview vs real send
    const freshDb = createDatabase(':memory:');
    broadcastService.db = freshDb;
    memberManager.db = freshDb;
    eventManager.db = freshDb;
    attendanceTracker.db = freshDb;
    stateManager.db = freshDb;

    const ev = eventManager.startNewEvent({
      namaAcara: 'Latihan Komparasi',
      waktuLatihan: 'Jumat, 4 September 2026'
    });
    const evId = ev.id;

    memberManager.registerOrUpdate('6281111111111', 'Member A', 'TargetKoor', 'Grup');
    memberManager.registerOrUpdate('6282222222222', 'Member B', 'TargetKoor', 'Grup');
    memberManager.registerOrUpdate('6283333333333', 'Member C', 'TargetKoor', 'Grup');

    // Member A sudah absen
    attendanceTracker.markResponded('6281111111111', { nama: 'Member A', status: 'Bisa' }, 'RESPONDED', evId);

    // 1. Jalankan kalkulasi Preview (Logika yang sama persis seperti broadcast.js)
    const members = memberManager.getMembersByTag('TargetKoor');
    const previewToSend = [];
    const previewSkipped = [];
    for (const m of members) {
      if (broadcastService.isAlreadyResponded(m.phone, evId)) {
        previewSkipped.push(m);
      } else {
        previewToSend.push(m);
      }
    }

    assert.equal(previewSkipped.length, 1, 'Preview: 1 diskip (Member A)');
    assert.equal(previewToSend.length, 2, 'Preview: 2 dikirim (Member B & C)');

    // 2. Jalankan Real Broadcast
    const realSentMessages = [];
    const mockSock = {
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, content) => {
        realSentMessages.push({ jid, text: content.text });
      }
    };

    const realResult = await broadcastService.runBroadcast({
      sock: mockSock,
      targetTag: 'TargetKoor'
    });

    assert.equal(realResult.skippedCount, previewSkipped.length, 'Jumlah skip Real Broadcast harus sama dengan Preview');
    assert.equal(realResult.successCount, previewToSend.length, 'Jumlah kirim Real Broadcast harus sama dengan Preview');
    assert.equal(realSentMessages.length, previewToSend.length, 'Jumlah panggilan socket harus sama persis dengan preview');
  });
});
