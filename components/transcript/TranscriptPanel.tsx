'use client'

import { downloadSrt, downloadTxt, downloadVtt } from '@/lib/download'
import {
  buildDisplaySegments,
  formatTimestamp,
  getPlainTranscriptText,
  stripTimestampMarkers
} from '@/lib/transcript'
import { useTranscriptStore } from '@/store/transcriptStore'
import { Check, Copy, Download, RefreshCw, Sparkles, FileText, CheckCircle2 } from 'lucide-react'
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
    <div className="apple-glass mx-auto w-full max-w-4xl overflow-hidden rounded-3xl transition-all duration-300">
      {/* Header Card */}
      <div className="border-b border-slate-200/60 bg-gradient-to-b from-white/90 to-slate-50/50 p-6 sm:flex sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Transcription Finished
            </span>
          </div>
          <h2 className="mt-2 truncate text-xl sm:text-2xl font-bold tracking-tight text-slate-950" title={sourceName}>
            {sourceName}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500">
            <span className="rounded-md bg-white px-2 py-0.5 ring-1 ring-slate-200/70 font-mono">
              {wordCount.toLocaleString()} words
            </span>
            <span>·</span>
            <span>{text.length.toLocaleString()} characters</span>
            {transcript?.language && transcript.language !== 'auto' && (
              <>
                <span>·</span>
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700">
                  {transcript.language}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 sm:mt-0 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 px-3.5 py-1 text-xs font-medium text-slate-600 ring-1 ring-slate-200/80 shadow-2xs">
            <span className={`h-1.5 w-1.5 rounded-full ${saving ? 'bg-amber-500 animate-pulse' : saved ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {saving ? 'Saving to cloud…' : saved ? 'Saved to history' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Floating Apple Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/50 bg-slate-50/70 p-3.5 sm:px-7">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented View Switcher */}
          <div className="flex rounded-xl bg-slate-200/60 p-1 text-xs font-semibold ring-1 ring-black/5">
            <button
              onClick={() => setViewMode('paragraphs')}
              className={`rounded-lg px-3.5 py-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'paragraphs' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Full Text
            </button>
            <button
              onClick={() => setViewMode('timestamps')}
              className={`rounded-lg px-3.5 py-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'timestamps' ? 'bg-white text-slate-950 shadow-xs' : 'text-slate-600 hover:text-slate-950'
              }`}
            >
              Timestamps ({displaySegments.length})
            </button>
          </div>

          {/* Primary Copy Pill */}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1.5 rounded-xl px-4 py-2 text-xs sm:text-sm font-semibold transition-all duration-200 cursor-pointer ${
              copied
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'apple-btn-primary text-white'
            }`}
          >
            {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            <span>{copied ? 'Copied to Clipboard' : 'Copy All'}</span>
          </button>

          {/* Export Action Pills */}
          <div className="flex items-center rounded-xl bg-white/80 p-0.5 ring-1 ring-slate-200/70">
            <button
              onClick={() => downloadTxt(text, sourceName)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Download className="h-3 w-3 text-slate-400" /> TXT
            </button>
            <button
              onClick={() => downloadSrt(text, sourceName, displaySegments)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Download className="h-3 w-3 text-slate-400" /> SRT
            </button>
            <button
              onClick={() => downloadVtt(text, sourceName, displaySegments)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <Download className="h-3 w-3 text-slate-400" /> VTT
            </button>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <ReportErrorButton
            errorMessage="User reported inaccurate transcript or quality issue"
            filename={sourceName}
            inputType="file"
            transcriptSnippet={text.slice(0, 300)}
            detectedLanguage={transcript?.language}
            className="text-slate-600 border-slate-200/80 hover:bg-slate-100 rounded-xl"
          />
          <button
            onClick={resetAll}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-600 transition-all hover:bg-slate-50 hover:text-slate-950 active:scale-95 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Editorial Content Area */}
      <div className="p-5 sm:p-8">
        <div
          className="max-h-[580px] overflow-y-auto pr-2 text-base leading-relaxed text-slate-800 outline-none"
          onCopy={handleTranscriptCopy}
        >
          {viewMode === 'paragraphs' ? (
            <div className="space-y-5 font-normal text-slate-900 leading-8">
              {text.split(/\n{2,}/).map((paragraph, pIdx) => (
                <p key={pIdx} className="leading-8 whitespace-pre-wrap selection:bg-blue-100">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-1.5">
              {displaySegments.map((segment, index) => (
                <div
                  key={`${segment.start}-${index}`}
                  className="group grid grid-cols-[4rem_minmax(0,1fr)] gap-3 rounded-xl p-2.5 transition-all duration-150 hover:bg-blue-50/40 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4"
                >
                  <span
                    aria-hidden="true"
                    className="select-none pt-0.5 text-right font-mono text-xs font-semibold tabular-nums text-slate-400 group-hover:text-blue-600 transition-colors"
                  >
                    {formatTimestamp(segment.start)}
                  </span>
                  <p className="whitespace-pre-wrap leading-relaxed text-slate-800 group-hover:text-slate-950">
                    {segment.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
