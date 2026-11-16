'use client'

import { Loader2 } from 'lucide-react'
import { transcriptionStageLabels } from '@/lib/transcriptionActivity'
import { useTranscriptStore } from '@/store/transcriptStore'
import MediaProgress from './MediaProgress'

export default function ProcessingPanel() {
  const fileName = useTranscriptStore(state => state.file?.name)
  const activity = useTranscriptStore(state => state.transcriptionActivity)
  const { stage, background } = activity

  return (
    <section aria-label="Transcription progress" className="apple-glass mx-auto w-full max-w-2xl rounded-3xl p-5 sm:p-8">
      <div className="flex items-start gap-3">
        <Loader2 aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600 motion-safe:animate-spin dark:text-blue-400" />
        <div className="min-w-0 flex-1">
          <h2 role="status" className="text-lg font-bold text-slate-950 dark:text-white">{transcriptionStageLabels[stage]}</h2>
          {fileName && <p className="break-words text-sm text-slate-600 dark:text-slate-300">{fileName}</p>}
        </div>
      </div>
      <MediaProgress activity={activity} />
      <p className="mt-4 text-sm text-slate-600 dark:text-slate-300">
        {background ? 'This job can continue in the background. Reopen it from Recent jobs.' : 'Keep this tab open while the file is processed.'}
      </p>
    </section>
  )
}
