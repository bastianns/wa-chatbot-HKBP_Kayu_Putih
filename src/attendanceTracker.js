import { getDb } from './db.js';
import { memberManager as defaultMemberManager } from './memberManager.js';
import { eventManager as defaultEventManager } from './eventManager.js';
import { logger } from './logger.js';

export class AttendanceTracker {
  constructor(dbInstance = null, memberMgr = null, eventMgr = null) {
    this._db = dbInstance;
    this._memberManager = memberMgr;
    this._eventManager = eventMgr;
  }

  get db() {
    return this._db || getDb();
  }

  set db(instance) {
    this._db = instance;
  }

  get memberManager() {
    return this._memberManager || defaultMemberManager;
  }

  set memberManager(instance) {
    this._memberManager = instance;
  }

  get eventManager() {
    return this._eventManager || defaultEventManager;
  }

  set eventManager(instance) {
    this._eventManager = instance;
  }

  /**
   * Mengambil event ID aktif
   */
  getActiveEventId() {
    const active = this.eventManager.getEvent();
    return active.id;
  }

  /**
   * Mulai event baru (membuat event di DB dan menyiapkan sesi tracking tanpa menghapus riwayat lama)
   */
  startNewEvent(eventName, eventDate) {
    const current = this.eventManager.getEvent();
    if (current.namaAcara === eventName && current.waktuLatihan === eventDate) {
      return current.id;
    }
    const newEvent = this.eventManager.startNewEvent({
      namaAcara: eventName,
      waktuLatihan: eventDate,
      lokasi: current.lokasi,
      tujuan: current.tujuan,
      targetOnTime: current.targetOnTime,
      batasWaktu: current.batasWaktu
    });
    return newEvent.id;
  }

