'use client'

import { useEffect, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import InputTabs from '@/components/input/InputTabs'
import ProcessingPanel from '@/components/processing/ProcessingPanel'
import TranscriptPanel from '@/components/transcript/TranscriptPanel'
import { useTranscriptStore } from '@/store/transcriptStore'
import { loadDemoSample } from '@/lib/demoSample'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Globe2,
  Zap,
  ShieldCheck,
  Bot
} from 'lucide-react'

function TranscribeContent() {
  const searchParams = useSearchParams()
  const status = useTranscriptStore((state) => state.status)

  // Auto-load demo if ?demo=1 query parameter is passed
  useEffect(() => {
    const isDemo = searchParams.get('demo')
    if (isDemo === '1' || isDemo === 'true') {
      loadDemoSample()
    }
  }, [searchParams])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10 space-y-8">
      {/* Top Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Home</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20">
              <Sparkles className="h-3 w-3" /> Studio
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Transcription Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Upload audio or video files, record live voice, or paste media links.
          </p>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <Globe2 className="h-3.5 w-3.5 text-blue-500" /> Khmer & English
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Up to 2GB
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Private
          </span>
        </div>
      </div>

      {/* Main Interactive Studio Stage */}
      <main className="w-full">
        <AnimatePresence mode="wait">
          {status === 'idle' || status === 'error' ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.99 }}
              transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <InputTabs />
            </motion.div>
          ) : status === 'uploading' || status === 'processing' ? (
            <motion.div
              key="processing"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.25 }}
            >
              <ProcessingPanel />
            </motion.div>
          ) : status === 'complete' ? (
            <motion.div
              key="complete"
              initial={{ opacity: 0, y: 10, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <TranscriptPanel />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </main>
    </div>
  )
}

export default function TranscribePage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-500">Loading Transcription Studio…</div>}>
      <TranscribeContent />
    </Suspense>
  )
}
