import { createDatabase } from '../src/db.js';
import { AttendanceTracker } from '../src/attendanceTracker.js';
import { MemberManager } from '../src/memberManager.js';
import { EventManager } from '../src/eventManager.js';

const [,, dbPath, eventIdStr, phone, status, choice, keterangan] = process.argv;
const eventId = parseInt(eventIdStr, 10);
const pid = process.pid;

console.log(`[Worker PID:${pid}] Membuka koneksi database fisik: ${dbPath}`);
const db = createDatabase(dbPath);
const memMgr = new MemberManager(db);
const evMgr = new EventManager(db);
const tracker = new AttendanceTracker(db, memMgr, evMgr);

console.log(`[Worker PID:${pid}] Menjalankan atomic markResponded untuk phone=${phone}, status=${status}, keterangan="${keterangan}"...`);
try {
  tracker.markResponded(phone, {
    nama: 'Daniel Nainggolan',
    seksi: 'Bass',
    status: choice,
    keterangan: keterangan,
    alasan: '-'
  }, status, eventId);

  console.log(`[Worker PID:${pid}] ✅ Sukses menyimpan ke attendance_records tanpa error.`);
  db.close();
  process.exit(0);
} catch (err) {
  console.error(`[Worker PID:${pid}] ❌ Terjadi error: ${err.message}`, err);
  db.close();
  process.exit(1);
}
