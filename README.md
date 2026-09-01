# 🤖 WhatsApp Bot Absensi Interaktif & Google Sheets (NHKBP Kayu Putih)

Bot WhatsApp interaktif berbasis Node.js + Baileys + SQLite yang otomatis mencatat kehadiran latihan/kegiatan naposo langsung ke **Google Sheets** secara real-time.

---

## 🌟 Fitur Utama & Keunggulan

1. **Embedded SQLite Database (`better-sqlite3`)**:
   - Penyimpanan data relasional cepat, bebas race-condition dengan WAL mode dan transaksi ACID, tanpa memerlukan server database eksternal terpisah.
   - Otomatis melakukan migrasi data lama dari flat file JSON (`members.json`, `event_config.json`, `attendance_tracker.json`, `sessions.json`) dengan backup aman.
2. **Keamanan & Validasi Ketat**:
   - **Single Source of Truth Admin**: Nomor admin dipusatkan di database (`seksi: "Pengurus"` atau `is_admin = 1`) dan dicocokkan dengan *exact equality* pada nomor yang sudah dinormalisasi (bukan `.includes()`).
   - **Allowlist Validasi Nama**: Menolak input sampah/spam (seperti *"Iya iya"*, *"1,2"*) dengan filter allowlist pola nama orang minimal 2 kata (`/^[a-zA-Z .'-]+$/`).
   - **Formula Injection Prevention**: Field teks bebas (seperti alasan) di-escape secara otomatis sebelum dikirim ke Google Sheets.
   - **Resolusi Identitas WhatsApp LID**: Verifikasi nomor HP eksplisit dan pemetaan permanen (`lid -> phone`) untuk mencegah tumpang tindih data.
3. **Riwayat Acara Permanen (`/riwayat`)**:
   - Setiap acara baru (`startNewEvent`) tidak lagi menghapus data absensi acara sebelumnya. Riwayat dapat dibandingkan kapan saja lewat command `/riwayat`.
4. **Manajemen Acara & Broadcast Dinamis**:
   - Template pesan dan penghitungan jumlah anggota terpusat (`messageTemplates.js`) dengan angka dinamis dari database.
   - Script broadcast & reminder mendukung **resume otomatis** dan penandaan status terkirim hanya setelah pesan benar-benar sukses terkirim.
5. **Percakapan Multi-Langkah (*State Machine*)**:
   - Sapaan Nama $\rightarrow$ Hadir / Tidak $\rightarrow$ On-time / Telat + Estimasi Jam $\rightarrow$ Alasan jika absen $\rightarrow$ Fitur ganti status (`#ubah`).

---

## 📁 Struktur Folder Proyek

```text
D:\wa-absensi-bot\
├── google-apps-script\
│   └── Code.gs             # Kode Webhook untuk dipasang di Google Sheets
├── src\
│   ├── botHandler.js       # Logika percakapan, perintah admin & alur chat
│   ├── broadcast.js        # Script broadcast aman CLI dengan resume support
│   ├── broadcastService.js # Core service broadcast terpadu
│   ├── db.js               # Inisialisasi SQLite database & migrasi otomatis
│   ├── eventManager.js     # Pengelola konfigurasi acara & riwayat lampau
│   ├── logger.js           # Structured logging terpusat
│   ├── memberManager.js    # Pengelola kontak, hak akses admin & LID mapping
│   ├── messageTemplates.js # Template pesan terpadu dengan counts dinamis
│   ├── remind.js           # Script follow-up / reminder anggota pending
│   ├── responseParser.js   # Fuzzy & smart NLP response parser
│   ├── sheetsService.js    # Pengirim data ke Google Sheets + sanitasi formula
│   └── stateManager.js     # Manajemen sesi chat per nomor WA di SQLite
├── test\
│   ├── admin.test.js       # Pengujian exact admin match & security
│   ├── broadcast.test.js   # Pengujian template dinamis & progress broadcast
│   ├── conversation.test.js# Pengujian end-to-end alur percakapan bot
│   ├── database.test.js    # Pengujian SQLite CRUD & riwayat event
│   ├── lid.test.js         # Pengujian resolusi identitas LID permanen
│   ├── sanitization.test.js# Pengujian formula injection prevention
│   └── validation.test.js  # Pengujian allowlist validasi nama
├── .env.example            # Template konfigurasi environment
├── .gitignore              # Proteksi file kredensial dan database lokal
├── absensi.db              # Database SQLite lokal (di-ignore dari git)
├── config.js               # Konfigurasi aplikasi
├── index.js                # Entry point utama bot
├── package.json            # Dependencies & npm scripts
└── SCHEMA.md               # Dokumentasi lengkap skema database & status enum
```

