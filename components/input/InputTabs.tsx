'use client'

import { useTranscriptStore } from '@/store/transcriptStore'
import { useSession, signIn } from 'next-auth/react'
import { Files, Upload } from 'lucide-react'
import MediaUploadZone from './MediaUploadZone'
import BatchUploadZone from './BatchUploadZone'

export default function InputTabs() {
  const { inputMode, setInputMode } = useTranscriptStore()
  const { data: session } = useSession()

  return (
    <div className="relative mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/40">
      {!session && (
        <div className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white/90 p-6 text-center backdrop-blur-sm">
          <div className="mb-3 text-2xl font-semibold text-slate-950">Sign in to start transcribing</div>
          <p className="mb-6 max-w-md text-sm leading-6 text-slate-600">
            Your account keeps transcripts private and saves completed work to history.
          </p>
          <button
            type="button"
            onClick={() => signIn()}
            className="rounded-xl bg-blue-600 px-6 py-3 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-blue-700"
          >
            Sign in to continue
          </button>
        </div>
      )}

      <div className={`border-b border-slate-200 bg-slate-50/70 p-2 ${!session ? 'opacity-40' : ''}`}>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => session && setInputMode('upload')}
            disabled={!session}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              inputMode === 'upload'
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                : 'bg-transparent text-slate-600 hover:bg-white/50 hover:text-slate-900'
            }`}
          >
            <Upload className="h-4 w-4" />
            <span>Upload or link</span>
          </button>

          <button
            type="button"
            onClick={() => session && setInputMode('batch')}
            disabled={!session}
            className={`flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all ${
              inputMode === 'batch'
                ? 'bg-white text-blue-700 shadow-sm ring-1 ring-slate-200'
                : 'bg-transparent text-slate-600 hover:bg-white/50 hover:text-slate-900'
            }`}
          >
            <Files className="h-4 w-4" />
            <span>Multiple files</span>
          </button>
        </div>
      </div>

      <div className={`p-5 sm:p-7 ${!session ? 'opacity-30' : ''}`}>
        {inputMode === 'batch' ? <BatchUploadZone /> : <MediaUploadZone />}
      </div>
    </div>
  )
}
