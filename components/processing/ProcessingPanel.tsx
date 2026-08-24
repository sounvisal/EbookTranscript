'use client'

import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Sparkles, Brain, Cpu, CheckCircle } from 'lucide-react'
import { useTranscriptStore } from '@/store/transcriptStore'

const STATUS_STEPS = [
  { label: 'Ingesting media & extracting speech audio', detail: 'Audio spectrogram normalization' },
  { label: 'Neural speech-to-text analysis', detail: 'Khmer & multilingual language modeling' },
  { label: 'Timestamp segmenting & verbatim alignment', detail: 'Precision sentence boundary detection' },
  { label: 'Finalizing formatting & intelligence review', detail: 'High-accuracy output synthesis' }
]

export default function ProcessingPanel() {
  const [stepIndex, setStepIndex] = useState(0)
  const progress = useTranscriptStore((state) => state.progress)

  useEffect(() => {
    const interval = setInterval(() => {
      setStepIndex((current) => (current + 1) % STATUS_STEPS.length)
    }, 2800)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="apple-glass mx-auto w-full max-w-3xl overflow-hidden rounded-3xl p-8 sm:p-12 transition-all">
      <div className="mx-auto max-w-lg text-center">
        {/* Apple Intelligence Soundwave Halo */}
        <div className="relative mx-auto mb-6 flex h-24 w-24 items-center justify-center">
          {/* Animated pulsing soundwave rings */}
          <motion.span
            className="absolute inset-0 rounded-full bg-blue-500/20"
            animate={{ scale: [1, 1.35, 1], opacity: [0.6, 0, 0.6] }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
          <motion.span
            className="absolute inset-2 rounded-full bg-purple-500/20"
            animate={{ scale: [1, 1.25, 1], opacity: [0.5, 0.1, 0.5] }}
            transition={{ duration: 2, delay: 0.3, repeat: Infinity, ease: 'easeInOut' }}
          />
          <div className="relative flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/30">
            <Sparkles className="h-8 w-8 animate-pulse text-white" />
          </div>
        </div>

        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-950">
          Transcribing your media
        </h2>

        {/* Dynamic status phase */}
        <div className="mt-3 min-h-[48px]">
          <motion.p
            key={stepIndex}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            className="text-sm font-semibold text-blue-600"
          >
            {STATUS_STEPS[stepIndex].label}
          </motion.p>
          <p className="mt-0.5 text-xs text-slate-400">
            {STATUS_STEPS[stepIndex].detail}
          </p>
        </div>

        {/* Apple Shimmering Progress Bar */}
        <div className="mt-8">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-600">
            <span className="flex items-center gap-1.5">
              <Cpu className="h-3.5 w-3.5 text-blue-500" /> Speech Engine Active
            </span>
            <span className="font-mono text-sm font-bold text-blue-600">{Math.floor(progress)}%</span>
          </div>

          <div className="relative mt-3 h-3 overflow-hidden rounded-full bg-slate-200/70 p-0.5 ring-1 ring-black/5">
            <motion.div
              className="relative h-full rounded-full bg-gradient-to-r from-blue-500 via-indigo-500 to-blue-600 shadow-xs"
              animate={{ width: `${Math.max(5, progress)}%` }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              {/* Shimmer light bar */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent animate-shimmer" />
            </motion.div>
          </div>
        </div>

        <p className="mt-7 text-xs leading-relaxed text-slate-400">
          Large files and videos process smoothly in real time. Please keep this tab open.
        </p>
      </div>
    </div>
  )
}
