/**
 * Extract audio from bounded-size video clips before uploading. Larger or long
 * recordings keep the direct-upload path to avoid unbounded browser decoding.
 */

export const MAX_CLIENT_VIDEO_BYTES = 64 * 1024 * 1024
export const MAX_CLIENT_VIDEO_SECONDS = 300

// Batch uploads may run many network workers, but only one decode at a time.
let extractionQueue: Promise<void> = Promise.resolve()

async function withExtractionSlot<T>(work: () => Promise<T>): Promise<T> {
  const previous = extractionQueue
  let release!: () => void
  extractionQueue = new Promise<void>((resolve) => { release = resolve })
  await previous
  try {
    return await work()
  } finally {
    release()
  }
}

export async function getMediaDuration(file: File, allowDecodeFallback = true): Promise<number> {
  if (typeof window === 'undefined') return 0
  return new Promise((resolve) => {
    let resolved = false
    let url = ''
    let element: HTMLMediaElement | undefined

    const cleanup = (d: number) => {
      if (resolved) return
      resolved = true
      clearTimeout(timer)
      if (element) {
        element.onloadedmetadata = element.ondurationchange = element.oncanplay = element.onerror = null
        element.pause()
        element.removeAttribute('src')
        element.load()
      }
      if (url) {
        try { URL.revokeObjectURL(url) } catch {}
      }
      resolve(Number.isFinite(d) && d > 0 ? Math.round(d * 10) / 10 : 0)
    }

    try {
      url = URL.createObjectURL(file)
    } catch {
      return resolve(0)
    }

    const timer = setTimeout(() => {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (allowDecodeFallback && AudioCtx && file.size < 60 * 1024 * 1024) {
        file.arrayBuffer().then((buf) => {
          const ctx = new AudioCtx()
          return ctx.decodeAudioData(buf).then((decoded) => {
            ctx.close().catch(() => {})
            cleanup(decoded.duration)
          }).catch(() => {
            ctx.close().catch(() => {})
            cleanup(0)
          })
        }).catch(() => cleanup(0))
      } else {
        cleanup(0)
      }
    }, 8000)

    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(file.name)
    element = isVideo
      ? document.createElement('video')
      : document.createElement('audio')

    element.preload = 'metadata'

    const checkDuration = () => {
      const d = element!.duration
      if (Number.isFinite(d) && d > 0 && d !== Infinity) {
        cleanup(d)
      }
    }

    element.onloadedmetadata = checkDuration
    element.ondurationchange = checkDuration
    element.oncanplay = checkDuration
    element.onerror = () => cleanup(0)
    element.src = url
  })
}

export async function prepareMediaForUpload(file: File): Promise<{ file: File; duration: number }> {
  const duration = await getMediaDuration(file, false).catch(() => 0)
  // If it's already a native audio file (MP3, M4A, WAV, AAC, FLAC, OGG), preserve its compressed format!
  const isPureAudio = file.type.startsWith('audio/') || /\.(mp3|m4a|wav|aac|ogg|flac|wma)$/i.test(file.name)
  if (isPureAudio) {
    return { file, duration }
  }

  // Only perform video track stripping for video formats (MP4, MOV, WebM, MKV)
  const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm|m4v|mkv|avi)$/i.test(file.name)
  if (typeof window === 'undefined' || !isVideo || file.size > MAX_CLIENT_VIDEO_BYTES
    || duration <= 0 || duration > MAX_CLIENT_VIDEO_SECONDS) return { file, duration }
  const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AudioContextClass) {
    return { file, duration }
  }

  return withExtractionSlot(async () => {
    let audioCtx: AudioContext | undefined
    try {
      const arrayBuffer = await file.arrayBuffer()
      audioCtx = new AudioContextClass({ sampleRate: 16000 })

      // Decode audio track from MP4, MOV, WebM, WAV, AAC, MP3
      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer)
      const duration = Number.isFinite(audioBuffer.duration) ? Math.round(audioBuffer.duration * 10) / 10 : 0
      if (duration <= 0 || duration > MAX_CLIENT_VIDEO_SECONDS) return { file, duration }

      // Resample natively to mono 16kHz using fast OfflineAudioContext
      const targetSampleRate = 16000
      const OfflineCtxClass = window.OfflineAudioContext || (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext
      let targetBuffer = audioBuffer

      if (OfflineCtxClass && audioBuffer.sampleRate !== targetSampleRate) {
        try {
          const targetFrames = Math.ceil(audioBuffer.duration * targetSampleRate)
          const offlineCtx = new OfflineCtxClass(1, targetFrames, targetSampleRate)
          const source = offlineCtx.createBufferSource()
          source.buffer = audioBuffer
          source.connect(offlineCtx.destination)
          source.start(0)
          targetBuffer = await offlineCtx.startRendering()
        } catch (resampleErr) {
          console.warn('Native 16kHz resampling fallback:', resampleErr)
        }
      }

      // Encode to compact mono 16kHz WAV without silence trimming (trimSilence = false)
      // to preserve all audio from 0:00.0 without dropping opening syllables
      const wavBlob = audioBufferToMonoWav(targetBuffer, false)
      const baseName = file.name.replace(/\.[^/.]+$/, '')
      const wavFile = new File([wavBlob], `${baseName}.wav`, { type: 'audio/wav' })
      return { file: wavFile.size < file.size ? wavFile : file, duration }
    } catch (err) {
      console.warn('Client audio extraction failed; falling back to original file:', err)
      return { file, duration }
    } finally {
      await audioCtx?.close().catch(() => {})
    }
  })
}

