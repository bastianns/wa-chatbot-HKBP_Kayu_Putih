import { getDb } from '../src/db.js';

const db = getDb('./absensi.db');

console.log('====================================================');
console.log('🔍 AUDIT SISTEMIK MENYELURUH DATABASE PRODUKSI');
console.log('====================================================\n');

// 1. Audit Duplikasi Nama di Tabel attendance_records per Event
console.log('📌 1. Duplikasi Nama di attendance_records per Event:');
const duplicateAttendanceByName = db.prepare(`
  SELECT 
    event_id, 
    LOWER(TRIM(name)) as clean_name, 
    COUNT(*) as jumlah_row, 
    GROUP_CONCAT(id || ' (' || phone || ': ' || status || ')') as detail_rows
  FROM attendance_records
  WHERE name != '' AND name NOT IN ('Anggota', 'Nomor Baru', 'Saudara/i', 'Admin Pengurus', 'Anggota Berhalangan')
  GROUP BY event_id, LOWER(TRIM(name))
  HAVING COUNT(*) > 1
  ORDER BY event_id ASC, clean_name ASC
`).all();
console.log(`Ditemukan: ${duplicateAttendanceByName.length} kelompok duplikasi attendance.`);
console.table(duplicateAttendanceByName);

// 2. Seluruh row di attendance_records yang menggunakan raw LID sebagai phone
console.log('\n📌 2. Seluruh Row di attendance_records yang Menggunakan Raw LID:');
const rawLidAttendance = db.prepare(`
  SELECT id, event_id, phone, name, seksi, status, attendance_choice, keterangan, responded_at
  FROM attendance_records
  WHERE phone NOT LIKE '628%'
  ORDER BY event_id ASC, id ASC
`).all();
console.log(`Ditemukan: ${rawLidAttendance.length} row attendance berbasis raw LID.`);
console.table(rawLidAttendance);

// 3. Seluruh row di attendance_records yang memiliki status konflik (misal satu WAITING_REPLY, satu RESPONDED untuk nama yang sama)
console.log('\n📌 3. Detail Konflik Status Kehadiran untuk Nama yang Sama:');
const conflicts = [];
for (const dup of duplicateAttendanceByName) {
  const rows = db.prepare(`
    SELECT id, event_id, phone, name, seksi, status, attendance_choice, keterangan, sent_at, responded_at
    FROM attendance_records
    WHERE event_id = ? AND LOWER(TRIM(name)) = ?
    ORDER BY id ASC
  `).all(dup.event_id, dup.clean_name);
  
  const hasResponded = rows.some(r => r.status === 'RESPONDED' || r.status === 'PARTIAL_HADIR');
  const hasWaiting = rows.some(r => r.status === 'WAITING_REPLY');
  
  if (hasResponded && hasWaiting) {
    conflicts.push({
      event_id: dup.event_id,
      name: dup.clean_name,
      rows: rows
    });
  }
}
console.log(`Ditemukan: ${conflicts.length} event-member dengan konflik status nyata (RESPONDED vs WAITING_REPLY).`);
for (const c of conflicts) {
  console.log(`\n👉 Event #${c.event_id} | Nama: "${c.name}"`);
  console.table(c.rows);
}

// 4. Audit Seluruh Anggota di Tabel members (Non-TargetKoor dan TargetKoor)
console.log('\n📌 4. Anggota yang Namanya Kosong atau Terdaftar Lebih dari 1x di members:');
const memberAnomalies = db.prepare(`
  SELECT id, phone, name, seksi, registered_at
  FROM members
  WHERE name = '' OR phone NOT LIKE '628%'
  ORDER BY seksi ASC, id ASC
`).all();
console.log(`Total entri members dengan nama kosong atau format LID: ${memberAnomalies.length}`);

// 5. Total Rekap Event yang ada di Database
console.log('\n📌 5. Ringkasan Seluruh Event di Database:');
const events = db.prepare(`
  SELECT e.id, e.nama_acara, e.waktu_latihan, e.is_active,
         COUNT(ar.id) as total_records,
         SUM(CASE WHEN ar.status = 'RESPONDED' THEN 1 ELSE 0 END) as total_responded,
         SUM(CASE WHEN ar.status = 'WAITING_REPLY' THEN 1 ELSE 0 END) as total_waiting
  FROM events e
  LEFT JOIN attendance_records ar ON ar.event_id = e.id
  GROUP BY e.id
  ORDER BY e.id ASC
`).all();
console.table(events);
