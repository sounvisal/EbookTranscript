'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { FileAudio } from 'lucide-react'
import { useTranscriptStore } from '@/store/transcriptStore'

const STATUS_MESSAGES = [
  'Preparing your media',
  'Listening for speech',
  'Building the transcript',
  'Detecting language and timestamps',
  'Finalizing the text'
]

export default function ProcessingPanel() {
  const [msgIndex, setMsgIndex] = useState(0)
  const progress = useTranscriptStore((state) => state.progress)

  useEffect(() => {
    const interval = setInterval(() => {
      setMsgIndex((current) => (current + 1) % STATUS_MESSAGES.length)
    }, 2400)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/40 sm:p-12">
      <div className="mx-auto max-w-xl text-center">
        <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50 text-blue-600">
          <FileAudio className="h-7 w-7" />
        </span>
        <h2 className="mt-6 text-2xl font-semibold text-slate-950">Transcribing your media</h2>
        <motion.p key={msgIndex} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-2 text-sm text-slate-500">
          {STATUS_MESSAGES[msgIndex]}…
        </motion.p>

        <div className="mt-9 flex items-center justify-between text-sm">
          <span className="font-medium text-slate-600">Progress</span>
          <span className="font-semibold tabular-nums text-blue-700">{Math.floor(progress)}%</span>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
          <motion.div className="h-full rounded-full bg-blue-600" animate={{ width: `${progress}%` }} transition={{ duration: 0.45, ease: 'linear' }} />
        </div>
        <p className="mt-6 text-xs leading-5 text-slate-400">You can keep this page open while the transcript is generated.</p>
      </div>
    </div>
  )
}
