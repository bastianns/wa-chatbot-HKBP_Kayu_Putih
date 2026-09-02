import { GoogleGenAI } from '@google/genai';
import { config } from '../config.js';

const client = new GoogleGenAI({ apiKey: config.geminiApiKey });

const testModels = [
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest'
];

for (const m of testModels) {
  try {
    const res = await client.models.generateContent({
      model: m,
      contents: [{ role: 'user', parts: [{ text: 'Halo bot, jawab: {"status":"OK"}' }] }],
      config: { responseMimeType: 'application/json' }
    });
    console.log('✅ Model', m, 'SUCCESS:', res.text);
  } catch (err) {
    console.log('❌ Model', m, 'FAILED:', err.message);
  }
}
