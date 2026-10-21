'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { Play, Pause, Sparkles, Volume2, VolumeX, ArrowRight, Users, Globe2 } from 'lucide-react'

interface WordTiming {
  word: string
  start: number
  end: number
  speaker: string
  isKhmer?: boolean
}

const DEMO_WORDS: WordTiming[] = [
  { word: '« សួស្តី', start: 0.0, end: 0.8, speaker: 'Speaker 1', isKhmer: true },
  { word: 'បងប្អូន', start: 0.8, end: 1.5, speaker: 'Speaker 1', isKhmer: true },
  { word: 'ទាំងអស់គ្នា!', start: 1.5, end: 2.4, speaker: 'Speaker 1', isKhmer: true },
  { word: 'Welcome', start: 2.4, end: 3.1, speaker: 'Speaker 1' },
  { word: 'to', start: 3.1, end: 3.5, speaker: 'Speaker 1' },
  { word: 'Signal AI.', start: 3.5, end: 4.5, speaker: 'Speaker 1' },
  { word: 'បាទ', start: 4.5, end: 5.2, speaker: 'Speaker 2', isKhmer: true },
  { word: 'សួស្តី!', start: 5.2, end: 6.0, speaker: 'Speaker 2', isKhmer: true },
  { word: 'Speech-to-Text', start: 6.0, end: 7.5, speaker: 'Speaker 2' },
  { word: 'កម្រិតខ្ពស់', start: 7.5, end: 8.8, speaker: 'Speaker 2', isKhmer: true },
  { word: 'Verbatim »', start: 8.8, end: 10.46, speaker: 'Speaker 2' }
]

const TOTAL_DURATION = 10.46

