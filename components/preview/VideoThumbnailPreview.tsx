'use client'

import { useEffect, useState } from 'react'
import { Film, Loader2, Play } from 'lucide-react'

export function VideoThumbnailPreview({ file }: { file: File }) {
  const [thumbnail, setThumbnail] = useState<string | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let isCancelled = false
    let objectUrl = ''

    try {
      objectUrl = URL.createObjectURL(file)
    } catch {
      setLoading(false)
      return
    }

    const video = document.createElement('video')
    video.preload = 'metadata'
    video.muted = true
    video.playsInline = true

    const timeout = setTimeout(() => {
      if (isCancelled) return
      setLoading(false)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }, 6000)

    video.onloadedmetadata = () => {
      if (isCancelled) return
      const dur = Number.isFinite(video.duration) ? video.duration : 0
      setDuration(Math.round(dur * 10) / 10)
      if (video.videoWidth && video.videoHeight) {
        setDimensions({ width: video.videoWidth, height: video.videoHeight })
      }
      // Seek to 10% of duration (or 1s) to avoid black opening slate
      video.currentTime = Math.min(Math.max(0.5, dur * 0.1), Math.max(0, dur - 0.5))
    }

    video.onseeked = () => {
      if (isCancelled) return
      try {
        const canvas = document.createElement('canvas')
        const width = Math.min(video.videoWidth || 640, 640)
        const ratio = (video.videoHeight || 360) / (video.videoWidth || 640)
        canvas.width = width
        canvas.height = Math.round(width * ratio)

        const ctx = canvas.getContext('2d')
        ctx?.drawImage(video, 0, 0, canvas.width, canvas.height)

        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        setThumbnail(dataUrl)
      } catch (err) {
        console.warn('Video frame snapshot error:', err)
      } finally {
        clearTimeout(timeout)
        setLoading(false)
        if (objectUrl) URL.revokeObjectURL(objectUrl)
      }
    }

    video.onerror = () => {
      if (isCancelled) return
      clearTimeout(timeout)
      setLoading(false)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }

    video.src = objectUrl

    return () => {
      isCancelled = true
      clearTimeout(timeout)
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file])

  const formatDuration = (d: number | null) => {
    if (!d || d <= 0) return null
    const m = Math.floor(d / 60)
    const s = Math.floor(d % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  if (loading) {
    return (
      <div className="relative w-full h-36 rounded-2xl border border-blue-100/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 flex items-center justify-center">
        <div className="flex items-center gap-2.5 text-xs text-slate-500 dark:text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          <span>Generating video frame preview…</span>
        </div>
      </div>
    )
  }

  return (
    <div className="relative w-full rounded-2xl border border-blue-100/80 dark:border-slate-800 overflow-hidden bg-slate-950 shadow-sm">
      {thumbnail ? (
        <div className="relative h-44 sm:h-48 w-full overflow-hidden flex items-center justify-center bg-black/60">
          <img
            src={thumbnail}
            alt="Video frame preview"
            className="w-full h-full object-cover opacity-90 transition-transform duration-300 hover:scale-105"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />

          {/* Center Play Icon Badge */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/25 backdrop-blur-md text-white shadow-lg ring-1 ring-white/30">
              <Play className="h-5 w-5 fill-white ml-0.5" />
            </span>
          </div>

          {/* Top Info Pills */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur-md px-2.5 py-1 text-[11px] font-semibold text-white ring-1 ring-white/20">
              <Film className="h-3 w-3 text-blue-400" />
              <span>Video Verified</span>
            </span>
          </div>

          {/* Bottom Duration & Resolution */}
          <div className="absolute bottom-3 left-3 right-3 flex items-center justify-between text-xs font-semibold text-white">
            <span className="font-mono text-[11px] text-slate-200">
              {dimensions ? `${dimensions.width}x${dimensions.height}` : 'HD Video'}
            </span>
            {duration && (
              <span className="rounded-md bg-black/70 backdrop-blur-md px-2 py-0.5 font-mono text-[11px] text-white ring-1 ring-white/10">
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>
      ) : (
        <div className="h-32 flex flex-col items-center justify-center gap-2 bg-slate-900 text-slate-400 text-xs">
          <Film className="h-7 w-7 text-slate-500" />
          <span>Video ready for transcription</span>
        </div>
      )}
    </div>
  )
}
