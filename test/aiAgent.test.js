import test from 'node:test';
import assert from 'node:assert/strict';
import { AiAgent } from '../src/aiAgent.js';
import { createDatabase } from '../src/db.js';
import { MemberManager } from '../src/memberManager.js';
import { EventManager } from '../src/eventManager.js';
import { AttendanceTracker } from '../src/attendanceTracker.js';
import { StateManager } from '../src/stateManager.js';
import { handleIncomingMessage } from '../src/botHandler.js';

test('AI Agent - Anonymized Intent Classifier & Privacy Tests', async (t) => {
  const publicEventContext = {
    namaAcara: 'Latihan Koor Pesta Gotilon',
    waktuLatihan: 'Kamis, 3 Sept 2026, 19:00 WIB',
    lokasi: 'Gereja HKBP Kayu Putih',
    targetOnTime: '19:00 WIB',
    batasWaktu: 'Sebelum latihan dimulai'
  };

  await t.test('1. Status ketersediaan API key', () => {
    const emptyAgent = new AiAgent('');
    assert.strictEqual(emptyAgent.isAvailable(), false);

    const activeAgent = new AiAgent('dummy_gemini_key');
    assert.strictEqual(activeAgent.isAvailable(), true);
  });

  await t.test('2. Uji Privasi Data: Payload ke Gemini API TIDAK mengandung PII (Nama, No HP, Seksi, Peran)', async () => {
    const agent = new AiAgent('test_key');

    let capturedPayload = null;
    agent.client = {
      models: {
        generateContent: async (params) => {
          capturedPayload = params;
          return {
            text: JSON.stringify({
              intent: 'ATTENDANCE_YES_LATE',
              arrivalTime: '20:00 WIB',
              reason: null,
              section: null,
              newName: null,
              role: null,
              replyText: null
            })
          };
        }
      }
    };

    // Panggil processMessage hanya dengan rawText dan konteks acara publik
    const result = await agent.processMessage({
      rawText: 'Halo kak saya bisa hadir tapi telat jam 8 malam ya',
      eventContext: publicEventContext
    });

    assert.notStrictEqual(capturedPayload, null, 'Gemini API harus terpanggil');
    const fullPayloadString = JSON.stringify(capturedPayload);

    // KETAT: Periksa bahwa tidak ada data pribadi contoh/metadata identitas yang bocor ke string request
    const forbiddenPiiStrings = [
      '6281234567890',
      '081234567890',
      '6281211524318',
      '6281281277599',
      '6281233334444',
      'Bastian Sibarani',
      'Shally cantik',
      'Daniel Nainggolan',
      'Benaya Bunga',
      'Nama Pengirim:',
      'Nomor WA:',
      'Status Admin:'
    ];

    for (const pii of forbiddenPiiStrings) {
      assert.strictEqual(
        fullPayloadString.includes(pii),
        false,
        `Pelanggaran Privasi: String "${pii}" terdeteksi di dalam payload request Gemini!`
      );
    }

    // Pastikan hanya konteks publik dan pesan mentah yang ada
    assert.strictEqual(fullPayloadString.includes('Latihan Koor Pesta Gotilon'), true);
    assert.strictEqual(fullPayloadString.includes('Gereja HKBP Kayu Putih'), true);
    assert.strictEqual(fullPayloadString.includes('Halo kak saya bisa hadir tapi telat jam 8 malam ya'), true);

    // Pastikan hasil kembalian adalah object intent terstruktur
    assert.strictEqual(result.intent, 'ATTENDANCE_YES_LATE');
    assert.strictEqual(result.arrivalTime, '20:00 WIB');
  });

  await t.test('3. Ekstraksi Structured Intent untuk berbagai variasi pesan', async () => {
    const agent = new AiAgent('test_key');

    const mockResponse = (intentObj) => {
      agent.client = {
        models: {
          generateContent: async () => ({ text: JSON.stringify(intentObj) })
        }
      };
    };

    // Test ATTENDANCE_YES_ONTIME
    mockResponse({ intent: 'ATTENDANCE_YES_ONTIME', arrivalTime: null, reason: null });
    let res = await agent.processMessage({ rawText: 'Saya on time hadir', eventContext: publicEventContext });
    assert.strictEqual(res.intent, 'ATTENDANCE_YES_ONTIME');

    // Test ATTENDANCE_NO
    mockResponse({ intent: 'ATTENDANCE_NO', reason: 'Lembur di kantor' });
    res = await agent.processMessage({ rawText: 'Maaf gak bisa hadir lembur di kantor', eventContext: publicEventContext });
    assert.strictEqual(res.intent, 'ATTENDANCE_NO');
    assert.strictEqual(res.reason, 'Lembur di kantor');

    // Test UPDATE_VOICE_SECTION
    mockResponse({ intent: 'UPDATE_VOICE_SECTION', section: 'Alto 2' });
    res = await agent.processMessage({ rawText: 'Saya mau pindah ke Alto 2 ya', eventContext: publicEventContext });
    assert.strictEqual(res.intent, 'UPDATE_VOICE_SECTION');
    assert.strictEqual(res.section, 'Alto 2');

    // Test ASK_SCHEDULE
    mockResponse({ intent: 'ASK_SCHEDULE' });
    res = await agent.processMessage({ rawText: 'Latihan jam berapa ya kak dan dimana?', eventContext: publicEventContext });
    assert.strictEqual(res.intent, 'ASK_SCHEDULE');
  });

  await t.test('4. Integrasi End-to-End: Personalisasi nama dan update absensi tetap berjalan aman di lokal (botHandler)', async () => {
    globalThis.fetch = async () => ({
      ok: true,
      json: async () => ({ status: 'success', message: 'mocked' })
    });
    const memDb = createDatabase(':memory:');
    const mm = new MemberManager(memDb);
    const em = new EventManager(memDb);
    const att = new AttendanceTracker(memDb, mm, em);
    const sm = new StateManager(memDb);

    const now = new Date().toISOString();
    memDb.prepare(`
      INSERT INTO events (id, nama_acara, waktu_latihan, lokasi, tujuan, is_active, created_at, updated_at)
      VALUES (1, 'Latihan Koor Pesta Gotilon', 'Kamis, 3 Sept 2026', 'Gereja HKBP Kayu Putih', 'Pelayanan', 1, ?, ?)
    `).run(now, now);

    const memberPhone = '6281299990000';
    const memberJid = `${memberPhone}@s.whatsapp.net`;
    mm.registerOrUpdate(memberPhone, 'Bastian Sibarani', 'Tenor 1', 'NHKBP Kayu Putih', true, 'Pengurus');

    // Hubungkan singletons ke db in-memory
    const { memberManager, eventManager, attendanceTracker, stateManager, aiAgent } = await import('../src/botHandler.js')
      .then(async () => {
        const { memberManager } = await import('../src/memberManager.js');
        const { eventManager } = await import('../src/eventManager.js');
        const { attendanceTracker } = await import('../src/attendanceTracker.js');
        const { stateManager } = await import('../src/stateManager.js');
        const { aiAgent } = await import('../src/aiAgent.js');
        return { memberManager, eventManager, attendanceTracker, stateManager, aiAgent };
      });

    memberManager.db = memDb;
    eventManager.db = memDb;
    attendanceTracker.db = memDb;
    stateManager.db = memDb;

    // Mock Gemini API pada instance aiAgent botHandler
    let capturedAiCall = null;
    aiAgent.apiKey = 'mock_valid_key';
    aiAgent.client = {
      models: {
        generateContent: async (params) => {
          capturedAiCall = params;
          return {
            text: JSON.stringify({
              intent: 'ATTENDANCE_YES_LATE',
              arrivalTime: '20:15 WIB',
              reason: null,
              section: null,
              newName: null,
              role: null,
              replyText: null
            })
          };
        }
      }
    };

    let sentReply = '';
    const fakeSock = {
      user: { id: '6281200000001:1@s.whatsapp.net' },
      sendPresenceUpdate: async () => {},
      sendMessage: async (jid, content) => {
        sentReply = content.text;
        return {};
      }
    };

    // User kirim pesan bahasa alami bebas
    await handleIncomingMessage(fakeSock, {
      messages: [{
        key: { remoteJid: memberJid, fromMe: false },
        message: { conversation: 'Halo kak saya bisa hadir latihan tapi agak telat jam 20.15 ya karena macet' }
      }]
    });

    // 1. Verifikasi payload ke AI tidak bocor identitas
    assert.notStrictEqual(capturedAiCall, null);
    const aiPayloadString = JSON.stringify(capturedAiCall);
    assert.strictEqual(aiPayloadString.includes(memberPhone), false, 'Nomor HP tidak boleh dikirim ke Gemini');
    assert.strictEqual(aiPayloadString.includes('Bastian Sibarani'), false, 'Nama anggota tidak boleh dikirim ke Gemini');

    // 2. Verifikasi balasan lokal tetap ramah dan terpersonalisasi dengan nama anggota
    assert.strictEqual(sentReply.includes('Bastian Sibarani'), true, 'Balasan lokal harus menyapa nama anggota');
    assert.strictEqual(sentReply.includes('20:15 WIB'), true, 'Balasan lokal harus mencantumkan jam telat');

    // 3. Verifikasi database lokal tersimpan dengan akurat
    const attendance = attendanceTracker.getAttendance(memberPhone, 1);
    assert.notStrictEqual(attendance, null);
    assert.strictEqual(attendance.attendance_choice, 'Bisa');
    assert.strictEqual(attendance.keterangan.includes('20:15 WIB'), true);
    assert.strictEqual(attendance.status, 'RESPONDED');
  });
});
