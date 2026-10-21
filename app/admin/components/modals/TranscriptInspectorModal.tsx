'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, X, Check, Copy } from 'lucide-react'
import type { AdminStats } from '../../types'

interface TranscriptInspectorModalProps {
  inspectingTranscript: AdminStats['recentTranscripts'][0] | null
  copiedTranscript: boolean
  onCopyTranscript: (text: string) => void
  onClose: () => void
}

export function TranscriptInspectorModal({
  inspectingTranscript,
  copiedTranscript,
  onCopyTranscript,
  onClose
}: TranscriptInspectorModalProps) {
  return (
    <AnimatePresence>
      {inspectingTranscript && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl overflow-hidden flex flex-col gap-4 max-h-[85vh]"
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 font-bold text-sm">
                <FileText className="h-5 w-5" />
                <span>Transcript Content Inspector</span>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Quality & Cadence Header */}
            {(() => {
              const durationMins = (inspectingTranscript.duration || 1) / 60
              const wpm = Math.round((inspectingTranscript.wordCount || 0) / Math.max(0.1, durationMins))
              const isNatural = wpm >= 110 && wpm <= 170

              return (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">LANGUAGE</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">{inspectingTranscript.language}</span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">WORDS</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {inspectingTranscript.wordCount.toLocaleString()}
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">DURATION</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {Math.floor(inspectingTranscript.duration / 60)}m {Math.round(inspectingTranscript.duration % 60)}s
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-slate-400 block text-[10px]">CADENCE</span>
                    <span
                      className={`font-bold ${isNatural ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600'}`}
                    >
                      {wpm} WPM {isNatural ? '🟢' : '🟡'}
                    </span>
                  </div>
                </div>
              )
            })()}

            {/* Transcript Text Box */}
            <div className="flex flex-col gap-1.5 flex-1 min-h-0">
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="font-medium text-slate-700 dark:text-slate-300 truncate max-w-sm">
                  {inspectingTranscript.filename}
                </span>
                <button
                  onClick={() => onCopyTranscript(inspectingTranscript.textExcerpt || '')}
                  className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-semibold hover:underline cursor-pointer"
                >
                  {copiedTranscript ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copiedTranscript ? 'Copied' : 'Copy Text'}</span>
                </button>
              </div>

              <div className="overflow-y-auto rounded-2xl bg-slate-50 dark:bg-slate-950 p-4 border border-slate-200/80 dark:border-slate-800 text-xs leading-relaxed text-slate-800 dark:text-slate-200 whitespace-pre-wrap font-sans max-h-72">
                {inspectingTranscript.textExcerpt || 'No transcript text stored for this record.'}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between text-[11px] text-slate-400 border-t border-slate-200 dark:border-slate-800 pt-3">
              <span>
                Created by:{' '}
                <span className="font-mono text-slate-600 dark:text-slate-300">{inspectingTranscript.userEmail}</span>
              </span>
              <button
                onClick={onClose}
                className="rounded-xl bg-slate-900 dark:bg-white px-4 py-1.5 text-xs font-bold text-white dark:text-slate-900 cursor-pointer"
              >
                Close
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
