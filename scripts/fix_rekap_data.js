import Database from 'better-sqlite3';

const db = new Database('./absensi.db');

// 1. Update Rheyden's attendance to Telat (19:30 WIB)
db.prepare("UPDATE attendance_records SET keterangan = 'Telat (19:30 WIB)', updated_at = ? WHERE phone = '628129934654' AND event_id = 3").run(new Date().toISOString());

// 2. Sync seksi for attendance_records in Event 3 from members table
db.prepare(`
  UPDATE attendance_records 
  SET seksi = (SELECT seksi FROM members WHERE members.phone = attendance_records.phone)
  WHERE event_id = 3 AND EXISTS (SELECT 1 FROM members WHERE members.phone = attendance_records.phone)
`).run();

console.log('✅ Database updated successfully.');