  /**
   * Catat pengiriman pesan broadcast (Status: WAITING_REPLY)
   */
  markSent(phone, name, seksi = 'Umum', eventId = null) {
    const evId = eventId || this.getActiveEventId();
    const cleanPhone = this.memberManager.normalizePhone(phone);
    if (!cleanPhone) return;

    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO attendance_records 
        (event_id, phone, name, seksi, status, sent_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 'WAITING_REPLY', ?, ?, ?)
      ON CONFLICT(event_id, phone) DO UPDATE SET
        name = CASE WHEN excluded.name != 'Nomor Baru' AND excluded.name != '' THEN excluded.name ELSE attendance_records.name END,
        seksi = CASE WHEN excluded.seksi != 'Umum' THEN excluded.seksi ELSE attendance_records.seksi END,
        sent_at = excluded.sent_at,
        updated_at = excluded.updated_at
    `).run(evId, cleanPhone, name || 'Nomor Baru', seksi || 'Umum', now, now, now);

    logger.debug('TRACKER', `Pesan broadcast tercatat ke ${cleanPhone} (Event #${evId})`);
  }

  /**
   * Catat respon absensi (PARTIAL_HADIR, PARTIAL_TIDAK, RESPONDED, NEEDS_VERIFICATION)
   */
  markResponded(phoneOrLid, responseData, status = 'RESPONDED', eventId = null) {
    const evId = eventId || this.getActiveEventId();
    let cleanPhone = this.memberManager.normalizePhone(phoneOrLid);
    const mappedPhone = this.memberManager.getLidMapping(cleanPhone);
    if (mappedPhone) {
      cleanPhone = mappedPhone;
    }

    const name = responseData.nama || '';
    const seksi = responseData.seksi || 'Umum';
    const choice = responseData.status === 'Bisa' || responseData.status === 'Tidak Bisa' ? responseData.status : null;
    const keterangan = responseData.keterangan || '-';
    const alasan = responseData.alasan || '-';
    const now = new Date().toISOString();
    const rawJson = JSON.stringify(responseData);

    const upsertTx = this.db.transaction(() => {
      this.db.prepare(`
        INSERT INTO attendance_records 
          (event_id, phone, name, seksi, status, attendance_choice, keterangan, alasan, responded_at, raw_response, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(event_id, phone) DO UPDATE SET
          name = CASE WHEN excluded.name != 'Anggota' AND excluded.name != '' THEN excluded.name ELSE attendance_records.name END,
          seksi = CASE WHEN excluded.seksi != 'Umum' THEN excluded.seksi ELSE attendance_records.seksi END,
          status = excluded.status,
          attendance_choice = excluded.attendance_choice,
          keterangan = excluded.keterangan,
          alasan = excluded.alasan,
          responded_at = excluded.responded_at,
          raw_response = excluded.raw_response,
          updated_at = excluded.updated_at
      `).run(evId, cleanPhone, name || 'Anggota', seksi, status, choice, keterangan, alasan, now, rawJson, now, now);
    });

    upsertTx();
    logger.info('TRACKER', `Respon absensi dicatat: ${name} (${cleanPhone}) -> ${status} [Choice: ${choice}]`);
  }

  /**
   * Catat pengiriman pesan reminder / follow-up
   */
  markReminded(phoneOrLid, eventId = null) {
    const evId = eventId || this.getActiveEventId();
    let cleanPhone = this.memberManager.normalizePhone(phoneOrLid);
    const mappedPhone = this.memberManager.getLidMapping(cleanPhone);
    if (mappedPhone) {
      cleanPhone = mappedPhone;
    }

    const now = new Date().toISOString();

    this.db.prepare(`
      UPDATE attendance_records 
      SET last_reminded_at = ?, updated_at = ?
      WHERE event_id = ? AND phone = ?
    `).run(now, now, evId, cleanPhone);

    logger.debug('TRACKER', `Reminder tercatat terkirim ke ${cleanPhone} (Event #${evId})`);
  }

  /**
   * Mengambil anggota pending yang belum membalas atau belum lengkap
   * @param {number|null} eventId ID Event
   * @param {number} cooldownMinutes Jika > 0, lewati anggota yang baru dikirimi reminder dalam N menit terakhir
   */
  getPendingMembers(eventId = null, cooldownMinutes = 0) {
    const evId = eventId || this.getActiveEventId();

    const rows = this.db.prepare(`
      SELECT * FROM attendance_records 
      WHERE event_id = ? AND LOWER(seksi) = 'targetkoor'
      ORDER BY id ASC
    `).all(evId);

    const nowMs = Date.now();
    const cooldownMs = cooldownMinutes * 60 * 1000;
    const list = [];

    for (const item of rows) {
      // Cek cooldown reminder untuk menghindari double reminder saat reconnect
      if (cooldownMinutes > 0 && item.last_reminded_at) {
        const lastRemindedMs = new Date(item.last_reminded_at).getTime();
        if (nowMs - lastRemindedMs < cooldownMs) {
          continue; // Masih dalam cooldown window, lewati
        }
      }

      if (item.status === 'WAITING_REPLY') {
        list.push({ phone: item.phone, name: item.name, seksi: item.seksi, status: item.status, note: 'Belum merespon sama sekali', lastRemindedAt: item.last_reminded_at });
      } else if (item.status === 'NEEDS_VERIFICATION') {
        list.push({ phone: item.phone, name: item.name, seksi: item.seksi, status: item.status, note: 'Butuh verifikasi nomor (LID suspect)', lastRemindedAt: item.last_reminded_at });
      } else if (item.status === 'PARTIAL_HADIR') {
        list.push({ phone: item.phone, name: item.name, seksi: item.seksi, status: item.status, note: 'Sudah konfirmasi Hadir, belum konfirmasi jam', lastRemindedAt: item.last_reminded_at });
      } else if (item.status === 'PARTIAL_TIDAK') {
        list.push({ phone: item.phone, name: item.name, seksi: item.seksi, status: item.status, note: 'Sudah konfirmasi Tidak Hadir, belum beri alasan', lastRemindedAt: item.last_reminded_at });
      }
    }

    return list;
  }

  /**
   * Ringkasan rekapitulasi kehadiran per event
   */
  getSummary(eventId = null) {
    const evId = eventId || this.getActiveEventId();
    const event = this.eventManager.getEventById(evId) || this.eventManager.getEvent();

    const rows = this.db.prepare(`
      SELECT a.*, 
             COALESCE(NULLIF(m.name, ''), a.name) as final_name,
             COALESCE(m.seksi, a.seksi) as final_seksi
      FROM attendance_records a
      LEFT JOIN members m ON m.phone = a.phone
      WHERE a.event_id = ?
    `).all(evId);

    const targetKoor = {
      totalSent: 0,
      totalResponded: 0,
      belumBalasSamaSekali: 0,
      totalHadir: 0,
      hadirOnTime: 0,
      hadirTelat: 0,
      hadirPendingJam: 0,
      totalTidakHadir: 0,
      tidakHadir: 0,
      tidakHadirPendingAlasan: 0,
      needsVerification: 0,
      hadirList: [],
      tidakHadirList: []
    };

    const extraResponses = [];
    let overallTotalResponded = 0;

    for (const item of rows) {
      const seksi = (item.final_seksi || item.seksi || 'Umum').toLowerCase();
      const isTarget = seksi === 'targetkoor';

      // Skip isolated unverified slots from Target Koor summary
      if (seksi === 'pendingverification' || seksi === 'unverifiedslot') {
        continue;
      }

      if (isTarget) {
        targetKoor.totalSent++;
        if (item.status === 'WAITING_REPLY') {
          targetKoor.belumBalasSamaSekali++;
        } else if (item.status === 'NEEDS_VERIFICATION') {
          targetKoor.needsVerification++;
        } else if (item.status === 'PARTIAL_HADIR') {
          targetKoor.totalResponded++;
          targetKoor.hadirPendingJam++;
          overallTotalResponded++;
          targetKoor.hadirList.push({
            phone: item.phone,
            name: item.final_name || item.name || 'Anggota Target',
            detail: item.keterangan !== '-' ? item.keterangan : 'Hadir (Menunggu Jam)',
            choice: 'Bisa'
          });
        } else if (item.status === 'PARTIAL_TIDAK') {
          targetKoor.totalResponded++;
          targetKoor.tidakHadirPendingAlasan++;
          overallTotalResponded++;
          targetKoor.tidakHadirList.push({
            phone: item.phone,
            name: item.final_name || item.name || 'Anggota Target',
            detail: item.alasan !== '-' ? item.alasan : 'Tidak Bisa (Belum Beri Alasan)',
            choice: 'Tidak Bisa'
          });
        } else if (item.status === 'RESPONDED') {
          targetKoor.totalResponded++;
          overallTotalResponded++;
          if (item.attendance_choice === 'Bisa') {
            if ((item.keterangan || '').includes('On-Time')) {
              targetKoor.hadirOnTime++;
            } else if ((item.keterangan || '').includes('Telat')) {
              targetKoor.hadirTelat++;
            } else {
              targetKoor.hadirPendingJam++;
            }
            targetKoor.hadirList.push({
              phone: item.phone,
              name: item.final_name || item.name || 'Anggota Target',
              detail: item.keterangan || 'On-Time',
              choice: 'Bisa'
            });
          } else if (item.attendance_choice === 'Tidak Bisa') {
            targetKoor.tidakHadir++;
            targetKoor.tidakHadirList.push({
              phone: item.phone,
              name: item.final_name || item.name || 'Anggota Target',
              detail: item.alasan || 'Tidak Bisa',
              choice: 'Tidak Bisa'
            });
          }
        }
      } else {
        // Respon di luar Target (Umum / Seksi Suara / Anggota Lain)
        if (item.status === 'RESPONDED' || item.status === 'PARTIAL_HADIR' || item.status === 'PARTIAL_TIDAK') {
          overallTotalResponded++;
          extraResponses.push({
            phone: item.phone,
            name: item.final_name || item.name || 'Anggota',
            seksi: item.final_seksi || item.seksi || 'Umum',
            status: item.attendance_choice || (item.status === 'PARTIAL_HADIR' ? 'Bisa' : 'Tidak Bisa'),
            keterangan: item.keterangan || '-',
            alasan: item.alasan || '-'
          });
        }
      }
    }

    targetKoor.totalHadir = targetKoor.hadirOnTime + targetKoor.hadirTelat + targetKoor.hadirPendingJam;
    targetKoor.totalTidakHadir = targetKoor.tidakHadir + targetKoor.tidakHadirPendingAlasan;

    return {
      eventId: event.id,
      eventName: event.namaAcara,
      eventDate: event.waktuLatihan,
      targetKoor,
      extraResponses,
      overallTotalResponded,
      // Backward compatibility fields:
      totalSent: targetKoor.totalSent,
      totalResponded: overallTotalResponded,
      belumBalasSamaSekali: targetKoor.belumBalasSamaSekali,
      totalHadir: targetKoor.totalHadir,
      hadirOnTime: targetKoor.hadirOnTime,
      hadirTelat: targetKoor.hadirTelat,
      hadirPendingJam: targetKoor.hadirPendingJam,
      totalTidakHadir: targetKoor.totalTidakHadir,
      tidakHadir: targetKoor.tidakHadir,
      tidakHadirPendingAlasan: targetKoor.tidakHadirPendingAlasan
    };
  }

  /**
   * Mengambil record absensi spesifik seorang anggota di event tertentu
   */
  getAttendance(phoneOrLid, eventId = null) {
    const evId = eventId || this.getActiveEventId();
    let cleanPhone = this.memberManager.normalizePhone(phoneOrLid);
    const mappedPhone = this.memberManager.getLidMapping(cleanPhone);
    if (mappedPhone) {
      cleanPhone = mappedPhone;
    }

    return this.db.prepare('SELECT * FROM attendance_records WHERE event_id = ? AND phone = ?').get(evId, cleanPhone) || null;
  }

  /**
   * Mengambil semua record absensi untuk event tertentu
   */
  getEventAttendance(eventId = null) {
    const evId = eventId || this.getActiveEventId();
    return this.db.prepare('SELECT * FROM attendance_records WHERE event_id = ?').all(evId);
  }
}

export const attendanceTracker = new AttendanceTracker();
