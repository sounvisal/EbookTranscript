'use client'

import { useState, useEffect } from 'react'
import { Search, X, ChevronUp, ChevronDown } from 'lucide-react'
import type { TranscriptSegment } from '@/lib/transcript'

interface TranscriptSearchProps {
  segments: TranscriptSegment[]
  onJumpTo: (segmentIndex: number, time: number) => void
  onClear: () => void
}

export function TranscriptSearch({
  segments,
  onJumpTo,
  onClear
}: TranscriptSearchProps) {
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Array<{ segmentIndex: number; time: number }>>([])
  const [currentMatchIndex, setCurrentMatchIndex] = useState(0)

  useEffect(() => {
    const trimmed = query.trim()
    if (!trimmed) {
      setMatches([])
      setCurrentMatchIndex(0)
      onClear()
      return
    }

    const lowerQuery = trimmed.toLowerCase()
    const found: Array<{ segmentIndex: number; time: number }> = []

    segments.forEach((seg, idx) => {
      if (seg.text.toLowerCase().includes(lowerQuery)) {
        found.push({ segmentIndex: idx, time: seg.start })
      }
    })

    setMatches(found)
    setCurrentMatchIndex(0)

    if (found.length > 0) {
      onJumpTo(found[0].segmentIndex, found[0].time)
    }
  }, [query, segments, onClear, onJumpTo])

  const handleNext = () => {
    if (matches.length === 0) return
    const nextIndex = (currentMatchIndex + 1) % matches.length
    setCurrentMatchIndex(nextIndex)
    onJumpTo(matches[nextIndex].segmentIndex, matches[nextIndex].time)
  }

  const handlePrev = () => {
    if (matches.length === 0) return
    const prevIndex = (currentMatchIndex - 1 + matches.length) % matches.length
    setCurrentMatchIndex(prevIndex)
    onJumpTo(matches[prevIndex].segmentIndex, matches[prevIndex].time)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) {
        handlePrev()
      } else {
        handleNext()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      setQuery('')
      onClear()
    }
  }

  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-200/90 dark:border-slate-700/80 bg-white/90 dark:bg-slate-900/90 px-3 py-1.5 shadow-2xs backdrop-blur-md transition-all focus-within:ring-2 focus-within:ring-blue-500/20 focus-within:border-blue-500/50">
      <Search className="h-3.5 w-3.5 text-slate-400 shrink-0" />

      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Find in transcript..."
        className="w-28 sm:w-36 md:w-44 text-xs outline-none bg-transparent text-slate-900 dark:text-white placeholder:text-slate-400"
      />

      {query && (
        <div className="flex items-center gap-1.5 pl-1 border-l border-slate-200 dark:border-slate-800">
          {/* Match counter */}
          <span className="text-[11px] font-mono font-medium text-slate-500 dark:text-slate-400 whitespace-nowrap">
            {matches.length > 0
              ? `${currentMatchIndex + 1}/${matches.length}`
              : '0'}
          </span>

          {/* Navigation buttons */}
          {matches.length > 0 && (
            <div className="flex items-center gap-0.5">
              <button
                type="button"
                onClick={handlePrev}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                title="Previous match (Shift+Enter)"
              >
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                type="button"
                onClick={handleNext}
                className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 transition-colors cursor-pointer"
                title="Next match (Enter)"
              >
                <ChevronDown className="h-3 w-3" />
              </button>
            </div>
          )}

          {/* Clear button */}
          <button
            type="button"
            onClick={() => {
              setQuery('')
              onClear()
            }}
            className="p-1 rounded-md hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors cursor-pointer"
            title="Clear search (Esc)"
          >
            <X className="h-3 w-3" />
          </button>
        </div>
      )}
    </div>
  )
}
