'use client'

import TranscriptToolbar from './TranscriptToolbar'
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
  Link2,
  ArrowUpRight,
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
  Loader2,
  Volume2,
  Undo2,
  Redo2
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useSession, signIn } from 'next-auth/react'
import AudioPlayer from '@/components/transcript/AudioPlayer'
import { transcribeWithProgress } from '@/lib/transcribeClient'
import { useUndoRedo } from '@/hooks/useUndoRedo'
import { useTranscriptPersistence, type TranscriptSnapshot } from '@/hooks/useTranscriptPersistence'
import { buildWordTimeline } from '@/lib/transcriptSync'
import { getMediaBlob, saveMediaBlob } from '@/lib/mediaStorage'
import { createTranscriptSlug } from '@/lib/transcriptSlug'
import Link from 'next/link'

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
  const { data: session } = useSession()
  const { transcript, file, audioBlob, audioUrl: storeAudioUrl, customAudioUrl, resetAll: storeResetAll, updateTranscriptContent, advancedOptions } = useTranscriptStore()

  const resetAll = () => {
    if (hasUnsavedChanges && !window.confirm("Leave this transcript with unsaved changes?")) return
    storeResetAll()
    if (typeof window !== 'undefined') {
      window.history.pushState(null, '', '/transcribe')
    }
  }
  const [viewMode, setViewMode] = useState<'paragraphs' | 'timestamps'>('timestamps')
  const [wordSyncEnabled, setWordSyncEnabled] = useState(true)
  const [copied, setCopied] = useState(false)
  const hasSaved = useRef(false)
  const recordId = useRef(transcript?.id)
  const [followPlayback, setFollowPlayback] = useState(true)
  const [followPaused, setFollowPaused] = useState(false)
  const [syncOffset, setSyncOffset] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)
  const toolbarRef = useRef<HTMLDivElement>(null)
  const [seekRequest, setSeekRequest] = useState<{ time: number; sequence: number }>()

  // High-sensitivity re-scan state
  const [isRetryingSensitivity, setIsRetryingSensitivity] = useState(false)
  const [retryError, setRetryError] = useState<string | null>(null)

  // In-line editing state
  const [editingSegmentIdx, setEditingSegmentIdx] = useState<number | null>(null)
  const [editingParagraphIdx, setEditingParagraphIdx] = useState<number | null>(null)
  const [editDraft, setEditDraft] = useState<string>('')
  const [copiedShareLink, setCopiedShareLink] = useState<boolean>(false)
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)

  // Audio Playback & Synchronization State
  const [currentTime, setCurrentTime] = useState(0)
  const activeWordRef = useRef<HTMLSpanElement | null>(null)
  const requestSeek = useCallback((time: number) => {
    setCurrentTime(time)
    setSeekRequest(previous => ({ time, sequence: (previous?.sequence ?? 0) + 1 }))
  }, [setCurrentTime, setSeekRequest])

  const rawText = transcript?.text || 'Mock transcript content.'
  const baseText = useMemo(
    () => getPlainTranscriptText(rawText, transcript?.segments),
    [rawText, transcript?.segments]
  )
  const initialSegments = useMemo(
    () => buildDisplaySegments(rawText, transcript?.segments, transcript?.duration),
    [rawText, transcript?.segments, transcript?.duration]
  )

  // Undo / Redo history for in-line edits
  type TranscriptEditSnapshot = {
    text: string
    segments: TranscriptSegment[]
  }

  const {
    state: historyState,
    set: setHistoryState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset: resetHistory
  } = useUndoRedo<TranscriptEditSnapshot>({
    text: baseText,
    segments: initialSegments
  })

  const liveSegments = historyState.segments
  const liveText = historyState.text
  const localContent = useRef<string | null>(null)
  const publishContent = useCallback((text: string, segments: TranscriptSegment[]) => {
    localContent.current = JSON.stringify({ text: getPlainTranscriptText(text, segments), segments: buildDisplaySegments(text, segments, transcript?.duration) })
    updateTranscriptContent(text, segments)
  }, [updateTranscriptContent, transcript?.duration])

  // Synchronize live state when the underlying transcript / segments change externally
  useEffect(() => {
    if (localContent.current === JSON.stringify({ text: baseText, segments: initialSegments })) return
    resetHistory({
      text: baseText,
      segments: initialSegments
    })
  }, [initialSegments, baseText, resetHistory])

  // Search in transcript state
  const [highlightedSegmentIdx, setHighlightedSegmentIdx] = useState<number | null>(null)

  const handleSearchJump = useCallback((segmentIndex: number, time: number) => {
    setHighlightedSegmentIdx(segmentIndex)
    requestSeek(time)
    setFollowPaused(true)
    setViewMode('timestamps')
    setTimeout(() => {
      const el = document.getElementById(`segment-${segmentIndex}`)
      const container = scrollRef.current
      if (el && container) {
        container.scrollTo({ top: container.scrollTop + el.getBoundingClientRect().top - container.getBoundingClientRect().top - (toolbarRef.current?.offsetHeight || 0) - 24,
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
    }, 50)
  }, [requestSeek, setFollowPaused, setViewMode, setHighlightedSegmentIdx])

  const handleSearchClear = useCallback(() => {
    setHighlightedSegmentIdx(null)
  }, [])

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

  const timelines = useMemo(() => liveSegments.map((segment, i) =>
    buildWordTimeline(segment, extractSpeaker(segment.text).body, liveSegments[i + 1]?.start)), [liveSegments])
  const syncTime = currentTime + syncOffset
  const activeSegmentIndex = liveSegments.findIndex((segment, i) => syncTime >= segment.start && syncTime < timelines[i].end)
  const activeTokenIndex = activeSegmentIndex < 0 ? -1 : timelines[activeSegmentIndex].tokens.findIndex(token =>
    token.start !== undefined && token.end !== undefined && syncTime >= token.start && syncTime < token.end)

  const scrollToActive = useCallback((smooth = false) => {
    const container = scrollRef.current
    const target = activeWordRef.current || container?.querySelector<HTMLElement>('[data-active-segment="true"]')
    if (!container || !target) return
    const viewport = container.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    const inset = (toolbarRef.current?.offsetHeight || 0) + 20
    if (rect.top < viewport.top + inset || rect.bottom > viewport.bottom - 24) {
      container.scrollTo({ top: container.scrollTop + rect.top - viewport.top - inset - 30,
        behavior: smooth && !window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'auto' })
    }
  }, [])
  useEffect(() => {
    if (followPlayback && !followPaused && editingSegmentIdx === null && editingParagraphIdx === null) scrollToActive()
  }, [activeSegmentIndex, activeTokenIndex, followPlayback, followPaused, editingSegmentIdx, editingParagraphIdx, scrollToActive])

  const activePanel = useRef(true)
  useEffect(() => {
    activePanel.current = true
    return () => { activePanel.current = false }
  }, [])
  const persistSnapshot = useCallback(async (snapshot: TranscriptSnapshot) => {
    const accountId = session?.user?.id
    if (!accountId || !transcript || !activePanel.current || useTranscriptStore.getState().accountId !== accountId) throw new Error('Account unavailable')
    const id = recordId.current
    const response = await fetch('/api/history', {
      method: id ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...snapshot, id, expectedUserId: accountId, source: transcript.source || file?.name || 'file',
        filename: file?.name, duration: transcript.duration, language: transcript.language, cacheId: transcript.cacheId })
    })
    if (!response.ok) throw new Error('Save failed')
    const result = await response.json()
    if (!id && !result.id) throw new Error('Save was not confirmed')
    if (!activePanel.current || useTranscriptStore.getState().accountId !== accountId) return
    if (!id) {
      recordId.current = result.id
      const store = useTranscriptStore.getState()
      if (store.transcript) store.setTranscript({ ...store.transcript, id: result.id, alreadySaved: true })
      const media = file || audioBlob
      if (media) {
        try {
          if (response.status === 201 || !await getMediaBlob(accountId, result.id)) await saveMediaBlob(accountId, result.id, media)
        } catch { setSaveSuccessMessage('Transcript saved. Local audio storage is unavailable.') }
      }
      const slug = createTranscriptSlug(transcript.source || file?.name, result.id)
      window.history.replaceState(null, '', '/transcribe/' + encodeURIComponent(slug))
    }
  }, [session?.user?.id, transcript, file, audioBlob, setSaveSuccessMessage])
  const { status: saveStatus, save: saveSnapshot } = useTranscriptPersistence(Boolean(transcript?.id), persistSnapshot)
  const draftDirty = editingSegmentIdx !== null ? editDraft !== liveSegments[editingSegmentIdx]?.text
    : editingParagraphIdx !== null ? editDraft !== paragraphs[editingParagraphIdx] : false
  const hasUnsavedChanges = draftDirty || saveStatus !== 'saved'
  useEffect(() => {
    if (!session?.user?.id || !transcript || transcript.id || hasSaved.current) return
    hasSaved.current = true
    void saveSnapshot({ text: liveText, segments: liveSegments })
  }, [session?.user?.id, transcript, liveText, liveSegments, saveSnapshot])
  useEffect(() => {
    if (!hasUnsavedChanges) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [hasUnsavedChanges])
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

  const isNoDialogueDetected = liveText.includes('[No spoken dialogue detected in media]')

  const handleRetryWithHighSensitivity = async () => {
    if (!file && !transcript?.source) return
    setIsRetryingSensitivity(true)
    setRetryError(null)

    try {
      const data = await transcribeWithProgress(
        file ? { file } : { url: transcript?.source },
        undefined,
        { ...advancedOptions, highSensitivity: true }
      )

      useTranscriptStore.getState().setTranscript({
        text: data.text,
        segments: data.segments,
        source: data.source || (file ? file.name : transcript?.source) || 'MEDIA INPUT',
        language: data.language,
        duration: data.duration,
        kind: 'transcript'
      })
    } catch (err: any) {
      setRetryError(err?.message || 'High sensitivity scan failed. Please try again.')
    } finally {
      setIsRetryingSensitivity(false)
    }
  }

  const handleSeekToSegment = (startTime: number) => {
    requestSeek(startTime)
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

  
  const handleCopyShareLink = () => {
    if (!transcript?.id) return
    const slug = createTranscriptSlug(transcript.source || file?.name, transcript.id)
    const fullUrl = `${window.location.origin}/transcribe/${encodeURIComponent(slug)}`
    navigator.clipboard.writeText(fullUrl)
    setCopiedShareLink(true)
    setTimeout(() => setCopiedShareLink(false), 2000)
  }

  const handleSaveSegment = async (idx: number, e?: React.MouseEvent) => {
    if (e) e.stopPropagation()
    const trimmed = editDraft.trim()
    if (!trimmed) {
      handleCancelEdit()
      return
    }

    const updatedSegments = liveSegments.map((seg, i) =>
      i === idx ? { ...seg, text: trimmed, words: undefined } : seg
    )
    const updatedText = updatedSegments.map((s) => s.text).join('\n\n')

    setHistoryState({ text: updatedText, segments: updatedSegments })
    setEditingSegmentIdx(null)
    setEditDraft('')
    publishContent(updatedText, updatedSegments)

    await saveSnapshot({ text: updatedText, segments: updatedSegments })
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

    const updatedSegments = paragraphs.length === liveSegments.length
      ? liveSegments.map((segment, i) => i === idx ? { ...segment, text: trimmed, words: undefined } : segment)
      : buildDisplaySegments(updatedText, undefined, transcript?.duration)
    setHistoryState({ text: updatedText, segments: updatedSegments })
    setEditingParagraphIdx(null)
    setEditDraft('')
    publishContent(updatedText, updatedSegments)

    await saveSnapshot({ text: updatedText, segments: updatedSegments })
  }

  const handleUndo = useCallback(async () => {
    if (!canUndo) return
    const prev = undo()
    if (prev) {
      publishContent(prev.text, prev.segments)
      setSaveSuccessMessage('Undone ↩')
      setTimeout(() => setSaveSuccessMessage(null), 2000)
      await saveSnapshot({ text: prev.text, segments: prev.segments })
    }
  }, [canUndo, undo, publishContent, saveSnapshot, setSaveSuccessMessage])

  const handleRedo = useCallback(async () => {
    if (!canRedo) return
    const next = redo()
    if (next) {
      publishContent(next.text, next.segments)
      setSaveSuccessMessage('Redone ↪')
      setTimeout(() => setSaveSuccessMessage(null), 2000)
      await saveSnapshot({ text: next.text, segments: next.segments })
    }
  }, [canRedo, redo, publishContent, saveSnapshot, setSaveSuccessMessage])

  // Global Undo / Redo keyboard shortcuts (Ctrl+Z / Cmd+Z, Ctrl+Y / Cmd+Shift+Z)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return
      }

      const isMac = typeof navigator !== 'undefined' && /Mac|iPod|iPhone|iPad/.test(navigator.platform)
      const isMod = isMac ? e.metaKey : e.ctrlKey

      if (isMod && e.key.toLowerCase() === 'z') {
        if (e.shiftKey) {
          e.preventDefault()
          handleRedo()
        } else {
          e.preventDefault()
          handleUndo()
        }
      } else if (isMod && e.key.toLowerCase() === 'y') {
        e.preventDefault()
        handleRedo()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [handleUndo, handleRedo])

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
      {/* Guest Celebration & Cloud Save Banner */}
      {!session && (
        <div className="relative overflow-hidden border-b border-indigo-200/50 dark:border-indigo-800/60 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 px-5 py-3 text-white shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-xl bg-white/20 backdrop-blur-xs text-base">
                🎉
              </span>
              <div className="text-xs sm:text-sm">
                <span className="font-semibold text-white">Transcript generated successfully!</span>{' '}
                <span className="text-blue-100">Sign in free to save to your Cloud History and unlock Batch Queue.</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => signIn()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-1.5 text-xs font-semibold text-indigo-700 shadow-xs hover:bg-indigo-50 hover:shadow-md transition-all active:scale-95 cursor-pointer"
              >
                <Sparkles className="h-3.5 w-3.5 text-indigo-600" />
                Sign in Free
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Header Card */}
      <div className="border-b border-slate-200/60 bg-gradient-to-b from-white/90 to-slate-50/50 p-3.5 dark:border-slate-800 dark:from-slate-900/90 dark:to-slate-950/50 sm:flex sm:items-center sm:justify-between sm:p-7">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping" />
            <span className="flex items-center gap-1">
              <CheckCircle2 className="h-3.5 w-3.5" /> Transcription Finished
            </span>
          </div>
          <h2 className="mt-1 truncate text-base font-bold tracking-tight text-slate-950 dark:text-white sm:mt-2 sm:text-2xl" title={sourceName}>
            {sourceName}
          </h2>
          <div className="mt-1.5 hidden flex-wrap items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400 sm:flex">
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

        <div className="mt-2 flex flex-wrap items-center gap-2 sm:mt-0">
          <div className="flex flex-wrap items-center gap-2">
            <span role="status" aria-live="polite" data-testid="save-status" className={
              'rounded-full px-3 py-1 text-xs font-semibold ' + (saveStatus === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300'
                : draftDirty || saveStatus !== 'saved' ? 'bg-amber-50 text-amber-800 dark:bg-amber-950 dark:text-amber-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300')
            }>{draftDirty ? 'Unsaved changes' : saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : saveStatus === 'error' ? 'Save failed — changes remain in this tab' : 'Not saved'}</span>
            {saveStatus === 'error' && !draftDirty && <button type="button" onClick={() => saveSnapshot({ text: liveText, segments: liveSegments })} className="min-h-9 rounded-lg px-3 text-sm font-semibold text-red-700 underline dark:text-red-300">Retry save</button>}
            {saveSuccessMessage && <span className="text-xs text-slate-500" role="status">{saveSuccessMessage}</span>}
          </div>
          {transcript?.id && (
            <button
              onClick={handleCopyShareLink}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors shadow-2xs cursor-pointer"
              title="Copy direct clean link to this transcript"
            >
              {copiedShareLink ? (
                <>
                  <Check className="h-3 w-3 text-emerald-500" />
                  <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Link Copied</span>
                </>
              ) : (
                <>
                  <Link2 className="h-3 w-3 text-slate-500" />
                  <span>Copy Link</span>
                </>
              )}
            </button>
          )}

          {session ? (
            <Link
              href="/history"
              className="inline-flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 px-3.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200/80 dark:ring-slate-700 shadow-2xs hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="View all transcripts in history"
            >
              <span>Open history ↗</span>
            </Link>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/90 dark:bg-slate-900/90 px-3.5 py-1 text-xs font-medium text-slate-600 dark:text-slate-300 ring-1 ring-slate-200/80 dark:ring-slate-700 shadow-2xs">
              <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
              Guest Preview
            </span>
          )}
        </div>
      </div>

      <div ref={scrollRef} tabIndex={0} aria-label="Transcript reading area" className="max-h-[72dvh] overflow-y-auto overscroll-contain sm:max-h-[85dvh]"
        onWheel={() => setFollowPaused(true)}
        onTouchMove={event => { if (!toolbarRef.current?.contains(event.target as Node)) setFollowPaused(true) }}
        onPointerDown={event => { if (event.target === event.currentTarget) setFollowPaused(true) }}
        onKeyDown={event => {
          if (!toolbarRef.current?.contains(event.target as Node) && ['PageUp', 'PageDown', 'Home', 'End', 'ArrowUp', 'ArrowDown'].includes(event.key)) setFollowPaused(true)
        }}>
      <div ref={toolbarRef} className="sticky top-0 z-20 bg-white dark:bg-slate-950">
      <div className="border-b border-slate-200/60 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-900/60 sm:p-4 sm:px-7">
        <AudioPlayer
          src={audioUrl}
          text={liveText}
          duration={transcript?.duration || 0}
          currentTime={currentTime}
          seekRequest={seekRequest}
          onSeek={requestSeek}
          onTimeUpdate={setCurrentTime}
          onAttachFile={(attached) => {
            const accountId = session?.user?.id
            const store = useTranscriptStore.getState()
            if (accountId && store.accountId !== accountId) return
            store.setFile(attached)
            if (accountId && transcript?.id) {
              saveMediaBlob(accountId, transcript.id, attached).catch(() => {
                setSaveSuccessMessage('Audio attached for this session. Local storage is unavailable.')
              })
            }
          }}
        />
      </div>

      <TranscriptToolbar viewMode={viewMode} setViewMode={setViewMode} segments={liveSegments} text={liveText}
        sourceName={sourceName} language={transcript?.language} onSearchJump={handleSearchJump} onSearchClear={handleSearchClear}
        onUndo={handleUndo} onRedo={handleRedo} canUndo={canUndo} canRedo={canRedo} copied={copied} onCopy={handleCopy} onReset={resetAll}
        wordSync={wordSyncEnabled} setWordSync={setWordSyncEnabled} follow={followPlayback}
        setFollow={enabled => { setFollowPlayback(enabled); setFollowPaused(false) }} followPaused={followPaused}
        onReturn={() => { setFollowPlayback(true); setFollowPaused(false); scrollToActive(true) }}
        editing={editingSegmentIdx !== null || editingParagraphIdx !== null} hasAudio={Boolean(audioUrl)}
        estimated={timelines.some(item => item.estimated)} offset={syncOffset} setOffset={setSyncOffset} />
      </div>

      {/* Editorial Content Area with Word-by-Word Karaoke Highlighting & In-Line Editing */}
      <div className="p-2 sm:p-8">
        {isNoDialogueDetected && (
          <div className="mb-6 rounded-2xl border border-amber-300 dark:border-amber-800/80 bg-amber-50/90 dark:bg-amber-950/40 p-5 shadow-sm backdrop-blur-md">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-start gap-3.5">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 dark:bg-amber-900/60 text-amber-700 dark:text-amber-300">
                  <Volume2 className="h-5 w-5" />
                </div>
                <div>
                  <h4 className="font-semibold text-slate-900 dark:text-white text-sm">
                    Audible speech but words not detected?
                  </h4>
                  <p className="mt-0.5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    The AI may have filtered this audio as background noise, music, or low-volume audio. Click below to re-scan with <strong>Maximum Acoustic Sensitivity</strong> to capture quiet voices, lyrics, and speech past background audio.
                  </p>
                  {retryError && (
                    <p className="mt-2 text-xs font-medium text-rose-600 dark:text-rose-400">
                      {retryError}
                    </p>
                  )}
                </div>
              </div>
              {(file || transcript?.source) && (
                <button
                  type="button"
                  disabled={isRetryingSensitivity}
                  onClick={handleRetryWithHighSensitivity}
                  className="flex items-center justify-center gap-2 rounded-xl bg-amber-600 hover:bg-amber-700 active:scale-95 disabled:opacity-50 text-white font-medium px-4 py-2.5 text-xs shadow-sm transition-all cursor-pointer shrink-0"
                >
                  {isRetryingSensitivity ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      <span>Re-scanning Audio…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      <span>Re-scan with High Sensitivity</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        )}

        <div
          className="pr-2 text-base leading-relaxed text-slate-800 dark:text-slate-200 outline-none"
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
                        className="sm:opacity-0 sm:group-hover:opacity-100 focus:opacity-100 transition-opacity inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-slate-800 cursor-pointer"
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

                const tokens = timelines[segIdx].tokens
                const isSearchMatch = highlightedSegmentIdx === segIdx

                return (
                  <div
                    key={`${segment.start}-${segIdx}`}
                    id={`segment-${segIdx}`}
                    data-active-segment={isSegmentActive}
                    onDoubleClick={(e) => handleStartEditSegment(segIdx, e)}
                    className={`group grid grid-cols-[2.75rem_minmax(0,1fr)] gap-2 rounded-2xl p-2.5 transition-all duration-200 sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-4 sm:p-3.5 ${
                      isSearchMatch
                        ? 'ring-2 ring-amber-400 bg-amber-50/90 dark:bg-amber-950/40 shadow-sm border-l-4 border-amber-500'
                        : isSegmentActive
                        ? `${speakerStyle?.bgActive || 'bg-blue-50/90 dark:bg-blue-950/50'} border-l-4 ${speakerStyle?.accent || 'border-blue-600'} shadow-xs ring-1 ring-blue-500/10`
                        : 'hover:bg-slate-100/60 dark:hover:bg-slate-800/40'
                    }`}
                  >
                    {/* Timestamp pill */}
                    <div className="flex items-start gap-1 select-none pt-0.5">
                      <button type="button" aria-label={"Play from " + formatTimestamp(segment.start)} onClick={() => handleSeekToSegment(segment.start)}
                        className={`font-mono text-xs font-bold tabular-nums transition-colors ${
                          isSegmentActive
                            ? 'text-blue-600 dark:text-blue-400 font-extrabold'
                            : 'text-slate-400 dark:text-slate-500 group-hover:text-blue-600 dark:group-hover:text-blue-400'
                        }`}
                      >
                        {formatTimestamp(segment.start)}
                      </button>
                    </div>

                    {/* Word-by-word rendered paragraph with speaker badge */}
                    <div className="min-w-0">
                      <div className="mb-0.5 flex items-center justify-between sm:mb-1.5">
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
                          className={`inline-flex min-h-8 items-center gap-1 rounded-lg px-2 text-xs font-semibold transition-opacity hover:bg-blue-50 focus-visible:opacity-100 dark:hover:bg-slate-800 ${isSegmentActive ? 'bg-white/80 text-blue-700 dark:bg-slate-900 dark:text-blue-300' : 'text-slate-600 dark:text-slate-300 sm:opacity-0 sm:group-hover:opacity-100'}`}
                          title="Click to edit segment (or double-click text)"
                        >
                          <Pencil className="h-3 w-3" />
                          <span className="text-[11px]">Edit</span>
                        </button>
                      </div>

                      <p className="whitespace-pre-wrap leading-relaxed text-slate-800 dark:text-slate-200 text-sm sm:text-base">
                        {tokens.map((token, tokenIdx) => {
                          if (token.start === undefined || token.end === undefined) return <span key={tokenIdx}>{token.text}</span>
                          const isThisWordActive = Boolean(audioUrl) && isSegmentActive && wordSyncEnabled && tokenIdx === activeTokenIndex
                          return <span key={tokenIdx} ref={isThisWordActive ? activeWordRef : null} data-active-word={isThisWordActive}
                            onClick={event => { event.stopPropagation(); if (!window.getSelection()?.toString()) requestSeek(Math.max(0, token.start! - syncOffset)) }}
                            className={isThisWordActive ? 'rounded-sm bg-blue-600 text-white ring-2 ring-blue-600' : 'cursor-pointer rounded-sm hover:bg-blue-100 dark:hover:bg-blue-950'}
                            title={'Jump to ' + formatTimestamp(token.start)}>{token.text}</span>
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
    </div>
  )
}
