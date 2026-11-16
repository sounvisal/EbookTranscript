'use client'

import { useEffect, useState } from 'react'
import { Loader2 } from 'lucide-react'
import { formatTimestamp } from '@/lib/transcript'
import { transcriptionStageLabels } from '@/lib/transcriptionActivity'
import { useTranscriptStore } from '@/store/transcriptStore'

export default function ProcessingPanel() {
  const fileName = useTranscriptStore(state => state.file?.name)
  const { stage, uploadPercent, background } = useTranscriptStore(state => state.transcriptionActivity)
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section aria-label="Transcription progress" className="apple-glass mx-auto w-full max-w-2xl rounded-3xl p-5 sm:p-8">
      <div className="flex items-start gap-3">
        <Loader2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 motion-safe:animate-spin dark:text-blue-400" />
        <div className="min-w-0 flex-1">
          <h2 role="status" className="text-lg font-bold text-slate-950 dark:text-white">{transcriptionStageLabels[stage]}</h2>
          {fileName && <p className="break-words text-sm text-slate-600 dark:text-slate-300">{fileName}</p>}
        </div>
      </div>
      {stage === 'uploading' && uploadPercent !== undefined && (
        <div className="mt-4 flex items-center gap-3">
          <progress aria-label="File upload" value={uploadPercent} max={100} className="h-2 w-full accent-blue-600" />
          <span className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-300">{uploadPercent}%</span>
        </div>
      )}
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        {background ? 'This job can continue in the background. Reopen it from Recent jobs.' : 'Keep this tab open while the file is processed.'}
      </p>
      <p className="mt-1 text-xs tabular-nums text-slate-500 dark:text-slate-400">Elapsed {formatTimestamp(elapsed)}</p>
    </section>
  )
}
