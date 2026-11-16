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
  Keyboard,
  Upload
} from 'lucide-react'
import { formatTimestamp } from '@/lib/transcript'

type AudioPlayerProps = {
  onAttachFile: (file: File) => void
  src?: string | null
  text?: string
  duration?: number
  currentTime: number
  seekRequest?: { time: number; sequence: number }
  onSeek: (time: number) => void
  onTimeUpdate: (time: number) => void
}

const PLAYBACK_SPEEDS = [0.75, 1.0, 1.25, 1.5, 2.0]

export default function AudioPlayer({
  onAttachFile,
  src,
  text,
  duration = 0,
  currentTime,
  seekRequest,
  onSeek,
  onTimeUpdate
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const synthRef = useRef<SpeechSynthesisUtterance | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
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

  // Stop any active SpeechSynthesis on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    }
  }, [])

  const stopSpeechSynthesis = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel()
    }
    synthRef.current = null
  }

  const startSpeechSynthesis = (targetTime: number) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !text) return
    window.speechSynthesis.cancel()

    const cleanText = text.trim()
    if (!cleanText) return

    const progressRatio = audioDuration > 0 ? Math.min(1, Math.max(0, targetTime / audioDuration)) : 0
    const words = cleanText.split(/\s+/)
    const startWordIndex = Math.floor(progressRatio * words.length)
    const textToSpeak = words.slice(startWordIndex).join(' ')
    if (!textToSpeak.trim()) return

    const utterance = new SpeechSynthesisUtterance(textToSpeak)
    utterance.rate = playbackSpeed

    // Voice selection: detect Khmer or English
    const voices = window.speechSynthesis.getVoices()
    const isKhmer = /[\u1780-\u17FF]/.test(cleanText)
    const voice = voices.find((v) => isKhmer ? v.lang.startsWith('km') : v.lang.startsWith('en'))
    if (voice) utterance.voice = voice

    utterance.onboundary = (e) => {
      if (e.name === 'word' && words.length > 0) {
        const spokenWordCount = textToSpeak.slice(0, e.charIndex).split(/\s+/).length
        const totalWordIdx = startWordIndex + spokenWordCount
        const approxTime = (totalWordIdx / words.length) * audioDuration
        onTimeUpdate(Math.min(audioDuration, approxTime))
      }
    }

    utterance.onend = () => {
      setIsPlaying(false)
      onTimeUpdate(audioDuration)
    }

    utterance.onerror = (err) => {
      if (err.error !== 'interrupted' && err.error !== 'canceled') {
        console.warn('SpeechSynthesis error:', err)
      }
      setIsPlaying(false)
    }

    synthRef.current = utterance
    window.speechSynthesis.speak(utterance)
  }

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

    let frame = 0
    let lastUpdate = 0
    const tick = (now: number) => {
      if (audio.paused || audio.ended) return
      if (now - lastUpdate >= 32) {
        onTimeUpdate(audio.currentTime)
        lastUpdate = now
      }
      frame = requestAnimationFrame(tick)
    }

    const handleEnded = () => {
      cancelAnimationFrame(frame)
      handleTimeUpdate()
      setIsPlaying(false)
    }

    const handlePlay = () => {
      cancelAnimationFrame(frame)
      frame = requestAnimationFrame(tick)
      setIsPlaying(true)
    }

    const handlePause = () => {
      cancelAnimationFrame(frame)
      handleTimeUpdate()
      setIsPlaying(false)
    }

    audio.addEventListener('loadedmetadata', handleLoadedMetadata)
    audio.addEventListener('timeupdate', handleTimeUpdate)
    audio.addEventListener('ended', handleEnded)
    audio.addEventListener('play', handlePlay)
    audio.addEventListener('pause', handlePause)
    if (!audio.paused) handlePlay()

    return () => {
      cancelAnimationFrame(frame)
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata)
      audio.removeEventListener('timeupdate', handleTimeUpdate)
      audio.removeEventListener('ended', handleEnded)
      audio.removeEventListener('play', handlePlay)
      audio.removeEventListener('pause', handlePause)
    }
  }, [hasNativeAudio, onTimeUpdate, src])

  // Only explicit seek requests may change playback position. Clock updates never seek.
  useEffect(() => {
    if (!seekRequest) return
    const audio = audioRef.current
    if (audio && hasNativeAudio) audio.currentTime = seekRequest.time
    else if (isPlaying) startSpeechSynthesis(seekRequest.time)
    // Playback state is intentionally excluded: pressing Play must not reapply an old seek.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seekRequest, hasNativeAudio, src])

  // 4. Keyboard Shortcuts: Space (play/pause), ArrowLeft/Right (-5s/+5s)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input, textarea, or contentEditable
      const target = e.target as HTMLElement
      if (
        e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey ||
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.closest('button, select, summary, a') ||
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
        audioRef.current.play().catch((err) => {
          console.warn('Native audio playback could not start:', err)
        })
      }
    } else {
      // When native audio is not attached, play via browser SpeechSynthesis
      if (isPlaying) {
        stopSpeechSynthesis()
        setIsPlaying(false)
      } else {
        startSpeechSynthesis(currentTime)
        setIsPlaying(true)
      }
    }
  }

  const handleSkip = (seconds: number) => {
    const newTime = Math.max(0, Math.min(audioDuration, currentTime + seconds))
    onSeek(newTime)
  }

  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = Number.parseFloat(e.target.value)
    onSeek(newTime)
  }

  const cycleSpeed = () => {
    const currentIndex = PLAYBACK_SPEEDS.indexOf(playbackSpeed)
    const nextSpeed = PLAYBACK_SPEEDS[(currentIndex + 1) % PLAYBACK_SPEEDS.length]
    setPlaybackSpeed(nextSpeed)
    if (hasNativeAudio && audioRef.current) {
      audioRef.current.playbackRate = nextSpeed
    } else if (isPlaying) {
      startSpeechSynthesis(currentTime)
    }
  }

  const handleAttachFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    onAttachFile(file)
    stopSpeechSynthesis()
    setIsPlaying(false)
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
    <div className="px-3 py-2 sm:apple-glass-card sm:rounded-2xl sm:border sm:border-slate-200/80 sm:p-5 sm:shadow-xs sm:dark:border-slate-800">
      {hasNativeAudio && src && (
        <audio
          ref={audioRef}
          src={src}
          preload="auto"
          playsInline
        />
      )}

      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 sm:flex sm:flex-col sm:items-stretch sm:gap-3.5">
        {/* Header Indicator */}
        <div className={`${hasNativeAudio ? 'hidden sm:flex' : 'col-span-3 row-start-2 flex sm:order-none'} items-center justify-between text-xs text-slate-500 dark:text-slate-400`}>
          <div className="flex flex-wrap items-center gap-2 font-medium">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-950 text-blue-600 dark:text-blue-400">
              <Headphones className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-slate-900 dark:text-white">
              {hasNativeAudio ? 'Original audio' : 'Voice reader'}
            </span>
            {hasNativeAudio ? (
              <span className="rounded-md bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300">
                Uploaded Audio
              </span>
            ) : (
              <div className="flex items-center gap-1.5">
                <span className="hidden rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/60 dark:text-blue-300 sm:flex sm:items-center sm:gap-1">
                  <Volume2 className="h-3 w-3" /> Voice Reader (TTS)
                </span>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*"
                  className="hidden"
                  onChange={handleAttachFile}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center gap-1 rounded-md bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 px-2 py-0.5 text-[10px] font-medium text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
                  title="Attach original audio or video file from your computer"
                >
                  <Upload className="h-2.5 w-2.5" />
                  <span>Attach Audio</span>
                </button>
              </div>
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
        <div className="relative hidden h-10 w-full items-center gap-0.5 overflow-hidden rounded-xl bg-slate-100/60 px-1 py-1 dark:bg-slate-800/50 sm:flex">
          {waveBars.map((heightPercent, idx) => {
            const barPosPercent = (idx / waveBars.length) * 100
            const isPlayed = barPosPercent <= progressPercent
            return (
              <div
                key={idx}
                onClick={() => {
                  const targetTime = (idx / waveBars.length) * displayTotal
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
        <div className="col-start-2 row-start-1 flex min-w-0 items-center gap-1.5 sm:gap-3">
          <span className="shrink-0 text-right font-mono text-[10px] font-bold text-slate-800 tabular-nums dark:text-slate-200 sm:w-14 sm:text-xs">
            {formatTimestamp(currentTime)}
          </span>

          <div className="relative flex min-w-0 flex-1 items-center">
            <input
              type="range"
              min="0"
              max={displayTotal || 100}
              step="0.1"
              value={currentTime}
              onChange={handleScrubberChange}
              aria-label="Playback position"
              className="h-2 w-full min-w-0 cursor-pointer appearance-none rounded-full bg-slate-200/80 accent-blue-600 focus-visible:ring-2 focus-visible:ring-blue-500 dark:bg-slate-700/80"
              style={{
                background: `linear-gradient(to right, #0071e3 ${progressPercent}%, rgba(203, 213, 225, 0.6) ${progressPercent}%)`
              }}
            />
          </div>

          <span className="shrink-0 font-mono text-[10px] font-semibold text-slate-500 tabular-nums dark:text-slate-400 sm:w-14 sm:text-xs">
            {formatTimestamp(displayTotal)}
          </span>
        </div>

        {/* Controls Toolbar */}
        <div className="contents sm:flex sm:items-center sm:justify-between sm:pt-1">
          <div className="contents sm:flex sm:items-center sm:gap-2">
            {/* Skip Back 5s */}
            <button
              onClick={() => handleSkip(-5)}
              className="hidden rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:block"
              title="Skip back 5 seconds (Left Arrow)"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            {/* Play / Pause Primary Button */}
            <button
              onClick={togglePlay}
              className="apple-btn-primary col-start-1 row-start-1 flex h-10 w-10 items-center justify-center rounded-full text-white shadow-md shadow-blue-500/20 transition-transform active:scale-95 sm:h-11 sm:w-11"
              aria-label={isPlaying ? 'Pause' : 'Play'}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? <Pause className="h-5 w-5 fill-white" /> : <Play className="h-5 w-5 fill-white ml-0.5" />}
            </button>

            {/* Skip Forward 5s */}
            <button
              onClick={() => handleSkip(5)}
              className="hidden rounded-xl p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white sm:block"
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

          <div className="contents sm:flex sm:items-center sm:gap-2">
            {/* Speed Selector */}
            <button
              onClick={cycleSpeed}
              className="col-start-3 row-start-1 flex min-h-10 min-w-10 items-center justify-center gap-1.5 rounded-full border border-slate-200/80 bg-white/90 px-2 text-xs font-bold text-slate-700 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700 sm:min-h-0 sm:px-3 sm:py-1.5"
              title="Change playback speed"
            >
              <Gauge className="hidden h-3.5 w-3.5 text-blue-600 dark:text-blue-400 sm:block" />
              <span>{playbackSpeed}x</span>
            </button>

            {/* Volume Control (Only for native audio) */}
            {hasNativeAudio && (
              <div className="relative hidden items-center sm:flex">
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
