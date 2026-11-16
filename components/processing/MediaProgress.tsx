'use client'

import { useEffect, useState } from 'react'
import { formatTimestamp } from '@/lib/transcript'
import type { TranscriptionActivity } from '@/lib/transcriptionActivity'

export default function MediaProgress({ activity, fileName }: { activity: TranscriptionActivity; fileName?: string }) {
  const { stage, uploadPercent, sections } = activity
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <div className="mt-3 space-y-1.5 text-xs text-slate-600 dark:text-slate-300">
      {stage === 'uploading' && uploadPercent !== undefined && (
        <div className="flex items-center gap-3">
          <progress aria-label={fileName ? `Upload ${fileName}` : 'File upload'} value={uploadPercent} max={100} className="h-2 w-full accent-blue-600" />
          <span className="font-medium tabular-nums">{uploadPercent}%</span>
        </div>
      )}
      {stage === 'processing' && sections && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-medium tabular-nums">
            <span>{sections.completed} of {sections.total} sections complete</span>
            <span>{Math.round((sections.completed / sections.total) * 100)}%</span>
          </div>
          <progress
            aria-label={fileName ? `Transcription sections for ${fileName}` : 'Transcription sections'}
            aria-valuetext={`${sections.completed} of ${sections.total} sections complete`}
            value={sections.completed}
            max={sections.total}
            className="block h-2 w-full accent-blue-600"
          />
          {sections.completed === sections.total && <p>Finalizing transcript…</p>}
        </>
      )}
      <p className="tabular-nums text-slate-500 dark:text-slate-400">Elapsed {formatTimestamp(elapsed)}</p>
    </div>
  )
}
