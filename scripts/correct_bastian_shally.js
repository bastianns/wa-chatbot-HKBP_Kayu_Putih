import { getDb } from '../src/db.js';

/**
 * Script Koreksi Data Bastian & Shally
 * Transaksi Atomik dengan Jejak Audit lid_mapping_history
 * 
 * CATATAN KEAMANAN:
 * - Dijalankan di dalam satu db.transaction() yang atomik (rollback otomatis jika ada error).
 * - Tidak menghapus nomor dummy (6281233334444) agar review tetap terisolasi.
 */
export function runCorrection() {
  const db = getDb();
  const now = new Date().toISOString();

  console.log('====================================================');
  console.log('🔍 1. QUERY BEFORE (Kondisi Sebelum Koreksi):');
  console.log('====================================================');

  const membersBefore = db.prepare(`
    SELECT id, phone, name, seksi, peran, is_admin 
    FROM members 
    WHERE phone IN ('6281211524318', '6281281277599')
    ORDER BY phone ASC
  `).all();
  console.log('\n[Tabel members - SEBELUM]:');
  console.table(membersBefore);

  const lidsBefore = db.prepare(`
    SELECT lid, phone, created_at 
    FROM lid_mappings 
    WHERE lid IN ('172743634981033', '17046842687550')
    ORDER BY lid ASC
  `).all();
  console.log('\n[Tabel lid_mappings - SEBELUM]:');
  console.table(lidsBefore);

  console.log('\n⏳ Menjalankan Transaksi Koreksi Atomik...');

  const correctionTx = db.transaction(() => {
    // 1. Rekam jejak audit di lid_mapping_history untuk kedua LID sebelum ditukar
    const insertHistory = db.prepare(`
      INSERT INTO lid_mapping_history (lid, old_phone, new_phone, changed_at, reason)
      VALUES (?, ?, ?, ?, ?)
    `);

    const currentBastianLid = db.prepare('SELECT phone FROM lid_mappings WHERE lid = ?').get('172743634981033');
    const currentShallyLid = db.prepare('SELECT phone FROM lid_mappings WHERE lid = ?').get('17046842687550');

    if (currentBastianLid) {
      insertHistory.run('172743634981033', currentBastianLid.phone, '6281211524318', now, 'CORRECTION_SWAPPED_PHONE_DATA');
    }
    if (currentShallyLid) {
      insertHistory.run('17046842687550', currentShallyLid.phone, '6281281277599', now, 'CORRECTION_SWAPPED_PHONE_DATA');
    }

    // 2. Koreksi pemetaan LID permanen
    const updateLid = db.prepare(`
      INSERT OR REPLACE INTO lid_mappings (lid, phone, created_at)
      VALUES (?, ?, ?)
    `);
    updateLid.run('172743634981033', '6281211524318', now); // Bastian LID -> Bastian Phone (081211524318)
    updateLid.run('17046842687550', '6281281277599', now);  // Shally LID -> Shally Phone (081281277599)

    // 3. Koreksi data profil di tabel members
    const updateMember = db.prepare(`
      UPDATE members 
      SET name = ?, seksi = ?, peran = ?, is_admin = 1, updated_at = ?
      WHERE phone = ?
    `);
    updateMember.run('Bastian Sibarani', 'Tenor', 'Anggota Naposobulung', now, '6281211524318');
    updateMember.run('Shally cantik', 'Sopran 1', 'Anggota BPH Divisi Musik dan Rohani', now, '6281281277599');

    // 4. Koreksi data di attendance_records untuk riwayat kehadiran
    const updateAttendance = db.prepare(`
      UPDATE attendance_records 
      SET name = ?, seksi = ?, updated_at = ?
      WHERE phone = ?
    `);
    updateAttendance.run('Bastian Sibarani', 'Tenor', now, '6281211524318');
    updateAttendance.run('Shally cantik', 'Sopran 1', now, '6281281277599');
  });

  correctionTx();
  console.log('✅ Transaksi Berhasil Dieksekusi!\n');

  console.log('====================================================');
  console.log('🔍 2. QUERY AFTER (Kondisi Setelah Koreksi):');
  console.log('====================================================');

  const membersAfter = db.prepare(`
    SELECT id, phone, name, seksi, peran, is_admin 
    FROM members 
    WHERE phone IN ('6281211524318', '6281281277599')
    ORDER BY phone ASC
  `).all();
  console.log('\n[Tabel members - SESUDAH]:');
  console.table(membersAfter);

  const lidsAfter = db.prepare(`
    SELECT lid, phone, created_at 
    FROM lid_mappings 
    WHERE lid IN ('172743634981033', '17046842687550')
    ORDER BY lid ASC
  `).all();
  console.log('\n[Tabel lid_mappings - SESUDAH]:');
  console.table(lidsAfter);

  const historyAfter = db.prepare(`
    SELECT id, lid, old_phone, new_phone, changed_at, reason 
    FROM lid_mapping_history 
    WHERE lid IN ('172743634981033', '17046842687550')
    ORDER BY id ASC
  `).all();
  console.log('\n[Tabel lid_mapping_history - SESUDAH]:');
  console.table(historyAfter);

  const attendanceAfter = db.prepare(`
    SELECT id, event_id, phone, name, seksi, status, attendance_choice, keterangan 
    FROM attendance_records 
    WHERE phone IN ('6281211524318', '6281281277599')
    ORDER BY event_id ASC, phone ASC
  `).all();
  console.log('\n[Tabel attendance_records - SESUDAH]:');
  console.table(attendanceAfter);
}

// Jika dijalankan langsung dari terminal: node scripts/correct_bastian_shally.js
if (process.argv[1] && process.argv[1].endsWith('correct_bastian_shally.js')) {
  runCorrection();
}
