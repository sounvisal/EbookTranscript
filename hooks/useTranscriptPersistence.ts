'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { TranscriptSegment } from '@/lib/transcript'

export type TranscriptSnapshot = { text: string; segments: TranscriptSegment[] }
export type SaveStatus = 'unsaved' | 'saving' | 'saved' | 'error'

/** Serialize writes so a slow older response can never overwrite a newer edit. */
export function useTranscriptPersistence(
  initiallySaved: boolean,
  persist: (snapshot: TranscriptSnapshot) => Promise<void>
) {
  const [status, setStatus] = useState<SaveStatus>(initiallySaved ? 'saved' : 'unsaved')
  const queue = useRef(Promise.resolve())
  const revision = useRef(0)
  const mounted = useRef(true)
  useEffect(() => {
    mounted.current = true
    return () => { mounted.current = false }
  }, [])

  const save = useCallback((snapshot: TranscriptSnapshot) => {
    const version = ++revision.current
    setStatus('saving')
    const operation = queue.current.then(() => persist(snapshot)).then(() => {
      if (mounted.current && version === revision.current) setStatus('saved')
    }).catch(() => {
      if (mounted.current && version === revision.current) setStatus('error')
    })
    queue.current = operation
    return operation
  }, [persist])

  return { status, save }
}
