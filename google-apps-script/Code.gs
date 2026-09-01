// Google Apps Script Webhook
function doPost(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getActiveSheet();
    var data = JSON.parse(e.postData.contents);
    
    // Pastikan header ada jika sheet masih kosong
    if (sheet.getLastRow() === 0) {
      sheet.appendRow([
        "Timestamp",
        "Tanggal Latihan",
        "Nama Acara",
        "Nomor WhatsApp",
        "Nama Lengkap",
        "Seksi",
        "Status Kehadiran",
        "Keterangan Jam",
        "Alasan Ketidakhadiran"
      ]);
    }
    
    // Cari baris jika nomor sudah ada untuk event yang sama (update row)
    var dataRange = sheet.getDataRange();
    var values = dataRange.getValues();
    var rowIndex = -1;
    
    for (var i = 1; i < values.length; i++) {
      if (values[i][1] === data.tanggalLatihan && String(values[i][3]) === String(data.nomorWa)) {
        rowIndex = i + 1;
        break;
      }
    }
    
    var rowData = [
      new Date(),
      data.tanggalLatihan || "-",
      data.namaAcara || "-",
      "'" + (data.nomorWa || "-"),
      data.nama || "Nomor Baru",
      data.seksi || "Umum",
      data.status || "-",
      data.keterangan || "-",
      data.alasan || "-"
    ];
    
    if (rowIndex > 0) {
      sheet.getRange(rowIndex, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sheet.appendRow(rowData);
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "Data absensi berhasil dicatat" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
