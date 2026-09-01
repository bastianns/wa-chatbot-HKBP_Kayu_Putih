import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';
import { logger } from './logger.js';
import { memberManager as defaultMemberManager } from './memberManager.js';
import { eventManager as defaultEventManager } from './eventManager.js';
import { attendanceTracker as defaultAttendanceTracker } from './attendanceTracker.js';
import { sendToGoogleSheets } from './sheetsService.js';
import { parseSectionChoice } from './responseParser.js';
import { cleanNameInput, isValidName } from './botHandler.js';

export class AiAgent {
  constructor(apiKey = config.geminiApiKey, dependencies = {}) {
    this.apiKey = apiKey;
    this.client = null;
    if (this.apiKey) {
      this.client = new GoogleGenAI({ apiKey: this.apiKey });
    }
    this.memberManager = dependencies.memberManager || defaultMemberManager;
    this.eventManager = dependencies.eventManager || defaultEventManager;
    this.attendanceTracker = dependencies.attendanceTracker || defaultAttendanceTracker;
  }

  /**
   * Cek apakah API Key Gemini tersedia dan aktif
   */
  isAvailable() {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  /**
   * Definisi Tools / Functions untuk Gemini Function Calling
   */
  getToolDeclarations() {
    return [
      {
        functionDeclarations: [
          {
            name: 'recordAttendance',
            description: 'Mencatat atau memperbarui konfirmasi kehadiran anggota untuk acara latihan paduan suara aktif.',
            parameters: {
              type: 'OBJECT',
              properties: {
                attendanceChoice: {
                  type: 'STRING',
                  description: 'Pilihan kehadiran: "Bisa" (jika hadir) atau "Tidak Bisa" (jika berhalangan/absen).',
                },
                isLate: {
                  type: 'BOOLEAN',
                  description: 'True jika hadir namun terlambat / telat, False jika on-time tepat waktu.',
                },
                arrivalTime: {
                  type: 'STRING',
                  description: 'Estimasi waktu / jam kedatangan jika telat (contoh: "20:15 WIB" atau "Pukul 20:30").',
                },
                reason: {
                  type: 'STRING',
                  description: 'Alasan jika tidak bisa hadir (contoh: "Lembur kantor", "Sakit flu", "Acara keluarga").',
                }
              },
              required: ['attendanceChoice']
            }
          },
          {
            name: 'updateVoiceSection',
            description: 'Mengatur atau mengubah seksi suara vokal paduan suara anggota (Sopran 1/2, Alto 1/2, Tenor 1/2, Bass 1/2, Pemusik, Umum).',
            parameters: {
              type: 'OBJECT',
              properties: {
                section: {
                  type: 'STRING',
                  description: 'Nama seksi suara (contoh: "Sopran 1", "Sopran 2", "Alto 1", "Alto 2", "Tenor 1", "Tenor 2", "Bass 1", "Bass 2", "Pemusik", "Umum").',
                }
              },
              required: ['section']
            }
          },
          {
            name: 'updateMemberName',
            description: 'Memperbarui nama lengkap resmi anggota di database dan daftar absensi.',
            parameters: {
              type: 'OBJECT',
              properties: {
                newName: {
                  type: 'STRING',
                  description: 'Nama lengkap baru anggota (minimal 2 kata, contoh: "Bastian Sibarani").',
                }
              },
              required: ['newName']
            }
          },
          {
            name: 'updateMemberRole',
            description: 'Memperbarui peran atau bidang pelayanan anggota di NHKBP Kayu Putih (contoh: Song Leader, Seksi Rohani & Musik, Pengurus, Pemusik, Anggota Naposobulung).',
            parameters: {
              type: 'OBJECT',
              properties: {
                role: {
                  type: 'STRING',
                  description: 'Nama peran atau bidang pelayanan baru.',
                }
              },
              required: ['role']
            }
          },
          {
            name: 'getEventSchedule',
            description: 'Mengambil jadwal dan detail informasi latihan aktif terdekat saat ini.',
            parameters: {
              type: 'OBJECT',
              properties: {}
            }
          },
          {
            name: 'getMyProfile',
            description: 'Mengambil data profil lengkap anggota (nama, seksi suara, peran, dan status kehadiran latihan terdekat).',
            parameters: {
              type: 'OBJECT',
              properties: {}
            }
          }
        ]
      }
    ];
  }

  /**
   * Eksekusi Function Call dari Gemini
   */
  async executeTool(toolName, args, context) {
    const { effectivePhone, knownName, member, currentEvent } = context;
    logger.info('AI_AGENT', `Executing tool: ${toolName} with args: ${JSON.stringify(args)}`);

    switch (toolName) {
      case 'recordAttendance': {
        const choice = args.attendanceChoice === 'Tidak Bisa' ? 'Tidak Bisa' : 'Bisa';
        let keterangan = '-';
        let alasan = '-';
        let status = 'RESPONDED';

        if (choice === 'Bisa') {
          if (args.isLate && args.arrivalTime) {
            keterangan = `Telat (${args.arrivalTime})`;
          } else if (args.isLate) {
            keterangan = 'Telat';
          } else {
            keterangan = `On-Time (${currentEvent.targetOnTime || '19:00 WIB'})`;
          }
        } else {
          alasan = args.reason || 'Berhalangan';
        }

        const payload = {
          nama: knownName || member?.name || 'Anggota',
          seksi: member?.seksi || 'Umum',
          status: choice,
          keterangan,
          alasan,
          namaAcara: currentEvent.namaAcara,
          tanggalLatihan: currentEvent.waktuLatihan,
          nomorWa: effectivePhone
        };

        this.attendanceTracker.markResponded(effectivePhone, payload, status);
        await sendToGoogleSheets(payload);

        return {
          success: true,
          message: `Kehadiran berhasil dicatat untuk ${payload.nama}: ${choice} (${choice === 'Bisa' ? keterangan : alasan}). Tersinkronisasi ke Google Sheets.`
        };
      }

      case 'updateVoiceSection': {
        const parsed = parseSectionChoice(args.section);
        const finalSection = parsed !== 'UNKNOWN' ? parsed : args.section;
        const now = new Date().toISOString();

        this.memberManager.registerOrUpdate(effectivePhone, knownName || member?.name || 'Anggota', finalSection);
        this.attendanceTracker.db.prepare('UPDATE attendance_records SET seksi = ?, updated_at = ? WHERE event_id = ? AND phone = ?')
          .run(finalSection, now, currentEvent.id, effectivePhone);

        const existingAttendance = this.attendanceTracker.getAttendance(effectivePhone, currentEvent.id);
        if (existingAttendance && existingAttendance.status === 'RESPONDED') {
          await sendToGoogleSheets({
            ...existingAttendance,
            nama: knownName || member?.name || 'Anggota',
            seksi: finalSection,
            status: existingAttendance.attendance_choice || 'Bisa',
            keterangan: existingAttendance.keterangan || '-',
            alasan: existingAttendance.alasan || '-',
            namaAcara: currentEvent.namaAcara,
            tanggalLatihan: currentEvent.waktuLatihan,
            nomorWa: effectivePhone
          });
        }

        return {
          success: true,
          section: finalSection,
          message: `Seksi suara berhasil diatur ke: ${finalSection} dan disinkronkan ke rekap.`
        };
      }

      case 'updateMemberName': {
        const cleaned = cleanNameInput(args.newName);
        if (!isValidName(cleaned)) {
          return { success: false, message: 'Nama tidak valid (minimal 2 kata dan harus berupa nama orang yang jelas).' };
        }

        const now = new Date().toISOString();
        this.memberManager.registerOrUpdate(effectivePhone, cleaned, member?.seksi, 'NHKBP Kayu Putih');
        this.attendanceTracker.db.prepare('UPDATE attendance_records SET name = ?, updated_at = ? WHERE event_id = ? AND phone = ?')
          .run(cleaned, now, currentEvent.id, effectivePhone);

        const existingAttendance = this.attendanceTracker.getAttendance(effectivePhone, currentEvent.id);
        if (existingAttendance && existingAttendance.status === 'RESPONDED') {
          await sendToGoogleSheets({
            ...existingAttendance,
            nama: cleaned,
            seksi: member?.seksi || 'Umum',
            status: existingAttendance.attendance_choice || 'Bisa',
            keterangan: existingAttendance.keterangan || '-',
            alasan: existingAttendance.alasan || '-',
            namaAcara: currentEvent.namaAcara,
            tanggalLatihan: currentEvent.waktuLatihan,
            nomorWa: effectivePhone
          });
        }

        return {
          success: true,
          name: cleaned,
          message: `Nama lengkap berhasil diperbarui menjadi: ${cleaned}.`
        };
      }

      case 'updateMemberRole': {
        this.memberManager.updatePeran(effectivePhone, args.role);
        return {
          success: true,
          role: args.role,
          message: `Peran / bidang pelayanan berhasil diperbarui menjadi: ${args.role}.`
        };
      }

      case 'getEventSchedule': {
        return {
          success: true,
          event: currentEvent
        };
      }

      case 'getMyProfile': {
        const att = this.attendanceTracker.getAttendance(effectivePhone, currentEvent.id);
        return {
          success: true,
          name: knownName || member?.name || '(Belum terdaftar)',
          seksi: member?.seksi || 'Umum',
          peran: member?.peran || 'Anggota Naposobulung',
          attendance: att ? { choice: att.attendance_choice, keterangan: att.keterangan, alasan: att.alasan } : null
        };
      }

      default:
        return { success: false, message: `Tool ${toolName} tidak dikenal.` };
    }
  }

  /**
   * Memproses pesan teks pengguna dengan LLM Gemini + Autonomous Tool Calling
   */
  async processMessage({ effectivePhone, rawText, member, knownName, userIsAdmin }) {
    if (!this.isAvailable() || !this.client) {
      return null;
    }

    const currentEvent = eventManager.getEvent();
    const context = { effectivePhone, knownName, member, userIsAdmin, currentEvent };

    const systemInstruction = `
Anda adalah Asisten AI Virtual Cerdas & Ramah dari Seksi Rohani & Musik NHKBP Kayu Putih.
Tugas utama Anda:
1. Menyapa jemaat/anggota naposobulung dengan hangat, sopan, dan bernuansa gerejawi (gunakan sapaan ramah seperti "Shalom Kak [Nama]! ✨" atau "Halo Kak [Nama]!").
2. Membantu anggota mengonfirmasi kehadiran latihan paduan suara, mencatat jam estimasi jika terlambat, atau mencatat alasan jika berhalangan dengan memanggil tool "recordAttendance".
3. Membantu anggota mengatur/mengubah seksi suara (Sopran 1/2, Alto 1/2, Tenor 1/2, Bass 1/2, Pemusik, Umum) dengan memanggil tool "updateVoiceSection".
4. Membantu memperbarui nama lengkap ("updateMemberName") atau peran pelayanan ("updateMemberRole").
5. Menjawab pertanyaan seputar jadwal latihan dan lokasi acara ("getEventSchedule") atau profil diri ("getMyProfile").

Informasi Konteks Saat Ini:
- Nama Pengirim: ${knownName || member?.name || 'Saudara/i'}
- Nomor WA: ${effectivePhone}
- Seksi Suara: ${member?.seksi || 'Belum ditentukan'}
- Peran: ${member?.peran || 'Anggota Naposobulung'}
- Status Admin: ${userIsAdmin ? 'YA (Pengurus)' : 'TIDAK'}
- Acara Latihan Terdekat: ${currentEvent.namaAcara}
- Waktu: ${currentEvent.waktuLatihan}
- Lokasi: ${currentEvent.lokasi}
- Tujuan: ${currentEvent.tujuan}
- Batas Pengisian: ${currentEvent.batasWaktu}

Panduan Sikap & Formatting:
- Gunakan bahasa Indonesia yang santun, bersahabat, dan jelas.
- Format pesan WhatsApp dengan rapi menggunakan bold (*teks*), italic (_teks_), dan emoji secukupnya.
- Jika pengguna sudah menyampaikan niatnya secara jelas (contoh: "bisa hadir jam 8", "pindah suara alto 2", "nama saya Samuel"), panggil tool yang sesuai terlebih dahulu, lalu berikan respon konfirmasi yang ramah.
- Hindari halusinasi data. Jangan mengarang jadwal acara atau status kehadiran tanpa mengecek tool atau konteks di atas.
`.trim();

    try {
      logger.info('AI_AGENT', `Mengirim pesan ke Gemini AI: "${rawText}" dari ${effectivePhone}`);

      const response = await this.client.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: rawText,
        config: {
          systemInstruction,
          tools: this.getToolDeclarations()
        }
      });

      // Cek apakah Gemini memanggil Function / Tool
      const functionCalls = response.functionCalls ? response.functionCalls : [];

      if (functionCalls.length > 0) {
        const toolResponses = [];
        for (const fc of functionCalls) {
          const result = await this.executeTool(fc.name, fc.args || {}, context);
          toolResponses.push({
            name: fc.name,
            response: result
          });
        }

        // Kirim kembali hasil eksekusi tool ke Gemini untuk menghasilkan balasan percakapan final
        const followUpResponse = await this.client.models.generateContent({
          model: 'gemini-2.5-flash',
          contents: [
            { role: 'user', parts: [{ text: rawText }] },
            { role: 'model', parts: functionCalls.map(fc => ({ functionCall: fc })) },
            {
              role: 'user',
              parts: toolResponses.map(tr => ({
                functionResponse: {
                  name: tr.name,
                  response: tr.response
                }
              }))
            }
          ],
          config: {
            systemInstruction
          }
        });

        return followUpResponse.text || null;
      }

      return response.text || null;
    } catch (err) {
      logger.error('AI_AGENT', `Error in Gemini AI Agent: ${err.message}`, err);
      // Fallback null agar sistem melanjutkan ke FSM deterministik secara aman
      return null;
    }
  }
}

export const aiAgent = new AiAgent();
