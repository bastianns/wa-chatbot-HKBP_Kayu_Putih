import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { logger } from './logger.js';

export class AiAgent {
  constructor(apiKey = config.geminiApiKey) {
    this.apiKey = apiKey;
    this.client = null;
    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    this.modelCooldowns = new Map();
  }

  /**
   * Cek apakah API Key Gemini tersedia dan aktif
   */
  isAvailable() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Memproses pesan teks mentah pengguna (rawText) dan konteks acara publik (eventContext).
   * 
   * KEBIJAKAN PRIVASI DATA:
   * Fungsi ini HANYA menerima rawText dan info acara publik.
   * TIDAK ADA nomor HP, nama anggota, seksi suara, atau peran gereja yang dikirimkan
   * ke Google Gemini API dalam bentuk apa pun.
   * 
   * Mengembalikan: Object intent terstruktur
   * {
   *   intent: "ATTENDANCE_YES_ONTIME" | "ATTENDANCE_YES_LATE" | "ATTENDANCE_YES_PENDING_TIME" |
   *           "ATTENDANCE_NO" | "UPDATE_VOICE_SECTION" | "UPDATE_NAME" | "UPDATE_ROLE" |
   *           "ASK_SCHEDULE" | "ASK_PROFILE" | "CASUAL_CHAT" | "UNKNOWN",
   *   arrivalTime: string | null,
   *   reason: string | null,
   *   section: string | null,
   *   newName: string | null,
   *   role: string | null,
   *   replyText: string | null
   * }
   */
  async processMessage({ rawText, eventContext = {} }) {
    if (!this.isAvailable() || !this.client || !rawText || typeof rawText !== 'string') {
      return null;
    }

    const {
      namaAcara = 'Latihan Paduan Suara NHKBP Kayu Putih',
      waktuLatihan = 'Akan diinfokan',
      lokasi = 'Gereja HKBP Kayu Putih',
      targetOnTime = '19:00 WIB',
      batasWaktu = 'Sebelum latihan dimulai'
    } = eventContext;

    const systemInstruction = `
Anda adalah AI Intent Classifier untuk Bot Absensi Paduan Suara Gereja (NHKBP Kayu Putih).
Tugas Anda adalah membaca pesan teks percakapan masuk dari seorang anggota dan mengklasifikasikan intent serta mengekstrak entitas ke dalam format JSON yang valid.

KONTEKS ACARA PUBLIK:
- Acara: ${namaAcara}
- Waktu: ${waktuLatihan}
- Lokasi: ${lokasi}
- Target On-Time: ${targetOnTime}
- Batas Pengisian: ${batasWaktu}

DAFTAR INTENT YANG DIDUKUNG:
1. "ATTENDANCE_YES_ONTIME" -> Jika anggota menyatakan bisa hadir dan tepat waktu/on-time.
2. "ATTENDANCE_YES_LATE" -> Jika anggota menyatakan bisa hadir tapi terlambat/telat, sertakan perkiraan jam di "arrivalTime" (contoh: "20:00 WIB", "20:30").
3. "ATTENDANCE_YES_PENDING_TIME" -> Jika anggota menyatakan bisa hadir tapi telat dan belum tahu jam berapa.
4. "ATTENDANCE_NO" -> Jika anggota berhalangan/tidak bisa hadir, sertakan alasan di "reason" (contoh: "Lembur kantor", "Sakit", "Acara keluarga").
5. "UPDATE_VOICE_SECTION" -> Jika anggota ingin memilih/mengubah seksi suara vokal (Sopran 1/2, Alto 1/2, Tenor 1/2, Bass 1/2, Pemusik, Umum), sertakan di "section".
6. "UPDATE_NAME" -> Jika anggota ingin mengubah nama lengkapnya, sertakan nama baru di "newName".
7. "UPDATE_ROLE" -> Jika anggota ingin mengubah peran/pelayanan gerejanya (contoh: Song Leader, Pemusik, BPH), sertakan di "role".
8. "ASK_SCHEDULE" -> Jika anggota menanyakan jadwal, tanggal, waktu, atau lokasi latihan.
9. "ASK_PROFILE" -> Jika anggota menanyakan profil diri atau status absensinya ("cek absen saya", "apakah saya sudah absen").
10. "CASUAL_CHAT" -> Jika pesan berupa salam, ucapan terima kasih, humor, atau obrolan santai yang bukan perintah absensi. Tulis kalimat balasan umum yang ramah, sopan, dan bernuansa gerejawi di "replyText" TANPA menyebut nama atau nomor orang tertentu.
11. "UNKNOWN" -> Jika pesan tidak dapat dipahami atau tidak cocok dengan intent di atas.

FORMAT OUTPUT:
Wajib mengembalikan JSON murni dengan schema:
{
  "intent": "ATTENDANCE_YES_ONTIME" | "ATTENDANCE_YES_LATE" | "ATTENDANCE_YES_PENDING_TIME" | "ATTENDANCE_NO" | "UPDATE_VOICE_SECTION" | "UPDATE_NAME" | "UPDATE_ROLE" | "ASK_SCHEDULE" | "ASK_PROFILE" | "CASUAL_CHAT" | "UNKNOWN",
  "arrivalTime": string | null,
  "reason": string | null,
  "section": string | null,
  "newName": string | null,
  "role": string | null,
  "replyText": string | null
}
`.trim();

    const candidateModels = [
      ...(config.geminiModel ? [config.geminiModel] : []),
      'gemini-3.6-flash',
      'gemini-3.5-flash',
      'gemini-3.5-flash-lite',
      'gemini-3.1-flash-lite',
      'gemini-flash-latest',
      'gemini-flash-lite-latest'
    ].filter((v, i, a) => a.indexOf(v) === i);

    logger.info('AI_AGENT', 'Mengirim raw text ke Gemini AI untuk klasifikasi intent (Anonymized)');

    const userMessageContent = { role: 'user', parts: [{ text: rawText }] };
    const contents = [userMessageContent];
    const now = Date.now();

    for (const modelName of candidateModels) {
      if (this.modelCooldowns.has(modelName) && this.modelCooldowns.get(modelName) > now) {
        continue;
      }
      try {
        const response = await this.client.models.generateContent({
          model: modelName,
          contents,
          config: {
            systemInstruction,
            responseMimeType: 'application/json'
          }
        });

        const text = this.extractText(response);
        if (text) {
          try {
            const parsed = JSON.parse(text);
            if (parsed && parsed.intent) {
              return parsed;
            }
          } catch (jsonErr) {
            const cleanedJson = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            const parsed = JSON.parse(cleanedJson);
            if (parsed && parsed.intent) {
              return parsed;
            }
          }
        }
      } catch (err) {
        const isQuotaOrRateLimit =
          err.status === 'RESOURCE_EXHAUSTED' ||
          err.message?.includes('429') ||
          err.message?.toLowerCase().includes('quota');

        if (isQuotaOrRateLimit) {
          this.modelCooldowns.set(modelName, Date.now() + 60000);
        }
        logger.warn('AI_AGENT', `Percobaan model ${modelName} gagal: ${err.message}. Mencoba model alternatif...`);
      }
    }

    logger.error('AI_AGENT', 'Semua kandidat model Gemini AI gagal merespon.');
    return null;
  }

  /**
   * Helper untuk mengekstrak string teks dari candidate parts Gemini
   */
  extractText(response) {
    if (!response) return null;
    if (typeof response.text === 'string' && response.text.trim().length > 0) {
      return response.text.trim();
    }
    const parts = response.candidates?.[0]?.content?.parts;
    if (Array.isArray(parts)) {
      const text = parts.map((p) => p.text).filter(Boolean).join('\n').trim();
      if (text.length > 0) return text;
    }
    return null;
  }
}

export const aiAgent = new AiAgent();