/**
 * Encodes an AudioBuffer into a mono 16-bit 16kHz WAV Blob
 * with Voice Activity Detection (VAD) silence trimming.
 */
function audioBufferToMonoWav(buffer: AudioBuffer, trimSilence = false): Blob {
  const numChannels = buffer.numberOfChannels
  const totalLength = buffer.length
  
  // Downmix multi-channel to mono
  const monoSamples = new Float32Array(totalLength)
  for (let c = 0; c < numChannels; c++) {
    const channelData = buffer.getChannelData(c)
    for (let i = 0; i < totalLength; i++) {
      monoSamples[i] += channelData[i] / numChannels
    }
  }

  // Voice Activity Detection & Silence Trimming (ultra-safe threshold ~ -60dB)
  let startIndex = 0
  let endIndex = totalLength
  
  if (trimSilence && totalLength > buffer.sampleRate * 2) {
    const windowSize = Math.floor(buffer.sampleRate * 0.05) // 50ms window
    const silenceThreshold = 0.001 // RMS ~ -60dB (preserve quiet voices)
    const padding = Math.floor(buffer.sampleRate * 0.5) // 500ms padding

    // Find leading speech start
    for (let i = 0; i < totalLength - windowSize; i += windowSize) {
      let sumSquares = 0
      for (let j = 0; j < windowSize; j++) {
        const val = monoSamples[i + j]
        sumSquares += val * val
      }
      const rms = Math.sqrt(sumSquares / windowSize)
      if (rms > silenceThreshold) {
        startIndex = Math.max(0, i - padding)
        break
      }
    }

    // Find trailing speech end
    for (let i = totalLength - windowSize; i > startIndex + windowSize; i -= windowSize) {
      let sumSquares = 0
      for (let j = 0; j < windowSize; j++) {
        const val = monoSamples[i + j]
        sumSquares += val * val
      }
      const rms = Math.sqrt(sumSquares / windowSize)
      if (rms > silenceThreshold) {
        endIndex = Math.min(totalLength, i + windowSize + padding)
        break
      }
    }
  }

  const length = endIndex - startIndex
  const trimmedSamples = monoSamples.subarray(startIndex, endIndex)

  // 16-bit PCM WAV (44 header bytes + 2 bytes per sample)
  const wavBuffer = new ArrayBuffer(44 + length * 2)
  const view = new DataView(wavBuffer)

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF')
  view.setUint32(4, 36 + length * 2, true)
  writeString(view, 8, 'WAVE')

  // fmt sub-chunk
  writeString(view, 12, 'fmt ')
  view.setUint32(16, 16, true)                         // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true)                          // AudioFormat (1 for PCM)
  view.setUint16(22, 1, true)                          // NumChannels (1 for mono)
  view.setUint32(24, buffer.sampleRate, true)          // SampleRate
  view.setUint32(28, buffer.sampleRate * 2, true)      // ByteRate (SampleRate * 1 * 2)
  view.setUint16(32, 2, true)                          // BlockAlign (1 * 2)
  view.setUint16(34, 16, true)                         // BitsPerSample (16-bit)

  // data sub-chunk
  writeString(view, 36, 'data')
  view.setUint32(40, length * 2, true)

  // Write 16-bit PCM samples with clipping clamp
  let offset = 44
  for (let i = 0; i < length; i++) {
    const s = Math.max(-1, Math.min(1, trimmedSamples[i]))
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true)
    offset += 2
  }

  return new Blob([wavBuffer], { type: 'audio/wav' })
}

function writeString(view: DataView, offset: number, string: string) {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i))
  }
}
