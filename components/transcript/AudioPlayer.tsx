'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Gauge,
  Headphones,
  Sparkles
} from 'lucide-react'
import { formatTimestamp } from '@/lib/transcript'

type AudioPlayerProps = {
  src?: string | null
  text?: string
  duration?: number
  currentTime: number
  onSeek: (time: number) => void
  onTimeUpdate: (time: number) => void
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]

export default function AudioPlayer({
  src,
  text,
  duration = 0,
  currentTime,
  onSeek,
  onTimeUpdate
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const timerRef = useRef<NodeJS.Timeout | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [isMuted, setIsMuted] = useState(false)
  const [audioDuration, setAudioDuration] = useState(duration || 60)

  const hasNativeAudio = Boolean(src)

  useEffect(() => {
    if (duration > 0) {
      setAudioDuration(duration)
    }
  }, [duration])

  // 1. Native Audio Event Handlers
  useEffect(() => {
    const audio = audioRef.current
    if (!audio || !hasNativeAudio) return

    const handleLoadedMetadata = () => {
      if (audio.duration && Number.isFinite(audio.duration)) {
        setAudioDuration(audio.duration)
      }
    }

    const handleTimeUpdate = () => {
      onTimeUpdate(audio.currentTime)
    }

    const handleEnded = () => {
      setIsPlaying(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)

    return () => {
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
    }
  }, [hasNativeAudio, onTimeUpdate])

  const currentTimeRef = useRef(currentTime)
  useEffect(() => {
    currentTimeRef.current = currentTime
  }, [currentTime])

  // 2. Synthetic Playback / Timer Synchronizer when no native audio file is attached (e.g. URL transcripts)
  useEffect(() => {
    if (hasNativeAudio) return

    if (isPlaying) {
      const intervalMs = 100
      timerRef.current = setInterval(() => {
        const next = currentTimeRef.current + (intervalMs / 1000) * playbackSpeed
        if (next >= audioDuration) {
          setIsPlaying(false)
          onTimeUpdate(audioDuration)
        } else {
          onTimeUpdate(next)
        }
      }, intervalMs)
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [isPlaying, hasNativeAudio, playbackSpeed, audioDuration, onTimeUpdate])

  // 3. Sync external seek (when user clicks a timestamp in the transcript)
  useEffect(() => {
    const audio = audioRef.current
    if (audio && hasNativeAudio && Math.abs(audio.currentTime - currentTime) > 0.3) {
      audio.currentTime = currentTime
    }
  }, [currentTime, hasNativeAudio])

  const togglePlay = () => {
    if (hasNativeAudio && audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause()
        setIsPlaying(false)
      } else {
        audioRef.current.play().catch(() => {})
        setIsPlaying(true)
      }
    } else {
      // Synthetic speech / timer toggle
      if (isPlaying) {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
          window.speechSynthesis.cancel()
        }
        setIsPlaying(false)
      } else {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window && text) {
          try {
            window.speechSynthesis.cancel()
            const utterance = new SpeechSynthesisUtterance(text.slice(0, 1000))
            utterance.rate = playbackSpeed
            utterance.onend = () => setIsPlaying(false)
            window.speechSynthesis.speak(utterance)
          } catch {}
        }
        setIsPlaying(true)
      }
    }
  }

  const handleSkip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(audioDuration, currentTime + seconds))
    if (hasNativeAudio && audioRef.current) {
      audioRef.current.currentTime = newTime
    }
    onSeek(newTime)
  }

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number.parseFloat(e.target.value)
    if (hasNativeAudio && audioRef.current) {
      audioRef.current.currentTime = newTime
    }
    onSeek(newTime)
  }

  const cycleSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
    const nextSpeed = PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length]
    setPlaybackSpeed(nextSpeed)
    if (hasNativeAudio && audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  const toggleMute = () => {
    if (hasNativeAudio && audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const displayTotal = audioDuration > 0 ? audioDuration : duration || 60
  const progressPercent = displayTotal > 0 ? (currentTime / displayTotal) * 100 : 0

  return (
    <div className="apple-glass-card rounded-2xl p-4 sm:p-5 transition-all shadow-xs">
      {hasNativeAudio && src && <audio ref={audioRef} src={src} preload="metadata" />}

      <div className="flex flex-col gap-3">
        {/* Header Indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-1.5 font-medium">
            <Headphones className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
            <span>{hasNativeAudio ? 'Interactive Audio Player' : 'Synchronized Playback Simulator'}</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="text-[11px] font-medium text-slate-400">Click any timestamp below to jump</span>
          </div>
        </div>

        {/* Scrubber and Times */}
        <div className="flex items-center gap-3">
          <span className="w-12 text-right font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
            {formatTimestamp(currentTime)}
          </span>

          <div className="relative flex-1 flex items-center">
            <input
              type="range"
              min="0"
              max={displayTotal || 100}
              step="0.1"
              value={currentTime}
              onChange={handleScrubberChange}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-slate-200/80 dark:bg-slate-700/80 accent-blue-600 transition-all focus:outline-none"
              style={{
                background: `linear-gradient(to right, #0071e3 ${progressPercent}%, rgba(203, 213, 225, 0.6) ${progressPercent}%)`
              }}
            />
          </div>

          <span className="w-12 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400">
            {formatTimestamp(displayTotal)}
          </span>
        </div>

        {/* Controls Toolbar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {/* Skip Back 5s */}
            <button
              onClick={() => handleSkip(-5)}
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
              title="Skip back 5 seconds"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            {/* Play / Pause Primary Button */}
            <button
              onClick={togglePlay}
              className="apple-btn-primary flex h-10 w-10 items-center justify-center rounded-full text-white shadow-sm transition-transform active:scale-95 cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="h-4 w-4 fill-white" /> : <Play className="h-4 w-4 fill-white ml-0.5" />}
            </button>

            {/* Skip Forward 5s */}
            <button
              onClick={() => handleSkip(5)}
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
              title="Skip forward 5 seconds"
            >
              <RotateCw className="h-4 w-4" />
            </button>

            {/* Soundwave animation when playing */}
            {isPlaying && (
              <div className="hidden sm:flex items-center gap-0.5 ml-2">
                <span className="h-3 w-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-5 w-1 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-4 w-1 rounded-full bg-blue-400 animate-bounce" style={{ animationDelay: '300ms' }} />
                <span className="h-6 w-1 rounded-full bg-blue-500 animate-bounce" style={{ animationDelay: '100ms' }} />
                <span className="h-3 w-1 rounded-full bg-blue-600 animate-bounce" style={{ animationDelay: '250ms' }} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Speed Selector */}
            <button
              onClick={cycleSpeed}
              className="flex items-center gap-1 rounded-full border border-slate-200/80 bg-white/80 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-colors cursor-pointer"
              title="Change playback speed"
            >
              <Gauge className="h-3 w-3 text-blue-600 dark:text-blue-400" />
              <span>{playbackSpeed}x</span>
            </button>

            {/* Mute Toggle (Only if native audio exists) */}
            {hasNativeAudio && (
              <button
                onClick={toggleMute}
                className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                title={isMuted ? 'Unmute' : 'Mute'}
              >
                {isMuted ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4" />}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
