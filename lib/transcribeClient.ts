import type { TranscriptSegment } from '@/lib/transcript'

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

  const uploadUrl = `https://${host}/upload/v1beta/files`

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
      reject(new Error('Network error during file upload to Gemini.'))
    }

    xhr.send(bodyBlob)
  })
}

/**
 * Calls /api/transcribe in streaming mode and forwards real progress events.
 * For local files, uses Direct-to-Gemini upload to prevent Vercel 413 Payload Too Large errors.
 */
export async function transcribeWithProgress(
  input: { file?: File; url?: string },
  onEvent?: (event: TranscribeProgressEvent) => void
): Promise<TranscribeResult> {
  let requestInit: RequestInit = { method: 'POST' }

  if (input.file) {
    onEvent?.({ type: 'status', phase: 'uploading' })

    // 1. Get direct upload authorization
    const sessionRes = await fetch('/api/upload-session', { method: 'POST' })
    if (!sessionRes.ok) {
      const errData = await sessionRes.json().catch(() => null)
      throw new Error(errData?.error || 'Please sign in to transcribe files.')
    }
    const { apiKey, keyIndex, host } = await sessionRes.json()

    // 2. Upload file directly to Gemini Files API (2GB limit)
    const uploadedFile = await directUploadToGemini(input.file, apiKey, host, (progress) => {
      onEvent?.({ type: 'progress', progress })
    })

    onEvent?.({ type: 'status', phase: 'processing' })

    // 3. Send lightweight 200-byte JSON request to /api/transcribe
    requestInit = {
      method: 'POST',
      headers: {
        'x-stream': '1',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        fileUri: uploadedFile.uri,
        mimeType: uploadedFile.mimeType || input.file.type || 'video/mp4',
        displayName: input.file.name,
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
    throw new Error('Transcription finished without generating transcript text. The media format may not be supported.')
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
