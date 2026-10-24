import type { TranscriptSegment } from '@/lib/transcript'
import { prepareMediaForUpload } from '@/lib/clientAudio'
import { useTranscriptStore } from '@/store/transcriptStore'

export type TranscribeProgressEvent =
  | { type: 'status'; phase: 'uploading' | 'processing'; duration?: number; message?: string }
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
    if (file.type === 'audio/mp3') return 'audio/mpeg'
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
 * Directly streams a media file to Google's authorized Resumable Upload URL.
 * Bypasses Vercel Serverless 4.5MB request body limit completely (supports files up to 2GB).
 * Uses 'upload, finalize' in a single stream, avoiding Google's 8MB intermediate chunk granularity requirement.
 */
async function uploadToResumableUrl(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ uri: string; name: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', uploadUrl, true)
    xhr.setRequestHeader('X-Goog-Upload-Offset', '0')
    xhr.setRequestHeader('X-Goog-Upload-Command', 'upload, finalize')

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && e.total > 0) {
          const percent = Math.min(99, Math.round((e.loaded / e.total) * 100))
          onProgress(percent)
        }
      }
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const res = JSON.parse(xhr.responseText)
          if (res.file?.uri) {
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
      reject(new Error(`Direct Google storage upload failed (status ${xhr.status || 0}). Check your internet connection or browser ad blocker.`))
    }

    xhr.send(file)
  })
}

/**
 * Server Upload Proxy fallback (/api/upload-proxy) for environments where direct
 * browser connections to Google are blocked (e.g. strict corporate ad blockers).
 * For files <= 4MB, proxies the entire file in one 'upload, finalize' call.
 */
async function uploadViaServerProxy(
  uploadUrl: string,
  file: File,
  onProgress?: (percent: number) => void
): Promise<{ uri: string; name: string; mimeType: string }> {
  onProgress?.(15)

  const uploadRes = await fetch('/api/upload-proxy', {
    method: 'POST',
    headers: {
      'x-upload-url': uploadUrl,
      'x-upload-offset': '0',
      'x-upload-command': 'upload, finalize'
    },
    body: file
  })

  if (!uploadRes.ok) {
    const errJson = await uploadRes.json().catch(() => null)
    throw new Error(errJson?.error || `Proxy upload failed (${uploadRes.status})`)
  }

  const data = await uploadRes.json().catch(() => ({}))
  if (!data?.file?.uri) {
    throw new Error('Upload proxy completed but failed to register media file.')
  }

  onProgress?.(99)
  return data.file
}

import type { AdvancedOptions } from '@/store/transcriptStore'

/**
 * Reads newline-delimited JSON stream from /api/transcribe and emits progress & results.
 */
