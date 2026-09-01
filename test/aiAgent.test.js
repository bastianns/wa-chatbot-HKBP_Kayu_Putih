import test from 'node:test';
import assert from 'node:assert/strict';
import { AiAgent } from '../src/aiAgent.js';
import { createDatabase } from '../src/db.js';
import { MemberManager } from '../src/memberManager.js';
import { EventManager } from '../src/eventManager.js';
import { AttendanceTracker } from '../src/attendanceTracker.js';

test('AI Agent & Tool Calling Architecture', async (t) => {
  const db = createDatabase(':memory:');
  const mm = new MemberManager(db);
  const em = new EventManager(db);
  const att = new AttendanceTracker(db, mm, em);

  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO events (id, nama_acara, waktu_latihan, lokasi, tujuan, is_active, created_at, updated_at)
    VALUES (1, 'Latihan Uji AI', 'Kamis, 3 Sept 2026', 'Gereja HKBP Kayu Putih', 'Pelayanan', 1, ?, ?)
  `).run(now, now);

  const testPhone = '6281233334444';
  mm.registerOrUpdate(testPhone, 'Bastian Sibarani', 'Tenor 1', 'NHKBP Kayu Putih', true, 'Pengurus / Admin');

  const createAgent = () =>
    new AiAgent('dummy_key', {
      memberManager: mm,
      eventManager: em,
      attendanceTracker: att
    });

  await t.test('1. Status ketersediaan API key', () => {
    const emptyAgent = new AiAgent('');
    assert.strictEqual(emptyAgent.isAvailable(), false);

    const activeAgent = new AiAgent('dummy_key');
    assert.strictEqual(activeAgent.isAvailable(), true);
  });

  await t.test('2. Deklarasi Tools / Functions memiliki schema lengkap', () => {
    const agent = createAgent();
    const tools = agent.getToolDeclarations();
    assert.strictEqual(Array.isArray(tools), true);

    const fns = tools[0].functionDeclarations.map((f) => f.name);
    assert.strictEqual(fns.includes('recordAttendance'), true);
    assert.strictEqual(fns.includes('updateVoiceSection'), true);
    assert.strictEqual(fns.includes('updateMemberName'), true);
    assert.strictEqual(fns.includes('updateMemberRole'), true);
    assert.strictEqual(fns.includes('getEventSchedule'), true);
    assert.strictEqual(fns.includes('getMyProfile'), true);
  });

  await t.test('3. Eksekusi Tool: updateVoiceSection', async () => {
    const agent = createAgent();
    const context = {
      effectivePhone: testPhone,
      knownName: 'Bastian Sibarani',
      member: mm.findMember(testPhone),
      currentEvent: em.getEvent()
    };

    const res = await agent.executeTool('updateVoiceSection', { section: 'Tenor 2' }, context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.section, 'Tenor 2');

    const updatedMember = mm.findMember(testPhone);
    assert.strictEqual(updatedMember.seksi, 'Tenor 2');
  });

  await t.test('4. Eksekusi Tool: updateMemberRole', async () => {
    const agent = createAgent();
    const context = {
      effectivePhone: testPhone,
      knownName: 'Bastian Sibarani',
      member: mm.findMember(testPhone),
      currentEvent: em.getEvent()
    };

    const res = await agent.executeTool('updateMemberRole', { role: 'Song Leader' }, context);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.role, 'Song Leader');

    const updatedMember = mm.findMember(testPhone);
    assert.strictEqual(updatedMember.peran, 'Song Leader');
  });

  await t.test('5. Eksekusi Tool: recordAttendance (Hadir Telat)', async () => {
    const agent = createAgent();
    const context = {
      effectivePhone: testPhone,
      knownName: 'Bastian Sibarani',
      member: mm.findMember(testPhone),
      currentEvent: em.getEvent()
    };

    const res = await agent.executeTool(
      'recordAttendance',
      {
        attendanceChoice: 'Bisa',
        isLate: true,
        arrivalTime: '20:30 WIB'
      },
      context
    );

    assert.strictEqual(res.success, true);

    const record = att.getAttendance(testPhone, 1);
    assert.strictEqual(record.attendance_choice, 'Bisa');
    assert.strictEqual(record.keterangan.includes('20:30 WIB'), true);
  });

  await t.test('6. Eksekusi Tool: getMyProfile & getEventSchedule', async () => {
    const agent = createAgent();
    const context = {
      effectivePhone: testPhone,
      knownName: 'Bastian Sibarani',
      member: mm.findMember(testPhone),
      currentEvent: em.getEvent()
    };

    const profileRes = await agent.executeTool('getMyProfile', {}, context);
    assert.strictEqual(profileRes.success, true);
    assert.strictEqual(profileRes.name, 'Bastian Sibarani');
    assert.strictEqual(profileRes.attendance.choice, 'Bisa');

    const eventRes = await agent.executeTool('getEventSchedule', {}, context);
    assert.strictEqual(eventRes.success, true);
    assert.strictEqual(eventRes.event.namaAcara, 'Latihan Uji AI');
  });
});
