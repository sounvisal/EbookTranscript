'use client'

import { useEffect, useRef, useState, useMemo } from 'react'
import {
  Play,
  Pause,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
  Gauge,
  Headphones,
  Sliders,
  Keyboard
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
  const [volume, setVolume] = useState(1.0)
  const [audioDuration, setAudioDuration] = useState(duration || 60)
  const [showVolumeSlider, setShowVolumeSlider] = useState(false)

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
      if (audio.duration && Number.isFinite(audio.duration) && audio.duration > 0) {
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

  // 2. Synthetic Playback / Timer Synchronizer when no native audio file is attached
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

  // 3. Sync external seek (when user clicks a timestamp or word in transcript)
  useEffect(() => {
    const audio = audioRef.current
    if (audio && hasNativeAudio && Math.abs(audio.currentTime - currentTime) > 0.3) {
      audio.currentTime = currentTime
    }
  }, [currentTime, hasNativeAudio])

  // 4. Keyboard Shortcuts: Space (play/pause), ArrowLeft/Right (-5s/+5s)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return
      }

      if (e.code === 'Space') {
        e.preventDefault()
        togglePlay()
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault()
        handleSkip(-5)
      } else if (e.code === 'ArrowRight') {
        e.preventDefault()
        handleSkip(5)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isPlaying, hasNativeAudio, audioDuration, currentTime])

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

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = Number.parseFloat(e.target.value)
    setVolume(newVol)
    if (hasNativeAudio && audioRef.current) {
      audioRef.current.volume = newVol
      if (newVol === 0) {
        audioRef.current.muted = true
        setIsMuted(true)
      } else if (isMuted) {
        audioRef.current.muted = false
        setIsMuted(false)
      }
    }
  }

  const displayTotal = audioDuration > 0 ? audioDuration : duration || 60
  const progressPercent = displayTotal > 0 ? Math.min(100, (currentTime / displayTotal) * 100) : 0

  // Generate responsive waveform pseudo-bars
  const waveBars = useMemo(() => {
    const heights = [
      40, 65, 30, 85, 45, 95, 70, 40, 80, 55,
      90, 60, 35, 75, 50, 100, 65, 45, 85, 55,
      70, 40, 90, 60, 80, 50, 95, 40, 75, 60,
      85, 45, 70, 90, 55, 65, 40, 80, 60, 50
    ]
    return heights
  }, [])

  return (
    <div className="apple-glass-card rounded-2xl p-4 sm:p-5 transition-all shadow-xs border border-slate-200/80 dark:border-slate-800">
      {hasNativeAudio && src && <audio ref={audioRef} src={src} preload="metadata" />}

      <div className="flex flex-col gap-3.5">
        {/* Header Indicator */}
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <div className="flex items-center gap-2 font-medium">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Headphones className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {hasNativeAudio ? 'Interactive Audio Player' : 'Playback Simulator'}
            </span>
            {hasNativeAudio && (
              <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                Audio Loaded
              </span>
            )}
          </div>

          <div className="hidden sm:flex items-center gap-2 text-[11px] text-slate-400">
            <span className="inline-flex items-center gap-1 font-mono">
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] ring-1 ring-slate-200 dark:ring-slate-700">Space</kbd> Play/Pause
            </span>
            <span>·</span>
            <span className="inline-flex items-center gap-1 font-mono">
              <kbd className="rounded bg-slate-100 dark:bg-slate-800 px-1 py-0.5 text-[10px] ring-1 ring-slate-200 dark:ring-slate-700">← / →</kbd> ±5s
            </span>
          </div>
        </div>

        {/* Visual Waveform + Interactive Seeking */}
        <div className="relative h-10 w-full flex items-center gap-0.5 px-1 py-1 rounded-xl bg-slate-100/60 dark:bg-slate-800/50 overflow-hidden cursor-pointer group">
          {waveBars.map((heightPercent, idx) => {
            const barPosPercent = (idx / waveBars.length) * 100
            const isPlayed = barPosPercent <= progressPercent
            return (
              <div
                key={idx}
                onClick={() => {
                  const targetTime = (idx / waveBars.length) * displayTotal
                  if (hasNativeAudio && audioRef.current) {
                    audioRef.current.currentTime = targetTime
                  }
                  onSeek(targetTime)
                }}
                className="flex-1 h-full flex items-center justify-center transition-all"
                title={`Seek to ${formatTimestamp((idx / waveBars.length) * displayTotal)}`}
              >
                <div
                  className={`w-full rounded-full transition-all duration-150 ${
                    isPlayed
                      ? 'bg-blue-600 dark:bg-blue-500 shadow-2xs'
                      : 'bg-slate-300/80 dark:bg-slate-700 hover:bg-blue-400 dark:hover:bg-blue-600'
                  }`}
                  style={{ height: `${heightPercent}%` }}
                />
              </div>
            )
          })}
        </div>

        {/* Scrubber and Time Indicators */}
        <div className="flex items-center gap-3">
          <span className="w-14 text-right font-mono text-xs font-bold text-slate-800 dark:text-slate-200 tabular-nums">
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

          <span className="w-14 font-mono text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums">
            {formatTimestamp(displayTotal)}
          </span>
        </div>

        {/* Controls Toolbar */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            {/* Skip Back 5s */}
            <button
              onClick={() => handleSkip(-5)}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
              title="Skip back 5 seconds (Left Arrow)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            {/* Play / Pause Primary Button */}
            <button
              onClick={togglePlay}
              className="apple-btn-primary flex h-11 w-11 items-center justify-center rounded-full text-white shadow-md shadow-blue-500/20 transition-transform active:scale-95 cursor-pointer"
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white ml-0.5" />}
            </button>

            {/* Skip Forward 5s */}
            <button
              onClick={() => handleSkip(5)}
              className="rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white transition-colors cursor-pointer"
              title="Skip forward 5 seconds (Right Arrow)"
            >
              <RotateCw className="h-4 w-4" />
            </button>

            {/* Equalizer Wave Indicator */}
            {isPlaying && (
              <div className="hidden sm:flex items-center gap-1 ml-2 px-2 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60">
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
              className="flex items-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 transition-all cursor-pointer shadow-2xs"
              title="Change playback speed"
            >
              <Gauge className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400" />
              <span>{playbackSpeed}x</span>
            </button>

            {/* Volume Control (Only for native audio) */}
            {hasNativeAudio && (
              <div className="relative flex items-center">
                <button
                  onClick={toggleMute}
                  onMouseEnter={() => setShowVolumeSlider(true)}
                  className="rounded-full p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                  title={isMuted ? 'Unmute' : 'Mute'}
                >
                  {isMuted || volume === 0 ? <VolumeX className="h-4 w-4 text-red-500" /> : <Volume2 className="h-4 w-4" />}
                </button>

                {showVolumeSlider && (
                  <div
                    onMouseLeave={() => setShowVolumeSlider(false)}
                    className="absolute right-0 bottom-full mb-2 p-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-lg flex items-center z-30 animate-in fade-in zoom-in-95"
                  >
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={isMuted ? 0 : volume}
                      onChange={handleVolumeChange}
                      className="h-1.5 w-20 cursor-pointer appearance-none rounded-full bg-slate-200 dark:bg-slate-700 accent-blue-600"
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
