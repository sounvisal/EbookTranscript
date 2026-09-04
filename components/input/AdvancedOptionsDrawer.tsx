'use client'

import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  SlidersHorizontal,
  ChevronDown,
  ChevronUp,
  Tag,
  Users,
  Languages,
  Plus,
  X,
  Sparkles,
  HelpCircle
} from 'lucide-react'
import { useTranscriptStore } from '@/store/transcriptStore'

const QUICK_SUGGESTIONS = [
  'Sounvisal',
  'Phnom Penh',
  'អគ្គិសនីកម្ពុជា',
  'Kubernetes',
  'Next.js',
  'Cambodia',
  'Microservices'
]

export default function AdvancedOptionsDrawer() {
  const [isOpen, setIsOpen] = useState(false)
  const [termInput, setTermInput] = useState('')

  const {
    advancedOptions,
    addCustomTerm,
    removeCustomTerm,
    setSpeakerDiarization,
    setLanguagePreference,
    resetAdvancedOptions
  } = useTranscriptStore()

  const { customVocabulary, speakerDiarization, languagePreference } = advancedOptions

  const handleAddTerm = (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    const trimmed = termInput.trim()
    if (!trimmed) return

    // Handle comma-separated input
    if (trimmed.includes(',')) {
      const parts = trimmed.split(',').map((p) => p.trim()).filter(Boolean)
      parts.forEach((p) => addCustomTerm(p))
    } else {
      addCustomTerm(trimmed)
    }
    setTermInput('')
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault()
      handleAddTerm()
    }
  }

  // Count active settings for the badge
  const activeCount =
    (customVocabulary.length > 0 ? 1 : 0) +
    (speakerDiarization ? 1 : 0) +
    (languagePreference !== 'auto' ? 1 : 0)

  return (
    <div className="rounded-2xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md overflow-hidden transition-all shadow-2xs">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between px-4 sm:px-5 py-3.5 text-left text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400">
            <SlidersHorizontal className="h-4 w-4" />
          </div>
          <span>Advanced Options</span>
          <span className="hidden sm:inline text-xs font-normal text-slate-500 dark:text-slate-400">
            (Vocabulary Hints & Speakers)
          </span>

          {activeCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-100/90 dark:bg-blue-950/80 px-2.5 py-0.5 text-[11px] font-bold text-blue-700 dark:text-blue-300">
              <Sparkles className="h-3 w-3" />
              <span>
                {activeCount} active
                {customVocabulary.length > 0 ? ` (${customVocabulary.length} words)` : ''}
              </span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 text-slate-400">
          <span className="text-xs font-normal">{isOpen ? 'Hide' : 'Configure'}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {/* Expandable Drawer Body */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-slate-200/60 dark:border-slate-800 px-4 sm:px-5 py-4 space-y-5 text-xs sm:text-sm"
          >
            {/* 1. Custom Vocabulary & Domain Hints */}
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <Tag className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  <span>Custom Vocabulary & Domain Terms</span>
                </label>
                {customVocabulary.length > 0 && (
                  <button
                    type="button"
                    onClick={() => useTranscriptStore.getState().setCustomVocabulary([])}
                    className="text-[11px] font-medium text-slate-400 hover:text-red-500 transition-colors cursor-pointer"
                  >
                    Clear terms
                  </button>
                )}
              </div>
              <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                Type names, technical jargon, acronyms, or Khmer proper nouns so the AI uses these exact spellings.
              </p>

              {/* Tag Input Form */}
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={termInput}
                    onChange={(e) => setTermInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. Sounvisal, Kubernetes, អគ្គិសនីកម្ពុជា (press Enter)"
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white/90 dark:bg-slate-900/90 px-3.5 py-2 text-xs sm:text-sm text-slate-900 dark:text-white outline-none transition-all placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:focus:ring-blue-900/40"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAddTerm()}
                  disabled={!termInput.trim()}
                  className="apple-btn-primary flex items-center gap-1 rounded-xl px-3.5 py-2 text-xs font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Add</span>
                </button>
              </div>

              {/* Current Active Tags */}
              {customVocabulary.length > 0 && (
                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  {customVocabulary.map((term) => (
                    <span
                      key={term}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-blue-200 dark:border-blue-800/80 bg-blue-50/80 dark:bg-blue-950/60 px-2.5 py-1 text-xs font-semibold text-blue-800 dark:text-blue-200 shadow-2xs animate-in fade-in zoom-in-95 duration-150"
                    >
                      <span>{term}</span>
                      <button
                        type="button"
                        onClick={() => removeCustomTerm(term)}
                        className="rounded-full p-0.5 text-blue-500 hover:bg-blue-200/60 dark:hover:bg-blue-900/60 hover:text-blue-900 dark:hover:text-white transition-colors cursor-pointer"
                        title={`Remove ${term}`}
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </span>
                  ))}
                </div>
              )}

              {/* Quick Suggestions */}
              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                <span className="text-[11px] text-slate-400 font-medium">Quick suggestions:</span>
                {QUICK_SUGGESTIONS.map((suggestion) => {
                  const isAdded = customVocabulary.includes(suggestion)
                  return (
                    <button
                      key={suggestion}
                      type="button"
                      onClick={() => (isAdded ? removeCustomTerm(suggestion) : addCustomTerm(suggestion))}
                      className={`inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors cursor-pointer ${
                        isAdded
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-slate-100/90 text-slate-600 hover:bg-slate-200/80 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span>{suggestion}</span>
                      {isAdded ? <X className="h-2.5 w-2.5" /> : <Plus className="h-2.5 w-2.5 opacity-60" />}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* 2. Speaker Diarization Toggle */}
            <div className="border-t border-slate-200/50 dark:border-slate-800/80 pt-4 flex items-center justify-between gap-4">
              <div className="min-w-0">
                <label
                  htmlFor="speaker-diarization-toggle"
                  className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200 cursor-pointer"
                >
                  <Users className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                  <span>Speaker Diarization</span>
                </label>
                <p className="mt-0.5 text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">
                  Detect and prefix distinct speakers (<code className="rounded bg-slate-100 dark:bg-slate-800 px-1 font-mono text-[10px]">Speaker 1:</code>, <code className="rounded bg-slate-100 dark:bg-slate-800 px-1 font-mono text-[10px]">Speaker 2:</code>) for meetings, conversations, and podcasts.
                </p>
              </div>

              {/* iOS Switch */}
              <button
                id="speaker-diarization-toggle"
                type="button"
                role="switch"
                aria-checked={speakerDiarization}
                onClick={() => setSpeakerDiarization(!speakerDiarization)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-purple-500 focus:ring-offset-2 ${
                  speakerDiarization ? 'bg-purple-600' : 'bg-slate-200 dark:bg-slate-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-md ring-0 transition duration-200 ease-in-out ${
                    speakerDiarization ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* 3. Language Preference Selector */}
            <div className="border-t border-slate-200/50 dark:border-slate-800/80 pt-4 space-y-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-1.5 font-semibold text-slate-800 dark:text-slate-200">
                  <Languages className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Language Pin & Strict Detection</span>
                </label>
                <span className="text-[11px] text-slate-400">Default: Auto-Detect</span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                {[
                  { id: 'auto', label: 'Auto-Detect', sub: '50+ Languages' },
                  { id: 'khmer', label: 'Khmer Only', sub: 'ភាសាខ្មែរ សុទ្ធ' },
                  { id: 'english', label: 'English Only', sub: 'Native verbatim' },
                  { id: 'bilingual', label: 'Bilingual', sub: 'Khmer + English' }
                ].map((item) => {
                  const isSelected = languagePreference === item.id
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setLanguagePreference(item.id as any)}
                      className={`flex flex-col items-start rounded-xl p-2.5 text-left transition-all cursor-pointer border ${
                        isSelected
                          ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/50 ring-1 ring-emerald-500/20 shadow-2xs'
                          : 'border-slate-200/80 dark:border-slate-700 bg-white/70 dark:bg-slate-900/60 hover:bg-slate-100/70 dark:hover:bg-slate-800'
                      }`}
                    >
                      <span className={`text-xs font-bold ${isSelected ? 'text-emerald-800 dark:text-emerald-200' : 'text-slate-800 dark:text-slate-200'}`}>
                        {item.label}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-slate-400 mt-0.5">
                        {item.sub}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Reset Defaults button */}
            {activeCount > 0 && (
              <div className="flex justify-end pt-1">
                <button
                  type="button"
                  onClick={resetAdvancedOptions}
                  className="text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 underline transition-colors cursor-pointer"
                >
                  Reset to default settings
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
