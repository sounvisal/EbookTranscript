'use client'

import InputTabs from '@/components/input/InputTabs'
import ProcessingPanel from '@/components/processing/ProcessingPanel'
import TranscriptPanel from '@/components/transcript/TranscriptPanel'
import { useTranscriptStore } from '@/store/transcriptStore'
import { AnimatePresence, motion } from 'framer-motion'

export default function Home() {
  const status = useTranscriptStore((state) => state.status)

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-20 pt-12 sm:px-6 sm:pt-16">
      <header className="mx-auto mb-10 max-w-2xl text-center">
        <span className="mb-4 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          AI-powered transcription
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Turn audio into clear text
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
          Upload audio or video, paste a media link, or process several files together.
        </p>
      </header>

      <section id="workspace" className="w-full">
        <AnimatePresence mode="wait">
          {status === 'idle' || status === 'error' ? (
            <motion.div key="input" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}>
              <InputTabs />
            </motion.div>
          ) : status === 'uploading' || status === 'processing' ? (
            <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <ProcessingPanel />
            </motion.div>
          ) : status === 'complete' ? (
            <motion.div key="complete" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
              <TranscriptPanel />
            </motion.div>
          ) : null}
        </AnimatePresence>
      </section>
    </div>
  )
}
