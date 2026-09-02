/**
 * =========================================================================================
 * 🛡️ SAFETY BOUNDARY NOTICE:
 * File ini HANYA membaca database produksi (absensi.db) untuk membuat clone (absensi_snapshot.db)
 * di awal eksekusi. SELURUH transaksi mutasi, koreksi, dan verifikasi assertion HANYA
 * menyentuh file `absensi_snapshot.db`.
 *
 * File produksi `absensi.db` TIDAK AKAN DISENTUH SAMA SEKALI oleh skrip ini.
 * =========================================================================================
 */

import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

const PROD_DB_PATH = path.resolve('./absensi.db');
const SNAPSHOT_DB_PATH = path.resolve('./absensi_snapshot.db');

// 1. Clean up & Clone absensi.db -> absensi_snapshot.db
console.log('=================================================================================');
console.log('🔄 1. MENYIAPKAN SNAPSHOT DATABASE ISOLASI:');
console.log('=================================================================================');
if (!fs.existsSync(PROD_DB_PATH)) {
  console.error(`❌ Error: File database produksi ${PROD_DB_PATH} tidak ditemukan!`);
  process.exit(1);
}

for (const ext of ['', '-wal', '-shm']) {
  const snapFile = SNAPSHOT_DB_PATH + ext;
  if (fs.existsSync(snapFile)) {
    fs.unlinkSync(snapFile);
  }
}

fs.copyFileSync(PROD_DB_PATH, SNAPSHOT_DB_PATH);
if (fs.existsSync(PROD_DB_PATH + '-wal')) {
  fs.copyFileSync(PROD_DB_PATH + '-wal', SNAPSHOT_DB_PATH + '-wal');
}
if (fs.existsSync(PROD_DB_PATH + '-shm')) {
  fs.copyFileSync(PROD_DB_PATH + '-shm', SNAPSHOT_DB_PATH + '-shm');
}
console.log(`✅ Sukses menyalin: ${PROD_DB_PATH} -> ${SNAPSHOT_DB_PATH}`);
console.log(`🔒 Seluruh operasi ke depan 100% terisolasi pada: ${SNAPSHOT_DB_PATH}\n`);

