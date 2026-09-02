# 📖 Dokumentasi Skema Data & Arsitektur Bot Absensi (SQLite Edition)

Dokumen ini mendokumentasikan skema database relasional SQLite (`better-sqlite3`), siklus hidup enum status, mekanisme konkurensi multi-proses, serta diagram *State Machine* alur percakapan bot WhatsApp.

---

## 🗄️ 1. Skema Tabel SQLite

### A. Tabel `schema_migrations` (Idempotensi & Tracking Migrasi)
Menjamin eksekusi migrasi dari flat-file JSON atau skema baru berjalan tepat satu kali secara transaksional penuh.

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` | `PRIMARY KEY` | Identifier migrasi (contoh: `'v1_json_migration'`) |
| `applied_at` | `TEXT` | `NOT NULL` | Timestamp ISO8601 migrasi sukses dieksekusi |

---

### B. Tabel `events` (Manajemen Acara & Riwayat Latihan)
Menyimpan riwayat seluruh kegiatan koor/latihan tanpa pernah menimpa event masa lampau.

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | ID unik acara |
| `nama_acara` | `TEXT` | `NOT NULL` | Nama kegiatan (contoh: *Latihan Paduan Suara*) |
| `waktu_latihan` | `TEXT` | `NOT NULL` | Jadwal acara (hari, tanggal, jam) |
| `lokasi` | `TEXT` | `NOT NULL` | Lokasi kegiatan latihan |
| `tujuan` | `TEXT` | `NOT NULL` | Tujuan pelayanan koor |
| `target_on_time`| `TEXT` | `DEFAULT '19:00 WIB'` | Jam patokan on-time |
| `batas_waktu` | `TEXT` | `DEFAULT 'Pukul 18:00 WIB'` | Deadline pengisian sebelum cut-off |
| `is_closed` | `INTEGER` | `DEFAULT 0` | Status cut-off (`0` = Dibuka, `1` = Ditutup) |
| `is_active` | `INTEGER` | `DEFAULT 1` | Status aktif (`1` = Acara aktif saat ini, `0` = Riwayat lampau) |
| `created_at` | `TEXT` | `NOT NULL` | Timestamp ISO8601 pembuatan |
| `updated_at` | `TEXT` | `NOT NULL` | Timestamp ISO8601 pembaruan terakhir |

---

### C. Tabel `members` (Database Anggota & Hak Akses Admin)
Menjadi **Single Source of Truth** data kontak jemaat/naposo dan hak akses admin.

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | ID unik anggota |
| `phone` | `TEXT` | `UNIQUE NOT NULL` | Nomor HP (format normalisasi `628...`) |
| `name` | `TEXT` | `DEFAULT ''` | Nama lengkap anggota |
| `seksi` | `TEXT` | `DEFAULT 'Umum'` | Seksi (*Sopran*, *Alto*, *Tenor*, *Bass*, *Pengurus*, *TargetKoor*, *Umum*) |
| `grup_asal` | `TEXT` | `DEFAULT 'NHKBP Kayu Putih'` | Nama grup WhatsApp asal |
| `is_admin` | `INTEGER` | `DEFAULT 0` | Flag Admin (`1` = Pengurus/Admin, `0` = Anggota Biasa) |
| `registered_at`| `TEXT` | `NOT NULL` | Timestamp pendaftaran pertama |
| `updated_at` | `TEXT` | `NOT NULL` | Timestamp pembaruan data anggota |

---

### D. Tabel `attendance_records` (Data Kehadiran per Event)
Mencatat konfirmasi kehadiran anggota per kegiatan dengan referensi Foreign Key ke `events(id)`.

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | ID unik catatan absensi |
| `event_id` | `INTEGER` | `NOT NULL REFERENCES events(id) ON DELETE CASCADE` | FK ke tabel acara |
| `phone` | `TEXT` | `NOT NULL` | Nomor HP anggota yang merespon |
| `name` | `TEXT` | `DEFAULT 'Nomor Baru'` | Nama anggota saat merespon |
| `seksi` | `TEXT` | `DEFAULT 'Umum'` | Seksi saat merespon |
| `status` | `TEXT` | `NOT NULL DEFAULT 'WAITING_REPLY'` | Enum status kehadiran |
| `attendance_choice` | `TEXT` | `NULL` | `'Bisa'` atau `'Tidak Bisa'` |
| `keterangan` | `TEXT` | `DEFAULT '-'` | Detail waktu (*On-Time* / *Telat (Estimasi)*) |
| `alasan` | `TEXT` | `DEFAULT '-'` | Alasan jika berhalangan hadir |
| `sent_at` | `TEXT` | `NULL` | Timestamp pesan broadcast terkirim |
| `responded_at` | `TEXT` | `NULL` | Timestamp anggota membalas |
| `raw_response` | `TEXT` | `NULL` | JSON string payload respon |
| `known_lid_mapping` | `TEXT` | `NULL` | Catatan LID mapping jika ada |
| `created_at` | `TEXT` | `NOT NULL` | Timestamp pembuatan |
| `updated_at` | `TEXT` | `NOT NULL` | Timestamp pembaruan |
| `UNIQUE(event_id, phone)` | `UNIQUE` | Mencegah duplikasi absensi untuk orang yang sama pada 1 event |

---

### E. Tabel `sessions` (Status Percakapan Real-Time)
Menyimpan state percakapan multi-langkah per pengguna WhatsApp (timeout 24 jam).

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `jid` | `TEXT` | `PRIMARY KEY` | WhatsApp JID (`<phone>@s.whatsapp.net` / `<lid>@lid`) |
| `step` | `TEXT` | `NOT NULL DEFAULT 'IDLE'` | State langkah percakapan saat ini |
| `data` | `TEXT` | `NOT NULL DEFAULT '{}'` | JSON string payload draft sesi |
| `last_updated` | `INTEGER` | `NOT NULL` | Timestamp epoch milidetik aktivitas terakhir |

---

### F. Tabel `lid_mappings` (Pemetaan Identitas WhatsApp LID Permanen)
Menyimpan pemetaan eksplisit dan permanen dari WhatsApp Linked Device / Privacy ID (`LID`) ke nomor HP asli (`Phone`).

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `lid` | `TEXT` | `PRIMARY KEY` | Nomor identitas WhatsApp LID pengirim |
| `phone` | `TEXT` | `NOT NULL` | Nomor telepon asli Indonesia (`628...`) |
| `created_at` | `TEXT` | `NOT NULL` | Timestamp verifikasi disimpan |

---

### G. Tabel `broadcast_progress` (Pelacakan Progress & Resume Broadcast)
Menyimpan antrian pengiriman pesan broadcast per event agar bisa di-resume otomatis jika koneksi terputus di tengah jalan.

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | ID antrian |
| `event_id` | `INTEGER` | `NOT NULL REFERENCES events(id) ON DELETE CASCADE` | FK ke event |
| `target_tag` | `TEXT` | `NOT NULL` | Target broadcast (*all*, *TargetKoor*, dsb.) |
| `phone` | `TEXT` | `NOT NULL` | Nomor tujuan broadcast |
| `name` | `TEXT` | `DEFAULT ''` | Nama penerima |
| `status` | `TEXT` | `NOT NULL DEFAULT 'PENDING'` | Status pengiriman (`PENDING`, `SENT`, `FAILED`) |
| `sent_at` | `TEXT` | `NULL` | Waktu sukses terkirim |
| `error_message` | `TEXT` | `NULL` | Pesan error jika gagal |
| `UNIQUE(event_id, target_tag, phone)` | `UNIQUE` | Mencegah double sending dalam sesi broadcast yang sama |

### H. Tabel `lid_mapping_history` (Audit Trail Perubahan Pemetaan Identitas LID)
Mencatat riwayat audit setiap kali ada pemetaan LID yang dibuat atau ditimpa, menjamin ketertelusuran akun admin maupun anggota biasa.

| Nama Kolom | Tipe Data | Constraint | Deskripsi |
| :--- | :--- | :--- | :--- |
| `id` | `INTEGER` | `PRIMARY KEY AUTOINCREMENT` | ID unik log audit |
| `lid` | `TEXT` | `NOT NULL` | Identifier LID yang diubah |
| `old_phone` | `TEXT` | `NULL` | Nomor HP sebelumnya (jika ada) |
| `new_phone` | `TEXT` | `NOT NULL` | Nomor HP baru hasil pemetaan |
| `changed_at` | `TEXT` | `NOT NULL` | Timestamp ISO8601 perubahan |
| `reason` | `TEXT` | `NULL` | Alasan perubahan (misal: *USER_CONFIRMED_IDENTITY*, *CORRECTION_SWAPPED_PHONE_DATA*) |

---

## 🚦 2. Enum Status & Siklus Hidup

### A. Status Kehadiran (`attendance_records.status`)
- `WAITING_REPLY`: Bot sudah mengirimkan broadcast, menunggu balasan dari anggota.
- `PARTIAL_HADIR`: Anggota sudah membalas "Bisa Hadir", namun masih dalam proses memilih On-Time / Telat.
- `PARTIAL_TIDAK`: Anggota sudah membalas "Tidak Bisa", namun masih dalam proses mengetikkan alasan.
- `RESPONDED`: Anggota telah menyelesaikan seluruh alur konfirmasi kehadiran (data lengkap & tersinkron ke Google Sheets via `await`).
- `NEEDS_VERIFICATION`: Respon masuk dari LID yang belum terverifikasi nomor teleponnya (masuk daftar review admin).

### B. Status Antrian Broadcast (`broadcast_progress.status`)
- `PENDING`: Menunggu giliran pengiriman (dengan anti-ban delay 15-25s). Jika koneksi WA putus di tengah jalan, status antrian sisa tetap `PENDING` dan bot langsung menghentikan loop (*Fast Abort*).
- `SENT`: Pesan telah sukses terkirim ke WhatsApp Baileys socket (`attendanceTracker.markSent` dipanggil).
- `FAILED`: Gagal terkirim akibat error level nomor (nomor tidak terdaftar / invalid JID), loop lanjut ke kontak berikutnya.

### C. State Percakapan (`sessions.step`)
- `IDLE`: Sesi awal / tidak ada percakapan aktif.
- `WAITING_LID_PHONE_CONFIRMATION`: Menunggu user menginput nomor HP (khusus pengirim LID yang belum terpetakan).
- `WAITING_LID_PHONE_CONFIRM_DOUBLE_CHECK`: Menunggu konfirmasi ganda (*ya* / *bukan*) dengan nomor tersamar sebelum mapping LID ke profil member yang sudah ada dieksekusi.
- `WAITING_NAME_REGISTRATION`: Menunggu user menginput nama lengkap (minimal 2 kata yang valid). *Catatan: metadata `pushName` tidak pernah membypass langkah ini.*
- `WAITING_ATTENDANCE`: Menunggu pilihan Hadir (1) / Tidak Hadir (2).
- `WAITING_ONTIME`: Menunggu pilihan On-Time (A) / Telat (B).
- `WAITING_LATE_TIME`: Menunggu input estimasi jam tiba telat.
- `WAITING_REASON`: Menunggu input alasan ketidakhadiran.

---

## 💡 3. Perbedaan Desain Tracking: Broadcast vs Reminder

1. **Broadcast (`broadcast.js` / `broadcast_progress`)**:
   - Berupa *Campaign Batch* statis (dikirimkan 1x ke seluruh anggota atau seksi).
   - Memiliki tabel antrian `broadcast_progress` tersendiri agar jika pengiriman terputus pada kontak ke-50 dari 150, saat reconnect bot melanjutkan dari kontak ke-51 tanpa mengulang kontak 1–50.
2. **Reminder (`remind.js` / State-Driven Dynamic Query)**:
   - Bersifat *Dynamic State-Driven Query* langsung dari `attendance_records` (`WHERE status IN ('WAITING_REPLY', 'PARTIAL_HADIR', 'PARTIAL_TIDAK')`).
   - Tidak memerlukan tabel antrian terpisah karena setiap eksekusi `remind` selalu mengambil data *live* real-time. Jika anggota baru saja membalas sebelum script remind selesai, anggota tersebut otomatis tidak lagi dikirimi pengingat.

---

## 🛡️ 4. Privasi Data & Integrasi AI (Kebijakan Zero PII Leakage)

### A. Keputusan Sadar Pengurus Gereja (Per 2 September 2026)
Pengurus gereja secara resmi memilih **Opsi 2: Anonimisasi Data Penuh Sebelum Dikirim ke Gemini API**. Fitur pemahaman bahasa alami (NLP) dipertahankan agar anggota dapat membalas secara fleksibel (contoh: *"Bisa hadir tapi telat jam 8 malam ya kak"*), namun dengan jaminan privasi data anggota gereja yang ketat.

### B. Layanan Eksternal yang Digunakan
- **Layanan:** Google Gemini API (Google Cloud AI).
- **Library:** `@google/genai` (Node.js SDK resmi).
- **Model:** `gemini-2.5-flash`, `gemini-2.0-flash` (dengan sistem fallback dan kuota resilience otomatis).

### C. Pembatasan Data yang Dikirim (Allowlist Minimal)
Hanya dua jenis data yang diizinkan dikirim ke server Google Gemini:
1. **Isi Pesan Teks Mentah (`rawText`)**: Pesan percakapan yang diketik oleh pengguna.
2. **Konteks Acara Publik**: Nama acara, jadwal latihan, lokasi gereja, target jam on-time, dan batas waktu konfirmasi (informasi yang bersifat publik dan memang diumumkan ke seluruh jemaat).

### D. Data yang DILARANG KERAS / TIDAK PERNAH Dikirimkan (Zero PII)
- ❌ **Nomor Telepon / WhatsApp** (`phone` / `effectivePhone`).
- ❌ **Nama Lengkap Anggota** (`name` / `knownName`).
- ❌ **Seksi Suara Vokal** (`seksi` - Sopran/Alto/Tenor/Bass).
- ❌ **Peran / Jabatan Pelayanan di Gereja** (`peran` - Song Leader, BPH, Pengurus, dsb.).
- ❌ **Riwayat Absensi & Catatan Medis/Alasan Anggota Sebelumnya**.

### E. Arsitektur Structured Intent Classifier
AI Gemini **TIDAK** digunakan untuk menyusun kalimat balasan akhir yang membutuhkan nama pribadi anggota. Gemini bertindak sebagai **Intent Classifier murni** yang mengembalikan JSON terstruktur:
```json
{
  "intent": "ATTENDANCE_YES_LATE",
  "arrivalTime": "20:00 WIB",
  "reason": null,
  "section": null,
  "newName": null,
  "role": null,
  "replyText": null
}
```
Seluruh perakitan kalimat sapaan ramah WhatsApp (menyapa nama Kakak, menyematkan detail acara, pembaruan ke SQLite, dan sinkronisasi ke Google Sheets) diproses **100% secara lokal** di dalam `botHandler.js` menggunakan data yang tersimpan di server lokal.
