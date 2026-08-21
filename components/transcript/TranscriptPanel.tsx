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

export default function TranscriptPanel() {
  const { transcript, file, resetAll } = useTranscriptStore()
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
          </div>
          <h2 className="mt-2 truncate text-xl font-semibold text-slate-950">{sourceName}</h2>
          <p className="mt-1 text-xs text-slate-500">{wordCount.toLocaleString()} words · {text.length.toLocaleString()} characters</p>
        </div>
        <span className="mt-3 inline-flex rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600 sm:mt-0">
          {saving ? 'Saving…' : saved ? 'Saved to history' : 'Ready'}
        </span>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-slate-50/70 p-3 sm:px-6">
        <button onClick={handleCopy} className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-semibold transition-colors ${copied ? 'bg-emerald-100 text-emerald-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}>
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy all'}
        </button>
        <button onClick={() => downloadTxt(text, sourceName)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" /> TXT
        </button>
        <button onClick={() => downloadSrt(text, sourceName, displaySegments)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" /> SRT
        </button>
        <button onClick={() => downloadVtt(text, sourceName, displaySegments)} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          <Download className="h-4 w-4" /> VTT
        </button>
        <button onClick={resetAll} className="ml-auto flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-900">
          <RefreshCw className="h-4 w-4" /> New transcript
        </button>
      </div>

      <div className="p-4 sm:p-7">
        <div className="max-h-[560px] overflow-y-auto pr-2 text-base leading-7 text-slate-800 outline-none" onCopy={handleTranscriptCopy}>
          {displaySegments.map((segment, index) => (
            <div key={`${segment.start}-${index}`} className="grid grid-cols-[3.5rem_minmax(0,1fr)] gap-3 rounded-lg px-1 py-2 transition-colors hover:bg-slate-50 sm:grid-cols-[4.5rem_minmax(0,1fr)] sm:gap-4">
              <span aria-hidden="true" className="select-none pt-0.5 text-right text-xs font-medium leading-7 tabular-nums text-slate-400">
                {formatTimestamp(segment.start)}
              </span>
              <p className="whitespace-pre-wrap">{segment.text}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
