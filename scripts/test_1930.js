import { aiAgent } from '../src/aiAgent.js';

async function main() {
  const res = await aiAgent.processMessage({
    rawText: '19.30',
    eventContext: {
      namaAcara: 'Latihan Paduan Suara Naposobulung',
      waktuLatihan: 'Kamis, 3 September 2026 - Pukul 20:00 WIB',
      targetOnTime: '20:00 WIB'
    }
  });

  console.log('AI Classification Result for "19.30":', res);
}

main();
