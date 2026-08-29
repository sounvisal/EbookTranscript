'use client'

import { useEffect, useRef, useState } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Gauge
} from 'lucide-react'
import { formatTimestamp } from '@/lib/transcript'

type AudioPlayerProps = {
  src: string
  duration?: number
  currentTime: number
  onSeek: (time: number) => void
  onTimeUpdate: (time: number) => void
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]

export default function AudioPlayer({
  src,
  duration = 0,
  currentTime,
  onSeek,
  onTimeUpdate
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [playbackSpeed, setPlaybackSpeed] = useState(1.0)
  const [isMuted, setIsMuted] = useState(false)
  const [audioDuration, setAudioDuration] = useState(duration)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

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
  }, [onTimeUpdate])

  // Sync external seek (when user clicks a timestamp in the transcript)
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return
    if (Math.abs(audio.currentTime - currentTime) > 0.3) {
      audio.currentTime = currentTime
    }
  }, [currentTime])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return

    if (isPlaying) {
      audio.pause()
      setIsPlaying(false)
    } else {
      audio.play().catch(() => {})
      setIsPlaying(true)
    }
  }

  const handleSkip = (seconds: number) => {
    const audio = audioRef.current
    if (!audio) return
    const newTime = Math.max(0, Math.min(audioDuration, audio.currentTime + seconds))
    audio.currentTime = newTime
    onSeek(newTime)
  }

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number.parseFloat(e.target.value)
    const audio = audioRef.current
    if (audio) {
      audio.currentTime = newTime
    }
    onSeek(newTime)
  }

  const cycleSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
    const nextSpeed = PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length]
    setPlaybackSpeed(nextSpeed)
    if (audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    }
  }

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted
      setIsMuted(!isMuted)
    }
  }

  const displayTotal = audioDuration > 0 ? audioDuration : duration
  const progressPercent = displayTotal > 0 ? (currentTime / displayTotal) * 100 : 0

  return (
    <div className="apple-glass-card rounded-2xl p-4 sm:p-5 transition-all">
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex flex-col gap-3 sm:gap-3.5">
        {/* Scrubber and Times */}
        <div className="flex items-center gap-3">
          <span className="w-12 text-right font-mono text-xs font-semibold text-slate-600 dark:text-slate-400">
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
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {/* Skip Back 5s */}
            <button
              onClick={() => handleSkip(-5)}
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
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
              className="rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              title="Skip forward 5 seconds"
            >
              <RotateCw className="h-4 w-4" />
            </button>
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

            {/* Mute Toggle */}
            <button
              onClick={toggleMute}
              className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
