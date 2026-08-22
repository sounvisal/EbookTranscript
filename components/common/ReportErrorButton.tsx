'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Check,
  Loader2,
  Send,
  X,
  FileAudio,
  ChevronDown,
  ChevronUp,
  MessageSquare
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

type ReportErrorButtonProps = {
  errorMessage: string
  filename?: string
  fileSizeBytes?: number
  fileFormat?: string
  inputType?: 'file' | 'url' | 'batch'
  transcriptSnippet?: string
  detectedLanguage?: string
  className?: string
}

const QUICK_CATEGORIES = [
  '⚡ Transcript cut off / incomplete',
  '🌐 Wrong language detected',
  '🛑 Failed / stuck during processing',
  '🔤 Low accuracy / words skipped',
  '🔇 Audio had no spoken words',
  '⚙️ System or network error'
]

export default function ReportErrorButton({
  errorMessage,
  filename,
  fileSizeBytes,
  fileFormat,
  inputType = 'file',
  transcriptSnippet,
  detectedLanguage,
  className = ''
}: ReportErrorButtonProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [status, setStatus] = useState<'idle' | 'reporting' | 'reported' | 'failed'>('idle')
  const [selectedCategory, setSelectedCategory] = useState<string>('')
  const [userComment, setUserComment] = useState('')
  const [showTechnicalError, setShowTechnicalError] = useState(false)

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation()
    setIsOpen(true)
  }

  const handleClose = () => {
    if (status === 'reporting') return
    setIsOpen(false)
  }

  const handleSendReport = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (status === 'reporting') return

    setStatus('reporting')

    const combinedNote = [
      selectedCategory,
      userComment.trim()
    ].filter(Boolean).join(' — ')

    try {
      const res = await fetch('/api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorMessage: errorMessage || 'User reported issue',
          filename,
          fileSizeBytes,
          fileFormat: fileFormat || filename?.split('.').pop(),
          inputType,
          userComment: combinedNote || undefined,
          transcriptSnippet,
          detectedLanguage
        })
      })

      if (!res.ok) {
        throw new Error('Failed to send report')
      }

      setStatus('reported')
      setTimeout(() => {
        setIsOpen(false)
        setStatus('idle')
        setUserComment('')
        setSelectedCategory('')
      }, 2500)
    } catch {
      setStatus('failed')
      setTimeout(() => setStatus('idle'), 3500)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        title="Report this error directly to the administrator for a fast fix"
        className={`inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm transition-all hover:bg-red-50 hover:border-red-300 ${className}`}
      >
        <Send className="h-3 w-3 text-red-600" />
        <span>Report to Admin</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleClose}
              className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            />

            {/* Modal Dialog */}
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 10 }}
              transition={{ type: 'spring', duration: 0.3 }}
              className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl z-10"
            >
              {/* Close Button */}
              <button
                type="button"
                onClick={handleClose}
                className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition"
              >
                <X className="h-5 w-5" />
              </button>

              {status === 'reported' ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                    <Check className="h-7 w-7" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900">Report Sent to Admin</h3>
                  <p className="mt-2 text-sm text-slate-600 max-w-sm">
                    Thank you! Our engineering team received your report and the technical diagnostics to investigate immediately.
                  </p>
                </div>
              ) : (
                <form onSubmit={handleSendReport} className="flex flex-col gap-4">
                  {/* Header */}
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-100 text-red-600">
                        <AlertTriangle className="h-4 w-4" />
                      </span>
                      <h3 className="text-lg font-bold text-slate-900">Report Issue to Admin</h3>
                    </div>
                    <p className="mt-1.5 text-xs text-slate-500">
                      Send full details directly to the admin Telegram channel for prompt troubleshooting.
                    </p>
                  </div>

                  {/* Context Badge */}
                  {filename && (
                    <div className="flex items-center gap-2.5 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      <FileAudio className="h-4 w-4 text-blue-600 shrink-0" />
                      <span className="truncate font-medium">{filename}</span>
                      {fileSizeBytes && (
                        <span className="ml-auto text-slate-400 shrink-0 font-mono">
                          {(fileSizeBytes / 1024 / 1024).toFixed(2)} MB
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick issue categories */}
                  <div>
                    <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Select Issue Type
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {QUICK_CATEGORIES.map((cat) => {
                        const isSelected = selectedCategory === cat
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setSelectedCategory(isSelected ? '' : cat)}
                            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-left text-xs font-medium transition-all ${
                              isSelected
                                ? 'border-blue-500 bg-blue-50 text-blue-800 ring-1 ring-blue-500 shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span>{cat}</span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  {/* Custom user comment */}
                  <div>
                    <label className="mb-1.5 flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-slate-500">
                      <span>Additional Notes</span>
                      <span className="text-[11px] font-normal lowercase text-slate-400">(optional)</span>
                    </label>
                    <textarea
                      rows={2}
                      value={userComment}
                      onChange={(e) => setUserComment(e.target.value)}
                      placeholder="e.g., Audio was clear Khmer from 0:10 to 1:30 but transcript is blank..."
                      className="w-full rounded-xl border border-slate-200 p-3 text-xs leading-5 text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                    />
                  </div>

                  {/* Technical Error Details (Collapsible) */}
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                    <button
                      type="button"
                      onClick={() => setShowTechnicalError(!showTechnicalError)}
                      className="flex w-full items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900"
                    >
                      <span className="flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-slate-400" />
                        Technical Error Details
                      </span>
                      {showTechnicalError ? (
                        <ChevronUp className="h-3.5 w-3.5" />
                      ) : (
                        <ChevronDown className="h-3.5 w-3.5" />
                      )}
                    </button>
                    {showTechnicalError && (
                      <div className="mt-2.5 overflow-x-auto rounded-lg bg-slate-900 p-2.5 text-[11px] font-mono text-red-300 leading-4">
                        {errorMessage || 'Transcription failed without specific server message.'}
                      </div>
                    )}
                  </div>

                  {status === 'failed' && (
                    <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs text-red-700 border border-red-200">
                      <AlertTriangle className="h-4 w-4 shrink-0" />
                      <span>Could not send report. Please check your connection and retry.</span>
                    </div>
                  )}

                  {/* Actions */}
                  <div className="mt-2 flex items-center justify-end gap-2.5">
                    <button
                      type="button"
                      onClick={handleClose}
                      disabled={status === 'reporting'}
                      className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-800 transition"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={status === 'reporting'}
                      className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-sm transition hover:bg-red-700 disabled:opacity-50"
                    >
                      {status === 'reporting' ? (
                        <>
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          <span>Sending Report...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-3.5 w-3.5" />
                          <span>Submit Report to Admin</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              )}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  )
}
