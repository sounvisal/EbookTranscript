'use client'

import Link from 'next/link'
import Image from 'next/image'
import { Sparkles, ShieldCheck, Heart, Send, ExternalLink, Zap } from 'lucide-react'

export default function Footer() {
  const currentYear = new Date().getFullYear()

  return (
    <footer className="w-full border-t border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-950/70 backdrop-blur-xl transition-colors">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="grid grid-cols-1 gap-10 md:grid-cols-4 lg:gap-12">
          {/* Brand & Fleet Health Status */}
          <div className="flex flex-col gap-4 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 group">
              <div className="relative flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-b from-blue-50 to-blue-100/60 dark:from-blue-950/80 dark:to-blue-900/40 p-1.5 shadow-xs ring-1 ring-black/5 dark:ring-white/10 transition-transform duration-200 group-hover:scale-105">
                <Image src="/logo.png" alt="Signal" width={32} height={32} className="h-full w-full object-contain" />
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-lg font-bold tracking-tight text-slate-950 dark:text-white">Signal</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-600 dark:bg-blue-950/60 dark:text-blue-400 ring-1 ring-blue-500/10">
                  <Sparkles className="h-2.5 w-2.5" /> AI
                </span>
              </div>
            </Link>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-slate-400">
              High-precision multilingual transcription engine for Khmer, English, and viral social media.
            </p>

            {/* Live Model Fleet Status Badge */}
            <div className="mt-2 inline-flex items-center gap-2 rounded-full border border-emerald-200/80 dark:border-emerald-900/60 bg-emerald-50/80 dark:bg-emerald-950/40 px-3 py-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300 shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              <span>Gemini Fleet Active & Healthy</span>
            </div>
          </div>

          {/* Navigation Column: Product */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Product
            </h3>
            <ul className="flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link href="/transcribe" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Web Transcriber
                </Link>
              </li>
              <li>
                <Link href="/history" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Cloud History
                </Link>
              </li>
              <li>
                <Link href="/formats" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Supported Formats
                </Link>
              </li>
              <li>
                <a
                  href="https://t.me/transcript_signal_bot"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                >
                  <Send className="h-3 w-3 text-blue-500" />
                  <span>Telegram Bot</span>
                  <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                </a>
              </li>
            </ul>
          </div>

          {/* Navigation Column: Subtitles & Exports */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Exports & Formats
            </h3>
            <ul className="flex flex-col gap-2.5 text-xs text-slate-600 dark:text-slate-400">
              <li>
                <Link href="/formats#srt" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  SubRip Subtitles (.SRT)
                </Link>
              </li>
              <li>
                <Link href="/formats#vtt" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  WebVTT Captions (.VTT)
                </Link>
              </li>
              <li>
                <Link href="/formats#txt" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Plain Document (.TXT)
                </Link>
              </li>
              <li>
                <Link href="/formats#json" className="hover:text-blue-600 dark:hover:text-blue-400 transition-colors">
                  Structured JSON (.JSON)
                </Link>
              </li>
            </ul>
          </div>

          {/* Privacy & Trust Guarantee */}
          <div className="flex flex-col gap-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
              Privacy & Security
            </h3>
            <div className="flex flex-col gap-2 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
              <div className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500 mt-0.5" />
                <span>
                  <strong>Private & Encrypted:</strong> Uploaded media is processed securely and never used to train public AI models.
                </span>
              </div>
              <div className="flex items-start gap-2">
                <Zap className="h-4 w-4 shrink-0 text-blue-500 mt-0.5" />
                <span>
                  <strong>Cookieless Privacy:</strong> Zero advertising tracking pixels or marketing cookies. Only essential session tokens.
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Attribution & Copyright Bar */}
        <div className="mt-12 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-slate-200/60 dark:border-slate-800/60 pt-6 text-xs text-slate-500 dark:text-slate-400">
          <p>© {currentYear} Signal AI. All rights reserved.</p>

          <p className="flex items-center gap-1.5">
            <span>Built with precision for Cambodia</span>
            <span className="text-red-500">🇰🇭</span>
            <span>& Global Media</span>
          </p>
        </div>
      </div>
    </footer>
  )
}
