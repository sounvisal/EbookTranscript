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
      {/* Apple Inset Segmented Switcher */}
      <div className="p-4 sm:p-5 border-b border-slate-200/50 dark:border-slate-800/80 bg-slate-50/50 dark:bg-slate-900/40">
        <div className="mx-auto max-w-md rounded-2xl bg-slate-200/60 dark:bg-slate-800/80 p-1.5 backdrop-blur-md ring-1 ring-black/5 dark:ring-white/5">
          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setInputMode('upload')}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                inputMode === 'upload'
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Upload className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              <span>Single File</span>
            </button>

            <button
              type="button"
              onClick={() => {
                if (!session) {
                  signIn()
                  return
                }
                setInputMode('batch')
              }}
              className={`flex items-center justify-center gap-2 rounded-xl py-2.5 px-4 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
                inputMode === 'batch'
                  ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs ring-1 ring-black/5 dark:ring-white/10'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              <Files className="h-4 w-4 text-purple-600 dark:text-purple-400" />
              <span>Batch Queue</span>
              {!session && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-300/80 dark:bg-slate-700/80 px-1.5 py-0.5 text-[9px] font-medium text-slate-700 dark:text-slate-300">
                  <Lock className="h-2.5 w-2.5" /> Sign in
                </span>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Inner Content Area */}
      <div className="p-5 sm:p-8">
        {inputMode === 'batch' ? <BatchUploadZone /> : <MediaUploadZone />}
      </div>
    </div>
  )
}
