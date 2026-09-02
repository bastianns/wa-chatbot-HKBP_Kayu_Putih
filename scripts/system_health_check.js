import Database from 'better-sqlite3';

const db = new Database('./absensi.db', { readonly: true });

console.log('====================================================');
console.log('🔍 FULL 360-DEGREE SYSTEM HEALTH CHECK (ABSENSI.DB)');
console.log('====================================================\n');

// 1. Members Breakdown by Seksi
const seksiCounts = db.prepare('SELECT seksi, COUNT(*) as count FROM members GROUP BY seksi').all();
console.log('📊 1. DISTRIBUSI ANGGOTA PER SEKSI:');
console.table(seksiCounts);

// 2. TargetKoor Detail Audit
console.log('\n🎯 2. AUDIT LENGKAP 23 ANGGOTA TARGETKOOR:');
const targetKoor = db.prepare('SELECT id, phone, name, seksi FROM members WHERE seksi = \'TargetKoor\' ORDER BY id ASC').all();
console.table(targetKoor);

// 3. Vokal & Pengurus Members Check
console.log('\n🎵 3. ANGGOTA VOKAL (Sopran, Alto, Tenor, Bass, Pengurus):');
const vokal = db.prepare('SELECT id, phone, name, seksi, is_admin FROM members WHERE seksi IN (\'Sopran\', \'Alto\', \'Tenor\', \'Bass\', \'Pengurus\') ORDER BY seksi ASC, name ASC').all();
console.table(vokal);

// 4. Duplicate Names Check across ALL members (excluding empty string)
const dupNames = db.prepare(`
  SELECT LOWER(TRIM(name)) as clean_name, COUNT(*) as cnt, GROUP_CONCAT(phone) as phones, GROUP_CONCAT(id) as ids 
  FROM members 
  WHERE name IS NOT NULL AND TRIM(name) != '' 
  GROUP BY LOWER(TRIM(name)) 
  HAVING cnt > 1
`).all();
console.log('\n👥 4. DUPLIKAT NAMA DI SELURUH DATABASE:');
if (dupNames.length === 0) {
  console.log('   ✅ 100% BERSIH: 0 Duplikat Nama.');
} else {
  console.table(dupNames);
}

// 5. Duplicate Phones Check across ALL members
const dupPhones = db.prepare(`
  SELECT phone, COUNT(*) as cnt, GROUP_CONCAT(name) as names, GROUP_CONCAT(id) as ids 
  FROM members 
  GROUP BY phone 
  HAVING cnt > 1
`).all();
console.log('\n📱 5. DUPLIKAT NOMOR HP DI SELURUH DATABASE:');
if (dupPhones.length === 0) {
  console.log('   ✅ 100% BERSIH: 0 Duplikat Nomor HP.');
} else {
  console.table(dupPhones);
}

// 6. Active Event #3 Attendance Check
console.log('\n📋 6. REKAP KEHADIRAN EVENT #3 (AKTIF):');
const attEv3 = db.prepare('SELECT id, phone, name, seksi, status, attendance_choice, keterangan, responded_at FROM attendance_records WHERE event_id = 3 ORDER BY id ASC').all();
console.table(attEv3);

// 7. All LID Mappings Status
console.log('\n🗺️ 7. STATUS SEMUA PEMETAAN LID:');
const lids = db.prepare('SELECT lm.lid, lm.phone, m.name, m.seksi FROM lid_mappings lm LEFT JOIN members m ON m.phone = lm.phone').all();
console.table(lids);
