/**
 * Modul Terpadu untuk Semua Template Pesan WhatsApp Absensi Bot
 * (Bahasa Indonesia informal ramah, emoji, sapaan "Kak <nama>", format bold/italic)
 */

export const messageTemplates = {
  /**
   * Menu Perintah Admin dengan jumlah anggota dinamis dari database
   */
  getHelpMessage(counts = {}, adminName = 'Pengurus') {
    const targetCount = counts.targetKoor || 0;
    const allCount = counts.totalMembers || 0;
    const greeting = adminName ? `Shalom Kak *${adminName}*! 👋\n` : '';

    return (
      `${greeting}🛠️ *MENU PERINTAH ADMIN (SEKSI ROHANI & MUSIK)*\n\n` +
      `*🚀 Perintah Broadcast Langsung dari WA:*\n` +
      `• *broadcast target* - Kirim PC ke ${targetCount} orang target khusus\n` +
      `• *broadcast pengurus* - Tes kirim PC ke sesama admin\n` +
      `• *broadcast all* - Kirim PC ke seluruh ${allCount} anggota\n` +
      `• *remind* - Kirim pengingat ke yang belum membalas\n\n` +
      `*📅 Pengaturan Acara:*\n` +
      `• *event* - Lihat detail acara aktif\n` +
      `• *setevent [Nama] | [Waktu] | [Lokasi] | [Tujuan]* - Ubah info acara\n` +
      `• *preview* - Lihat simulasi pesan yang akan dikirim ke anggota\n` +
      `• *tutup* - Tutup pengisian absensi (Cut-off)\n` +
      `• *buka* - Buka kembali absensi\n` +
      `• *umumkan* - Buat teks broadcast grup\n` +
      `• *riwayat* - Lihat riwayat acara & kehadiran lampau\n\n` +
      `*👥 Pengaturan Anggota & Grup:*\n` +
      `• *gruplist* - Lihat semua grup WA yang diikuti bot\n` +
      `• *syncgroup [No]* - Impor nomor anggota dari grup\n` +
      `• *anggota* - Lihat daftar nama & seksi anggota (bisa: *anggota Sopran*, *anggota Tenor*, dsb.)\n` +
      `• *cari [Nama/No]* - Cari info anggota & status kehadirannya\n\n` +
      `*📊 Laporan & Monitoring:*\n` +
      `• *rekap* - Lihat rekap kehadiran real-time\n` +
      `• *pending* - Lihat anggota yang BELUM membalas`
    );
  },

  /**
   * Hasil pencarian anggota spesifik
   */
  getMemberSearchResultMessage(keyword, results = [], attendanceMap = {}) {
    if (!results || results.length === 0) {
      return `🔍 *PENCARIAN ANGGOTA ("${keyword}")*\n\n❌ Tidak ditemukan anggota dengan nama atau nomor HP tersebut.`;
    }

    let msg = `🔍 *HASIL PENCARIAN ANGGOTA ("${keyword}") - Ditemukan ${results.length} orang:*\n\n`;

    results.forEach((m, idx) => {
      const att = attendanceMap[m.phone] || null;
      let statusStr = '⚪ _Belum ada respon_';
      if (att) {
        if (att.status === 'Bisa') {
          statusStr = `✅ *Bisa Hadir* (${att.keterangan || 'On-Time'})`;
        } else if (att.status === 'Tidak Bisa') {
          statusStr = `❌ *Tidak Bisa* (Alasan: ${att.alasan || '-'})`;
        } else {
          statusStr = `⏳ *Proses:* ${att.status}`;
        }
      }

      msg += `*${idx + 1}.* 👤 *${m.name || '(Belum input nama)'}*\n`;
      msg += `   📱 No WA: *${m.phone}*\n`;
      msg += `   🎶 Seksi: *${m.seksi || 'Umum'}* | ${m.is_admin ? '⭐ *Admin*' : 'Anggota'}\n`;
      msg += `   📊 Status Event: ${statusStr}\n\n`;
    });

    return msg.trim();
  },

  /**
   * Tanya pilihan seksi suara saat registrasi anggota baru
   */
  getAskSectionMessage(name) {
    return (
      `Senang berkenalan dengan Kak *${name}*! ✨\n\n` +
      `Boleh tahu Kakak bertugas di bagian seksi suara / pelayanan apa ya? 🎶\n\n` +
      `Silakan balas dengan angka atau kata:\n` +
      `*1.* Sopran 🎼\n` +
      `*2.* Alto 🎶\n` +
      `*3.* Tenor 🎤\n` +
      `*4.* Bass 🎵\n` +
      `*5.* Pemusik / Tim Musik 🎹\n` +
      `*6.* Umum / Jemaat`
    );
  },

  /**
   * Daftar anggota per seksi
   */
  getMemberListMessage(members, filterTag = 'all') {
    if (!members || members.length === 0) {
      return `👥 *DAFTAR ANGGOTA [${filterTag.toUpperCase()}]*\n\nTidak ada anggota yang ditemukan.`;
    }

    let msg = `👥 *DAFTAR ANGGOTA TERDAFTAR [${filterTag.toUpperCase()}] (${members.length} Orang):*\n\n`;
    const preview = members.slice(0, 30);
    preview.forEach((m, idx) => {
      msg += `*${idx + 1}.* ${m.name || '(Belum input nama)'} (${m.phone}) - [${m.seksi || 'Umum'}]\n`;
    });
    if (members.length > 30) {
      msg += `\n_... dan ${members.length - 30} anggota lainnya._`;
    }
    return msg;
  },

  /**
   * Preview pesan broadcast untuk admin
   */
  getPreviewMessage(event, counts = {}) {
    const totalTarget = counts.targetKoor || counts.totalMembers || 0;

    return (
      `👁️ *PREVIEW PESAN ABSENSI (${totalTarget} TARGET KOOR)*\n` +
      `👥 *Total Penerima:* ${totalTarget} orang\n\n` +
      `*1. Sapaan untuk Anggota Baru (Belum Tersimpan):*\n` +
      `------------------------------------\n` +
      this.getNewMemberGreeting(event) + '\n' +
      `------------------------------------\n\n` +
      `*2. Sapaan untuk Anggota yang Sudah Tersimpan:*\n` +
      `------------------------------------\n` +
      this.getKnownMemberGreeting('Daniel', event) + '\n' +
      `------------------------------------\n` +
      `💡 _Untuk mengirim langsung dari WA ini, ketik:_ \n*broadcast target*`
    );
  },

  /**
   * Sapaan untuk anggota baru yang belum terdaftar namanya
   */
  getNewMemberGreeting(event) {
    return (
      `Shalom rekan-rekan Naposo HKBP Kayu Putih! 👋✨\n\n` +
      `Perkenalkan, ini adalah layanan bot asisten otomatis dari *Pengurus & Seksi Koor Naposo HKBP Kayu Putih*. Kami menghubungi rekan-rekan untuk mendata kehadiran dan persiapan latihan paduan suara kita. 🙏\n\n` +
      `Sebelum kami catat, boleh minta tolong ketikkan *Nama Lengkap* Anda terlebih dahulu?`
    );
  },

  /**
   * Sapaan untuk anggota yang namanya sudah tersimpan di database
   */
  getKnownMemberGreeting(name, event, adminHint = '') {
    return (
      `Shalom Kak *${name}*! 👋✨\n` +
      `Salam dari Pengurus Seksi Koor Naposo HKBP Kayu Putih.\n\n` +
      `Untuk persiapan *${event.namaAcara}*:\n` +
      `🗓️ *Waktu:* ${event.waktuLatihan}\n` +
      `📍 *Lokasi:* ${event.lokasi}\n` +
      `🎯 *Tujuan:* ${event.tujuan}\n\n` +
      `*Apakah Kak ${name} bisa hadir latihan?*\n\n` +
      `Silakan balas dengan angka atau kata:\n` +
      `*1.* Bisa Hadir ✅\n` +
      `*2.* Tidak Bisa Hadir ❌\n\n` +
      `_(Ketik *batal* jika ingin membatalkan)_` +
      adminHint
    );
  },

  /**
   * Tanya konfirmasi jam On-Time / Telat
   */
  getAskOnTimeMessage(event) {
    return (
      `Puji Tuhan! 🙏\n\n` +
      `Apakah Kakak bisa hadir on-time (${event.targetOnTime})?\n\n` +
      `Balas dengan huruf atau kata:\n` +
      `*A.* Ya, On-Time ⏰\n` +
      `*B.* Telat ⏳`
    );
  },

  /**
   * Tanya estimasi jam tiba jika telat
   */
  getAskLateTimeMessage() {
    return (
      `Siap dicatat telat. Kira-kira estimasi tiba jam berapa ya? 🕒\n\n` +
      `_(Contoh: Ketik *19.30*, *Jam 8 malam*, atau *19.45 kena macet*)_`
    );
  },

  /**
   * Tanya alasan ketidakhadiran
   */
  getAskReasonMessage() {
    return (
      `Baik, mohon maaf Kakak berhalangan hadir. 🙏\n\n` +
      `Boleh ketik alasan singkat ketidakhadiran? (Contoh: Sakit / Lembur kerja / Ada acara keluarga)`
    );
  },

  /**
   * Konfirmasi sukses hadir On-Time
   */
  getSuccessOnTimeMessage(name, event) {
    return (
      `Terima kasih banyak konfirmasinya, Kak *${name}*! 🎉\n\n` +
      `Data kehadiran Kakak telah dicatat:\n` +
      `📋 Status: *Bisa Hadir*\n` +
      `🕒 Waktu: *On-Time (${event.targetOnTime})*\n` +
      `📍 Lokasi: *${event.lokasi}*\n\n` +
      `Sampai jumpa di tempat latihan, Tuhan memberkati! ✨\n\n` +
      `💡 _Catatan: Jika ada perubahan rencana mendadak, silakan ketik *#ubah* untuk memperbarui kehadiran._`
    );
  },

  /**
   * Konfirmasi sukses hadir Telat
   */
  getSuccessLateMessage(name, event, lateTime) {
    return (
      `Terima kasih konfirmasinya, Kak *${name}*! 🙌\n\n` +
      `Data kehadiran Kakak telah dicatat:\n` +
      `📋 Status: *Bisa Hadir*\n` +
      `⏳ Keterangan: *Telat (Estimasi: ${lateTime})*\n` +
      `📍 Lokasi: *${event.lokasi}*\n\n` +
      `Hati-hati di jalan ya, sampai jumpa di latihan! ✨\n\n` +
      `💡 _Catatan: Jika ada perubahan rencana mendadak, silakan ketik *#ubah* untuk memperbarui kehadiran._`
    );
  },

  /**
   * Konfirmasi sukses tidak hadir
   */
  getSuccessReasonMessage(name, reason) {
    return (
      `Terima kasih atas informasinya, Kak *${name}*. 🙏\n\n` +
      `Data ketidakhadiran Kakak telah dicatat:\n` +
      `📋 Status: *Tidak Bisa Hadir*\n` +
      `📝 Alasan: *${reason}*\n\n` +
      `Semoga urusannya dilancarkan / lekas pulih. Tuhan memberkati! ✨\n\n` +
      `💡 _Catatan: Jika ada perubahan rencana mendadak, silakan ketik *#ubah* untuk memperbarui kehadiran._`
    );
  },

  /**
   * Pesan saat absensi ditutup
   */
  getClosedMessage(event) {
    return (
      `Mohon maaf, pengisian absensi untuk *${event.namaAcara}* sudah *DITUTUP* untuk rekapitulasi pengurus. 🙏\n\n` +
      `Jika ada keperluan mendesak atau perubahan rencana mendadak, silakan hubungi pengurus/seksi koor ya. Terima kasih! ✨`
    );
  },

  /**
   * Permintaan verifikasi nomor HP jika masuk dari akun WhatsApp LID baru
   */
  getLidVerificationRequest() {
    return (
      `Shalom rekan-rekan Naposo HKBP Kayu Putih! 👋✨\n\n` +
      `Untuk memastikan identitas dan nomor WhatsApp Anda terhubung dengan tepat di sistem absensi, boleh bantu ketikkan *Nomor HP WhatsApp* Anda terlebih dahulu?\n\n` +
      `_(Contoh: Ketik *08123456789* atau *628123456789*)_`
    );
  },

  /**
   * Konfirmasi sukses verifikasi nomor HP dari LID
   */
  getLidVerificationSuccess(phone) {
    return `✅ Terima kasih! Nomor HP WhatsApp Anda (*${phone}*) berhasil diverifikasi di sistem absensi. 🙏`;
  },

  /**
   * Template rekapitulasi real-time
   */
  getRekapMessage(event, summary) {
    let extraHadir = summary.targetKoor.hadirPendingJam > 0 ? `\n• Menunggu Jam Tiba: *${summary.targetKoor.hadirPendingJam}* orang` : '';
    let extraAbsen = summary.targetKoor.tidakHadirPendingAlasan > 0 ? `\n• Belum Beri Alasan: *${summary.targetKoor.tidakHadirPendingAlasan}* orang` : '';
    let extraQuarantine = summary.targetKoor.needsVerification > 0 ? `\n• Butuh Verifikasi Nomor (LID Suspect): *${summary.targetKoor.needsVerification}* orang` : '';

    let extraText = '';
    if (summary.extraResponses && summary.extraResponses.length > 0) {
      extraText = `\n\n👥 *TAMBAHAN RESPON DI LUAR TARGET (${summary.extraResponses.length} Orang):*\n`;
      summary.extraResponses.forEach((ex) => {
        const detail = ex.keterangan !== '-' ? ex.keterangan : (ex.alasan !== '-' ? ex.alasan : '');
        const detailStr = detail ? ` - ${detail}` : '';
        extraText += `• *${ex.name}*: ${ex.status === 'Bisa' ? '✅ Hadir' : '❌ Tidak Hadir'}${detailStr}\n`;
      });
    }

    return (
      `📊 *REKAP KEHADIRAN: ${event.namaAcara}*\n` +
      `🗓️ ${event.waktuLatihan}\n` +
      `------------------------------------\n` +
      `🎯 *TARGET KHUSUS KOOR (${summary.targetKoor.totalSent} Orang):*\n` +
      `• Terkonfirmasi Valid: *${summary.targetKoor.totalResponded}* orang\n` +
      `• Belum Merespon: *${summary.targetKoor.belumBalasSamaSekali}* orang` +
      extraQuarantine + `\n\n` +
      `*🟢 Rincian Hadir Target (${summary.targetKoor.totalHadir} Orang):*\n` +
      `• On-Time (19:00): *${summary.targetKoor.hadirOnTime}* orang\n` +
      `• Telat: *${summary.targetKoor.hadirTelat}* orang` +
      extraHadir + `\n\n` +
      `*🔴 Rincian Tidak Hadir Target (${summary.targetKoor.totalTidakHadir} Orang):*\n` +
      `• Sudah Ada Alasan: *${summary.targetKoor.tidakHadir}* orang` +
      extraAbsen +
      extraText +
      `\n------------------------------------\n` +
      `📈 *Total Keseluruhan Konfirmasi Masuk:* *${summary.overallTotalResponded}* orang\n\n` +
      `💡 _Ketik *pending* untuk melihat daftar nomor target yang belum membalas._`
    );
  },

  /**
   * Template daftar riwayat acara lampau
   */
  getHistoryListMessage(eventsWithSummary) {
    if (!eventsWithSummary || eventsWithSummary.length === 0) {
      return `📜 *RIWAYAT ACARA*\n\nBelum ada riwayat acara yang tercatat di database.`;
    }

    let msg = `📜 *RIWAYAT ACARA & KEHADIRAN LAMPAS (${eventsWithSummary.length} Acara Terakhir):*\n\n`;

    eventsWithSummary.forEach((item, idx) => {
      let badge = '';
      if (item.isActive) {
        badge = item.isClosed ? ' 🔒 *(Ditutup / Selesai)*' : ' 🟢 *(Sedang Aktif)*';
      } else {
        badge = ' ⚪ *(Arsip Lampau)*';
      }

      msg += `*${idx + 1}.* [ID #${item.id}] *${item.namaAcara}*${badge}\n`;
      msg += `   🗓️ ${item.waktuLatihan}\n`;
      msg += `   📊 Hadir: *${item.totalHadir}* | Tidak Hadir: *${item.totalTidakHadir}* | Total Respon: *${item.overallTotalResponded}*\n\n`;
    });

    msg += `💡 _Ketik *riwayat [ID]* (contoh: *riwayat 1*) untuk melihat rekap detail acara tertentu._`;
    return msg;
  }
};
