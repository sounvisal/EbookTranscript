const https = require('https');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

function fetchTTS(text, lang) {
  return new Promise((resolve, reject) => {
    const url = 'https://translate.google.com/translate_tts?ie=UTF-8&q=' + encodeURIComponent(text) + '&tl=' + lang + '&client=tw-ob';
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' } }, (res) => {
      if (res.statusCode !== 200) {
        return reject(new Error(`TTS failed with status: ${res.statusCode}`));
      }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject);
  });
}

async function main() {
  const publicAudioDir = path.join(__dirname, '..', 'public', 'audio');
  if (!fs.existsSync(publicAudioDir)) {
    fs.mkdirSync(publicAudioDir, { recursive: true });
  }

  console.log('Generating Hero Visualizer Audio...');
  // Phrases for Hero Visualizer:
  // Speaker 1: « សួស្តី បងប្អូន ទាំងអស់គ្នា! Welcome to Signal AI. »
  // Speaker 2: « បាទ សួស្តី! Speech-to-Text កម្រិតខ្ពស់ Verbatim »
  const p1 = await fetchTTS('សួស្តីបងប្អូនទាំងអស់គ្នា', 'km');
  const p2 = await fetchTTS('Welcome to Signal AI', 'en');
  const p3 = await fetchTTS('បាទ សួស្តី', 'km');
  const p4 = await fetchTTS('Speech to text', 'en');
  const p5 = await fetchTTS('កម្រិតខ្ពស់', 'km');
  const p6 = await fetchTTS('Verbatim', 'en');

  const tmp1 = path.join(__dirname, 'tmp1.mp3');
  const tmp2 = path.join(__dirname, 'tmp2.mp3');
  const tmp3 = path.join(__dirname, 'tmp3.mp3');
  const tmp4 = path.join(__dirname, 'tmp4.mp3');
  const tmp5 = path.join(__dirname, 'tmp5.mp3');
  const tmp6 = path.join(__dirname, 'tmp6.mp3');
  fs.writeFileSync(tmp1, p1);
  fs.writeFileSync(tmp2, p2);
  fs.writeFileSync(tmp3, p3);
  fs.writeFileSync(tmp4, p4);
  fs.writeFileSync(tmp5, p5);
  fs.writeFileSync(tmp6, p6);

  const listFile = path.join(__dirname, 'list.txt');
  fs.writeFileSync(listFile, `file '${tmp1.replace(/\\/g, '/')}'\nfile '${tmp2.replace(/\\/g, '/')}'\nfile '${tmp3.replace(/\\/g, '/')}'\nfile '${tmp4.replace(/\\/g, '/')}'\nfile '${tmp5.replace(/\\/g, '/')}'\nfile '${tmp6.replace(/\\/g, '/')}'\n`);

  const visualizerOut = path.join(publicAudioDir, 'demo_visualizer.mp3');
  execFileSync(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', visualizerOut]);
  console.log('Visualizer audio generated:', visualizerOut, fs.statSync(visualizerOut).size, 'bytes');

  // Sample Demo for /transcribe
  console.log('Generating Sample Demo Audio...');
  const s1 = await fetchTTS('សួស្តីអ្នកទាំងអស់គ្នា! Welcome to Signal AI podcast where we demonstrate bilingual speech transcription.', 'km');
  const s2 = await fetchTTS('បាទ សួស្តី! ការបម្លែងសម្លេងជាភាសាខ្មែរ ឥឡូវនេះមានភាពត្រឹមត្រូវខ្ពស់ ដោយបែងចែករវាងសម្លេងមនុស្សនិយាយ និងសម្លេងតន្ត្រីយ៉ាងច្បាស់។', 'km');
  const s3 = await fetchTTS('Exactly! You can click any timestamp to jump the audio, edit phrases in line, or export directly to Premiere Pro SRT subtitles.', 'en');

  const stmp1 = path.join(__dirname, 'stmp1.mp3');
  const stmp2 = path.join(__dirname, 'stmp2.mp3');
  const stmp3 = path.join(__dirname, 'stmp3.mp3');
  fs.writeFileSync(stmp1, s1);
  fs.writeFileSync(stmp2, s2);
  fs.writeFileSync(stmp3, s3);

  const slistFile = path.join(__dirname, 'slist.txt');
  fs.writeFileSync(slistFile, `file '${stmp1.replace(/\\/g, '/')}'\nfile '${stmp2.replace(/\\/g, '/')}'\nfile '${stmp3.replace(/\\/g, '/')}'\n`);

  const sampleOut = path.join(publicAudioDir, 'demo_khmer_english_sample.mp3');
  execFileSync(ffmpegPath, ['-y', '-f', 'concat', '-safe', '0', '-i', slistFile, '-c', 'copy', sampleOut]);
  console.log('Sample demo audio generated:', sampleOut, fs.statSync(sampleOut).size, 'bytes');

  // Clean temp files
  [tmp1, tmp2, tmp3, tmp4, tmp5, tmp6, listFile, stmp1, stmp2, stmp3, slistFile].forEach(f => {
    try { fs.unlinkSync(f); } catch {}
  });

  console.log('ALL DEMO AUDIOS GENERATED SUCCESSFULLY!');
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