const db = new Database(SNAPSHOT_DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// 2. Definisi Eksplisit 8 Anggota Target Koor beserta ID Row dan ID Attendance
export const TARGET_MEMBERS = [
  {
    name: 'Benaya Bunga Simanjuntak',
    correctPhone: '6281210176004',
    officialMemberRowId: 156,
    lid: '203920903241884',
    oldSlotPhone: '6282276661746',
    duplicateMemberIds: [69, 150],
    attendanceMap: [
      { eventId: 1, winnerId: 1, loserIds: [] },
      { eventId: 2, winnerId: 51, loserIds: [] },
      { eventId: 3, winnerId: 119, loserIds: [233] }
    ]
  },
  {
    name: 'Nathanael Josua',
    correctPhone: '6281210948567',
    officialMemberRowId: 154,
    lid: '150341152669709',
    oldSlotPhone: '6281210176004',
    duplicateMemberIds: [57],
    attendanceMap: [
      { eventId: 1, winnerId: 7, loserIds: [5] },
      { eventId: 2, winnerId: 57, loserIds: [55] }
    ]
  },
  {
    name: 'Christian Nathaniel Adventura Hutapea',
    correctPhone: '6282311927079',
    officialMemberRowId: 168,
    lid: '246510067388562',
    oldSlotPhone: '6289517498649',
    duplicateMemberIds: [56, 151],
    attendanceMap: [
      { eventId: 1, winnerId: 2, loserIds: [19] },
      { eventId: 2, winnerId: 52, loserIds: [69] }
    ]
  },
  {
    name: 'Andrew Sioh Sahat Gonggom Tua Hutahaean',
    correctPhone: '6285218300134',
    officialMemberRowId: 161,
    lid: '250646037033026',
    oldSlotPhone: '6287888478332',
    duplicateMemberIds: [20, 152],
    attendanceMap: [
      { eventId: 1, winnerId: 3, loserIds: [12] },
      { eventId: 2, winnerId: 53, loserIds: [62] }
    ]
  },
  {
    name: 'Kyla Gavrila Tiurmaida',
    correctPhone: '6281914515770',
    officialMemberRowId: 167,
    lid: '187501276881014',
    oldSlotPhone: '6285892639583',
    duplicateMemberIds: [122, 157],
    attendanceMap: [
      { eventId: 1, winnerId: 8, loserIds: [18] },
      { eventId: 2, winnerId: 58, loserIds: [68] }
    ]
  },
  {
    name: 'Rebecca Zaneta Octoria Hutajulu',
    correctPhone: '6287782829423',
    officialMemberRowId: 172,
    lid: '163294740529277',
    oldSlotPhone: 'NO_PRIOR_PHONE_SLOT',
    duplicateMemberIds: [101],
    attendanceMap: [
      { eventId: 1, winnerId: 23, loserIds: [] },
      { eventId: 2, winnerId: 73, loserIds: [] }
    ]
  },
  {
    name: 'Rheyden Petrik Hutahaean',
    correctPhone: '628129934654',
    officialMemberRowId: 166,
    lid: '260704531685506',
    oldSlotPhone: 'NO_PRIOR_PHONE_SLOT',
    duplicateMemberIds: [25],
    attendanceMap: [
      { eventId: 1, winnerId: 29, loserIds: [17] },
      { eventId: 2, winnerId: 79, loserIds: [67] }
    ]
  },
  {
    name: 'Catherine',
    correctPhone: '6281388035191',
    officialMemberRowId: 162,
    lid: '93458656194655',
    oldSlotPhone: 'NO_PRIOR_PHONE_SLOT',
    duplicateMemberIds: [26],
    attendanceMap: [
      { eventId: 1, winnerId: 30, loserIds: [13] },
      { eventId: 2, winnerId: 80, loserIds: [63] }
    ]
  }
];

// Rekam data awal sebelum mutasi untuk assertion & review
const preState = {
  attendanceBefore: new Map(), // key: winnerId -> record before
  deletedLosers: [],
  txStartTime: new Date().toISOString()
};

for (const tm of TARGET_MEMBERS) {
  for (const item of tm.attendanceMap) {
    const winnerRow = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(item.winnerId);
    if (winnerRow) {
      preState.attendanceBefore.set(item.winnerId, winnerRow);
    } else {
      console.error(`⚠️ Winner ID ${item.winnerId} untuk ${tm.name} tidak ditemukan di database!`);
    }
  }
}
console.log(`📋 Total attendance winners captured before tx: ${preState.attendanceBefore.size}`);

console.log('=================================================================================');
console.log('⏳ 2. MENJALANKAN TRANSAKSI ATOMIK (db.transaction) PADA SNAPSHOT:');
console.log('=================================================================================');

const now = new Date().toISOString();

const runCorrectionTransaction = db.transaction(() => {
  // 1. Rekam Jejak Audit & Perbarui LID Mappings
  for (const tm of TARGET_MEMBERS) {
    const oldPhoneRef = tm.oldSlotPhone || '-';

    db.prepare(`
      INSERT INTO lid_mapping_history (lid, old_phone, new_phone, changed_at, reason)
      VALUES (?, ?, ?, ?, 'MANUAL_AUDIT_CORRECTION')
    `).run(tm.lid, oldPhoneRef, tm.correctPhone, now);

    db.prepare(`
      INSERT OR REPLACE INTO lid_mappings (lid, phone, created_at)
      VALUES (?, ?, ?)
    `).run(tm.lid, tm.correctPhone, now);

    console.log(`🗺️ [LID Mapping] ${tm.name}: LID ${tm.lid} (${oldPhoneRef} -> ${tm.correctPhone})`);
  }

  // 2. Attendance Records: Hapus Losers Dulu
  for (const tm of TARGET_MEMBERS) {
    for (const item of tm.attendanceMap) {
      for (const loserId of item.loserIds) {
        const loserRow = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(loserId);
        if (loserRow) {
          console.log(`🗑️ [Event #${item.eventId}] Menghapus Row Kalah (Audit): ID ${loserRow.id} | Phone: ${loserRow.phone} | Status: ${loserRow.status} | Nama: "${loserRow.name}"`);
          preState.deletedLosers.push({
            targetName: tm.name,
            eventId: item.eventId,
            loserRecord: loserRow
          });
          db.prepare('DELETE FROM attendance_records WHERE id = ?').run(loserId);
        }
      }
    }
  }

  // 3. Attendance Records: Set Placeholder Phone dulu untuk hindari benturan UNIQUE(event_id, phone)
  for (const tm of TARGET_MEMBERS) {
    for (const item of tm.attendanceMap) {
      db.prepare(`
        UPDATE attendance_records
        SET phone = ?
        WHERE id = ?
      `).run(`TEMP_ATT_${item.winnerId}`, item.winnerId);
    }
  }

  // 4. Attendance Records: Set ke Nomor Benar & Nama Benar
  for (const tm of TARGET_MEMBERS) {
    for (const item of tm.attendanceMap) {
      const winnerRow = preState.attendanceBefore.get(item.winnerId);
      db.prepare(`
        UPDATE attendance_records
        SET phone = ?, name = ?, seksi = 'TargetKoor', updated_at = ?
        WHERE id = ?
      `).run(tm.correctPhone, tm.name, now, item.winnerId);

      console.log(`🏆 [Event #${item.eventId}] Row Pemenang Diupdate: ID ${item.winnerId} -> ${tm.name} (${tm.correctPhone}) [Status: ${winnerRow.status}, Choice: ${winnerRow.attendance_choice || '-'}]`);
    }
  }

  // 5. Members Table: Set Placeholder Phone dulu
  for (const tm of TARGET_MEMBERS) {
    db.prepare('UPDATE members SET phone = ? WHERE id = ?').run(`TEMP_MEM_${tm.officialMemberRowId}`, tm.officialMemberRowId);
  }

  // 6. Members Table: Hapus Duplikat
  for (const tm of TARGET_MEMBERS) {
    for (const dupId of tm.duplicateMemberIds) {
      const dupRow = db.prepare('SELECT id, phone, name FROM members WHERE id = ?').get(dupId);
      if (dupRow) {
        console.log(`🧹 [Member Cleanup] Menghapus Duplicate Row ID ${dupRow.id} (${dupRow.phone} - "${dupRow.name}")`);
        db.prepare('DELETE FROM members WHERE id = ?').run(dupId);
      }
    }
  }

  // 7. Members Table: Set ke Nomor Benar & Nama Benar
  for (const tm of TARGET_MEMBERS) {
    db.prepare(`
      UPDATE members
      SET name = ?, phone = ?, seksi = 'TargetKoor', updated_at = ?
      WHERE id = ?
    `).run(tm.name, tm.correctPhone, now, tm.officialMemberRowId);
    console.log(`👤 [Member Profile] Updated ID ${tm.officialMemberRowId} -> "${tm.name}" (${tm.correctPhone})`);
  }
});

runCorrectionTransaction();
console.log('\n✅ Transaksi Atomik Sukses Dieksekusi pada absensi_snapshot.db!\n');

// ---------------------------------------------------------------------------------
// 3. ASSERTION OTOMATIS (POST-COMMIT VERIFICATION)
// ---------------------------------------------------------------------------------
console.log('=================================================================================');
console.log('🧪 3. MENJALANKAN 5 PROGRAMMATIC ASSERTIONS PADA SNAPSHOT:');
console.log('=================================================================================');

function assert(condition, assertionName, detailMsg) {
  if (!condition) {
    console.error(`\n❌ [ASSERTION FAILED] ${assertionName}`);
    console.error(`   Detail: ${detailMsg}`);
    process.exit(1);
  }
  console.log(`✔ [PASS] ${assertionName}: ${detailMsg}`);
}

// 5.a MEMBER UNIQUENESS
for (const tm of TARGET_MEMBERS) {
  const rowsByPhone = db.prepare('SELECT id, phone, name FROM members WHERE phone = ?').all(tm.correctPhone);
  assert(
    rowsByPhone.length === 1 && rowsByPhone[0].name === tm.name,
    '5.a MEMBER UNIQUENESS (Phone)',
    `Member "${tm.name}" harus memiliki tepat 1 row di members dengan phone ${tm.correctPhone}. Ditemukan: ${rowsByPhone.length}`
  );

  const rowsByName = db.prepare('SELECT id, phone, name FROM members WHERE LOWER(TRIM(name)) = ?').all(tm.name.toLowerCase());
  assert(
    rowsByName.length === 1,
    '5.a MEMBER UNIQUENESS (Name Duplicate)',
    `Member "${tm.name}" tidak boleh memiliki row duplikat di members. Ditemukan: ${rowsByName.length}`
  );

  if (tm.oldSlotPhone && tm.oldSlotPhone !== tm.correctPhone && tm.oldSlotPhone !== '6281210176004') {
    const ghostLeft = db.prepare('SELECT id, phone, name FROM members WHERE phone = ?').all(tm.oldSlotPhone);
    assert(
      ghostLeft.length === 0,
      '5.a MEMBER UNIQUENESS (Ghost Slot Phone Cleaned)',
      `Nomor slot lama ${tm.oldSlotPhone} untuk "${tm.name}" harus bersih dari members. Ditemukan: ${ghostLeft.length}`
    );
  }
}

// 5.b LID MAPPING 1:1
for (const tm of TARGET_MEMBERS) {
  const lidRows = db.prepare('SELECT lid, phone FROM lid_mappings WHERE lid = ?').all(tm.lid);
  assert(
    lidRows.length === 1 && lidRows[0].phone === tm.correctPhone,
    '5.b LID MAPPING 1:1',
    `LID ${tm.lid} (${tm.name}) harus terpetakan tepat ke nomor benar ${tm.correctPhone}. Ditemukan: ${JSON.stringify(lidRows)}`
  );
}

// 5.c ATTENDANCE PER-ORANG (Status & Choice Identical)
for (const tm of TARGET_MEMBERS) {
  for (const item of tm.attendanceMap) {
    const preRow = preState.attendanceBefore.get(item.winnerId);
    const postRow = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(item.winnerId);

    assert(
      postRow !== undefined,
      '5.c ATTENDANCE PER-ORANG (Row Exists)',
      `[Event #${item.eventId}] Attendance record ID ${item.winnerId} (${tm.name}) harus ada.`
    );

    assert(
      postRow.status === preRow.status && postRow.attendance_choice === preRow.attendance_choice,
      '5.c ATTENDANCE PER-ORANG (Status & Choice Identical)',
      `[Event #${item.eventId}] ${tm.name}: Status Before (${preRow.status}, ${preRow.attendance_choice || '-'}) harus identik dengan After (${postRow.status}, ${postRow.attendance_choice || '-'}).`
    );

    assert(
      postRow.phone === tm.correctPhone,
      '5.c ATTENDANCE PER-ORANG (Phone Updated)',
      `[Event #${item.eventId}] ${tm.name}: Phone harus sudah terupdate ke ${tm.correctPhone}. Ditemukan: ${postRow.phone}`
    );
  }
}

// 5.d ZERO DATA LOSS PER-ORANG (Benaya & Nathanael)
// Benaya: Event 1, 2, 3 harus RESPONDED & Bisa
for (const ev of [1, 2, 3]) {
  const benayaRow = db.prepare('SELECT status, attendance_choice FROM attendance_records WHERE event_id = ? AND phone = ?').get(ev, '6281210176004');
  assert(
    benayaRow && benayaRow.status === 'RESPONDED' && benayaRow.attendance_choice === 'Bisa',
    `5.d ZERO DATA LOSS (Benaya Event #${ev})`,
    `Kehadiran Benaya di Event #${ev} harus RESPONDED (Bisa). Ditemukan: ${JSON.stringify(benayaRow)}`
  );
}

// Nathanael: Event 1, 2 harus RESPONDED & Bisa (Membuktikan data Nathanael tetap aman!)
for (const ev of [1, 2]) {
  const nathanaelRow = db.prepare('SELECT status, attendance_choice FROM attendance_records WHERE event_id = ? AND phone = ?').get(ev, '6281210948567');
  assert(
    nathanaelRow && nathanaelRow.status === 'RESPONDED' && nathanaelRow.attendance_choice === 'Bisa',
    `5.d ZERO DATA LOSS (Nathanael Event #${ev})`,
    `Kehadiran Nathanael di Event #${ev} harus RESPONDED (Bisa) di bawah nomor aslinya 6281210948567. Ditemukan: ${JSON.stringify(nathanaelRow)}`
  );
}

// 5.e AUDIT TRAIL INTEGRITY (Memastikan old_phone vs new_phone informatif)
const recentAuditLogs = db.prepare(`
  SELECT id, lid, old_phone, new_phone, reason, changed_at
  FROM lid_mapping_history
  WHERE reason = 'MANUAL_AUDIT_CORRECTION' AND changed_at >= ?
`).all(preState.txStartTime);

assert(
  recentAuditLogs.length === 8,
  '5.e AUDIT TRAIL INTEGRITY (Row Count)',
  `Harus ada tepat 8 entri baru di lid_mapping_history. Ditemukan: ${recentAuditLogs.length}`
);

for (const log of recentAuditLogs) {
  const tm = TARGET_MEMBERS.find((t) => t.lid === log.lid);
  assert(
    log.new_phone === tm.correctPhone,
    '5.e AUDIT TRAIL INTEGRITY (New Phone Matches)',
    `Audit log LID ${log.lid} new_phone harus ${tm.correctPhone}. Ditemukan: ${log.new_phone}`
  );
  assert(
    log.old_phone === (tm.oldSlotPhone || '-'),
    '5.e AUDIT TRAIL INTEGRITY (Old Phone Meaningful)',
    `Audit log LID ${log.lid} old_phone harus mencatat slot lama "${tm.oldSlotPhone || '-'}". Ditemukan: "${log.old_phone}"`
  );
}

console.log('\n🎉 SELURUH 5 PROGRAMMATIC ASSERTIONS BERHASIL 100% TANPA KESALAHAN!\n');

// ---------------------------------------------------------------------------------
// 4. OUTPUT TABEL BEFORE / AFTER UNTUK HUMAN REVIEW
// ---------------------------------------------------------------------------------
console.log('=================================================================================');
console.log('📊 4. TABEL BEFORE / AFTER SNAPSHOT (UNTUK HUMAN REVIEW):');
console.log('=================================================================================');

const reviewTable = [];
for (const tm of TARGET_MEMBERS) {
  const memberPost = db.prepare('SELECT id, phone, name, seksi FROM members WHERE phone = ?').get(tm.correctPhone);

  const eventSummariesPre = [];
  const eventSummariesPost = [];

  for (const item of tm.attendanceMap) {
    const pre = preState.attendanceBefore.get(item.winnerId);
    if (pre) {
      eventSummariesPre.push(`Ev#${item.eventId}: ${pre.status} (${pre.attendance_choice || '-'})`);
    }
    const post = db.prepare('SELECT * FROM attendance_records WHERE id = ?').get(item.winnerId);
    if (post) {
      eventSummariesPost.push(`Ev#${item.eventId}: ${post.status} (${post.attendance_choice || '-'})`);
    }
  }

  reviewTable.push({
    'Nama Anggota': tm.name,
    'LID WhatsApp': tm.lid,
    'Slot Lama (Before)': tm.oldSlotPhone || '(Tidak ada)',
    'Nomor Benar (After)': memberPost ? memberPost.phone : '❌ Error',
    'Status Attendance (Before)': eventSummariesPre.join(', ') || '(Belum pernah absen)',
    'Status Attendance (After)': eventSummariesPost.join(', ') || '(Belum pernah absen)'
  });
}

console.table(reviewTable);

console.log('\n=================================================================================');
console.log('📜 5. LOG AUDIT TRAIL 8 ROW BARU DI lid_mapping_history:');
console.log('=================================================================================');
console.table(recentAuditLogs);

console.log('\n=================================================================================');
console.log('🗑️ 6. DAFTAR RECORD ATTENDANCE KALAH YANG DIHAPUS EKSPLISIT:');
console.log('=================================================================================');
console.table(preState.deletedLosers.map((d) => ({
  target: d.targetName,
  eventId: d.eventId,
  deletedRecordId: d.loserRecord.id,
  deletedPhone: d.loserRecord.phone,
  deletedStatus: d.loserRecord.status,
  deletedName: d.loserRecord.name,
  deletedChoice: d.loserRecord.attendance_choice || '-'
})));

db.close();
console.log('\n🔒 absensi_snapshot.db siap direview. absensi.db produksi BELUM disentuh sama sekali.');
