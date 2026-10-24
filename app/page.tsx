'use client'

import { useState } from 'react'
import Link from 'next/link'
import HeroSoundwaveVisualizer from '@/components/hero/HeroSoundwaveVisualizer'
import { motion } from 'framer-motion'
import {
  Sparkles,
  Globe2,
  Zap,
  ShieldCheck,
  ArrowRight,
  Bot,
  Cpu,
  FileAudio,
  Users,
  FileText,
  CheckCircle2,
  ChevronDown,
  Radio,
  ExternalLink,
  Play,
  Download,
  Lock,
  Headphones,
  Sliders,
  Check
} from 'lucide-react'

export default function Home() {
  const [openFaqIdx, setOpenFaqIdx] = useState<number | null>(0)

  const toggleFaq = (idx: number) => {
    setOpenFaqIdx(openFaqIdx === idx ? null : idx)
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-10 sm:px-6 sm:pt-14 space-y-16 sm:space-y-20">
      {/* Hero Header with Apple HIG Aesthetic */}
      <header className="mx-auto max-w-3xl text-center">
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/80 dark:border-blue-900/60 dark:bg-blue-950/40 px-3.5 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 shadow-xs backdrop-blur-md"
        >
          <Sparkles className="h-3.5 w-3.5 text-blue-600 dark:text-blue-400 animate-pulse" />
          <span>Next-Gen Audio & Video Intelligence</span>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="text-4xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-5xl lg:text-6xl sm:leading-[1.12]"
        >
          Turn speech into clear,{' '}
          <span className="bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 bg-clip-text text-transparent">
            verbatim text.
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mt-5 text-base sm:text-lg leading-relaxed text-slate-600 dark:text-slate-300 max-w-2xl mx-auto"
        >
          Multilingual transcription & subtitle generator engineered for Khmer, English & 50+ languages.
          Automatic language detection, speaker diarization, and synced exports.
        </motion.p>

        {/* Primary CTA Buttons */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3"
        >
          <Link
            href="/transcribe"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:from-blue-700 hover:to-indigo-700 transition-all active:scale-95 cursor-pointer"
          >
            <Sparkles className="h-4 w-4" />
            Start Transcribing Free
            <ArrowRight className="h-4 w-4" />
          </Link>

          <Link
            href="/transcribe?demo=1"
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-5 py-3.5 text-sm font-semibold text-slate-800 dark:text-slate-200 shadow-xs hover:bg-slate-50 dark:hover:bg-slate-800/80 transition-all active:scale-95 cursor-pointer"
          >
            <Play className="h-3.5 w-3.5 fill-current text-blue-600 dark:text-blue-400" />
            Try 15s Bilingual Sample
          </Link>
        </motion.div>

        {/* Feature Badges */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mt-6 flex flex-wrap items-center justify-center gap-2 sm:gap-3 text-xs font-medium text-slate-600 dark:text-slate-300"
        >
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <Globe2 className="h-3.5 w-3.5 text-blue-500" /> Khmer & English Native
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <Zap className="h-3.5 w-3.5 text-amber-500" /> Up to 2GB Direct Upload
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" /> Cookieless & Private
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100/90 dark:bg-slate-900/90 px-3 py-1 ring-1 ring-slate-200/60 dark:ring-slate-800 shadow-2xs">
            <Bot className="h-3.5 w-3.5 text-indigo-500" /> Telegram Companion
          </span>
        </motion.div>

        {/* Quick Jump Links */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="mt-6 flex items-center justify-center gap-4 text-xs font-medium text-slate-500 dark:text-slate-400"
        >
          <a href="#welcome-guide" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Quick Guide ↓
          </a>
          <span>·</span>
          <a href="#how-it-works" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            How It Works ↓
          </a>
          <span>·</span>
          <a href="#features" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Key Features ↓
          </a>
          <span>·</span>
          <a href="#telegram-bot" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            Telegram Bot ↓
          </a>
          <span>·</span>
          <a href="#faq" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
            FAQ ↓
          </a>
        </motion.div>
      </header>

      {/* Interactive Hero Live Soundwave & Karaoke Captions Visualizer */}
      <section className="w-full">
        <HeroSoundwaveVisualizer />
      </section>

      {/* Inline Welcome & Quick Guide Section (No Popups!) */}
      <section id="welcome-guide" className="scroll-mt-20">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="rounded-full bg-blue-100 dark:bg-blue-950/60 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20">
            Welcome to Signal AI
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Everything you need to turn speech into verbatim text
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Three core superpowers engineered for Cambodian creators, journalists, and teams.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Card 1: Khmer Precision */}
          <div className="apple-glass rounded-3xl p-6 relative flex flex-col justify-between group hover:border-blue-500/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-sm">
                  ខ្មែរ
                </span>
                <span className="rounded-full bg-blue-50 dark:bg-blue-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:text-blue-300">
                  Unicode 15.0
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Khmer & English Dual Engine
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Tuned specifically for subscript consonants (ជើងអក្សរ), tone rules, and mixed Khmer-English colloquialisms without phonetic corruption.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-800 space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-blue-500" /> Zero missing subscript letters
              </div>
              <div className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-blue-500" /> Color-coded speaker diarization
              </div>
            </div>
          </div>

          {/* Card 2: Free Guest Tier */}
          <div className="apple-glass rounded-3xl p-6 relative flex flex-col justify-between group hover:border-emerald-500/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                  3x
                </span>
                <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">
                  Zero Sign-In
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Free Guest Tier
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Transcribe up to 3 files completely free with no password or credit card required. Or jump directly into our 15-second bilingual sample demo.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-800">
              <Link
                href="/transcribe?demo=1"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2 text-xs font-bold text-white shadow-xs transition-all active:scale-95 cursor-pointer"
              >
                <Play className="h-3 w-3 fill-white" />
                Try Interactive Demo Sample
              </Link>
            </div>
          </div>

          {/* Card 3: Telegram Companion */}
          <div className="apple-glass rounded-3xl p-6 relative flex flex-col justify-between group hover:border-indigo-500/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                  <Bot className="h-5 w-5" />
                </span>
                <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-0.5 text-[10px] font-semibold text-indigo-700 dark:text-indigo-300">
                  Mobile Companion
                </span>
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Telegram Voice Transcriber
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Forward any voice note or video clip to @transcript_signal_bot and receive formatted transcripts & .SRT subtitle files right inside your chat.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-800">
              <a
                href="https://t.me/transcript_signal_bot"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 text-white dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 py-2 text-xs font-bold transition-all cursor-pointer"
              >
                <Bot className="h-3.5 w-3.5 text-blue-400" />
                Open @transcript_signal_bot
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* Live Telemetry & Trust Metrics Bar */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <div className="apple-glass rounded-2xl p-4 sm:p-5 text-center transition-all hover:scale-[1.02]">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            500K+
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Words Transcribed
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" /> High Verbatim Precision
          </div>
        </div>

        <div className="apple-glass rounded-2xl p-4 sm:p-5 text-center transition-all hover:scale-[1.02]">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            99.8%
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Khmer Unicode Accuracy
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-blue-600 dark:text-blue-400">
            <Sparkles className="h-3 w-3" /> Dialect Code-Switching
          </div>
        </div>

        <div className="apple-glass rounded-2xl p-4 sm:p-5 text-center transition-all hover:scale-[1.02]">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            &lt; 1.2s
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Fleet Latency
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-indigo-600 dark:text-indigo-400">
            <Radio className="h-3 w-3 animate-pulse" /> Self-Healing Routing
          </div>
        </div>

        <div className="apple-glass rounded-2xl p-4 sm:p-5 text-center transition-all hover:scale-[1.02]">
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-950 dark:text-white">
            2.0 GB
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-500 dark:text-slate-400">
            Max Upload Capacity
          </div>
          <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-medium text-purple-600 dark:text-purple-400">
            <Zap className="h-3 w-3" /> 3+ Hour Long-Form
          </div>
        </div>
      </section>

      {/* How It Works (3-Step Visual Workflow) */}
      <section id="how-it-works" className="scroll-mt-20">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="rounded-full bg-blue-100 dark:bg-blue-950/60 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20">
            Seamless Workflow
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            From raw audio to finished transcript in three steps
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Engineered for creators, students, journalists, and teams in Cambodia and worldwide.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <div className="apple-glass rounded-3xl p-6 relative flex flex-col justify-between group hover:border-blue-500/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-500/10 text-blue-600 dark:text-blue-400 font-bold text-sm">
                  01
                </span>
                <FileAudio className="h-5 w-5 text-slate-400 group-hover:text-blue-500 transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Drop Media or Link
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Upload MP3, WAV, MP4, M4A, MOV files up to 2GB, record live speech directly in your browser, or paste YouTube, TikTok & Facebook URLs.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-800 flex items-center justify-between text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>All major codecs supported</span>
              <Link href="/transcribe" className="text-blue-600 dark:text-blue-400 font-semibold hover:underline">
                Open Studio →
              </Link>
            </div>
          </div>

          {/* Step 2 */}
          <div className="apple-glass rounded-3xl p-6 relative flex flex-col justify-between group hover:border-indigo-500/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 font-bold text-sm">
                  02
                </span>
                <Cpu className="h-5 w-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Multi-Pass AI Processing
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Audio is normalized to 16kHz mono, separated from background noise, and processed with automatic speaker identification & Khmer tone alignment.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-800 flex items-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Gemini 2.5 self-healing fleet</span>
            </div>
          </div>

          {/* Step 3 */}
          <div className="apple-glass rounded-3xl p-6 relative flex flex-col justify-between group hover:border-emerald-500/30 transition-all">
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-bold text-sm">
                  03
                </span>
                <Download className="h-5 w-5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                Review & Export Subtitles
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                Listen with synchronized audio scrubbing, edit text inline, and download formatted .SRT, .VTT, .TXT or sync automatically to Cloud History.
              </p>
            </div>
            <div className="mt-6 pt-4 border-t border-slate-200/60 dark:border-slate-800 flex items-center text-[11px] font-medium text-slate-500 dark:text-slate-400">
              <span>Clickable timestamps & SRT generator</span>
            </div>
          </div>
        </div>
      </section>

      {/* Feature Bento Grid */}
      <section id="features" className="scroll-mt-20">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="rounded-full bg-indigo-100 dark:bg-indigo-950/60 px-3 py-1 text-xs font-semibold text-indigo-700 dark:text-indigo-300 ring-1 ring-indigo-500/20">
            Engineered for Precision
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Advanced intelligence built into every transcribe
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Cutting-edge speech algorithms tuned for real-world acoustics and multilingual conversations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {/* Bento Item 1: Bilingual Engine (Col span 2) */}
          <div className="apple-glass rounded-3xl p-7 md:col-span-2 relative overflow-hidden flex flex-col justify-between group">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 dark:bg-blue-950/60 px-3 py-1 text-xs font-semibold text-blue-700 dark:text-blue-300 ring-1 ring-blue-500/20 mb-3">
                <Globe2 className="h-3.5 w-3.5" />
                Khmer Unicode 15.0 + Code-Switching
              </div>
              <h3 className="text-xl sm:text-2xl font-bold text-slate-950 dark:text-white">
                Bilingual Khmer & English Recognition
              </h3>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300 max-w-xl leading-relaxed">
                Specially tuned to recognize mixed Khmer-English colloquial speech, complex subscript consonants (ជើងអក្សរ), and modern conversational loanwords without phonetic corruption or missing characters.
              </p>

              {/* Sample Visual Snippet */}
              <div className="mt-5 rounded-2xl bg-white/70 dark:bg-slate-900/70 p-4 ring-1 ring-slate-200/80 dark:ring-slate-800 backdrop-blur-xs font-mono text-xs text-slate-800 dark:text-slate-200 space-y-1.5">
                <div className="flex items-center gap-2 text-slate-400 text-[11px]">
                  <span className="text-emerald-500 font-semibold">[00:03.20]</span> Speaker 1:
                </div>
                <div className="text-slate-900 dark:text-slate-100 font-sans">
                  « សួស្តីបងប្អូនទាំងអស់គ្នា! ថ្ងៃនេះយើងនឹងមក share ពី technique ក្នុងការ transcribe audio អោយបាន accurate បំផុត »
                </div>
              </div>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-medium text-blue-600 dark:text-blue-400">
              <Check className="h-4 w-4" /> Zero transliteration artifacts
            </div>
          </div>

          {/* Bento Item 2: Self-Healing Fleet */}
          <div className="apple-glass rounded-3xl p-7 relative overflow-hidden flex flex-col justify-between group">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 dark:bg-amber-950/60 px-3 py-1 text-xs font-semibold text-amber-700 dark:text-amber-300 ring-1 ring-amber-500/20 mb-3">
                <Radio className="h-3.5 w-3.5 animate-pulse" />
                High Availability
              </div>
              <h3 className="text-xl font-bold text-slate-950 dark:text-white">
                4-Model Self-Healing Fleet
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Adaptive real-time load balancer automatically routes and retries between Gemini 2.5 Pro, Flash, Thinking, and Invidious audio proxies for 99.99% uptime.
              </p>
            </div>
            <div className="mt-6 rounded-xl bg-slate-100/80 dark:bg-slate-900/80 p-3 ring-1 ring-slate-200/70 dark:ring-slate-800 text-[11px] font-mono text-slate-600 dark:text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                Fleet Active
              </span>
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Ready</span>
            </div>
          </div>

          {/* Bento Item 3: Speaker Diarization */}
          <div className="apple-glass rounded-3xl p-7 relative overflow-hidden flex flex-col justify-between group">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-purple-50 dark:bg-purple-950/60 px-3 py-1 text-xs font-semibold text-purple-700 dark:text-purple-300 ring-1 ring-purple-500/20 mb-3">
                <Users className="h-3.5 w-3.5" />
                Diarization
              </div>
              <h3 className="text-xl font-bold text-slate-950 dark:text-white">
                Speaker Identification
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Identifies who is speaking and separates conversations with color-coded speaker badges and synchronized audio navigation.
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              <span className="rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 px-2.5 py-0.5 text-[11px] font-semibold">
                Speaker 1
              </span>
              <span className="rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800 px-2.5 py-0.5 text-[11px] font-semibold">
                Speaker 2
              </span>
              <span className="rounded-full bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-200/80 dark:border-amber-800 px-2.5 py-0.5 text-[11px] font-semibold">
                Host
              </span>
            </div>
          </div>

          {/* Bento Item 4: Studio Voice Separation */}
          <div className="apple-glass rounded-3xl p-7 relative overflow-hidden flex flex-col justify-between group">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-rose-50 dark:bg-rose-950/60 px-3 py-1 text-xs font-semibold text-rose-700 dark:text-rose-300 ring-1 ring-rose-500/20 mb-3">
                <Sliders className="h-3.5 w-3.5" />
                Acoustic Studio
              </div>
              <h3 className="text-xl font-bold text-slate-950 dark:text-white">
                Voice Isolation & Normalization
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                In-browser 16kHz mono audio normalization strips out background hiss, fans, and room reverb before transcription begins.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-medium text-slate-500 dark:text-slate-400">
              <Headphones className="h-4 w-4 text-rose-500" />
              <span>Studio-grade voice clarity</span>
            </div>
          </div>

          {/* Bento Item 5: Cookieless & Private */}
          <div className="apple-glass rounded-3xl p-7 relative overflow-hidden flex flex-col justify-between group">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-300 ring-1 ring-emerald-500/20 mb-3">
                <Lock className="h-3.5 w-3.5" />
                Cookieless Privacy
              </div>
              <h3 className="text-xl font-bold text-slate-950 dark:text-white">
                100% Private & Tracker-Free
              </h3>
              <p className="mt-2 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed">
                Zero advertising trackers, zero marketing cookies. Your media is processed ephemerally and never used to train public models.
              </p>
            </div>
            <div className="mt-6 flex items-center gap-2 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <ShieldCheck className="h-4 w-4" />
              <span>GDPR / ePrivacy compliant</span>
            </div>
          </div>
        </div>
      </section>

      {/* Telegram Bot Showcase */}
      <section id="telegram-bot" className="scroll-mt-20">
        <div className="relative overflow-hidden rounded-3xl border border-indigo-200/70 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-900/90 via-slate-900 to-slate-950 p-8 sm:p-12 text-white shadow-xl">
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-80 h-80 rounded-full bg-blue-500/10 blur-3xl pointer-events-none" />
          <div className="absolute bottom-0 left-0 -ml-16 -mb-16 w-80 h-80 rounded-full bg-violet-500/10 blur-3xl pointer-events-none" />

          <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            <div className="lg:col-span-7 space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1 text-xs font-semibold text-blue-200 backdrop-blur-md">
                <Bot className="h-4 w-4 text-blue-300" />
                <span>Mobile Companion Bot</span>
              </div>

              <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight text-white leading-tight">
                Transcribe voice notes on the fly with Telegram
              </h2>

              <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
                On your phone? Simply forward voice messages, audio tracks, or video notes to{' '}
                <strong className="text-white">@transcript_signal_bot</strong>.
                Receive formatted transcripts, clickable timestamps, and .SRT subtitle files right inside your chat.
              </p>

              <div className="pt-2 flex flex-wrap items-center gap-4">
                <a
                  href="https://t.me/transcript_signal_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white px-5 py-3 text-sm font-bold text-slate-950 shadow-md hover:bg-slate-100 transition-all active:scale-95 cursor-pointer"
                >
                  <Bot className="h-4 w-4 text-blue-600" />
                  Open @transcript_signal_bot
                  <ExternalLink className="h-3.5 w-3.5 text-slate-500" />
                </a>

                <Link
                  href="/transcribe"
                  className="inline-flex items-center gap-2 rounded-2xl bg-white/10 hover:bg-white/15 px-5 py-3 text-sm font-semibold text-white transition-all backdrop-blur-md cursor-pointer"
                >
                  Open Web Studio
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className="pt-4 flex flex-wrap items-center gap-4 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Voice notes up to 20MB
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Auto-sync to Web History
                </span>
                <span className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-emerald-400" /> Free to use
                </span>
              </div>
            </div>

            {/* Telegram Chat Mockup */}
            <div className="lg:col-span-5">
              <div className="rounded-2xl border border-white/10 bg-slate-900/90 p-5 shadow-2xl backdrop-blur-md space-y-3 font-sans text-xs">
                <div className="flex items-center gap-2.5 pb-3 border-b border-white/10">
                  <div className="h-8 w-8 rounded-full bg-blue-500 flex items-center justify-center font-bold text-white text-xs">
                    ST
                  </div>
                  <div>
                    <div className="font-semibold text-white flex items-center gap-1">
                      Signal Transcript Bot
                      <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                    </div>
                    <div className="text-[10px] text-slate-400">@transcript_signal_bot · bot</div>
                  </div>
                </div>

                {/* User Message */}
                <div className="flex justify-end">
                  <div className="rounded-2xl rounded-tr-xs bg-blue-600 px-3.5 py-2 text-white max-w-[85%]">
                    <div className="flex items-center gap-2 text-[11px] font-medium">
                      <FileAudio className="h-3.5 w-3.5" /> Voice_Message_04.ogg (1:14)
                    </div>
                  </div>
                </div>

                {/* Bot Response */}
                <div className="flex justify-start">
                  <div className="rounded-2xl rounded-tl-xs bg-slate-800/90 border border-white/10 px-3.5 py-2.5 text-slate-200 max-w-[92%] space-y-1.5">
                    <div className="flex items-center justify-between text-[10px] text-blue-400 font-semibold">
                      <span>⚡ TRANSCRIPT READY (Khmer + English)</span>
                      <span>00:01s</span>
                    </div>
                    <p className="text-[11px] text-slate-100 leading-snug">
                      « អរគុណសម្រាប់ការទាក់ទងមក! Welcome to the meeting. We are reviewing the quarterly report today. »
                    </p>
                    <div className="pt-1.5 flex items-center gap-2 text-[10px] text-slate-400 border-t border-white/10">
                      <span>📄 Download:</span>
                      <span className="text-blue-300 font-mono">.SRT</span>
                      <span>·</span>
                      <span className="text-blue-300 font-mono">.TXT</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Interactive FAQ Accordion */}
      <section id="faq" className="scroll-mt-20">
        <div className="text-center max-w-xl mx-auto mb-10">
          <span className="rounded-full bg-slate-200 dark:bg-slate-800 px-3 py-1 text-xs font-semibold text-slate-700 dark:text-slate-300 ring-1 ring-slate-300 dark:ring-slate-700">
            Frequently Asked Questions
          </span>
          <h2 className="mt-3 text-2xl sm:text-3xl font-bold tracking-tight text-slate-950 dark:text-white">
            Everything you need to know
          </h2>
          <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
            Clear answers about accuracy, pricing, privacy, and file compatibility.
          </p>
        </div>

        <div className="max-w-3xl mx-auto space-y-3">
          {[
            {
              q: 'How accurate is the Khmer script transcription?',
              a: 'We use a specialized pipeline specifically tuned for Khmer Unicode 15.0, subscript consonants (ជើងអក្សរ), tone markers, and natural Khmer-English code-switching commonly spoken in Cambodian media and meetings. Accuracy regularly exceeds 99.8% on clear audio tracks.'
            },
            {
              q: 'Can I transcribe files for free without creating an account?',
              a: 'Yes! Any visitor can immediately transcribe up to 3 files or test our instant 15-second bilingual sample completely free with zero sign-in. To save your transcripts indefinitely in Cloud History, unlock batch processing, or link Telegram, simply sign in free with Google.'
            },
            {
              q: 'What media formats and file sizes are supported?',
              a: 'We support all standard audio and video formats, including MP3, WAV, MP4, M4A, AAC, FLAC, OGG, WebM, MOV, and MKV. You can upload single files up to 2GB in size, accommodating lectures and long-form podcasts up to 3+ hours.'
            },
            {
              q: 'Do you use tracking cookies or sell my audio data?',
              a: 'Never. We use strictly necessary, cryptographically signed session tokens for user authentication. There are zero tracking pixels, zero marketing cookies, and zero third-party data broker integrations. Your audio is processed ephemerally and never used for public model training.'
            },
            {
              q: 'How does the Telegram bot companion work?',
              a: 'Open @transcript_signal_bot in Telegram, tap Start, and forward any voice message, audio file, or video note. The bot transcribes it in real time and replies with formatted text, timestamps, and downloadable .SRT files right inside your chat.'
            }
          ].map((item, idx) => (
            <div
              key={idx}
              className="apple-glass rounded-2xl overflow-hidden transition-all duration-200"
            >
              <button
                type="button"
                onClick={() => toggleFaq(idx)}
                className="w-full flex items-center justify-between p-5 text-left text-sm sm:text-base font-semibold text-slate-900 dark:text-white hover:text-blue-600 dark:hover:text-blue-400 transition-colors cursor-pointer"
              >
                <span>{item.q}</span>
                <ChevronDown
                  className={`h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 ${
                    openFaqIdx === idx ? 'rotate-180 text-blue-600 dark:text-blue-400' : ''
                  }`}
                />
              </button>
              {openFaqIdx === idx && (
                <div className="px-5 pb-5 text-xs sm:text-sm text-slate-600 dark:text-slate-300 leading-relaxed border-t border-slate-200/50 dark:border-slate-800 pt-3">
                  {item.a}
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Bottom Conversion CTA */}
      <section className="relative overflow-hidden rounded-3xl border border-blue-200/60 dark:border-blue-900/40 bg-gradient-to-r from-blue-600 via-indigo-600 to-violet-600 p-8 sm:p-12 text-white text-center shadow-lg">
        <div className="max-w-2xl mx-auto space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1 text-xs font-semibold text-white backdrop-blur-md">
            <Sparkles className="h-3.5 w-3.5" />
            <span>Ready in seconds</span>
          </div>

          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white">
            Start transcribing with verbatim accuracy today
          </h2>

          <p className="text-sm sm:text-base text-blue-100 max-w-xl mx-auto leading-relaxed">
            Try 3 files free or test with our instant sample. No credit card required.
          </p>

          <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
            <Link
              href="/transcribe"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-white px-6 py-3.5 text-sm font-bold text-slate-950 shadow-md hover:bg-slate-100 transition-all active:scale-95 cursor-pointer"
            >
              Start Transcribing Free
              <ArrowRight className="h-4 w-4 text-indigo-600" />
            </Link>

            <a
              href="https://t.me/transcript_signal_bot"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 rounded-2xl bg-white/15 hover:bg-white/20 px-6 py-3.5 text-sm font-semibold text-white transition-all backdrop-blur-md cursor-pointer"
            >
              <Bot className="h-4 w-4" />
              Try Telegram Bot
            </a>
          </div>
        </div>
      </section>
    </div>
  )
}
