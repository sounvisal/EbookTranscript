'use client'

import { useEffect, useState, Suspense } from 'react'
import { useParams, useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { useSession, signIn } from 'next-auth/react'
import InputTabs from '@/components/input/InputTabs'
import ProcessingPanel from '@/components/processing/ProcessingPanel'
import TranscriptPanel from '@/components/transcript/TranscriptPanel'
import { useTranscriptStore, getCachedSessionMedia } from '@/store/transcriptStore'
import { getMediaBlob } from '@/lib/mediaStorage'
import { extractIdFromSlug } from '@/lib/transcriptSlug'
import { loadDemoSample } from '@/lib/demoSample'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Sparkles,
  ArrowLeft,
  Globe2,
  Zap,
  ShieldCheck,
  Loader2,
  Lock,
  AlertCircle,
  FileQuestion
} from 'lucide-react'

function TranscribeContent() {
  const params = useParams()
  const searchParams = useSearchParams()
  const router = useRouter()
  const { status: authStatus } = useSession()

  const status = useTranscriptStore((state) => state.status)
  const currentTranscript = useTranscriptStore((state) => state.transcript)
  const setTranscriptWithAudio = useTranscriptStore((state) => state.setTranscriptWithAudio)
  const resetAll = useTranscriptStore((state) => state.resetAll)

  const [isLoadingDeepLink, setIsLoadingDeepLink] = useState(false)
  const [deepLinkError, setDeepLinkError] = useState<'unauthorized' | 'not_found' | 'error' | null>(null)

  // Resolve target ID from clean path /transcribe/[slug] or ?id=... or ?slug=...
  const rawSlug = (params?.slug as string) || searchParams.get('slug') || searchParams.get('id')
  const targetId = extractIdFromSlug(rawSlug)

  // Auto-load demo if ?demo=1 query parameter is passed
  useEffect(() => {
    const isDemo = searchParams.get('demo')
    if (isDemo === '1' || isDemo === 'true') {
      loadDemoSample()
    }
  }, [searchParams])

  // Restore transcript when accessing clean path /transcribe/[slug] or ?id=...
  useEffect(() => {
    if (!targetId) return

    // If already loaded in store, no need to re-fetch
    if (currentTranscript?.id === targetId && status === 'complete') {
      return
    }

    let isCancelled = false

    const loadTargetTranscript = async () => {
      setIsLoadingDeepLink(true)
      setDeepLinkError(null)

      try {
        const res = await fetch(`/api/history?id=${encodeURIComponent(targetId)}`, { cache: 'no-store' })
        if (isCancelled) return

        if (res.status === 401) {
          setDeepLinkError('unauthorized')
          return
        }

        if (!res.ok) {
          setDeepLinkError('not_found')
          return
        }

        const data = await res.json()
        if (isCancelled) return

        const sourceName = data.filename || data.source || 'Transcript'

        // 1. Check in-memory session cache first
        let mediaUrl: string | null = null
        let mediaFile: File | null = null
        let mediaBlob: Blob | null = null

        const cached =
          getCachedSessionMedia(data.id) ||
          (data.filename ? getCachedSessionMedia(data.filename) : undefined) ||
          (data.source ? getCachedSessionMedia(data.source) : undefined) ||
          getCachedSessionMedia(sourceName)

        if (cached) {
          mediaUrl = cached.url
          mediaFile = cached.file || null
          mediaBlob = cached.blob || null
        } else {
          // 2. Retrieve genuine audio file binary from local browser IndexedDB
          try {
            const storedBlob = await getMediaBlob(data.id, data.filename || data.source || sourceName)
            if (storedBlob) {
              mediaBlob = storedBlob
              mediaUrl = URL.createObjectURL(storedBlob)
            }
          } catch (storageErr) {
            console.warn('Failed to retrieve audio from IndexedDB:', storageErr)
          }
        }

        setTranscriptWithAudio(
          {
            id: data.id,
            text: data.rawText || data.text,
            source: sourceName,
            duration: data.duration || 0,
            language: data.language || 'auto',
            alreadySaved: true
          },
          mediaUrl,
          mediaFile,
          mediaBlob
        )
      } catch (fetchErr) {
        console.error('Error restoring transcript by ID:', fetchErr)
        if (!isCancelled) setDeepLinkError('error')
      } finally {
        if (!isCancelled) setIsLoadingDeepLink(false)
      }
    }

    loadTargetTranscript()

    return () => {
      isCancelled = true
    }
  }, [targetId, authStatus, currentTranscript?.id, status, setTranscriptWithAudio])

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10 space-y-8">
      {/* Top Workspace Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200/60 dark:border-slate-800">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-blue-600 dark:text-slate-400 dark:hover:text-blue-400 transition-colors"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Back to Home</span>
            </Link>
            <span className="text-slate-300 dark:text-slate-700">/</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-[11px] font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20">
              <Sparkles className="h-3 w-3" /> Studio
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            Transcription Studio
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
            Upload audio or video files, record live voice, or paste media links.
          </p>
        </div>

        {/* Feature Badges */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-600 dark:text-slate-300">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <Globe2 className="h-3.5 w-3.5 text-blue-500" /> Khmer & English
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Up to 2GB
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Private
          </span>
        </div>
      </div>

      {/* Main Interactive Studio Stage */}
      <main className="w-full">
        {isLoadingDeepLink ? (
          <div className="flex flex-col items-center justify-center p-20 text-center rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/70 dark:bg-slate-900/60 backdrop-blur-md">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600 dark:text-blue-400 mb-3" />
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Restoring Transcript & Audio</h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
              Loading transcription records and checking local storage for original playback audio…
            </p>
          </div>
        ) : deepLinkError === 'unauthorized' ? (
          <div className="flex flex-col items-center justify-center p-14 text-center rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 shadow-xs">
            <div className="h-12 w-12 rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600 dark:text-amber-400 mb-4 ring-1 ring-amber-500/20">
              <Lock className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Sign In Required</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
              This saved transcript belongs to a private user account. Please sign in to access it.
            </p>
            <div className="mt-6 flex items-center gap-3">
              <button
                onClick={() => signIn()}
                className="apple-btn-primary rounded-full px-5 py-2 text-xs sm:text-sm font-semibold text-white"
              >
                Sign In
              </button>
              <Link
                href="/transcribe"
                onClick={() => resetAll()}
                className="rounded-full border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-2 text-xs sm:text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50"
              >
                New Transcription
              </Link>
            </div>
          </div>
        ) : deepLinkError === 'not_found' ? (
          <div className="flex flex-col items-center justify-center p-14 text-center rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/70 shadow-xs">
            <div className="h-12 w-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 mb-4">
              <FileQuestion className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-slate-900 dark:text-white">Transcript Not Found</h2>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1 max-w-md">
              The transcript linked by this URL could not be found or may have been deleted.
            </p>
            <Link
              href="/transcribe"
              onClick={() => {
                resetAll()
                router.replace('/transcribe')
              }}
              className="apple-btn-primary mt-6 rounded-full px-5 py-2 text-xs sm:text-sm font-semibold text-white"
            >
              Start New Transcription
            </Link>
          </div>
        ) : (
          <AnimatePresence mode="wait">
            {status === 'idle' || status === 'error' ? (
              <motion.div
                key="input"
                initial={{ opacity: 0, y: 10, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.99 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                <InputTabs />
              </motion.div>
            ) : status === 'uploading' || status === 'processing' ? (
              <motion.div
                key="processing"
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.25 }}
              >
                <ProcessingPanel />
              </motion.div>
            ) : status === 'complete' ? (
              <motion.div
                key="complete"
                initial={{ opacity: 0, y: 10, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
              >
                <TranscriptPanel />
              </motion.div>
            ) : null}
          </AnimatePresence>
        )}
      </main>
    </div>
  )
}

export default function TranscribePage() {
  return (
    <Suspense fallback={<div className="min-h-[50vh] flex items-center justify-center text-sm text-slate-500">Loading Transcription Studio…</div>}>
      <TranscribeContent />
    </Suspense>
  )
}
