import { getDb } from '../src/db.js';

const db = getDb('./absensi.db');
const phonesToCheck = [
  '203920903241884', '6281210176004', '6282276661746',
  '246510067388562', '6282311927097', '6289517498649', '6282311927079',
  '250646037033026', '6285218300134', '6287888478332',
  '150341152669709', '6281210948567',
  '187501276881014', '6281914515770', '6285892639583',
  '163294740529277', '6287782829423',
  '260704531685506', '628129934654',
  '93458656194655', '6281388035191'
];

const inClause = phonesToCheck.map(p => `'${p}'`).join(',');
const rows = db.prepare(`
  SELECT id, event_id, phone, name, seksi, status, attendance_choice, keterangan 
  FROM attendance_records 
  WHERE phone IN (${inClause})
  ORDER BY event_id ASC, id ASC
`).all();

console.table(rows);
