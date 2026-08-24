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
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/70 p-6 text-center backdrop-blur-xl">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-blue-50 to-blue-100/70 text-blue-600 shadow-xs ring-1 ring-blue-500/15">
            <Lock className="h-6 w-6" strokeWidth={2} />
          </div>
          <h2 className="mb-2 text-2xl font-bold tracking-tight text-slate-950">Sign in to start transcribing</h2>
          <p className="mb-6 max-w-sm text-sm leading-relaxed text-slate-600">
            Keep your transcripts private, securely stored, and synchronized across devices.
          </p>
          <button
            type="button"
            onClick={() => signIn()}
            className="apple-btn-primary flex items-center gap-2 rounded-full px-6 py-3 text-sm font-semibold text-white transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            <span>Sign in with Google</span>
          </button>
        </div>
      )}

      {/* Apple Inset Segmented Switcher */}
      <div className={`p-4 sm:p-5 border-b border-slate-200/50 bg-slate-50/50 ${!session ? 'opacity-40' : ''}`}>
        <div className="mx-auto max-w-md rounded-2xl bg-slate-200/60 p-1.5 backdrop-blur-md ring-1 ring-black/5">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => session && setInputMode('upload')}
              disabled={!session}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                inputMode === 'upload'
                  ? 'bg-white text-slate-950 shadow-xs ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Upload className="h-4 w-4 text-blue-600" />
              <span>Single File / Link</span>
            </button>

            <button
              type="button"
              onClick={() => session && setInputMode('batch')}
              disabled={!session}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs sm:text-sm font-semibold transition-all duration-200 ${
                inputMode === 'batch'
                  ? 'bg-white text-slate-950 shadow-xs ring-1 ring-black/5'
                  : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              <Files className="h-4 w-4 text-purple-600" />
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
