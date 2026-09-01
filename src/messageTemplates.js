/**
 * Modul Terpadu untuk Semua Template Pesan WhatsApp Absensi Bot
 * (Bahasa Indonesia informal ramah, emoji, sapaan "Kak <nama>", format bold/italic)
 */

export const messageTemplates = {
  /**
   * Menu Perintah untuk Admin/Pengurus
   */
  getAdminHelpMessage(counts = {}, adminName = 'Pengurus') {
    const targetCount = counts.targetKoor || 0;
    const allCount = counts.totalMembers || 0;
    const greeting = adminName ? `Shalom Kak *${adminName}*! 👋\n` : '';

    return (
      `${greeting}🛠️ *MENU PERINTAH ADMIN (SEKSI ROHANI & MUSIK)*\n\n` +
      `*👤 Pribadi & Profil Anda:*\n` +
      `• *profil* (atau *saya*) - Lihat data diri & status kehadiran Anda\n` +
      `• *absen* (atau *#absen*) - Isi absensi untuk diri sendiri\n` +
      `• *#suara* / *#nama* - Atur seksi suara vokal / nama Anda\n\n` +
      `*🚀 Broadcast & Pengumuman:*\n` +
      `• *broadcast target* - Kirim PC ke ${targetCount} orang target khusus\n` +
      `• *broadcast pengurus* - Tes kirim PC ke sesama admin\n` +
      `• *broadcast all* - Kirim PC ke seluruh ${allCount} anggota\n` +
      `• *remind* - Kirim pengingat ke yang belum membalas\n` +
      `• *umumkan* - Format teks pengumuman siap share ke grup WA\n\n` +
      `*📅 Pengaturan Acara Latihan:*\n` +
      `• *event* - Lihat info jadwal latihan aktif\n` +
      `• *setevent [Nama] | [Waktu] | [Lokasi] | [Tujuan]* - Buat / ubah jadwal latihan\n` +
      `• *tutup* / *buka* - Kunci / buka kembali pengisian absensi\n` +
      `• *riwayat* - Lihat riwayat acara latihan lampau\n\n` +
      `*📊 Monitoring & Data Anggota:*\n` +
      `• *rekap* - Lihat rekapitulasi kehadiran real-time\n` +
      `• *pending* - Lihat daftar nomor yang belum membalas\n` +
      `• *anggota* - Lihat daftar anggota terdaftar (bisa: *anggota Sopran*, *anggota Tenor*)\n` +
      `• *cari [Nama/No]* - Cari info anggota tertentu\n` +
      `• *gruplist* / *syncgroup [No]* - Impor anggota dari grup WA`
    );
  },

  /**
   * Menu Bantuan Sederhana & Ramah untuk Anggota Biasa
   */
  getMemberHelpMessage(name = 'Saudara/i') {
    return (
      `Shalom Kak *${name}*! 👋✨\n` +
      `Selamat datang di Bot Absensi Paduan Suara NHKBP Kayu Putih.\n\n` +
      `*📌 PANDUAN PERINTAH YANG BISA KAKAK GUNAKAN:*\n\n` +
      `• *profil* (atau *saya*) - Lihat data diri & status kehadiran Kakak\n` +
      `• *absen* (atau *#absen*) - Isi konfirmasi kehadiran latihan aktif\n` +
      `• *#ubah* - Ubah konfirmasi kehadiran jika rencana berubah\n` +
      `• *#suara* - Atur/ganti seksi suara vokal (Sopran, Alto, Tenor, Bass, Pemusik)\n` +
      `• *#peran* - Atur/ganti peran pelayanan (Anggota, Seksi Musik, Song Leader, dll.)\n` +
      `• *#nama [Nama Baru]* - Perbarui nama lengkap Anda\n` +
      `• *event* - Lihat jadwal & info latihan aktif saat ini\n\n` +
      `💡 _Contoh cara cepat:_ Ketik *#suara Tenor 1* atau *#peran Song Leader*`
    );
  },

  /**
   * Backward compatibility alias untuk help
   */
  getHelpMessage(counts = {}, adminName = 'Pengurus') {
    return this.getAdminHelpMessage(counts, adminName);
  },

  /**
   * Tampilan Profil Mandiri Anggota (Info Lengkap & Jelas)
   */
  getMemberProfileMessage(name, phone, seksi, isAdmin, event, record, peran = null) {
    const voiceSection = (seksi && seksi !== 'Umum' && seksi !== 'Pengurus') ? `*${seksi}*` : '_Belum ditentukan (Ketik #suara)_';
    const roleText = peran || (isAdmin ? 'Pengurus / Admin ⭐' : 'Anggota Naposobulung');

    let statusText = '⚪ _Belum mengisi konfirmasi_';
    if (record) {
      if (record.attendance_choice === 'Bisa' || (record.status === 'RESPONDED' && record.attendance_choice === 'Bisa')) {
        statusText = `✅ *Bisa Hadir* (${record.keterangan || 'On-Time'})`;
      } else if (record.attendance_choice === 'Tidak Bisa' || (record.status === 'RESPONDED' && record.attendance_choice === 'Tidak Bisa')) {
        statusText = `❌ *Tidak Bisa Hadir* (Alasan: ${record.alasan || '-'})`;
      } else {
        statusText = `⏳ *Sedang Proses:* ${record.status}`;
      }
    }

    return (
      `👤 *PROFIL & STATUS LATIHAN*\n` +
      `🏛️ *NHKBP Kayu Putih*\n` +
      `------------------------------------\n` +
      `• *Nama Lengkap:* ${name || '(Belum terdaftar)'}\n` +
      `• *Seksi Suara:* ${voiceSection}\n` +
      `• *Peran / Pelayanan:* *${roleText}*\n\n` +
      `*📅 Status Latihan Terdekat:*\n` +
      `• *Acara:* ${event ? event.namaAcara : 'Latihan Koor'}\n` +
      `• *Jadwal:* ${event ? event.waktuLatihan : '-'}\n` +
      `• *Status Kehadiran:* ${statusText}\n` +
      `------------------------------------\n\n` +
      `*✏️ Ingin Mengubah Data Anda?*\n` +
      `• Ketik *#suara* (atau *#suara Tenor 1*, *#suara Alto*) untuk ganti seksi suara\n` +
      `• Ketik *#peran* (atau *#peran Song Leader*) untuk ganti peran pelayanan\n` +
      `• Ketik *#nama [Nama Baru]* untuk mengganti nama lengkap\n` +
      `• Ketik *#absen* (atau *#ubah*) untuk mengisi / mengubah kehadiran`
    );
  },

  /**
   * Tanya pilihan peran / pelayanan
   */
  getAskRoleMessage(name, currentRole = null) {
    const prevInfo = currentRole ? `📌 _(Peran Kakak saat ini: *${currentRole}*)_\n\n` : '';

    return (
      `Halo Kak *${name}*! ✨\n\n` +
      prevInfo +
      `Silakan pilih peran / bidang pelayanan Kakak di NHKBP Kayu Putih:\n\n` +
      `• *1.* Anggota Naposobulung\n` +
      `• *2.* Seksi Rohani & Musik (Koor)\n` +
      `• *3.* Pengurus / BPH\n` +
      `• *4.* Song Leader / Dirigen\n` +
      `• *5.* Pemusik / Tim Musik\n` +
      `• *6.* Seksi Pelayanan Lainnya (Acara, Humas, Konsumsi, dll.)\n\n` +
      `_(Balas dengan angka 1-6, atau langsung ketik peran Anda, contoh: *1*, *Song Leader*, atau *#peran Seksi Konsumsi*)_`
    );
  },

  /**
   * Sapaan santai saat anggota mengirim salam (Halo / Pagi / dll.)
   */
  getCasualGreetingMessage(name, event, record, seksi, isAdmin) {
    let statusSummary = '';
    if (record && record.status === 'RESPONDED') {
      const isHadir = record.attendance_choice === 'Bisa';
      statusSummary = isHadir 
        ? `✅ *Bisa Hadir* (${record.keterangan || 'On-Time'})` 
        : `❌ *Tidak Bisa* (Alasan: ${record.alasan || '-'})`;
    } else {
      statusSummary = `⚪ _Belum mengisi kehadiran (Ketik *absen* untuk mengisi)_`;
    }

    const voiceInfo = (seksi && seksi !== 'Umum' && seksi !== 'Pengurus') ? ` | Seksi: *${seksi}*` : '';

    return (
      `Shalom Kak *${name}*! 👋✨\n\n` +
      `📌 *Latihan Terdekat:* ${event.namaAcara}\n` +
      `🗓️ *Waktu:* ${event.waktuLatihan}\n` +
      `📍 *Lokasi:* ${event.lokasi}\n` +
      `📊 *Status Kakak:* ${statusSummary}${voiceInfo}\n\n` +
      `💡 _Ketik *profil* untuk lihat data diri, *absen* untuk isi kehadiran, atau *menu* untuk panduan lengkap._`
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
   * Tanya pilihan seksi suara saat registrasi atau pembaruan suara
   */
  getAskSectionMessage(name, currentSeksi = null) {
    const prevInfo = (currentSeksi && currentSeksi !== 'Umum' && currentSeksi !== 'Pengurus') 
      ? `📌 _(Seksi suara Kakak latihan sebelumnya tercatat: *${currentSeksi}*)_\n\n` 
      : '';

    return (
      `Halo Kak *${name}*! 🎶✨\n\n` +
      prevInfo +
      `Boleh konfirmasi seksi suara / pelayanan Kakak untuk latihan ini?\n\n` +
      `*Pilihan Seksi Suara:*\n` +
      `• *1.* Sopran (atau ketik *Sopran 1* / *Sopran 2*) 🎼\n` +
      `• *2.* Alto (atau ketik *Alto 1* / *Alto 2*) 🎶\n` +
      `• *3.* Tenor (atau ketik *Tenor 1* / *Tenor 2*) 🎤\n` +
      `• *4.* Bass (atau ketik *Bass 1* / *Bass 2*) 🎵\n` +
      `• *5.* Pemusik / Tim Musik 🎹\n` +
      `• *6.* Umum / Jemaat\n\n` +
      `_(Silakan balas dengan angka atau kata, contoh: *1*, *Sopran 2*, atau *Alto*)_`
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
   * Sapaan untuk anggota yang sudah selesai mengonfirmasi kehadiran sebelumnya
   */
  getAlreadyRespondedGreeting(name, event, record) {
    const isHadir = record.attendance_choice === 'Bisa' || (record.status === 'RESPONDED' && record.attendance_choice === 'Bisa');
    const statusEmoji = isHadir ? '✅' : '❌';
    const statusText = isHadir ? 'Bisa Hadir' : 'Tidak Bisa Hadir';
    const detailText = isHadir ? (record.keterangan || 'On-Time') : `Alasan: ${record.alasan || '-'}`;

    return (
      `Shalom Kak *${name}*! 👋✨\n\n` +
      `Kakak sebelumnya sudah tercatat mengonfirmasi kehadiran untuk *${event.namaAcara}*:\n` +
      `🗓️ *Waktu:* ${event.waktuLatihan}\n` +
      `📍 *Lokasi:* ${event.lokasi}\n` +
      `📋 *Status:* ${statusEmoji} *${statusText}* (${detailText})\n\n` +
      `💡 _Jika ada perubahan rencana mendadak, Kakak bisa ketik *#ubah* kapan saja untuk mengganti status kehadiran ya!_ 😊`
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
   * Template daftar riwayat acara lampau (Dikelompokkan Aktif vs Arsip)
   */
  getHistoryListMessage(eventsWithSummary) {
    if (!eventsWithSummary || eventsWithSummary.length === 0) {
      return `📜 *RIWAYAT ACARA*\n\nBelum ada riwayat acara yang tercatat di database.`;
    }

    const activeEvents = eventsWithSummary.filter((e) => e.isActive);
    const pastEvents = eventsWithSummary.filter((e) => !e.isActive);

    let msg = `📜 *RIWAYAT ACARA & ARSIP LATIHAN*\n\n`;

    if (activeEvents.length > 0) {
      msg += `🟢 *SEDANG BERJALAN / AKTIF (Latihan Minggu Ini):*\n`;
      activeEvents.forEach((item) => {
        const lockBadge = item.isClosed ? ' 🔒 *(Absensi Ditutup)*' : ' 🔓 *(Absensi Dibuka)*';
        msg += `• [ID #${item.id}] *${item.namaAcara}*${lockBadge}\n`;
        msg += `   🗓️ ${item.waktuLatihan}\n`;
        msg += `   📊 Hadir: *${item.totalHadir}* | Tidak Hadir: *${item.totalTidakHadir}* | Total Respon: *${item.overallTotalResponded}*\n\n`;
      });
    }

    if (pastEvents.length > 0) {
      msg += `📦 *ARSIP ACARA LAMPAU (Sudah Selesai):*\n`;
      pastEvents.forEach((item) => {
        msg += `• [ID #${item.id}] *${item.namaAcara}* ⚪\n`;
        msg += `   🗓️ ${item.waktuLatihan}\n`;
        msg += `   📊 Hadir: *${item.totalHadir}* | Tidak Hadir: *${item.totalTidakHadir}* | Total Respon: *${item.overallTotalResponded}*\n\n`;
      });
    }

    msg += `💡 _Ketik *riwayat [ID]* (contoh: *riwayat 2*) untuk melihat detail absensi latihan tertentu._`;
    return msg;
  }
};
