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
 * Calls /api/transcribe in streaming mode and forwards real progress events
 * (upload -> processing -> incremental progress derived from Gemini's streamed
 * transcript) via onEvent. Resolves with the final transcript result.
 */
export async function transcribeWithProgress(
  input: { file?: File; url?: string },
  onEvent?: (event: TranscribeProgressEvent) => void
): Promise<TranscribeResult> {
  const requestInit: RequestInit = { method: 'POST' }

  if (input.file) {
    const formData = new FormData()
    formData.append('file', input.file)
    requestInit.headers = { 'x-stream': '1' }
    requestInit.body = formData
  } else if (input.url) {
    requestInit.headers = { 'x-stream': '1', 'Content-Type': 'application/json' }
    requestInit.body = JSON.stringify({ url: input.url })
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
    throw new Error(errorMsg || `Request failed (${res.status} ${res.statusText})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let result: TranscribeResult | null = null
  let errorMessage = ''

  const handleLine = (line: string) => {
    const trimmed = line.trim()
    if (!trimmed) return

    let event: StreamEvent
    try {
      event = JSON.parse(trimmed) as StreamEvent
    } catch {
      return
    }

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

  if (errorMessage) throw new Error(errorMessage)
  if (!result) throw new Error('Transcription failed')

  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      const bc = new BroadcastChannel('signal_admin_sync')
      bc.postMessage({ type: 'transcription_completed', time: Date.now() })
      bc.close()
    }
  } catch {}

  return result
}
