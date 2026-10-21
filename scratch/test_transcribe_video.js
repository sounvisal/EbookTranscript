require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadGeminiFile, getGeminiFile, streamGeminiTranscript, deleteGeminiFile } = require('../lib/gemini');
const { getOptimalModelOrder } = require('../lib/fleet');

async function main() {
  const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY).split(',');
  const key = rawKeys[1].trim(); // Key #1
  const videoBuffer = fs.readFileSync(path.join(__dirname, 'test_5mb.mp4'));

  console.log('Uploading test video...');
  const uploadRes = await uploadGeminiFile(key, {
    buffer: videoBuffer,
    mimeType: 'video/mp4',
    displayName: 'test_5mb.mp4'
  });

  let file = await getGeminiFile(key, uploadRes.file.name);
  while (file.state !== 'ACTIVE') {
    await new Promise(r => setTimeout(r, 1000));
    file = await getGeminiFile(key, uploadRes.file.name);
  }
  console.log('File is ACTIVE. Testing models with video file URI:', file.uri);

  const modelsToTest = ['gemini-2.5-flash', 'gemini-3.6-flash', 'gemini-flash-latest', 'gemini-3.5-flash-lite', 'gemini-3.5-transcribe'];

  for (const model of modelsToTest) {
    const t0 = Date.now();
    try {
      console.log(`\nTesting model: ${model}...`);
      const res = await streamGeminiTranscript(key, {
        modelName: model,
        prompt: 'Transcribe this audio if any or say [No speech detected]. Format JSON: {"text":"..."}',
        mimeType: 'video/mp4',
        fileUri: file.uri
      });
      console.log(`Model ${model} SUCCESS in ${Date.now() - t0}ms! Length: ${res.length}`);
    } catch (err) {
      console.log(`Model ${model} FAILED in ${Date.now() - t0}ms: ${err.message}`);
    }
  }

  await deleteGeminiFile(key, uploadRes.file.name);
}

main().catch(console.error);
