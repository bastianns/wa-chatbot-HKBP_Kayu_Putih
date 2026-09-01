# 🤖 WhatsApp Bot Absensi Interaktif & Google Sheets (NHKBP Kayu Putih)

Bot WhatsApp asisten absensi paduan suara & kegiatan interaktif berbasis **Node.js + Baileys + SQLite** yang otomatis mendata kehadiran, memetakan seksi suara, dan mencatat data langsung ke **Google Sheets** secara real-time.

---

## 🌟 Fitur Utama & Keunggulan

1. **Embedded SQLite Database (`better-sqlite3`)**:
   - Penyimpanan data relasional cepat, bebas *race-condition* dengan mode WAL (*Write-Ahead Logging*) dan transaksi atomik ACID, tanpa perlu server database eksternal.
   - Mendukung riwayat multi-acara permanen; data kehadiran latihan lampau tidak pernah terhapus atau tertimpa saat event baru dimulai.
2. **Pengalaman Pengguna Ramah & Bebas Stres (*Stress-Free UX*)**:
   - **Menu Bantuan Adaptif (`menu` / `help`)**: Tampilan otomatis menyesuaikan peran pengirim (menu simpel untuk anggota umum, menu pengurus lengkap untuk admin).
   - **Profil Mandiri (`profil` / `saya`)**: Anggota dapat melihat fakta data diri, peran, seksi suara, dan status kehadiran latihan terdekat dalam 1 pesan rapi.
   - **Edit Mandiri (*Self-Service*)**: Anggota dapat memperbarui nama (`#nama`), seksi suara (`#suara`), maupun kehadiran (`#ubah`) kapan saja.
   - **Sapaan Cerdas (*Casual Greeting*)**: Tidak menodong pertanyaan secara kaku saat anggota mengirim salam santai (*"Halo"*, *"Pagi"*, *"Shalom"*).
3. **Perekaman & Pemecahan Seksi Suara Koor (*Voice Section Allocation*)**:
   - Mendukung pencatatan suara utama maupun alokasi suara pecahan:
     - 🎼 **Sopran** (*Sopran 1*, *Sopran 2*)
     - 🎶 **Alto** (*Alto 1*, *Alto 2*)
     - 🎤 **Tenor** (*Tenor 1*, *Tenor 2*)
     - 🎵 **Bass** (*Bass 1*, *Bass 2*)
     - 🎹 **Pemusik / Tim Musik**
     - 👥 **Umum / Jemaat**
   - Mengingat suara latihan sebelumnya dan otomatis menyinkronkan perubahan suara ke Google Sheets & SQLite.
4. **Keamanan & Validasi Ketat**:
   - **Single Source of Truth Admin**: Hak akses admin dipusatkan di SQLite (`is_admin = 1` atau `seksi = 'Pengurus'`) dengan pencocokan eksklusif pada nomor yang dinormalisasi.
   - **Allowlist Validasi Nama**: Menolak input sampah/spam dengan filter allowlist pola nama minimal 2 kata (`/^[a-zA-Z .'-]+$/`).
   - **Formula Injection Prevention**: Field teks bebas otomatis di-escape sebelum dikirim ke spreadsheet (`=`, `+`, `-`, `@`, `\t`, `\r`).
   - **Resolusi Identitas WhatsApp LID**: Verifikasi nomor HP eksplisit dan pemetaan permanen (`lid -> phone`).
5. **Monitoring & Pencarian Admin Real-time**:
   - Pencarian anggota spesifik (`cari [Nama/No]`), daftar anggota per seksi (`anggota [seksi]`), rekapitulasi (`rekap`), daftar pending (`pending`), dan arsip riwayat (`riwayat`).

---

## 📱 Panduan Perintah WhatsApp (Private Chat)

### 👤 A. Perintah untuk Seluruh Anggota (Member & Pengurus)

| Perintah | Fungsi | Contoh Penggunaan |
| :--- | :--- | :--- |
| `profil` / `saya` | Melihat fakta data diri & status kehadiran latihan terdekat | `profil` |
| `menu` / `help` | Menampilkan panduan bantuan ramah anggota | `menu` |
| `absen` / `#absen` | Mengisi konfirmasi kehadiran latihan aktif | `absen` |
| `#ubah` / `ubah` | Mengubah status kehadiran (jika ada halangan mendadak) | `#ubah` |
| `#suara` / `suara` | Mengatur / mengubah seksi suara vokal koor | `#suara` atau `#suara Tenor 1` |
| `#peran` / `peran` | Mengatur / mengubah peran atau seksi pelayanan | `#peran` atau `#peran Song Leader` |
| `#nama` / `nama` | Mengubah nama lengkap resmi | `#nama Jonathan Panjaitan` |
| `event` | Melihat info jadwal latihan aktif saat ini | `event` |
| `batal` / `reset` | Me-reset sesi percakapan jika ingin mulai dari awal | `batal` |

---

### 🛠️ B. Perintah Khusus Admin / Pengurus (Seksi Rohani & Musik)

