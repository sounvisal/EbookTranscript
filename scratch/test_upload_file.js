require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { uploadGeminiFile, getGeminiFile, GEMINI_FILE_STATE_ACTIVE, GEMINI_FILE_STATE_FAILED, deleteGeminiFile } = require('../lib/gemini');

async function main() {
  const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY).split(',');
  const key = rawKeys[1].trim(); // Key #1
  const videoBuffer = fs.readFileSync(path.join(__dirname, 'test_5mb.mp4'));

  console.log('Uploading test video (', videoBuffer.length, 'bytes) to Gemini Files API...');
  const t0 = Date.now();
  const uploadRes = await uploadGeminiFile(key, {
    buffer: videoBuffer,
    mimeType: 'video/mp4',
    displayName: 'test_5mb.mp4'
  });
  console.log('Upload call completed in', Date.now() - t0, 'ms. File name:', uploadRes.file.name);

  const t1 = Date.now();
  let file = await getGeminiFile(key, uploadRes.file.name);
  console.log('Initial state:', file.state);

  let attempt = 0;
  while (file.state !== GEMINI_FILE_STATE_ACTIVE && file.state !== GEMINI_FILE_STATE_FAILED) {
    attempt++;
    console.log(`Attempt ${attempt}: state is ${file.state} (${Date.now() - t1}ms elapsed)...`);
    await new Promise(r => setTimeout(r, 1000));
    file = await getGeminiFile(key, uploadRes.file.name);
  }

  console.log(`Final file state: ${file.state} after ${Date.now() - t1}ms! Total time: ${Date.now() - t0}ms`);
  await deleteGeminiFile(key, uploadRes.file.name);
  console.log('Cleaned up test file.');
}

main().catch(console.error);
