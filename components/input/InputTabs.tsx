'use client'

import { useTranscriptStore } from '@/store/transcriptStore'
import { useSession, signIn } from 'next-auth/react'
import { Files, Upload, Sparkles, Lock } from 'lucide-react'
import MediaUploadZone from './MediaUploadZone'
import BatchUploadZone from './BatchUploadZone'

export default function InputTabs() {
  const { inputMode, setInputMode } = useTranscriptStore()
  const { data: session } = useSession()

  return (
    <div className="apple-glass relative mx-auto w-full max-w-4xl overflow-hidden rounded-3xl transition-all duration-300">
      {/* Auth overlay with Apple frosted blur */}
      {!session && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/75 dark:bg-slate-950/80 p-6 text-center backdrop-blur-xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/70 dark:from-blue-950/80 dark:to-blue-900/40 text-blue-600 dark:text-blue-400 shadow-xs ring-1 ring-blue-500/15 dark:ring-blue-400/20">
            <Lock className="h-6 w-6" strokeWidth={2} />
          </div>
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-slate-950 dark:text-white">Sign in to start transcribing</h2>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-slate-600 dark:text-slate-400">
            Keep your transcripts private, securely stored, and synchronized across devices.
          </p>
          <button
            type="button"
            onClick={() => signIn()}
            className="apple-btn-primary flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Sign in to Signal</span>
          </button>
        </div>
      )}

      {/* Apple Inset Segmented Switcher */}
      <div className={`p-4 sm:p-5 border-b border-slate-200/50 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40 ${!session ? 'opacity-40' : ''}`}>
        <div className="mx-auto max-w-md rounded-2xl bg-slate-200/60 dark:bg-slate-800/80 p-1.5 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/5">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => session && setInputMode('upload')}
              disabled={!session}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                inputMode === 'upload'
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Upload className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Single File / Link</span>
            </button>

            <button
              type="button"
              onClick={() => session && setInputMode('batch')}
              disabled={!session}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                inputMode === 'batch'
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Files className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span>Batch Queue</span>
            </button>
          </div>
        </div>
      </div>

      {/* Inner Content Area */}
      <div className={`p-5 sm:p-8 ${!session ? 'opacity-30' : ''}`}>
        {inputMode === 'batch' ? <BatchUploadZone /> : <MediaUploadZone />}
      </div>
    </div>
  )
}
