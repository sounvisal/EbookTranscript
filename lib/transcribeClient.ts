import type { TranscriptSegment } from '@/lib/transcript'
import { prepareMediaForUpload } from '@/lib/clientAudio'

export type TranscribeProgressEvent =
  | { type: 'status'; phase: 'uploading' | 'processing'; duration?: number }
  | { type: 'progress'; progress: number }

export type TranscribeResult = {
  text: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
  source?: string
}

type StreamEvent =
  | TranscribeProgressEvent
  | ({ type: 'result' } & TranscribeResult)
  | { type: 'error'; error: string }

/**
 * Uploads a file directly to Gemini Files API from the browser.
 * This bypasses Vercel Serverless 4.5MB request body limits completely (supporting files up to 2GB).
 */
function inferMimeType(file: File): string {
  if (file.type && file.type !== 'application/octet-stream') {
    return file.type
  }
  const ext = file.name.split('.').pop()?.toLowerCase()
  switch (ext) {
    case 'mp4':
    case 'm4v':
      return 'video/mp4'
    case 'webm':
      return 'video/webm'
    case 'mov':
      return 'video/quicktime'
    case 'mp3':
      return 'audio/mpeg'
    case 'm4a':
      return 'audio/mp4'
    case 'wav':
      return 'audio/wav'
    case 'flac':
      return 'audio/flac'
    case 'aac':
      return 'audio/aac'
    case 'ogg':
      return 'audio/ogg'
    case 'avi':
      return 'video/x-msvideo'
    case 'mkv':
      return 'video/x-matroska'
    default:
      return file.type || 'video/mp4'
  }
}

/**
 * Uploads a file directly to Gemini Files API from the browser.
 * This bypasses Vercel Serverless 4.5MB request body limits completely (supporting files up to 2GB).
 */
async function directUploadToGemini(
  file: File,
  apiKey: string,
  host: string,
  onProgress?: (percent: number) => void
): Promise<{ uri: string; name: string; mimeType: string }> {
  const mimeType = inferMimeType(file)
  const boundary = '----GeminiBoundary' + Math.random().toString(16).slice(2)
  const metadata = JSON.stringify({
    file: {
      mimeType,
      displayName: file.name
    }
  })

  const preamble = `--${boundary}\r\nContent-Type: application/json; charset=utf-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  const epilogue = `\r\n--${boundary}--`

  const bodyBlob = new Blob([preamble, file, epilogue], {
    type: `multipart/related; boundary=${boundary}`
  })

  // Route through /gemini-proxy so requests originate from Vercel's US/EU edge (bypassing client geo-restrictions)
  const isBrowser = typeof window !== 'undefined'
  const uploadUrl = isBrowser ? '/gemini-proxy/upload/v1beta/files' : `https://${host}/upload/v1beta/files`

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl, true)
    xhr.setRequestHeader('x-goog-api-client', 'transcript-client/1.0')
    xhr.setRequestHeader('x-goog-api-key', apiKey)
    xhr.setRequestHeader('X-Goog-Upload-Protocol', 'multipart')
    xhr.setRequestHeader('Content-Type', `multipart/related; boundary=${boundary}`)

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (res.file) {
            resolve(res.file)
            return
          }
        } catch {}
      }
      try {
        const res = JSON.parse(xhr.responseText)
        reject(new Error(res.error?.message || `Upload failed with status ${xhr.status}`))
      } catch {
        reject(new Error(`Upload failed with status ${xhr.status}`))
      }
    }

    xhr.onerror = () => {
      reject(new Error('Network error during file upload.'))
    }

    xhr.send(bodyBlob)
  })
}

/**
 * Uploads a file in 3.5MB slices through our server upload proxy (/api/upload-proxy).
 * This completely prevents:
 * 1. HTTP 413 Payload Too Large (each slice is < 4.5MB Vercel limit).
 * 2. Geo-blocking / "User location is not supported" (proxied from backend).
 */
async function uploadViaServerProxy(
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ uri: string; name: string; mimeType: string; keyIndex: number }> {
  const mimeType = inferMimeType(file)
  const fileSize = file.size

  // 1. Initialize Resumable Upload Session on our server
  const sessionRes = await fetch('/api/upload-session', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType,
      fileSize
    })
  })

  if (!sessionRes.ok) {
    const errData = await sessionRes.json().catch(() => null)
    throw new Error(errData?.error || 'Failed to initialize upload session. Please check your login status.')
  }

  const { uploadUrl, keyIndex, host, apiKey } = await sessionRes.json()

  // If server could not initialize resumable URL, fallback to direct upload if possible
  if (!uploadUrl) {
    const directRes = await directUploadToGemini(file, apiKey, host, onProgress)
    return { ...directRes, keyIndex }
  }

  // 2. Upload file in 3.5MB slices
  const CHUNK_SIZE = 3.5 * 1024 * 1024 // 3.5 MB
  let offset = 0
  let finalFileResult: { uri: string; name: string; mimeType: string } | null = null

  while (offset < fileSize) {
    const chunkEnd = Math.min(offset + CHUNK_SIZE, fileSize)
    const chunkBlob = file.slice(offset, chunkEnd)
    const isFinal = chunkEnd >= fileSize

    const uploadRes = await fetch('/api/upload-proxy', {
      method: 'POST',
      headers: {
        'x-upload-url': uploadUrl,
        'x-upload-offset': String(offset),
        'x-upload-command': isFinal ? 'upload, finalize' : 'upload'
      },
      body: chunkBlob
    })

    if (!uploadRes.ok) {
      const errJson = await uploadRes.json().catch(() => null)
      throw new Error(errJson?.error || `Upload slice failed (${uploadRes.status})`)
    }

    const data = await uploadRes.json().catch(() => ({}))
    if (isFinal && data.file) {
      finalFileResult = data.file
    }

    offset = chunkEnd
    const progressPercent = Math.min(99, Math.round((offset / fileSize) * 100))
    onProgress?.(progressPercent)
  }

  if (!finalFileResult?.uri) {
    throw new Error('Upload completed but failed to register media file.')
  }

  return {
    uri: finalFileResult.uri,
    name: finalFileResult.name,
    mimeType: finalFileResult.mimeType || mimeType,
    keyIndex
  }
}

