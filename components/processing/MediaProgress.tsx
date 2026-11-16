'use client'

import { useEffect, useState } from 'react'
import { formatTimestamp } from '@/lib/transcript'
import { transcriptionStageLabels, type TranscriptionActivity } from '@/lib/transcriptionActivity'
import styles from './MediaProgress.module.css'

export default function MediaProgress({ activity, fileName }: { activity: TranscriptionActivity; fileName?: string }) {
  const { stage, uploadPercent, sections } = activity
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    const startedAt = Date.now()
    const timer = setInterval(() => setElapsed(Math.floor((Date.now() - startedAt) / 1000)), 1000)
    return () => clearInterval(timer)
  }, [])

  const isUploading = stage === 'uploading'
  const sectionCount = stage === 'processing' ? sections : undefined
  const sectionLabel = sectionCount && `${sectionCount.completed} of ${sectionCount.total} sections complete`
  const percent = sectionCount ? Math.round((sectionCount.completed / sectionCount.total) * 100)
    : isUploading ? uploadPercent : undefined
  const label = sectionCount ? 'Transcription sections' : isUploading ? 'File upload' : transcriptionStageLabels[stage]
  const elapsedLabel = `Elapsed ${formatTimestamp(elapsed)}`

  return (
    <div className="mt-4 space-y-2.5 text-xs tabular-nums text-slate-600 dark:text-slate-300">
      <div className="flex items-baseline justify-between gap-3">
        <span className={sectionLabel ? 'font-medium' : ''}>{sectionLabel || elapsedLabel}</span>
        {percent !== undefined && (
          <span className="shrink-0 font-semibold text-slate-950 dark:text-white">{percent}%</span>
        )}
      </div>
      <div
        role="progressbar"
        aria-label={fileName ? `${label} for ${fileName}` : label}
        aria-valuenow={percent}
        aria-valuetext={sectionLabel}
        className={styles.track}
      >
        <span aria-hidden="true" className={percent === undefined ? `${styles.fill} ${styles.indeterminate}` : styles.fill}
          style={percent === undefined ? undefined : { width: `${percent}%` }} />
      </div>
      {sectionCount && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 text-slate-600 dark:text-slate-400">
          <span>{elapsedLabel}</span>
          {sectionCount.completed === sectionCount.total && <span role="status">Finalizing transcript…</span>}
        </div>
      )}
    </div>
  )
}
