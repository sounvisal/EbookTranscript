const youtubedl = require('youtube-dl-exec');
const fs = require('fs');

function getFfmpegPath() {
  try {
    const ffmpegStatic = require('ffmpeg-static');
    if (typeof ffmpegStatic === 'string' && fs.existsSync(ffmpegStatic)) {
      return ffmpegStatic;
    }
  } catch {}
  return undefined;
}

async function extractYouTubeTranscript(urlValue, languagePreference = 'auto') {
  const startTime = Date.now();
  const ffmpegLoc = getFfmpegPath();

  console.log(`[YouTube Subtitles] Probing metadata and caption tracks (ffmpeg: ${ffmpegLoc})...`);

  const meta = await youtubedl(urlValue, {
    dumpSingleJson: true,
    noCheckCertificates: true,
    noWarnings: true,
    noPlaylist: true,
    geoBypass: true,
    extractorArgs: 'youtube:player_client=android',
    ...(ffmpegLoc ? { ffmpegLocation: ffmpegLoc } : {})
  });

  if (meta?.is_live) {
    throw new Error('Live streams cannot be transcribed until the broadcast concludes.');
  }

  const duration = Number(meta?.duration) || 0;
  const rawTitle = meta?.title || 'youtube-video';
  const videoTitle = rawTitle.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '').trim() || 'youtube-video';
  const subtitles = meta?.subtitles || {};
  const autoCaptions = meta?.automatic_captions || {};

  const findCaptionTrack = (tracks) => {
    if (!tracks || typeof tracks !== 'object') return null;
    const langKeys = Object.keys(tracks);
    if (!langKeys.length) return null;

    let targetLang = null;
    if (languagePreference === 'khmer') {
      targetLang = langKeys.find((l) => l.startsWith('km') || l.startsWith('kh'));
    } else if (languagePreference === 'english') {
      targetLang = langKeys.find((l) => l.startsWith('en'));
    }

    if (!targetLang) {
      targetLang =
        langKeys.find((l) => l.startsWith('km')) ||
        langKeys.find((l) => l.startsWith('en')) ||
        langKeys[0];
    }

    const formats = tracks[targetLang];
    if (!Array.isArray(formats) || !formats.length) return null;

    const json3 = formats.find((f) => f.ext === 'json3');
    const selectedFormat = json3 || formats[0];

    return {
      lang: targetLang,
      url: selectedFormat.url
    };
  };

  const selected = findCaptionTrack(subtitles) || findCaptionTrack(autoCaptions);
  if (!selected || !selected.url) {
    console.log('[YouTube Subtitles] No subtitles or automatic captions found for this video.');
    return null;
  }

  let fetchUrl = selected.url;
  if (!fetchUrl.includes('fmt=json3') && !fetchUrl.includes('.json3')) {
    fetchUrl += (fetchUrl.includes('?') ? '&' : '?') + 'fmt=json3';
  }

  console.log(`[YouTube Subtitles] Fetching timedtext (${selected.lang})...`);
  const captionRes = await fetch(fetchUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    }
  });

  if (!captionRes.ok) {
    console.warn(`[YouTube Subtitles] Failed to fetch timedtext: HTTP ${captionRes.status}`);
    return null;
  }

  const data = await captionRes.json();
  const rawEvents = Array.isArray(data.events) ? data.events : [];
  const segments = [];
  const textPieces = [];

  for (const ev of rawEvents) {
    if (!ev.segs || !Array.isArray(ev.segs)) continue;

    const segText = ev.segs
      .map((s) => s.utf8 || '')
      .join('')
      .replace(/[\u200B-\u200D\uFEFF]/g, '')
      .replace(/^>>\s*/, '')
      .replace(/\n+/g, ' ')
      .trim();

    if (!segText || segText === '\n') continue;

    const start = Math.round(((ev.tStartMs || 0) / 1000) * 100) / 100;
    const dur = Math.round(((ev.dDurationMs || 0) / 1000) * 100) / 100;
    const end = Math.round((start + dur) * 100) / 100;

    segments.push({ start, end, text: segText });
    textPieces.push(segText);
  }

  if (!segments.length) {
    console.log('[YouTube Subtitles] Timedtext returned 0 valid speech segments.');
    return null;
  }

  const fullText = textPieces.join(' ').replace(/\s{2,}/g, ' ').trim();
  const elapsed = Date.now() - startTime;
  console.log(`[YouTube Subtitles] SUCCESS! Extracted ${segments.length} segments in ${elapsed}ms.`);

  return {
    text: fullText,
    segments,
    language: selected.lang,
    duration: duration || (segments.length > 0 ? segments[segments.length - 1].end : 0),
    sourceName: videoTitle,
    displayName: `${videoTitle}.txt`
  };
}

async function run() {
  const result = await extractYouTubeTranscript('https://youtu.be/-u7x3-6JHV8');
  if (result) {
    console.log('Result sourceName:', result.sourceName);
    console.log('Result duration:', result.duration);
    console.log('Result language:', result.language);
    console.log('Result segments count:', result.segments.length);
    console.log('Sample segment 0:', result.segments[0]);
    console.log('Sample text (first 100 chars):', result.text.slice(0, 100));
  } else {
    console.log('No result returned');
  }
}

run();
