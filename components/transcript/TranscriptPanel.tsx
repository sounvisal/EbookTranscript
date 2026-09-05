'use client'

import { downloadSrt, downloadTxt, downloadVtt } from '@/lib/download'
import {
  buildDisplaySegments,
  formatTimestamp,
  getPlainTranscriptText,
  stripTimestampMarkers,
  type TranscriptSegment
} from '@/lib/transcript'
import { useTranscriptStore } from '@/store/transcriptStore'
import {
  Check,
  Copy,
  Download,
  RefreshCw,
  Sparkles,
  FileText,
  CheckCircle2,
  Headphones,
  Wand2,
  User,
  Users,
  Pencil,
  X,
  Edit3,
  Loader2
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import ReportErrorButton from '@/components/common/ReportErrorButton'
import AudioPlayer from '@/components/transcript/AudioPlayer'

const SPEAKER_REGEX = /^(?:\[?(?:Speaker\s*[A-Za-z0-9]+|Person\s*[A-Za-z0-9]+|Host|Guest|Interviewer|Interviewee|អ្នកនិយាយ\s*[០-៩0-9]+)\]?)\s*[:：]\s*/i

function extractSpeaker(rawText: string): { speaker: string | null; body: string } {
  const match = rawText.match(SPEAKER_REGEX)
  if (match) {
    const rawSpeaker = match[0]
      .replace(/[:：]\s*$/, '')
      .replace(/^[\[\(]\s*|\s*[\]\)]$/g, '')
      .trim()
    return {
      speaker: rawSpeaker,
      body: rawText.slice(match[0].length).trim()
    }
  }
  return {
    speaker: null,
    body: rawText
  }
}

function getSpeakerStyle(speaker: string) {
  const normalized = speaker.toLowerCase().trim()
  if (normalized.includes('1') || normalized.includes('a') || normalized.includes('host') || normalized.includes('១')) {
    return {
      badge: 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200/80 dark:border-indigo-800 ring-indigo-500/10',
      dot: 'bg-indigo-500',
      accent: 'border-l-indigo-500',
      bgActive: 'bg-indigo-50/90 dark:bg-indigo-950/50'
    }
  }
  if (normalized.includes('2') || normalized.includes('b') || normalized.includes('guest') || normalized.includes('២')) {
    return {
      badge: 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200/80 dark:border-emerald-800 ring-emerald-500/10',
      dot: 'bg-emerald-500',
      accent: 'border-l-emerald-500',
      bgActive: 'bg-emerald-50/90 dark:bg-emerald-950/50'
    }
  }
  if (normalized.includes('3') || normalized.includes('c') || normalized.includes('៣')) {
    return {
      badge: 'bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/80 dark:border-amber-800 ring-amber-500/10',
      dot: 'bg-amber-500',
      accent: 'border-l-amber-500',
      bgActive: 'bg-amber-50/90 dark:bg-amber-950/50'
    }
  }
  if (normalized.includes('4') || normalized.includes('d') || normalized.includes('៤')) {
    return {
      badge: 'bg-rose-50 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300 border-rose-200/80 dark:border-rose-800 ring-rose-500/10',
      dot: 'bg-rose-500',
      accent: 'border-l-rose-500',
      bgActive: 'bg-rose-50/90 dark:bg-rose-950/50'
    }
  }
  return {
    badge: 'bg-purple-50 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300 border-purple-200/80 dark:border-purple-800 ring-purple-500/10',
    dot: 'bg-purple-500',
    accent: 'border-l-purple-500',
    bgActive: 'bg-purple-50/90 dark:bg-purple-950/50'
  }
}

export default function TranscriptPanel() {
  const { transcript, file, audioBlob, audioUrl: storeAudioUrl, customAudioUrl, resetAll, updateTranscriptContent } = useTranscriptStore()
  const [viewMode, setViewMode] = useState<'paragraphs' | 'timestamps'>('timestamps')
  const [wordSyncEnabled, setWordSyncEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const hasSaved = useRef(false)

  // In-line editing state
  const [editingSegmentIdx, setEditingSegmentIdx] = useState<number | null>(null)
  const [editingParagraphIdx, setEditingParagraphIdx] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<string>('')
  const [isPatchingHistory, setIsPatchingHistory] = useState<boolean>(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)

  // Audio Playback & Synchronization State
  const [currentTime, setCurrentTime] = useState(0)
  const activeWordRef = useRef<HTMLSpanElement | null>(null)

  const rawText = transcript?.text || 'Mock transcript content.'
  const baseText = useMemo(
    () => getPlainTranscriptText(rawText, transcript?.segments),
    [rawText, transcript?.segments]
  )
  const initialSegments = useMemo(
    () => buildDisplaySegments(rawText, transcript?.segments, transcript?.duration),
    [rawText, transcript?.segments, transcript?.duration]
  )

  // Live mutable segments & text for in-line edits
  const [liveSegments, setLiveSegments] = useState<TranscriptSegment[]>(initialSegments)
  const [liveText, setLiveText] = useState<string>(baseText)

  // Synchronize live state when the underlying transcript / segments change externally
  useEffect(() => {
    setLiveSegments(initialSegments)
    setLiveText(baseText)
  }, [initialSegments, baseText])

  const sourceName = file ? file.name : (transcript?.source || 'Transcript')
  const wordCount = liveText.split(/\s+/).filter(Boolean).length

  // Paragraphs for Full Text view
  const paragraphs = useMemo(() => {
    return liveText.split(/\n{2,}/).filter(Boolean)
  }, [liveText])

  // Detect distinct speakers across all segments
  const detectedSpeakers = useMemo(() => {
    const speakers = new Set<string>()
    liveSegments.forEach((seg) => {
      const { speaker } = extractSpeaker(seg.text)
      if (speaker) speakers.add(speaker)
    })
    return Array.from(speakers)
  }, [liveSegments])

  // Resolve the active audio source directly from the uploaded file, audioBlob, or store
  const audioUrl = useMemo(() => {
    if (storeAudioUrl) return storeAudioUrl
    if (customAudioUrl) return customAudioUrl
    if (file) {
      try {
        return URL.createObjectURL(file)
      } catch {
        return null
      }
    }
    if (audioBlob) {
      try {
        return URL.createObjectURL(audioBlob)
      } catch {
        return null
      }
    }
    return null
  }, [storeAudioUrl, customAudioUrl, file, audioBlob])

  // Find active segment index
  const activeSegmentIndex = useMemo(() => {
    if (liveSegments.length === 0) return -1
    return liveSegments.findIndex((seg, i) => {
      const nextSeg = liveSegments[i + 1]
      const end = typeof seg.end === 'number' && seg.end > seg.start ? seg.end : (nextSeg ? nextSeg.start : seg.start + 5)
      return currentTime >= seg.start && currentTime < end
    })
  }, [currentTime, liveSegments])

  // Auto-scroll active word into view smoothly
  useEffect(() => {
    if (activeWordRef.current) {
      activeWordRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest'
      })
    }
  }, [currentTime])

  // Check if transcript was loaded from history or was already saved
  const isAlreadySaved = Boolean(transcript?.alreadySaved || transcript?.id)

  useEffect(() => {
    // If this transcript is already saved in history, do not save it again!
    if (isAlreadySaved) {
      setSaved(true)
      hasSaved.current = true
      return
    }

    const autoSave = async () => {
      if (!transcript || hasSaved.current || saved || saving || isAlreadySaved) return

      hasSaved.current = true
      setSaving(true)

      try {
        const payload = {
          text: liveText,
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
          const data = await res.json().catch(() => null)
          if (data?.id && transcript) {
            transcript.id = data.id
            transcript.alreadySaved = true
          }
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
  }, [transcript, file, saved, saving, liveText, wordCount, isAlreadySaved])

  const handleCopy = () => {
    navigator.clipboard.writeText(liveText)
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

  // In-line Edit Handlers
  const handleStartEditSegment = (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingParagraphIdx(null)
    setEditingSegmentIdx(idx)
    setEditDraft(liveSegments[idx]?.text || '')
  }

  const handleStartEditParagraph = (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingSegmentIdx(null)
    setEditingParagraphIdx(idx)
    setEditDraft(paragraphs[idx] || '')
  }

  const handleCancelEdit = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    setEditingSegmentIdx(null)
    setEditingParagraphIdx(null)
    setEditDraft('')
  }

  const persistToHistory = async (newText: string) => {
    const transcriptId = transcript?.id
    if (!transcriptId) {
      setSaveSuccessMessage('Edited & synced')
      setTimeout(() => setSaveSuccessMessage(null), 2500)
      return
    }

    setIsPatchingHistory(true)
    try {
      const res = await fetch('/api/history', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transcriptId, text: newText })
      })
      if (res.ok) {
        setSaveSuccessMessage('Saved to history ✓')
      } else {
        setSaveSuccessMessage('Edited locally')
      }
    } catch (err) {
      console.error('Failed to sync edit to history:', err)
      setSaveSuccessMessage('Edited locally')
    } finally {
      setIsPatchingHistory(false)
      setTimeout(() => setSaveSuccessMessage(null), 2500)
    }
  }

  const handleSaveSegment = async (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const trimmed = editDraft.trim()
    if (!trimmed) {
      handleCancelEdit()
      return
    }

    const updatedSegments = liveSegments.map((seg, i) =>
      i === idx ? { ...seg, text: trimmed } : seg
    )
    const updatedText = updatedSegments.map((s) => s.text).join('\n\n')

    setLiveSegments(updatedSegments)
    setLiveText(updatedText)
    setEditingSegmentIdx(null)
    setEditDraft('')
    updateTranscriptContent(updatedText, updatedSegments)

    await persistToHistory(updatedText)
  }

  const handleSaveParagraph = async (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const trimmed = editDraft.trim()
    if (!trimmed) {
      handleCancelEdit()
      return
    }

    const updatedParagraphs = [...paragraphs]
    updatedParagraphs[idx] = trimmed
    const updatedText = updatedParagraphs.join('\n\n')

    setLiveText(updatedText)
    setEditingParagraphIdx(null)
    setEditDraft('')
    updateTranscriptContent(updatedText, liveSegments)

    await persistToHistory(updatedText)
  }

  const handleKeyDown = (
    e: React.KeyboardEvent<HTMLTextAreaElement>,
    onSave: () => void
  ) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      onSave()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      handleCancelEdit()
    }
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
            <span className="rounded-md bg-white dark:bg-slate-800 px-2 py-0.5 ring-1 ring-slate-200/70 dark:ring-slate-700 font-mono text-slate-700 dark:text-slate-300">
              {wordCount.toLocaleString()} words
            </span>
            <span>·</span>
            <span>{liveText.length.toLocaleString()} characters</span>
            {transcript?.language && transcript.language !== 'auto' && (
              <>
                <span>·</span>
                <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300">
                  {transcript.language}
                </span>
              </>
            )}
            {detectedSpeakers.length > 0 && (
              <>
                <span>·</span>
                <span className="rounded-full bg-purple-50 dark:bg-purple-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-purple-700 dark:text-purple-300 ring-1 ring-purple-500/20 flex items-center gap-1">
                  <Users className="h-3 w-3" />
                  {detectedSpeakers.length} {detectedSpeakers.length === 1 ? 'Speaker' : 'Speakers'} Diarized
                </span>
              </>
            )}
          </div>
        </div>

        <div className="mt-4 sm:mt-0 flex items-center gap-2">
          {isPatchingHistory && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20">
              <Loader2 className="h-3 w-3 animate-spin text-blue-600" />
              Syncing edits…
            </span>
          )}
          {saveSuccessMessage && !isPatchingHistory && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20 animate-fade-in">
              <Check className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              {saveSuccessMessage}
            </span>
          )}
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 px-3.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200/80 dark:ring-slate-700 shadow-2xs">
            <span className={`h-1.5 w-1.5 rounded-full ${saving ? 'bg-amber-500 animate-pulse' : (saved || isAlreadySaved) ? 'bg-emerald-500' : 'bg-slate-400'}`} />
            {saving ? 'Saving to cloud…' : (saved || isAlreadySaved) ? 'Saved to history' : 'Ready'}
          </span>
        </div>
      </div>

      {/* Embedded Synchronized Audio Player */}
      <div className="border-b border-slate-200/60 dark:border-slate-800 p-4 sm:px-7 bg-slate-50/40 dark:bg-slate-900/40">
        <AudioPlayer
          src={audioUrl}
          text={liveText}
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
              Karaoke Sync ({liveSegments.length})
            </button>
          </div>

          {/* Edit Hint Tag */}
          <span className="hidden lg:inline-flex items-center gap-1 text-[11px] text-slate-400 dark:text-slate-500 font-medium">
            <Edit3 className="h-3 w-3 text-slate-400" /> Click ✎ or double-click to edit
          </span>

          {/* Karaoke Word Marker Indicator */}
          <button
            onClick={() => setWordSyncEnabled(!wordSyncEnabled)}
            className={`hidden sm:flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
              wordSyncEnabled
                ? 'border-blue-300 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/60 text-blue-700 dark:text-blue-300 shadow-2xs'
                : 'border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900 text-slate-500'
            }`}
            title="Toggle word-by-word active tracking"
          >
            <Wand2 className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>Word Tracking: {wordSyncEnabled ? 'ON' : 'OFF'}</span>
          </button>

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
            <span>{copied ? 'Copied' : 'Copy All'}</span>
          </button>

          {/* Export Action Pills */}
          <div className="flex items-center rounded-xl bg-white/80 dark:bg-slate-800 p-0.5 ring-1 ring-slate-200/70 dark:ring-slate-700">
            <button
              onClick={() => downloadTxt(liveText, sourceName)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-3 w-3 text-slate-400" /> TXT
            </button>
            <button
              onClick={() => downloadSrt(liveText, sourceName, liveSegments)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            >
              <Download className="h-3 w-3 text-slate-400" /> SRT
            </button>
            <button
              onClick={() => downloadVtt(liveText, sourceName, liveSegments)}
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
            transcriptSnippet={liveText.slice(0, 300)}
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

      {/* Editorial Content Area with Word-by-Word Karaoke Highlighting & In-Line Editing */}
      <div className="p-5 sm:p-8">
        <div
          className="max-h-[580px] overflow-y-auto pr-2 text-base leading-relaxed text-slate-800 dark:text-slate-200 outline-none"
          onCopy={handleTranscriptCopy}
        >
          {viewMode === 'paragraphs' ? (
            <div className="space-y-6 font-normal text-slate-900 dark:text-slate-100 leading-8">
              {paragraphs.map((paragraph, pIdx) => {
                const isEditingThisPara = editingParagraphIdx === pIdx
                const { speaker, body: paraBody } = extractSpeaker(paragraph)
                const speakerStyle = speaker ? getSpeakerStyle(speaker) : null

                if (isEditingThisPara) {
                  return (
                    <div
                      key={pIdx}
                      className="w-full space-y-2.5 rounded-2xl border border-blue-400/80 dark:border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/40 p-4 shadow-sm ring-2 ring-blue-500/20"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 font-medium">
                        <span className="flex items-center gap-1 font-semibold">
                          <Edit3 className="h-3.5 w-3.5" /> Edit Paragraph #{pIdx + 1}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                          Enter to save · Shift+Enter for newline · Esc to cancel
                        </span>
                      </div>
                      <textarea
                        autoFocus
                        rows={Math.max(3, Math.min(8, Math.ceil(editDraft.length / 70)))}
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        onKeyDown={(e) => handleKeyDown(e, () => handleSaveParagraph(pIdx))}
                        className="w-full resize-y rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-sm sm:text-base font-normal text-slate-900 dark:text-white leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                        placeholder="Type corrected paragraph or speaker content..."
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleCancelEdit}
                          className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3.5 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                        >
                          <X className="h-3.5 w-3.5" /> Cancel
                        </button>
                        <button
                          type="button"
                          onClick={(e) => handleSaveParagraph(pIdx, e)}
                          className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 cursor-pointer transition-colors"
                        >
                          <Check className="h-3.5 w-3.5" /> Save Changes
                        </button>
                      </div>
                    </div>
                  )
                }

                return (
                  <div
                    key={pIdx}
                    onDoubleClick={(e) => handleStartEditParagraph(pIdx, e)}
                    className="group relative space-y-1.5 rounded-2xl p-3.5 -mx-3.5 transition-all hover:bg-slate-100/50 dark:hover:bg-slate-800/30"
                    title="Double-click to edit paragraph"
                  >
                    <div className="flex items-center justify-between">
                      {speaker ? (
                        <div className="flex items-center gap-1.5">
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide shadow-2xs ${speakerStyle?.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${speakerStyle?.dot}`} />
                            <User className="h-3 w-3" />
                            <span>{speaker}</span>
                          </span>
                        </div>
                      ) : <span />}
                      <button
                        type="button"
                        onClick={(e) => handleStartEditParagraph(pIdx, e)}
                        className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                        title="Edit paragraph"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        <span className="text-[11px]">Edit</span>
                      </button>
                    </div>
                    <p className="leading-8 whitespace-pre-wrap selection:bg-blue-100 dark:selection:bg-blue-900">
                      {speaker ? paraBody : paragraph}
                    </p>
                  </div>
                )
              })}
            </div>
          ) : (
            <div className="space-y-2.5">
              {liveSegments.map((segment, segIdx) => {
                const isSegmentActive = segIdx === activeSegmentIndex
                const isEditingThisSeg = editingSegmentIdx === segIdx
                const { speaker, body: segmentBody } = extractSpeaker(segment.text)
                const speakerStyle = speaker ? getSpeakerStyle(speaker) : null

                const segStart = segment.start
                const nextSeg = liveSegments[segIdx + 1]
                const segEnd = typeof segment.end === 'number' && segment.end > segStart
                  ? segment.end
                  : (nextSeg ? nextSeg.start : segStart + 4)
                const segDuration = Math.max(0.5, segEnd - segStart)

                if (isEditingThisSeg) {
                  return (
                    <div
                      key={`${segment.start}-${segIdx}`}
                      onClick={(e) => e.stopPropagation()}
                      className="grid grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[5rem_minmax(0,1fr)] gap-3 sm:gap-4 rounded-2xl p-3.5 border border-blue-400/80 dark:border-blue-500/80 bg-blue-50/40 dark:bg-blue-950/40 shadow-sm ring-2 ring-blue-500/20"
                    >
                      <div className="flex items-start gap-1 select-none pt-2">
                        <span className="font-mono text-xs font-bold tabular-nums text-blue-600 dark:text-blue-400">
                          {formatTimestamp(segment.start)}
                        </span>
                      </div>
                      <div className="space-y-2.5 min-w-0">
                        <div className="flex items-center justify-between text-xs text-blue-700 dark:text-blue-300 font-medium">
                          <span className="flex items-center gap-1 font-semibold">
                            <Edit3 className="h-3.5 w-3.5" /> Edit Segment #{segIdx + 1}
                          </span>
                          <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            Enter to save · Shift+Enter for newline · Esc to cancel
                          </span>
                        </div>
                        <textarea
                          autoFocus
                          rows={Math.max(2, Math.min(5, Math.ceil(editDraft.length / 50)))}
                          value={editDraft}
                          onChange={(e) => setEditDraft(e.target.value)}
                          onKeyDown={(e) => handleKeyDown(e, () => handleSaveSegment(segIdx))}
                          className="w-full resize-y rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-2.5 text-sm sm:text-base font-normal text-slate-900 dark:text-white leading-relaxed focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                          placeholder="Type corrected segment text..."
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={handleCancelEdit}
                            className="inline-flex items-center gap-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 cursor-pointer transition-colors"
                          >
                            <X className="h-3.5 w-3.5" /> Cancel
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleSaveSegment(segIdx, e)}
                            className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-blue-500 cursor-pointer transition-colors"
                          >
                            <Check className="h-3.5 w-3.5" /> Save Changes
                          </button>
                        </div>
                      </div>
                    </div>
                  )
                }

                // Split segment body into words while preserving spacing
                const wordsList = segmentBody.trim().split(/(\s+)/)
                const realWords = wordsList.filter((w) => w.trim().length > 0)
                const totalRealWords = Math.max(1, realWords.length)

                let wordCounter = 0

                return (
                  <div
                    key={`${segment.start}-${segIdx}`}
                    onClick={() => handleSeekToSegment(segment.start)}
                    onDoubleClick={(e) => handleStartEditSegment(segIdx, e)}
                    className={`group grid grid-cols-[4rem_minmax(0,1fr)] sm:grid-cols-[5rem_minmax(0,1fr)] gap-3 sm:gap-4 rounded-2xl p-3.5 cursor-pointer transition-all duration-200 relative ${
                      isSegmentActive
                        ? `${speakerStyle?.bgActive || 'bg-blue-50/90 dark:bg-blue-950/50'} border-l-4 ${speakerStyle?.accent || 'border-blue-600'} shadow-xs ring-1 ring-blue-500/10`
                        : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Timestamp pill */}
                    <div className="flex items-start gap-1 select-none pt-0.5">
                      <span
                        className={`font-mono text-xs font-bold tabular-nums transition-colors ${
                          isSegmentActive
                            ? 'text-blue-600 dark:text-blue-400 font-extrabold'
                            : 'text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`}
                      >
                        {formatTimestamp(segment.start)}
                      </span>
                    </div>

                    {/* Word-by-word rendered paragraph with speaker badge */}
                    <div className="min-w-0">
                      <div className="mb-1.5 flex items-center justify-between">
                        {speaker ? (
                          <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold tracking-wide shadow-2xs ${speakerStyle?.badge}`}>
                            <span className={`h-1.5 w-1.5 rounded-full ${speakerStyle?.dot}`} />
                            <User className="h-3 w-3" />
                            <span>{speaker}</span>
                          </span>
                        ) : <span />}

                        {/* In-line Edit button on hover */}
                        <button
                          type="button"
                          onClick={(e) => handleStartEditSegment(segIdx, e)}
                          className="opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-lg px-2 py-0.5 text-xs font-medium text-slate-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
                          title="Click to edit segment (or double-click text)"
                        >
                          <Pencil className="h-3 w-3" />
                          <span className="text-[11px]">Edit</span>
                        </button>
                      </div>

                      <p className="whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200 text-sm sm:text-base">
                        {wordsList.map((token, tokenIdx) => {
                          const isWhitespace = token.trim().length === 0
                          if (isWhitespace) {
                            return <span key={tokenIdx}>{token}</span>
                          }

                          const currentWordIndex = wordCounter
                          wordCounter += 1

                          const wStart = segStart + (currentWordIndex / totalRealWords) * segDuration
                          const wEnd = segStart + ((currentWordIndex + 1) / totalRealWords) * segDuration

                          const isThisWordActive = isSegmentActive && wordSyncEnabled && currentTime >= wStart && currentTime < wEnd
                          const isPastWord = wordSyncEnabled && (currentTime >= wEnd)

                          return (
                            <span
                              key={tokenIdx}
                              ref={isThisWordActive ? activeWordRef : null}
                              onClick={(e) => {
                                e.stopPropagation()
                                setCurrentTime(wStart)
                              }}
                              className={`transition-all duration-150 inline-block rounded cursor-pointer ${
                                isThisWordActive
                                  ? 'bg-blue-600 text-white font-bold px-1.5 py-0.5 shadow-sm scale-[1.06] ring-2 ring-blue-400/40'
                                  : isPastWord && isSegmentActive
                                  ? 'text-blue-900 dark:text-blue-300 font-medium hover:underline'
                                  : 'hover:bg-blue-100/60 dark:hover:bg-blue-900/40 hover:text-blue-600'
                              }`}
                              title={`Jump to ${formatTimestamp(wStart)} (Double-click segment to edit)`}
                            >
                              {token}
                            </span>
                          )
                        })}
                      </p>
                    </div>
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
