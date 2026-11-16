'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Download, Undo2, Redo2 } from 'lucide-react'
import { downloadTxt, downloadSrt, downloadVtt } from '@/lib/download'
import type { TranscriptSegment } from '@/lib/transcript'
import { TranscriptSearch } from './TranscriptSearch'
import ReportErrorButton from '@/components/common/ReportErrorButton'

type Props = {
  viewMode: 'paragraphs' | 'timestamps'
  setViewMode: (mode: 'paragraphs' | 'timestamps') => void
  segments: TranscriptSegment[]
  text: string
  sourceName: string
  language?: string
  onSearchJump: (index: number, time: number) => void
  onSearchClear: () => void
  onUndo: () => void
  onRedo: () => void
  canUndo: boolean
  canRedo: boolean
  copied: boolean
  onCopy: () => void
  onReset: () => void
  wordSync: boolean
  setWordSync: (enabled: boolean) => void
  follow: boolean
  setFollow: (enabled: boolean) => void
  followPaused: boolean
  onReturn: () => void
  editing: boolean
  hasAudio: boolean
  estimated: boolean
  offset: number
  setOffset: (value: number) => void
}

export default function TranscriptToolbar(props: Props) {
  const [exportOpen, setExportOpen] = useState(false)
  const exportRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!exportOpen) return
    const outside = (event: PointerEvent) => { if (!exportRef.current?.contains(event.target as Node)) setExportOpen(false) }
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setExportOpen(false); exportRef.current?.querySelector('button')?.focus() }
    }
    document.addEventListener('pointerdown', outside)
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', outside); document.removeEventListener('keydown', escape) }
  }, [exportOpen])
  const exports = [
    { label: 'Text (.txt)', download: downloadTxt },
    { label: 'Subtitles (.srt)', download: downloadSrt },
    { label: 'Web captions (.vtt)', download: downloadVtt }
  ]
  return (
    <div className="border-b border-slate-200 p-2.5 dark:border-slate-800 sm:p-3 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-xl bg-slate-100 p-1 dark:bg-slate-800" aria-label="Transcript view">
          {(['paragraphs', 'timestamps'] as const).map(mode => <button key={mode} type="button" aria-pressed={props.viewMode === mode}
            onClick={() => props.setViewMode(mode)} className={'min-h-9 rounded-lg px-3 text-sm font-medium ' + (props.viewMode === mode ? 'bg-white text-slate-950 shadow-sm dark:bg-slate-700 dark:text-white' : 'text-slate-600 dark:text-slate-300')}>
            {mode === 'paragraphs' ? 'Read' : 'Timestamps'}
          </button>)}
        </div>
        <TranscriptSearch segments={props.segments} onJumpTo={props.onSearchJump} onClear={props.onSearchClear} />
        <button type="button" onClick={props.onUndo} disabled={!props.canUndo} aria-label="Undo edit" title="Undo (Ctrl+Z)" className="min-h-9 min-w-9 rounded-lg p-2 disabled:opacity-30"><Undo2 className="h-4 w-4" /></button>
        <button type="button" onClick={props.onRedo} disabled={!props.canRedo} aria-label="Redo edit" title="Redo (Ctrl+Shift+Z)" className="min-h-9 min-w-9 rounded-lg p-2 disabled:opacity-30"><Redo2 className="h-4 w-4" /></button>
        <button type="button" onClick={props.onCopy} className="ml-auto inline-flex min-h-10 items-center gap-2 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white">
          {props.copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}{props.copied ? 'Copied' : 'Copy'}
        </button>
        <div ref={exportRef} className="relative">
          <button type="button" aria-expanded={exportOpen} aria-controls="transcript-exports" onClick={() => setExportOpen(open => !open)} className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700"><Download className="h-4 w-4" />Export</button>
          {exportOpen && <div id="transcript-exports" role="group" aria-label="Export formats" className="absolute right-0 top-full z-30 mt-2 w-48 rounded-xl border border-slate-200 bg-white p-1 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            {exports.map(item => <button key={item.label} type="button" className="block min-h-10 w-full rounded-lg px-3 text-left text-sm hover:bg-slate-100 dark:hover:bg-slate-800"
              onClick={() => { item.download(props.text, props.sourceName, props.segments); setExportOpen(false) }}>{item.label}</button>)}
          </div>}
        </div>
        <details className="relative">
          <summary className="flex min-h-10 cursor-pointer items-center rounded-xl border border-slate-300 px-3 text-sm dark:border-slate-700">More</summary>
          <div className="absolute right-0 z-30 mt-2 w-64 space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg dark:border-slate-700 dark:bg-slate-900">
            <ReportErrorButton errorMessage="User reported inaccurate transcript or quality issue" filename={props.sourceName} inputType="file" transcriptSnippet={props.text.slice(0, 500)} detectedLanguage={props.language} />
            <button type="button" onClick={props.onReset} className="block min-h-10 rounded-lg px-3 text-sm">New transcription</button>
            <label className="block text-xs font-medium">Highlight adjustment: {props.offset > 0 ? '+' : ''}{props.offset.toFixed(1)} s
              <input aria-label="Highlight timing adjustment" type="range" min="-2" max="2" step="0.1" value={props.offset} onChange={event => props.setOffset(Number(event.target.value))} className="mt-3 w-full" />
            </label>
            <p className="text-xs text-slate-500">Positive values advance highlighting. Negative values delay it. Audio playback is unchanged.</p>
            <button type="button" onClick={() => props.setOffset(0)} className="min-h-9 text-xs underline">Reset timing adjustment</button>
          </div>
        </details>
      </div>
      {props.viewMode === 'timestamps' && <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-slate-100 pt-1 text-xs dark:border-slate-800 sm:mt-3 sm:gap-x-4 sm:pt-3">
        <label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={props.wordSync} disabled={!props.hasAudio} onChange={event => props.setWordSync(event.target.checked)} />Highlight words</label>
        <label className="flex min-h-8 items-center gap-2"><input type="checkbox" checked={props.follow} onChange={event => props.setFollow(event.target.checked)} />Follow playback</label>
        {(props.followPaused || !props.follow) && <button type="button" disabled={props.editing} onClick={props.onReturn} className="min-h-8 font-semibold text-blue-600 disabled:opacity-40 dark:text-blue-400">Return to current sentence</button>}
        <span className="text-slate-500">{!props.hasAudio ? 'Attach original audio for synchronized highlighting' : props.estimated ? 'Estimated word timing' : 'Word timestamps'}</span>
      </div>}
    </div>
  )
}
