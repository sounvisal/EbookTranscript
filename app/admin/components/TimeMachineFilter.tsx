'use client'

import { Clock } from 'lucide-react'
import type { DateRangeOption } from '../types'

interface TimeMachineFilterProps {
  selectedRange: DateRangeOption
  onRangeChange: (range: DateRangeOption) => void
  startTime: string
  endTime: string
}

export function TimeMachineFilter({ selectedRange, onRangeChange, startTime, endTime }: TimeMachineFilterProps) {
  const ranges: Array<{ id: DateRangeOption; label: string }> = [
    { id: 'today', label: 'Today' },
    { id: 'yesterday', label: 'Yesterday' },
    { id: '7d', label: 'Last 7 Days' },
    { id: '30d', label: 'Last 30 Days' },
    { id: 'all', label: 'All Time' }
  ]

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50 dark:bg-slate-950/40 p-3 rounded-2xl border border-slate-200/80 dark:border-slate-800">
      <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400">
        <Clock className="h-4 w-4 text-blue-500" />
        <span className="font-bold text-slate-900 dark:text-white">Time Machine:</span>
        <span>Viewing telemetry data from</span>
        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
          {startTime ? new Date(startTime).toLocaleDateString() : 'Loading...'}
        </span>
        <span>to</span>
        <span className="font-mono font-semibold text-blue-600 dark:text-blue-400">
          {endTime ? new Date(endTime).toLocaleDateString() : 'Now'}
        </span>
      </div>

      <div className="flex items-center gap-1 rounded-xl bg-slate-200/70 dark:bg-slate-900 p-1">
        {ranges.map((r) => {
          const isCurrent = selectedRange === r.id
          return (
            <button
              key={r.id}
              onClick={() => onRangeChange(r.id)}
              className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all cursor-pointer ${
                isCurrent
                  ? 'bg-white dark:bg-blue-600 text-blue-600 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              {r.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