export default function HeroSoundwaveVisualizer() {
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [isMuted, setIsMuted] = useState(false)
  const [activeWordIdx, setActiveWordIdx] = useState<number>(-1)
  const [currentSpeaker, setCurrentSpeaker] = useState('Speaker 1')
  const [waveSeed, setWaveSeed] = useState(0)

  const audioRef = useRef<HTMLAudioElement | null>(null)
  const animFrameRef = useRef<number | null>(null)

  // Animation loop for pulsing soundwave bars during playback
  useEffect(() => {
    if (!isPlaying) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
      return
    }

    let frame = 0
    const loop = () => {
      frame++
      setWaveSeed(frame)
      animFrameRef.current = requestAnimationFrame(loop)
    }

    animFrameRef.current = requestAnimationFrame(loop)
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    }
  }, [isPlaying])

  const handleTimeUpdate = () => {
    if (!audioRef.current) return
    const time = audioRef.current.currentTime || 0
    setCurrentTime(time)

    const matchedIdx = DEMO_WORDS.findIndex(
      (w) => time >= w.start && time < w.end
    )

    if (matchedIdx !== -1) {
      setActiveWordIdx(matchedIdx)
      setCurrentSpeaker(DEMO_WORDS[matchedIdx].speaker)
    } else {
      setActiveWordIdx(-1)
    }
  }

  const handleTogglePlay = async () => {
    if (!audioRef.current) return

    if (isPlaying) {
      audioRef.current.pause()
      setIsPlaying(false)
    } else {
      try {
        await audioRef.current.play()
        setIsPlaying(true)
      } catch (err) {
        console.error('Playback error:', err)
      }
    }
  }

  const handleToggleMute = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (!audioRef.current) return
    const nextMuted = !isMuted
    audioRef.current.muted = nextMuted
    setIsMuted(nextMuted)
  }

  // 32 Soundwave Bar heights
  const bars = Array.from({ length: 32 }, (_, i) => {
    if (!isPlaying) {
      return 15 + ((i * 7) % 25)
    }
    const wave = Math.sin((waveSeed * 0.12) + (i * 0.45)) * 32 + 48
    const variance = ((i * 11) % 18)
    return Math.max(12, Math.min(95, wave + variance))
  })

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.18, duration: 0.4 }}
      className="apple-glass rounded-3xl p-5 sm:p-7 relative overflow-hidden border border-blue-200/70 dark:border-blue-900/50 shadow-xl"
    >
      {/* Real HTML5 Audio Element */}
      <audio
        ref={audioRef}
        src="/audio/demo_visualizer.mp3"
        preload="auto"
        playsInline
        onTimeUpdate={handleTimeUpdate}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          if (audioRef.current) {
            audioRef.current.currentTime = 0
            audioRef.current.play().catch(() => {})
          }
        }}
      />

      {/* Background dynamic ambient glow */}
      <div className="absolute top-0 right-1/4 -mt-10 w-64 h-32 bg-blue-500/10 dark:bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-1/4 -mb-10 w-64 h-32 bg-indigo-500/10 dark:bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />

      {/* Header Bar */}
      <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200/60 dark:border-slate-800">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-xs">
            <Sparkles className="h-4 w-4 animate-pulse" />
          </span>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs sm:text-sm font-bold text-slate-950 dark:text-white">
                Live Speech & Subtitle Visualizer
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                Spoken Voice Audio
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Listen to real bilingual speech with synchronized word highlights and speaker tags
            </p>
          </div>
        </div>

        {/* Diarization Badge & Audio Mute */}
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold transition-all duration-300 ${
              currentSpeaker === 'Speaker 1'
                ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/30'
                : 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/30'
            }`}
          >
            <Users className="h-3 w-3" />
            <span>{currentSpeaker}</span>
          </span>

          <button
            type="button"
            onClick={handleToggleMute}
            title={isMuted ? 'Unmute voice' : 'Mute voice'}
            className="flex h-7 w-7 items-center justify-center rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors cursor-pointer"
          >
            {isMuted ? <VolumeX className="h-3.5 w-3.5 text-rose-500" /> : <Volume2 className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {/* Main Interactive Stage: Soundwave + Glowing Live Captions */}
      <div className="relative z-10 py-5 space-y-5">
        {/* Animated Soundwave Equalizer */}
        <div className="h-14 sm:h-16 flex items-end justify-center gap-1 sm:gap-1.5 px-2">
          {bars.map((height, i) => (
            <div
              key={i}
              style={{ height: `${height}%` }}
              className={`w-1.5 sm:w-2 rounded-full transition-all duration-75 ${
                isPlaying
                  ? 'bg-gradient-to-t from-blue-600 via-indigo-500 to-cyan-400 dark:from-blue-500 dark:via-indigo-400 dark:to-cyan-300 shadow-xs'
                  : 'bg-slate-200 dark:bg-slate-800'
              }`}
            />
          ))}
        </div>

        {/* Live Synchronized Glowing Subtitle Bar */}
        <div className="rounded-2xl bg-white/80 dark:bg-slate-900/80 p-4 sm:p-5 ring-1 ring-slate-200/80 dark:ring-slate-800 backdrop-blur-md shadow-xs">
          <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2 text-sm sm:text-base font-medium">
            {DEMO_WORDS.map((item, idx) => {
              const isActive = activeWordIdx === idx
              return (
                <span
                  key={idx}
                  className={`relative px-2 py-0.5 rounded-lg transition-all duration-150 ${
                    isActive
                      ? 'bg-blue-600 text-white font-bold scale-110 shadow-md ring-2 ring-blue-400'
                      : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white'
                  } ${item.isKhmer ? 'font-sans text-base sm:text-lg' : ''}`}
                >
                  {item.word}
                  {isActive && (
                    <motion.span
                      layoutId="karaoke-glow"
                      className="absolute inset-0 rounded-lg bg-blue-500/20 blur-xs -z-10"
                    />
                  )}
                </span>
              )
            })}
          </div>

          {/* Subtitle Format Pill */}
          <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span className="flex items-center gap-1.5">
              <Globe2 className="h-3 w-3 text-blue-500" />
              Real Spoken Voice (Khmer + English)
            </span>
            <span>
              {currentTime.toFixed(1)}s / {TOTAL_DURATION.toFixed(1)}s
            </span>
          </div>
        </div>
      </div>

      {/* Control Strip & Full Demo Button */}
      <div className="relative z-10 pt-2 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <button
            type="button"
            id="hero-play-speech-btn"
            onClick={handleTogglePlay}
            className={`w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl px-5 py-2.5 text-xs sm:text-sm font-bold text-white transition-all shadow-md active:scale-95 cursor-pointer ${
              isPlaying
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700'
            }`}
          >
            {isPlaying ? (
              <>
                <Pause className="h-4 w-4" /> Pause Speech
              </>
            ) : (
              <>
                <Play className="h-4 w-4 fill-white" /> Listen to Spoken Voice
              </>
            )}
          </button>

          <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
            {isPlaying ? 'Playing spoken voice audio…' : 'Click to hear real spoken speech'}
          </span>
        </div>

        {/* Link to Dedicated Studio */}
        <Link
          href="/transcribe"
          className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800/90 hover:bg-slate-200 dark:hover:bg-slate-700/90 px-4 py-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-all active:scale-95 cursor-pointer"
        >
          <span>Open Full Studio</span>
          <ArrowRight className="h-3.5 w-3.5 text-blue-500" />
        </Link>
      </div>
    </motion.div>
  )
}
