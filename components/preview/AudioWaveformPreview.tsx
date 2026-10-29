'use client'

import { useEffect, useRef, useState } from 'react'
import { Music, Volume2 } from 'lucide-react'

export function AudioWaveformPreview({ file }: { file: File }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [loading, setLoading] = useState(true)
  const [duration, setDuration] = useState<number | null>(null)

  useEffect(() => {
    let isCancelled = false

    const drawFallbackWaveform = () => {
      if (canvasRef.current) {
        const ctx = canvasRef.current.getContext('2d')
        if (ctx) {
          const width = canvasRef.current.width
          const height = canvasRef.current.height
          const bars = 44
          ctx.clearRect(0, 0, width, height)
          for (let i = 0; i < bars; i++) {
            const h = Math.max(8, Math.sin(i * 0.35) * 18 + 26)
            const x = i * (width / bars) + 1.5
            const y = (height - h) / 2
            ctx.fillStyle = '#6366f1'
            ctx.fillRect(x, y, (width / bars) - 3, h)
          }
        }
      }
    }

    const generateWaveform = async () => {
      try {
        setLoading(true)

        // For large media files (> 20MB), avoid decoding full PCM into browser memory to prevent tab freezing
        if (file.size > 20 * 1024 * 1024) {
          drawFallbackWaveform()
          setLoading(false)
          return
        }

        const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
        if (!AudioCtx) {
          drawFallbackWaveform()
          setLoading(false)
          return
        }

        const audioContext = new AudioCtx()
        const arrayBuffer = await file.arrayBuffer()
        const audioBuffer = await audioContext.decodeAudioData(arrayBuffer)
        audioContext.close().catch(() => {})

        if (isCancelled) return

        setDuration(Math.round(audioBuffer.duration * 10) / 10)

        const canvas = canvasRef.current
        if (!canvas) {
          setLoading(false)
          return
        }

        const ctx = canvas.getContext('2d')
        if (!ctx) {
          setLoading(false)
          return
        }

        const width = canvas.width
        const height = canvas.height
        const data = audioBuffer.getChannelData(0)
        const bars = 48
        const step = Math.max(1, Math.floor(data.length / bars))

        ctx.clearRect(0, 0, width, height)

        for (let i = 0; i < bars; i++) {
          const startIndex = i * step
          let sum = 0
          const sampleSize = Math.min(step, data.length - startIndex)
          for (let j = 0; j < sampleSize; j++) {
            sum += Math.abs(data[startIndex + j] || 0)
          }
          const avg = sampleSize > 0 ? sum / sampleSize : 0
          const minHeight = 4
          const barHeight = Math.min(height - 4, Math.max(minHeight, avg * height * 3.5))
          const barWidth = (width / bars) - 2.5
          const x = i * (width / bars) + 1.25
          const y = (height - barHeight) / 2

          // Smooth modern gradient
          const gradient = ctx.createLinearGradient(0, y, 0, y + barHeight)
          gradient.addColorStop(0, '#3b82f6')
          gradient.addColorStop(0.5, '#6366f1')
          gradient.addColorStop(1, '#06b6d4')

          ctx.fillStyle = gradient
          ctx.beginPath()
          ctx.roundRect ? ctx.roundRect(x, y, barWidth, barHeight, 3) : ctx.rect(x, y, barWidth, barHeight)
          ctx.fill()
        }

        setLoading(false)
      } catch (err) {
        console.warn('Audio waveform preview fallback:', err)
        drawFallbackWaveform()
        setLoading(false)
      }
    }

    generateWaveform()
    return () => {
      isCancelled = true
    }
  }, [file])

  const formatDuration = (d: number | null) => {
    if (!d || d <= 0) return null
    const m = Math.floor(d / 60)
    const s = Math.floor(d % 60)
    return `${m}:${s < 10 ? '0' : ''}${s}`
  }

  return (
    <div className="relative w-full rounded-2xl border border-blue-100/80 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-900/80 p-3.5 backdrop-blur-md">
      <div className="flex items-center justify-between mb-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
        <span className="flex items-center gap-1.5 text-blue-600 dark:text-blue-400">
          <Volume2 className="h-3.5 w-3.5" />
          <span>Audio Waveform Analysis</span>
        </span>
        {duration && (
          <span className="font-mono text-[11px] text-slate-500">
            {formatDuration(duration)}
          </span>
        )}
      </div>

      <div className="relative w-full h-16 rounded-xl bg-white/60 dark:bg-slate-950/60 ring-1 ring-slate-200/60 dark:ring-slate-800 overflow-hidden flex items-center justify-center">
        {loading ? (
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Music className="h-4 w-4 text-blue-500" />
            <span>Analyzing audio tracks...</span>
          </div>
        ) : (
          <canvas
            ref={canvasRef}
            width={600}
            height={64}
            className="w-full h-full px-2"
          />
        )}
      </div>
    </div>
  )
}
