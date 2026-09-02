import { getDb } from '../src/db.js';
import { memberManager } from '../src/memberManager.js';

const db = getDb('./absensi.db');

const userList = [
  { name: 'Benaya Bunga Simanjuntak', phoneInput: '6281210176004' },
  { name: 'Christian Nathaniel Adventura Hutapea', phoneInput: '6282311927097' },
  { name: 'Andrew Sioh Sahat Gonggom Tua Hutahaean', phoneInput: '+62 852-1830-0134' },
  { name: 'Nathanael Josua', phoneInput: '+62 812-1094-8567' },
  { name: 'Kyla Gavrila Tiurmaida', phoneInput: '+62 819-1451-5770' },
  { name: 'Rebecca Zaneta Octoria Hutajulu', phoneInput: '+62 877-8282-9423' },
  { name: 'Rheyden Petrik Hutahaean', phoneInput: '+62 812-9934-654' },
  { name: 'Catherine', phoneInput: '+62 813-8803-5191' }
];

console.log('=== PEMERIKSAAN STATUS 8 NAMA & NOMOR DARI USER ===\n');

for (const u of userList) {
  const normPhone = memberManager.normalizePhone(u.phoneInput);
  console.log(`--------------------------------------------------`);
  console.log(`👤 Target: ${u.name}`);
  console.log(`   Nomor Benar: ${normPhone} (input: ${u.phoneInput})`);

  // 1. Cek tabel members berdasarkan nomor HP benar
  const memberByPhone = db.prepare('SELECT id, phone, name, seksi, registered_at FROM members WHERE phone = ?').get(normPhone);
  console.log(`   [members via Phone]:`, memberByPhone || '❌ TIDAK ADA DI DB');

  // 2. Cek tabel members berdasarkan pencarian nama
  const memberByName = db.prepare('SELECT id, phone, name, seksi, registered_at FROM members WHERE LOWER(name) LIKE ?').all(`%${u.name.toLowerCase().split(' ')[0]}%`);
  console.log(`   [members via Nama]:`, memberByName);

  // 3. Cek tabel lid_mappings apakah ada LID terpetakan ke nomor ini
  const lidByPhone = db.prepare('SELECT * FROM lid_mappings WHERE phone = ?').all(normPhone);
  console.log(`   [lid_mappings via Phone]:`, lidByPhone);

  // 4. Cek apakah ada LID untuk nama ini di tabel lid_mappings
  if (memberByName.length > 0) {
    for (const mb of memberByName) {
      const lidByRaw = db.prepare('SELECT * FROM lid_mappings WHERE lid = ?').all(mb.phone);
      if (lidByRaw.length > 0) {
        console.log(`   [lid_mappings via Raw LID ${mb.phone}]:`, lidByRaw);
      }
    }
  }
}
