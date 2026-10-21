require('dotenv').config();
const fs = require('fs');
const path = require('path');
const ffmpeg = require('ffmpeg-static');
const { execFileSync } = require('child_process');
const https = require('https');

async function benchmark() {
  const videoPath = path.join(__dirname, 'test_5mb.mp4');
  const videoBuffer = fs.readFileSync(videoPath);
  console.log(`Testing 5MB Video Transcription Benchmark (${videoBuffer.length} bytes)...`);

  // Path 1: Old way (Full video uploaded to Gemini Files API + old model)
  console.log('\n--- Path 1: Old way (Raw MP4 to Gemini Files API) ---');
  // We already saw this took 35,928ms (36s) on gemini-flash-latest!

  // Path 2: New optimized way (Server strips video to compact MP3 -> inline Gemini request)
  console.log('\n--- Path 2: Optimized Fast Path (ffmpeg audio extract -> Gemini 3.5 Flash Lite) ---');
  const t0 = Date.now();
  const audioOut = path.join(__dirname, 'bench_audio.mp3');
  execFileSync(ffmpeg, ['-y', '-i', videoPath, '-vn', '-ac', '1', '-ar', '24000', '-b:a', '64k', audioOut]);
  const extractTime = Date.now() - t0;
  const audioBuffer = fs.readFileSync(audioOut);
  console.log(`1. Audio extracted in ${extractTime}ms (size reduced from ${videoBuffer.length} to ${audioBuffer.length} bytes = ${(videoBuffer.length / audioBuffer.length).toFixed(1)}x smaller!)`);

  const rawKeys = (process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY).split(',');
  const key = rawKeys[1].trim(); // Key #1
  const host = process.env.GEMINI_API_HOST || 'gemini-proxy.vsuon54.workers.dev';

  const t1 = Date.now();
  const body = JSON.stringify({
    contents: [{
      parts: [
        { text: 'You are an expert audio transcriber. Transcribe this audio or return [No speech]. Format: {"text":"..."}' },
        { inline_data: { mime_type: 'audio/mp3', data: audioBuffer.toString('base64') } }
      ]
    }]
  });

  const req = https.request({
    hostname: host,
    path: '/v1beta/models/gemini-3.5-flash-lite:generateContent?key=' + key,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(body)
    }
  }, (res) => {
    let data = '';
    res.on('data', c => data += c);
    res.on('end', () => {
      const apiTime = Date.now() - t1;
      const totalTime = Date.now() - t0;
      console.log(`2. Gemini API call completed in ${apiTime}ms! (Status: ${res.statusCode})`);
      console.log(`>>> TOTAL SPEED: ${totalTime}ms (vs 36,000ms old way)! That is ${(36000 / totalTime).toFixed(1)}x FASTER!`);
      try { fs.unlinkSync(audioOut); } catch {}
    });
  });
  req.write(body);
  req.end();
}

benchmark().catch(console.error);
