'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Send,
  X,
  Wifi,
  Smartphone,
  BarChart3,
  ExternalLink,
  Loader2
} from 'lucide-react'

interface TelegramControlModalProps {
  isOpen: boolean
  onClose: () => void
  telegramSetup: any
  loadingTelegramSetup: boolean
  registeringWebhook: boolean
  disconnectingWebhook: boolean
  dispatchingDigest: boolean
  testingTelegram: boolean
  onRegisterWebhook: () => void
  onDeleteWebhook: () => void
  onDispatchEveningDigest: () => void
  onTestTelegram: () => void
  chatId?: string | null
}

export function TelegramControlModal({
  isOpen,
  onClose,
  telegramSetup,
  loadingTelegramSetup,
  registeringWebhook,
  disconnectingWebhook,
  dispatchingDigest,
  testingTelegram,
  onRegisterWebhook,
  onDeleteWebhook,
  onDispatchEveningDigest,
  onTestTelegram,
  chatId
}: TelegramControlModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl overflow-hidden flex flex-col gap-4 max-h-[90vh] overflow-y-auto"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-500 border border-sky-500/20">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-extrabold text-base text-slate-900 dark:text-white flex items-center gap-2">
                    <span>Telegram 2-Way Command Center</span>
                    {telegramSetup?.bot?.username && (
                      <span className="text-xs font-mono font-normal text-sky-600 dark:text-sky-400">
                        @{telegramSetup.bot.username}
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    Zero-typing remote phone controls & automated real-time incident alerts.
                  </p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 text-xs">
              {/* 1. Live Webhook 2-Way Connection Status Card */}
              <div className="p-4 rounded-2xl bg-gradient-to-br from-sky-500/5 via-blue-500/5 to-indigo-500/5 border border-sky-200/80 dark:border-sky-900/40 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="relative flex h-2.5 w-2.5">
                      <span
                        className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                          telegramSetup?.webhook?.url ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      <span
                        className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                          telegramSetup?.webhook?.url ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                      />
                    </span>
                    <span className="font-bold text-slate-900 dark:text-white text-xs">
                      {loadingTelegramSetup
                        ? 'Checking Webhook Status...'
                        : telegramSetup?.webhook?.url
                        ? '2-Way Interactive Bot: Active'
                        : 'Webhook Inactive (One-Way Alerts Only)'}
                    </span>
                  </div>

                  {telegramSetup?.webhook?.url ? (
                    <span className="rounded-full bg-emerald-100 dark:bg-emerald-950/60 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-400 border border-emerald-300/40">
                      Webhook Connected
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 dark:bg-amber-950/60 px-2.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400 border border-amber-300/40">
                      Setup Required
                    </span>
                  )}
                </div>

                <div className="flex flex-col gap-1 text-[11px] text-slate-600 dark:text-slate-400">
                  <div className="flex justify-between font-mono">
                    <span>Authorized Admin Chat:</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      {chatId || 'Not Configured'}
                    </span>
                  </div>
                  {telegramSetup?.webhook?.url && (
                    <div className="flex flex-col gap-0.5 mt-1 pt-1 border-t border-slate-200/60 dark:border-slate-800">
                      <span className="text-[10px] text-slate-400">Target Webhook Endpoint:</span>
                      <code className="text-[10px] truncate bg-white/70 dark:bg-slate-950/60 px-2 py-1 rounded-md text-sky-600 dark:text-sky-400">
                        {telegramSetup.webhook.url}
                      </code>
                    </div>
                  )}
                </div>

                {/* Webhook Action Trigger */}
                <div className="pt-1 flex items-center gap-2">
                  <button
                    onClick={onRegisterWebhook}
                    disabled={registeringWebhook}
                    className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 px-4 py-2 text-xs font-bold text-white shadow-md shadow-sky-500/20 hover:opacity-95 active:scale-95 disabled:opacity-50 transition-all cursor-pointer"
                  >
                    {registeringWebhook ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Wifi className="h-4 w-4" />
                    )}
                    <span>
                      {telegramSetup?.webhook?.url
                        ? 'Re-Sync & Push Buttons to Phone'
                        : '🚀 Connect 2-Way Interactive Bot Now'}
                    </span>
                  </button>

                  {telegramSetup?.webhook?.url && (
                    <button
                      onClick={onDeleteWebhook}
                      disabled={disconnectingWebhook}
                      className="rounded-xl border border-red-200 dark:border-red-900/50 bg-red-50/50 dark:bg-red-950/30 px-3 py-2 text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-100 disabled:opacity-50 transition-colors cursor-pointer"
                      title="Disconnect Webhook"
                    >
                      {disconnectingWebhook ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        'Disconnect'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* 2. Zero-Typing Interactive Keyboard Showcase */}
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/80 dark:border-slate-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-900 dark:text-white text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                    <Smartphone className="h-3.5 w-3.5 text-blue-500" />
                    <span>Pinned Telegram Keyboard (No Typing Required)</span>
                  </span>
                  <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                    1-Tap Responses
                  </span>
                </div>

                <p className="text-[11px] text-slate-500 dark:text-slate-400">
                  These 6 physical buttons stay pinned to the bottom of your Telegram chat for instant remote control:
                </p>

                <div className="grid grid-cols-2 gap-2 mt-1">
                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">
                      📊 Live Stats
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Today&apos;s audio duration, words, request volume & error rate
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">
                      🩺 System Health
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Neon DB latency, Gemini API status & Vercel edge probe
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">
                      🔑 Key Fleet
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Multi-key latency probe & 429 quota exhaustion check
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">
                      👥 Active Users
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Recent 5 signups, roles & top transcribers
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">
                      🔄 Run Daily Report
                    </span>
                    <span className="text-[10px] text-slate-400">
                      On-demand trigger for the 6:10 PM performance digest
                    </span>
                  </div>

                  <div className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200/60 dark:border-slate-800/80">
                    <span className="font-bold text-slate-800 dark:text-slate-200 block text-[11px]">
                      🌐 Open Admin Web
                    </span>
                    <span className="text-[10px] text-slate-400">
                      Instant 1-tap launcher to this Web Dashboard
                    </span>
                  </div>
                </div>
              </div>

              {/* 3. Action Buttons */}
              <div className="flex flex-col gap-2 pt-1">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    onClick={onDispatchEveningDigest}
                    disabled={dispatchingDigest}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    {dispatchingDigest ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <BarChart3 className="h-3.5 w-3.5" />
                    )}
                    <span>Dispatch 6:10 PM Digest</span>
                  </button>

                  <button
                    onClick={onTestTelegram}
                    disabled={testingTelegram}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors cursor-pointer"
                  >
                    {testingTelegram ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    <span>Send Ping Test Alert</span>
                  </button>
                </div>

                {telegramSetup?.bot?.username && (
                  <a
                    href={`https://t.me/${telegramSetup.bot.username}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 py-2 text-xs font-bold text-sky-600 dark:text-sky-400 hover:bg-sky-500/20 transition-all"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open @{telegramSetup.bot.username} in Telegram</span>
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