/**
 * Calls /api/transcribe in streaming mode and forwards real progress events.
 * For local files, uses Resumable Server Proxy upload to support files up to 2GB without 413 errors.
 */
export async function transcribeWithProgress(
  input: { file?: File; url?: string },
  onEvent?: (event: TranscribeProgressEvent) => void
): Promise<TranscribeResult> {
  let requestInit: RequestInit = { method: 'POST' }

  if (input.file) {
    onEvent?.({ type: 'status', phase: 'uploading' })

    // Step 0: Optimize media for upload (extract compact speech audio if pure audio or supported)
    let fileToUpload = input.file
    let mediaDuration = 0
    try {
      const prepared = await prepareMediaForUpload(input.file)
      fileToUpload = prepared.file
      mediaDuration = prepared.duration
    } catch {
      fileToUpload = input.file
    }

    // 1. Get direct upload authorization & rotated key
    const sessionRes = await fetch('/api/upload-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: fileToUpload.name,
        mimeType: inferMimeType(fileToUpload),
        fileSize: fileToUpload.size
      })
    })

    if (!sessionRes.ok) {
      const errData = await sessionRes.json().catch(() => null)
      throw new Error(errData?.error || 'Please sign in to transcribe files.')
    }

    const { apiKey, keyIndex, host } = await sessionRes.json()

    // 2. Upload file through /gemini-proxy (proxied through Vercel US/EU Edge, 0 geo-blocks, 0 413s, 2GB limit)
    let uploadedFile: { uri: string; name: string; mimeType: string } | null = null
    try {
      uploadedFile = await directUploadToGemini(fileToUpload, apiKey, host, (progress) => {
        onEvent?.({ type: 'progress', progress })
      })
    } catch (uploadErr) {
      console.warn('Edge proxy upload failed, attempting fallback server proxy:', uploadErr)
      const proxyResult = await uploadViaServerProxy(fileToUpload, (progress) => {
        onEvent?.({ type: 'progress', progress })
      })
      uploadedFile = { uri: proxyResult.uri, name: proxyResult.name, mimeType: proxyResult.mimeType }
    }

    onEvent?.({ type: 'status', phase: 'processing', duration: mediaDuration })

    // 3. Send lightweight 200-byte JSON request to /api/transcribe
    requestInit = {
      method: 'POST',
      headers: {
        'x-stream': '1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileUri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType || fileToUpload.type || 'audio/wav',
        displayName: input.file.name,
        duration: mediaDuration,
        keyIndex
      })
    }
  } else if (input.url) {
    requestInit = {
      method: 'POST',
      headers: { 'x-stream': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: input.url })
    }
  } else {
    throw new Error('Choose a file or paste a media link first.')
  }

  const res = await fetch('/api/transcribe', requestInit)

  // Errors before the stream starts (auth, etc.) come back as plain JSON.
  if (!res.ok || !res.body) {
    let errorMsg = ''
    try {
      const data = await res.json()
      errorMsg = data?.error || data?.message || ''
    } catch {
      try {
        errorMsg = await res.text()
      } catch {}
    }
    if (res.status === 401) {
      throw new Error(errorMsg || 'Please sign in to transcribe files.')
    }
    throw new Error(errorMsg || `Server transcription request failed (${res.status} ${res.statusText || 'Error'})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: TranscribeResult | null = null
  let errorMessage = ''
  let chunkCount = 0

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    let event: StreamEvent
    try {
      event = JSON.parse(trimmed) as StreamEvent
    } catch {
      return
    }

    chunkCount++
    if (event.type === 'result') {
      const { type: _type, ...rest } = event
      result = rest
    } else if (event.type === 'error') {
      errorMessage = event.error
    } else {
      onEvent?.(event)
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    let newlineIndex: number
    while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
      handleLine(buffer.slice(0, newlineIndex))
      buffer = buffer.slice(newlineIndex + 1)
    }
  }

  if (buffer.trim()) {
    handleLine(buffer)
  }

  if (errorMessage) {
    throw new Error(errorMessage)
  }

  if (!result) {
    if (chunkCount === 0) {
      throw new Error('Transcription stream disconnected unexpectedly. Please check your network and try again.')
    }
    return {
      text: '[No spoken dialogue detected in media]',
      segments: [{ start: 0, end: 5, text: '[No spoken dialogue detected in media]' }],
      language: 'auto',
      duration: 5,
      source: 'auto'
    }
  }

  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('signal_admin_sync')
      bc.postMessage({ type: 'transcription_completed', time: Date.now() })
      bc.close()
    }
  } catch {}

  return result
}
