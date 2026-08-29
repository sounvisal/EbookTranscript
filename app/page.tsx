'use client'

import InputTabs from '@/components/input/InputTabs'
import ProcessingPanel from '@/components/processing/ProcessingPanel'
import TranscriptPanel from '@/components/transcript/TranscriptPanel'
import { useTranscriptStore } from '@/store/transcriptStore'
import { AnimatePresence, motion } from 'framer-motion'
import { Sparkles, Globe2, Zap, ShieldCheck } from 'lucide-react'

export default function Home() {
  const status = useTranscriptStore((state) => state.status)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14">
      {/* Hero Header with Apple HIG Aesthetic */}
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 dark:border-blue-900/60 dark:bg-blue-950/40 px-3.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 shadow-xs backdrop-blur-md"
        >
          <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />
          <span>Next-Gen Audio & Video Intelligence</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-5xl sm:leading-[1.15]"
        >
          Turn speech into clear, verbatim text.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-4 text-base leading-relaxed text-slate-600 dark:text-slate-400 sm:text-lg"
        >
          Upload audio, video, or paste a link. Powered by advanced multilingual AI with automatic language detection & timestamping.
        </motion.p>

        {/* Feature Badges */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2.5 sm:gap-4 text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 dark:bg-slate-900/80 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800">
            <Globe2 className="h-3.5 w-3.5 text-slate-500 dark:text-slate-400" /> Khmer & English & 50+ Languages
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 dark:bg-slate-900/80 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Up to 2GB Direct Upload
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/80 dark:bg-slate-900/80 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Private & Secure
          </span>
        </motion.div>
      </header>

      {/* Main Interactive Workspace */}
      <section id="workspace" className="w-full">
        <AnimatePresence mode="wait">
          {status === 'idle' || status === 'error' ? (
            <motion.div
              key="input"
              initial={{ opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -12, scale: 0.99 }}
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
              initial={{ opacity: 0, y: 12, scale: 0.99 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              <TranscriptPanel />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  )
}
