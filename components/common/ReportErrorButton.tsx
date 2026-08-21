'use client'

import { useState } from 'react'
import { AlertTriangle, Check, Loader2, Send } from 'lucide-react'

type ReportErrorButtonProps = {
  errorMessage: string
  filename?: string
  fileSizeBytes?: number
  fileFormat?: string
  inputType?: 'file' | 'url' | 'batch'
  className?: string
}

export default function ReportErrorButton({
  errorMessage,
  filename,
  fileSizeBytes,
  fileFormat,
  inputType = 'file',
  className = ''
}: ReportErrorButtonProps) {
  const [status, setStatus] = useState<'idle' | 'reporting' | 'reported' | 'failed'>('idle')

  const handleReport = async (e: React.MouseEvent) => {
    e.stopPropagation()
    if (status === 'reporting' || status === 'reported') return

    setStatus('reporting')
    try {
      const res = await fetch('/api/report-error', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          errorMessage,
          filename,
          fileSizeBytes,
          fileFormat,
          inputType
        })
      })

      if (!res.ok) {
        throw new Error('Failed to send report')
      }

      setStatus('reported')
    } catch {
      setStatus('failed')
      setTimeout(() => setStatus('idle'), 3000)
    }
  }

  if (status === 'reported') {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
        <Check className="h-3.5 w-3.5" />
        Reported to Admin
      </span>
    )
  }

  return (
    <button
      type="button"
      onClick={handleReport}
      disabled={status === 'reporting'}
      title="Report this error directly to the administrator for a fast fix"
      className={`inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-xs font-semibold text-red-700 shadow-sm transition-all hover:bg-red-50 hover:border-red-300 disabled:opacity-60 ${className}`}
    >
      {status === 'reporting' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Reporting...</span>
        </>
      ) : status === 'failed' ? (
        <>
          <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
          <span className="text-amber-700">Retry Report</span>
        </>
      ) : (
        <>
          <Send className="h-3 w-3" />
          <span>Report to Admin</span>
        </>
      )}
    </button>
  )
}
