'use client'

import { transcriptionStageLabels } from '@/lib/transcriptionActivity'
import { useTranscriptStore } from '@/store/transcriptStore'
import MediaProgress from './MediaProgress'

export default function ProcessingPanel() {
  const fileName = useTranscriptStore(state => state.file?.name)
  const activity = useTranscriptStore(state => state.transcriptionActivity)
  const { stage, background } = activity

  return (
    <section aria-label="Transcription progress" className="apple-glass mx-auto w-full max-w-xl rounded-3xl p-5 sm:p-7">
      <h2 role="status" className="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">{transcriptionStageLabels[stage]}</h2>
      {fileName && <p className="mt-0.5 break-words text-sm text-slate-600 dark:text-slate-300">{fileName}</p>}
      <MediaProgress activity={activity} />
      <p className="mt-4 border-t border-slate-200/70 pt-3 text-xs leading-relaxed text-slate-600 dark:border-white/10 dark:text-slate-300">
        {background ? 'This job can continue in the background. Reopen it from Recent jobs.' : 'Keep this tab open while the file is processed.'}
      </p>
    </section>
  )
}
