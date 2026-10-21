import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import { streamGeminiTranscript } from '../lib/gemini';

async function main() {
  const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY)!.split(',');
  const key = rawKeys[0].trim();
  const audioBuf = fs.readFileSync(path.join(__dirname, 'test_extracted.mp3'));

  console.log(`Testing streamGeminiTranscript with ${audioBuf.length} bytes audio on Key ${key.slice(0, 10)}...`);
  const t0 = Date.now();
  const result = await streamGeminiTranscript(key, {
    modelName: 'gemini-3.5-flash-lite',
    prompt: 'Transcribe this audio strictly as JSON: {"language":"auto","text":"...","segments":[]}',
    mimeType: 'audio/mpeg',
    inlineData: audioBuf,
    onText: (chunk) => {
      process.stdout.write('.');
    }
  });

  console.log(`\nSuccess in ${Date.now() - t0}ms!`);
  console.log(result);
}

main().catch(console.error);