Pengurus yang terdaftar di database dapat mengirimkan perintah administrasi berikut:

| Kategori | Perintah | Fungsi | Contoh |
| :--- | :--- | :--- | :--- |
| **Broadcast** | `broadcast target` | Kirim pesan PC ke seluruh target koor | `broadcast target` |
| | `broadcast pengurus`| Tes kirim pesan PC ke sesama admin | `broadcast pengurus` |
| | `broadcast all` | Kirim pesan PC ke seluruh anggota di database | `broadcast all` |
| | `remind` | Kirim pesan pengingat ke yang belum merespon | `remind` |
| **Monitoring** | `rekap` | Rekapitulasi kehadiran real-time | `rekap` |
| | `pending` | Daftar anggota target yang belum membalas | `pending` |
| | `cari [Nama/No]` | Cari info anggota & status kehadirannya | `cari Maria` atau `cari 0812` |
| | `anggota [seksi]` | Lihat daftar nama anggota per seksi suara | `anggota` atau `anggota Sopran` |
| **Acara** | `setevent` | Buat / ubah jadwal latihan secara instan | `setevent Latihan Koor \| Kamis, 3 Sept 20.00 \| Gereja \| Pengisian Minggu` |
| | `tutup` / `buka` | Kunci (*cut-off*) atau buka kembali absensi | `tutup` |
| | `riwayat` | Lihat arsip daftar acara dan absensi lampau | `riwayat` atau `riwayat 1` |
| | `umumkan` | Buat teks pengumuman siap share ke grup WA | `umumkan` |
| **Grup WA** | `gruplist` | Lihat daftar grup WA yang diikuti bot | `gruplist` |
| | `syncgroup [No]` | Impor kontak anggota dari grup WA | `syncgroup 1` |

---

## 📁 Struktur Folder Proyek

```text
D:\wa-absensi-bot\
├── google-apps-script\
│   └── Code.gs             # Kode Webhook terpasang di Google Sheets
├── src\
│   ├── botHandler.js       # Logika percakapan, perintah admin, profil & alur chat
│   ├── broadcast.js        # Script broadcast aman CLI dengan resume support
│   ├── broadcastService.js # Core service broadcast terpadu
│   ├── db.js               # Inisialisasi SQLite database & migrasi otomatis
│   ├── eventManager.js     # Pengelola konfigurasi acara & riwayat lampau
│   ├── logger.js           # Structured logging terpusat
│   ├── memberManager.js    # Pengelola kontak, hak akses admin, seksi & LID mapping
│   ├── messageTemplates.js # Template pesan terpadu dengan counts dinamis & menu adaptif
│   ├── remind.js           # Script follow-up / reminder anggota pending
│   ├── responseParser.js   # Fuzzy & smart NLP response parser (kehadiran & seksi suara)
│   ├── sheetsService.js    # Pengirim data ke Google Sheets + sanitasi formula
│   └── stateManager.js     # Manajemen sesi percakapan per nomor WA di SQLite
├── test\
│   ├── admin.test.js       # Pengujian exact admin match, seksi & search
│   ├── broadcast.test.js   # Pengujian template dinamis & progress broadcast
│   ├── conversation.test.js# Pengujian end-to-end alur percakapan bot, profil & help
│   ├── database.test.js    # Pengujian SQLite CRUD & riwayat event
│   ├── lid.test.js         # Pengujian resolusi identitas LID permanen
│   ├── multiprocess.test.js# Pengujian konkurensi SQLite multi-proses fisik
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

## 👥 Penggunaan via Terminal (CLI)

```powershell
# Jalankan bot utama
npm start

# Jalankan seluruh test suite (57 tests)
npm test

# Broadcast ke target khusus koor (TargetKoor)
npm run broadcast -- target

# Broadcast ke seluruh anggota
npm run broadcast -- all

# Broadcast khusus seksi tertentu
npm run broadcast -- Sopran
npm run broadcast -- Tenor

# Mengirim reminder ke anggota yang belum merespon
npm run remind
```

---

## 🚀 Panduan Setup & Deploy

1. **Pasang Webhook Google Apps Script**:
   - Salin isi file [google-apps-script/Code.gs](file:///D:/wa-absensi-bot/google-apps-script/Code.gs) ke menu **Extensions > Apps Script** pada Google Sheets Anda.
   - Klik **Deploy > New Deployment > Web App** (*Who has access: Anyone*).
   - Salin URL Web App (`https://script.google.com/macros/s/.../exec`).
2. **Konfigurasi File `.env`**:
   - Salin [.env.example](file:///D:/wa-absensi-bot/.env.example) menjadi `.env`.
   - Masukkan `GOOGLE_SHEETS_URL` dan nomor HP admin Anda (`ADMIN_NUMBERS=6281281277599`).
3. **Jalankan Bot**:
   ```powershell
   npm start
   ```
   Scan QR Code yang muncul di terminal menggunakan aplikasi WhatsApp di HP Anda.