---

## 🛠️ Perintah Admin Lewat WhatsApp (Private Chat)

Pengurus/Admin yang terdaftar di database dapat mengirimkan perintah berikut (bisa dengan tanda `/` ataupun tanpa `/`):

| Perintah | Fungsi | Contoh |
| :--- | :--- | :--- |
| `/help` | Menampilkan menu panduan perintah admin | `/help` |
| `/event` | Melihat detail acara latihan yang sedang aktif | `/event` |
| `/setevent [Nama] \| [Waktu] \| [Lokasi] \| [Tujuan]` | Mengubah info latihan secara instan | `/setevent Latihan Koor Naposo \| Sabtu, 29 Agustus 2026 19.00 WIB \| Gereja HKBP Kayu Putih \| Pengisian Koor Minggu 30 Agustus 2026 Jam 10.00` |
| `/rekap` | Melihat rekapitulasi kehadiran real-time | `/rekap` |
| `/pending` | Melihat daftar anggota yang belum membalas | `/pending` |
| `/riwayat` | Melihat daftar acara dan kehadiran lampau | `/riwayat` atau `/riwayat 1` |
| `/tutup` | Menutup pengisian absensi (Cut-off) | `/tutup` |
| `/buka` | Membuka kembali pengisian absensi | `/buka` |
| `/broadcast [tag]` | Memulai pengiriman PC di background | `broadcast target` atau `broadcast all` |
| `/remind` | Mengirim pesan follow-up ke yang pending | `/remind` |
| `/gruplist` | Melihat daftar grup WA yang diikuti bot | `/gruplist` |
| `/syncgroup [No]` | Menyinkronkan anggota dari grup WA | `/syncgroup 1` |
| `/umumkan` atau `/link` | Membuat template pengumuman siap share ke grup | `/umumkan` |

---

## 👥 Cara Broadcast via Terminal (CLI)

```powershell
# Preview / Dry-run tanpa mengirim pesan
npm run broadcast -- target --dry-run

# Broadcast ke target khusus koor (TargetKoor)
npm run broadcast -- target

# Broadcast ke seluruh anggota terdaftar
npm run broadcast -- all

# Broadcast khusus seksi tertentu
npm run broadcast -- Sopran
npm run broadcast -- Alto
npm run broadcast -- Tenor
npm run broadcast -- Bass
npm run broadcast -- Pengurus

# Mengirim reminder ke anggota yang belum merespon
npm run remind
```

---

## 🧪 Menjalankan Test Suite

Proyek ini dilengkapi dengan unit & integration test menggunakan Node.js test runner bawaan (`node:test` + `node:assert/strict`):

```powershell
npm test
```

---

## 🚀 Panduan Setup & Keamanan

1. **Pasang Script di Google Sheets**:
   - Salin isi file [google-apps-script/Code.gs](file:///D:/wa-absensi-bot/google-apps-script/Code.gs) ke menu **Extensions > Apps Script** di Google Sheets Anda.
   - Klik **Deploy > New Deployment > Web App** (*Who has access: Anyone*).
   - Salin URL Web App (`https://script.google.com/macros/s/.../exec`).
2. **Isi File `.env`**:
   - Salin [.env.example](file:///D:/wa-absensi-bot/.env.example) menjadi `.env`.
   - Masukkan Webhook URL serta nomor HP admin Anda untuk emergency override (`ADMIN_NUMBERS=6281281277599`).
3. **Peringatan Keamanan**:
   - Pastikan file `.env`, `absensi.db`, dan file data anggota ada di `.gitignore` dan tidak pernah di-commit ke repositori publik.
   - Jika URL Webhook Google Apps Script pernah dibagikan atau terekspos, **segera lakukan Redeploy Web App** di Google Apps Script untuk membuat URL baru.
4. **Jalankan Bot**:
   ```powershell
   npm start
   ```
   Scan QR Code yang muncul menggunakan WhatsApp di HP Anda.
