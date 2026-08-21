'use client'

import { downloadSrt, downloadTxt, downloadVtt } from '@/lib/download'
import {
  buildDisplaySegments,
  formatTimestamp,
  getPlainTranscriptText,
  stripTimestampMarkers
} from '@/lib/transcript'
import { useTranscriptStore } from '@/store/transcriptStore'
import { Check, Copy, Download, RefreshCw } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReportErrorButton from '@/components/common/ReportErrorButton'

export default function TranscriptPanel() {
  const { transcript, file, resetAll } = useTranscriptStore()
  const [viewMode, setViewMode] = useState<'paragraphs' | 'timestamps'>('paragraphs')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const hasSaved = useRef(false)

  const rawText = transcript?.text || 'Mock transcript content. In a full implementation, this text would be returned by the API.'
  const text = useMemo(
    () => getPlainTranscriptText(rawText, transcript?.segments),
    [rawText, transcript?.segments]
  )
  const displaySegments = useMemo(
    () => buildDisplaySegments(rawText, transcript?.segments, transcript?.duration),
    [rawText, transcript?.segments, transcript?.duration]
  )
  const sourceName = file ? file.name : (transcript?.source || 'Transcript')
  const wordCount = text.split(/\s+/).filter(Boolean).length

  useEffect(() => {
    const autoSave = async () => {
      // Prevent double saving and only save if there's an actual transcript.
      if (!transcript || hasSaved.current || saved || saving) return

      hasSaved.current = true
      setSaving(true)

      try {
        const payload = {
          text,
          source: transcript.source || (file ? 'file' : transcript.source === 'LIVE VOICE' ? 'live_voice' : 'voice_record'),
          filename: file ? file.name : undefined,
          duration: transcript.duration || 0,
          wordCount,
          language: transcript.language || 'auto'
        }

        const res = await fetch('/api/history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        })

        if (res.ok) {
          setSaved(true)
        } else {
          hasSaved.current = false
        }
      } catch (e) {
        console.error('Autosave failed:', e)
        hasSaved.current = false
      } finally {
        setSaving(false)
      }
    }

    autoSave()
  }, [transcript, file, saved, saving, text, wordCount])

  const handleCopy = () => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleTranscriptCopy = (event: React.ClipboardEvent<HTMLDivElement>) => {
    const selection = window.getSelection()?.toString()
    if (!selection) return

    event.clipboardData.setData('text/plain', stripTimestampMarkers(selection))
    event.preventDefault()
  }

  return (
    <div className="mx-auto w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/40">
      <div className="border-b border-slate-200 p-5 sm:flex sm:items-center sm:justify-between sm:p-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Transcript ready
            {transcript?.language && transcript.language !== 'auto' && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-blue-50 border border-blue-200 px-2.5 py-0.5 text-xs font-semibold text-blue-700">
                🌐 {transcript.language}
              </span>
            )}
          </div>
          <h2 className="mt-2 truncate text-xl font-semibold text-slate-950">{sourceName}</h2>
          <p className="mt-1 text-xs text-slate-500">{wordCount.toLocaleString()} words · {text.length.toLocaleString()} characters</p>
        </div>
        <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:mt-0">
          {saving ? 'Saving…' : saved ? 'Saved to history' : 'Ready'}
        </span>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/70 p-3 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-200/80 p-0.5 text-xs font-semibold">
            <button
              onClick={() => setViewMode('paragraphs')}
              className={`rounded-md px-3 py-1.5 transition-all ${
                viewMode === 'paragraphs' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Full Text
            </button>
            <button
              onClick={() => setViewMode('timestamps')}
              className={`rounded-md px-3 py-1.5 transition-all ${
                viewMode === 'timestamps' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Timestamps ({displaySegments.length})
            </button>
          </div>

          <button onClick={handleCopy} className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-semibold transition-colors ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied ? 'Copied' : 'Copy all'}
          </button>
          <button onClick={() => downloadTxt(text, sourceName)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> TXT
          </button>
          <button onClick={() => downloadSrt(text, sourceName, displaySegments)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> SRT
          </button>
          <button onClick={() => downloadVtt(text, sourceName, displaySegments)} className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> VTT
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ReportErrorButton
            errorMessage="User reported inaccurate transcript or quality issue"
            filename={sourceName}
            inputType="file"
            className="text-slate-600 border-slate-200 hover:bg-slate-100"
          />
          <button onClick={resetAll} className="flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs sm:text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-900">
            <RefreshCw className="h-4 w-4" /> New transcript
          </button>
        </div>
      </div>

      <div className="p-4 sm:p-7">
        <div className="max-h-[560px] overflow-y-auto pr-2 text-base leading-7 text-slate-800 outline-none" onCopy={handleTranscriptCopy}>
          {viewMode === 'paragraphs' ? (
            <div className="space-y-4 font-normal text-slate-900 leading-relaxed">
              {text.split(/\n{2,}/).map((paragraph, pIdx) => (
                <p key={pIdx} className="leading-relaxed whitespace-pre-wrap">{paragraph}</p>
              ))}
            </div>
          ) : (
            displaySegments.map((segment, index) => (
              <div key={`${segment.start}-${index}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-slate-50 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
                <span aria-hidden="true" className="select-none pt-0.5 text-right text-xs font-medium leading-7 tabular-nums text-slate-400">
                  {formatTimestamp(segment.start)}
                </span>
                <p className="whitespace-pre-wrap">{segment.text}</p>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
