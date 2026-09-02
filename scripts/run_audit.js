import { getDb } from '../src/db.js';

const db = getDb('./absensi.db');

console.log('=== BAGIAN A: LID MAPPINGS ===');
const partA = db.prepare(`
  SELECT lm.lid, lm.phone, lm.created_at, m.name, m.seksi
  FROM lid_mappings lm
  LEFT JOIN members m ON m.phone = lm.phone
  ORDER BY lm.created_at ASC
`).all();
console.log('COUNT_A:', partA.length);
console.table(partA);

console.log('\n=== BAGIAN B: DUPLICATE NAMES ===');
const partB = db.prepare(`
  SELECT name, COUNT(*) as jumlah, GROUP_CONCAT(phone) as nomor_nomor
  FROM members
  WHERE name != '' AND name NOT IN ('Anggota', 'Nomor Baru', 'Saudara/i')
  GROUP BY LOWER(TRIM(name))
  HAVING COUNT(*) > 1
`).all();
console.log('COUNT_B:', partB.length);
console.table(partB);

console.log('\n=== BAGIAN C: ATTENDANCE VS MEMBER NAME MISMATCH ===');
const partC = db.prepare(`
  SELECT ar.phone, ar.name AS nama_di_riwayat, m.name AS nama_di_profil, ar.event_id, ar.updated_at
  FROM attendance_records ar
  JOIN members m ON m.phone = ar.phone
  WHERE LOWER(TRIM(ar.name)) != LOWER(TRIM(m.name))
    AND ar.name NOT IN ('Anggota', 'Nomor Baru', 'Saudara/i')
  ORDER BY ar.phone, ar.event_id
`).all();
console.log('COUNT_C:', partC.length);
console.table(partC);

console.log('\n=== BAGIAN D: ADMIN LID WITHOUT AUDIT LOG ===');
const partD = db.prepare(`
  SELECT lm.lid, lm.phone, m.name, m.is_admin
  FROM lid_mappings lm
  JOIN members m ON m.phone = lm.phone
  WHERE (m.is_admin = 1 OR LOWER(m.seksi) = 'pengurus')
    AND lm.lid NOT IN (SELECT DISTINCT lid FROM lid_mapping_history)
`).all();
console.log('COUNT_D:', partD.length);
console.table(partD);

console.log('\n=== BAGIAN E: DUMMY / TEST DATA IN MEMBERS ===');
const partE = db.prepare(`
  SELECT phone, name, seksi, registered_at
  FROM members
  WHERE name LIKE '%dummy%' OR name LIKE '%test%' OR name LIKE '%uji%'
     OR seksi LIKE '%dummy%' OR seksi LIKE '%test%'
  ORDER BY registered_at DESC
`).all();
console.log('COUNT_E:', partE.length);
console.table(partE);