async function readTranscriptionStream(
  body: ReadableStream<Uint8Array>,
  onEvent?: (event: TranscribeProgressEvent) => void
): Promise<TranscribeResult> {
  const reader = body.getReader()
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
    throw new Error(
      errorMessage ||
      (chunkCount > 0
        ? 'Transcription stream ended unexpectedly before completion. Please check your network connection and try again.'
        : 'Transcription stream disconnected. Please check your network and try again.')
    )
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

/**
 * Calls /api/transcribe in streaming mode and forwards real progress events.
 * For files <= 25MB (like 5MB videos), streams directly to /api/transcribe where ffmpeg
 * extracts a compact 120KB MP3 in <100ms and sends it inline to Gemini for 1-2s completion.
 * For larger files (up to 2GB), uses Resumable Gemini Files API upload.
 */
export async function transcribeWithProgress(
  input: { file?: File; url?: string },
  onEvent?: (event: TranscribeProgressEvent) => void,
  options?: AdvancedOptions,
  preferredKeyIndex?: number
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
      if (prepared.file && prepared.file !== input.file) {
        useTranscriptStore.getState().setAudioBlob(prepared.file)
      }
    } catch {
      fileToUpload = input.file
    }

    // FAST DIRECT PATH for files <= 25MB (e.g. 5MB videos):
    // Directly stream file to /api/transcribe where server-side ffmpeg extracts audio in ~80ms
    // and transcribes inline in 1-2s (bypassing slow video frame analysis and Files API state wait).
    if (fileToUpload.size <= 25 * 1024 * 1024) {
      const formData = new FormData()
      formData.append('file', fileToUpload)
      if (options) {
        formData.append('options', JSON.stringify(options))
      }
      if (typeof preferredKeyIndex === 'number') {
        formData.append('keyIndex', String(preferredKeyIndex))
      }

      try {
        const directHeaders: Record<string, string> = {
          'x-stream': '1'
        }
        if (typeof preferredKeyIndex === 'number') {
          directHeaders['x-key-index'] = String(preferredKeyIndex)
        }

        const directRes = await fetch('/api/transcribe', {
          method: 'POST',
          headers: directHeaders,
          body: formData
        })

        if (directRes.ok && directRes.body) {
          return await readTranscriptionStream(directRes.body, onEvent)
        }

        if (directRes.status === 401 || directRes.status === 429) {
          const errData = await directRes.json().catch(() => null)
          throw new Error(errData?.error || 'Transcription failed.')
        }

        console.warn(`Direct upload returned status ${directRes.status}; falling back to Files API...`)
      } catch (directErr: any) {
        if (directErr?.message && (directErr.message.includes('sign in') || directErr.message.includes('limit reached') || directErr.message.includes('quota'))) {
          throw directErr
        }
        console.warn('Fast direct upload attempt failed; falling back to Files API upload...', directErr)
      }
    }

    // 1. Get direct upload authorization & rotated key from server
    const requestSession = async () => {
      const sessionRes = await fetch('/api/upload-session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fileName: fileToUpload.name,
          mimeType: inferMimeType(fileToUpload),
          fileSize: fileToUpload.size,
          clientOrigin: typeof window !== 'undefined' ? window.location.origin : undefined,
          preferredKeyIndex
        })
      })

      if (!sessionRes.ok) {
        const errData = await sessionRes.json().catch(() => null)
        throw new Error(errData?.error || 'Please sign in to transcribe files.')
      }

      return (await sessionRes.json()) as {
        keyIndex: number
        host: string
        uploadUrl?: string
      }
    }

    let { keyIndex, host, uploadUrl } = await requestSession()

    // 2. Upload file: prioritize direct resumable upload (supports up to 2GB, 0 Vercel limits, no 8MB chunk error)
    let uploadedFile: { uri: string; name: string; mimeType: string } | null = null

    if (uploadUrl) {
      try {
        uploadedFile = await uploadToResumableUrl(uploadUrl, fileToUpload, (progress) => {
          onEvent?.({ type: 'progress', progress })
        })
      } catch (directErr: any) {
        console.warn('Direct resumable upload attempt failed; falling back to authenticated server proxy...', directErr)
        try {
          uploadedFile = await uploadViaServerProxy(uploadUrl, fileToUpload, (progress) => {
            onEvent?.({ type: 'progress', progress })
          })
        } catch (proxyErr) {
          // Retry with a fresh upload session if needed
          try {
            console.log('Retrying large file upload with fresh upload session...')
            const retrySession = await requestSession()
            keyIndex = retrySession.keyIndex
            host = retrySession.host
            uploadUrl = retrySession.uploadUrl

            if (uploadUrl) {
              uploadedFile = await uploadViaServerProxy(uploadUrl, fileToUpload, (progress) => {
                onEvent?.({ type: 'progress', progress })
              })
            } else {
              throw proxyErr || directErr
            }
          } catch (retryErr) {
            throw retryErr || proxyErr || directErr
          }
        }
      }
    } else {
      throw new Error('Upload session URL not available. Please try again.')
    }

    if (!uploadedFile?.uri) {
      throw new Error('Upload completed but did not return a valid file URI.')
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
        keyIndex: preferredKeyIndex ?? keyIndex,
        options
      })
    }
  } else {
    throw new Error('Please select an audio or video file to transcribe.')
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

  return await readTranscriptionStream(res.body, onEvent)
}
