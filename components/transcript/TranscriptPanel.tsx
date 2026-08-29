'use client'

import { downloadSrt, downloadTxt, downloadVtt } from '@/lib/download'
import {
  buildDisplaySegments,
  formatTimestamp,
  getPlainTranscriptText,
  stripTimestampMarkers
} from '@/lib/transcript'
import { useTranscriptStore } from '@/store/transcriptStore'
import { Check, Copy, Download, RefreshCw, Sparkles, FileText, CheckCircle2, PlayCircle } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReportErrorButton from '@/components/common/ReportErrorButton'
import AudioPlayer from '@/components/transcript/AudioPlayer'

export default function TranscriptPanel() {
  const { transcript, file, audioBlob, resetAll } = useTranscriptStore()
  const [viewMode, setViewMode] = useState<'paragraphs' | 'timestamps'>('paragraphs')
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const hasSaved = useRef(false)

  // Audio Playback & Synchronization State
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const [currentTime, setCurrentTime] = useState(0)
  const activeSegmentRef = useRef<HTMLDivElement | null>(null)

  const rawText = transcript?.text || 'Mock transcript content.'
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

  // Generate object URL for Audio Player
  useEffect(() => {
    let url: string | null = null
    if (file) {
      url = URL.createObjectURL(file)
      setAudioUrl(url)
    } else if (audioBlob) {
      url = URL.createObjectURL(audioBlob)
      setAudioUrl(url)
    }
    return () => {
      if (url) URL.revokeObjectURL(url)
    }
  }, [file, audioBlob])

  // Find active segment index
  const activeSegmentIndex = useMemo(() => {
    if (displaySegments.length === 0) return -1
    return displaySegments.findIndex((seg, i) => {
      const nextSeg = displaySegments[i + 1]
      const end = typeof seg.end === 'number' && seg.end > seg.start ? seg.end : (nextSeg ? nextSeg.start : seg.start + 5)
      return currentTime >= seg.start && currentTime < end
    })
  }, [currentTime, displaySegments])

  useEffect(() => {
    const autoSave = async () => {
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

  const handleSeekToSegment = (startTime: number) => {
    setCurrentTime(startTime)
  }

  return (
    <div className="apple-glass mx-auto w-full max-w-4xl overflow-hidden rounded-3xl transition-all duration-300">
      {/* Header Card */}
      <div className="border-b border-slate-200/60 dark:border-slate-800 bg-gradient-to-b from-white/90 to-slate-50/50 dark:from-slate-900/90 dark:to-slate-950/50 p-6 sm:flex sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Transcription Finished
            </span>
          </div>
          <h2 className="mt-2 truncate text-xl sm:text-2xl font-bold tracking-tight text-slate-950 dark:text-white" title={sourceName}>
            {sourceName}
          </h2>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
            <span className="rounded-md bg-white dark:bg-slate-800 px-2 py-0.5 ring-1 ring-slate-200/70 dark:ring-slate-700 font-mono">
              {wordCount.toLocaleString()} words
            </span>
            <span>·</span>
            <span>{text.length.toLocaleString()} characters</span>
            {transcript?.language && transcript.language !== 'auto' && (
              <>
                <span>·</span>
                <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {transcript.language}
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 sm:mt-0 flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 px-3.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200/80 dark:ring-slate-700 shadow-2xs">
            <span className={`h-1.5 w-1.5 rounded-full ${saving ? 'bg-amber-500 animate-pulse' : saved ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {saving ? 'Saving to cloud…' : saved ? 'Saved to history' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Embedded Synchronized Audio Player */}
      <div className="border-b border-slate-200/60 dark:border-slate-800 p-4 sm:px-7 bg-slate-50/40 dark:bg-slate-900/40">
        <AudioPlayer
          src={audioUrl}
          text={text}
          duration={transcript?.duration || 0}
          currentTime={currentTime}
          onSeek={setCurrentTime}
          onTimeUpdate={setCurrentTime}
        />
      </div>

      {/* Floating Apple Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200/50 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/70 p-3.5 sm:px-7">
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Segmented View Switcher */}
          <div className="flex rounded-xl bg-slate-200/60 dark:bg-slate-800 p-1 text-xs font-semibold ring-1 ring-black/5 dark:ring-white/5">
            <button
              onClick={() => setViewMode('paragraphs')}
              className={`rounded-lg px-3.5 py-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'paragraphs' ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
              }`}
            >
              Full Text
            </button>
            <button
              onClick={() => setViewMode('timestamps')}
              className={`rounded-lg px-3.5 py-1.5 transition-all duration-200 cursor-pointer ${
                viewMode === 'timestamps' ? 'bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-xs' : 'text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white'
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
          <div className="flex items-center rounded-xl bg-white/80 dark:bg-slate-800 p-0.5 ring-1 ring-slate-200/70 dark:ring-slate-700">
            <button
              onClick={() => downloadTxt(text, sourceName)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-3 w-3 text-slate-400" /> TXT
            </button>
            <button
              onClick={() => downloadSrt(text, sourceName, displaySegments)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-3 w-3 text-slate-400" /> SRT
            </button>
            <button
              onClick={() => downloadVtt(text, sourceName, displaySegments)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
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
            className="text-slate-600 dark:text-slate-300 border-slate-200/80 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl"
          />
          <button
            onClick={resetAll}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3.5 py-2 text-xs sm:text-sm font-medium text-slate-600 dark:text-slate-300 transition-all hover:bg-slate-50 dark:hover:bg-slate-800 hover:text-slate-950 dark:hover:text-white active:scale-95 cursor-pointer"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>New</span>
          </button>
        </div>
      </div>

      {/* Editorial Content Area with Live Segment Highlighting */}
      <div className="p-5 sm:p-8">
        <div
          className="max-h-[580px] overflow-y-auto pr-2 text-base leading-relaxed text-slate-800 dark:text-slate-200 outline-none"
          onCopy={handleTranscriptCopy}
        >
          {viewMode === 'paragraphs' ? (
            <div className="space-y-5 font-normal text-slate-900 dark:text-slate-100 leading-8">
              {text.split(/\n{2,}/).map((paragraph, pIdx) => (
                <p key={pIdx} className="leading-8 whitespace-pre-wrap selection:bg-blue-100 dark:selection:bg-blue-900">
                  {paragraph}
                </p>
              ))}
            </div>
          ) : (
            <div className="space-y-2">
              {displaySegments.map((segment, index) => {
                const isActive = index === activeSegmentIndex

                return (
                  <div
                    key={`${segment.start}-${index}`}
                    ref={isActive ? activeSegmentRef : null}
                    onClick={() => handleSeekToSegment(segment.start)}
                    className={`group grid grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[5rem_minmax(0,1fr)] gap-3 sm:gap-4 rounded-xl p-3 cursor-pointer transition-all duration-200 ${
                      isActive
                        ? 'bg-blue-50/90 dark:bg-blue-950/60 border-l-4 border-blue-600 shadow-xs ring-1 ring-blue-500/10'
                        : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-1 select-none pt-0.5">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums transition-colors ${
                          isActive
                            ? 'text-blue-600 dark:text-blue-400 font-extrabold'
                            : 'text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`}
                      >
                        {formatTimestamp(segment.start)}
                      </span>
                    </div>

                    <p
                      className={`whitespace-pre-wrap leading-relaxed transition-colors ${
                        isActive
                          ? 'font-medium text-blue-950 dark:text-blue-100'
                          : 'text-slate-800 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white'
                      }`}
                    >
                      {segment.text}
                    </p>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
