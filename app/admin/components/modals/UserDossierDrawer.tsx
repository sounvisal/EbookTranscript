'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Gauge, FileAudio, Loader2 } from 'lucide-react'
import type { UserDossier } from '../../types'

interface UserDossierDrawerProps {
  isOpen: boolean
  userDossier: UserDossier | null
  dossierLoading: boolean
  onClose: () => void
}

export function UserDossierDrawer({
  isOpen,
  userDossier,
  dossierLoading,
  onClose
}: UserDossierDrawerProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 220 }}
            className="relative w-full max-w-xl bg-white dark:bg-slate-900 h-full overflow-y-auto border-l border-slate-200 dark:border-slate-800 p-6 flex flex-col gap-6 shadow-2xl"
          >
            {/* Drawer Header */}
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-blue-600 text-white font-bold text-lg">
                  {userDossier?.name?.[0]?.toUpperCase() || 'U'}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-white text-base">
                    {userDossier?.name || 'User Dossier'}
                  </h3>
                  <span className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                    {userDossier?.email}
                  </span>
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {dossierLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="h-8 w-8 animate-spin text-blue-500" />
                <p className="text-xs text-slate-400">Loading User Dossier & Metrics...</p>
              </div>
            ) : userDossier ? (
              <div className="flex flex-col gap-6 text-xs">
                {/* Quota Progress Card */}
                <div className="p-4 rounded-2xl bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/30 border border-blue-200/70 dark:border-blue-900/50 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                      <Gauge className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      Today&apos;s Audio Quota
                    </span>
                    <span className="font-mono font-bold text-blue-700 dark:text-blue-300">
                      {userDossier.quota.isAdmin
                        ? 'Unlimited (Admin)'
                        : `${userDossier.quota.usedMinutes} / ${userDossier.quota.limitMinutes} mins`}
                    </span>
                  </div>

                  {!userDossier.quota.isAdmin && (
                    <div className="flex flex-col gap-1">
                      <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                        <div
                          style={{
                            width: `${Math.min(
                              100,
                              Math.round((userDossier.quota.usedMinutes / userDossier.quota.limitMinutes) * 100)
                            )}%`
                          }}
                          className={`h-full rounded-full ${
                            userDossier.quota.usedMinutes >= userDossier.quota.limitMinutes
                              ? 'bg-red-500'
                              : 'bg-gradient-to-r from-blue-600 to-indigo-600'
                          }`}
                        />
                      </div>
                      <span className="text-[10px] text-slate-500">
                        {userDossier.quota.remainingMinutes} minutes remaining today. Resets at midnight UTC+7.
                      </span>
                    </div>
                  )}
                </div>

                {/* High-level stats */}
                <div className="grid grid-cols-3 gap-2.5 font-mono text-center">
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">Transcripts</span>
                    <span className="text-base font-bold text-slate-900 dark:text-white">
                      {userDossier.stats.totalTranscripts}
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">Total Audio</span>
                    <span className="text-base font-bold text-slate-900 dark:text-white">
                      {userDossier.stats.totalAudioMinutes}m
                    </span>
                  </div>
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                    <span className="text-[10px] text-slate-400 block font-sans">Success Rate</span>
                    <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                      {userDossier.stats.successRate}%
                    </span>
                  </div>
                </div>

                {/* Account Timeline Info */}
                <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex flex-col gap-1.5 text-[11px]">
                  <div className="flex justify-between">
                    <span className="text-slate-400">Member Since:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {new Date(userDossier.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Last Active:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {new Date(userDossier.lastActive).toLocaleDateString()}{' '}
                      {new Date(userDossier.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-slate-400">Total Tokens:</span>
                    <span className="font-mono text-slate-700 dark:text-slate-300">
                      {userDossier.stats.totalTokens.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Recent Transcripts */}
                <div className="flex flex-col gap-2">
                  <span className="font-bold text-slate-900 dark:text-white text-xs">
                    Recent Transcriptions ({userDossier.recentTranscripts.length})
                  </span>
                  <div className="flex flex-col gap-1.5 max-h-56 overflow-y-auto">
                    {userDossier.recentTranscripts.length > 0 ? (
                      userDossier.recentTranscripts.map((t) => (
                        <div
                          key={t.id}
                          className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/50 dark:border-slate-800 flex items-center justify-between"
                        >
                          <div className="flex items-center gap-2 truncate">
                            <FileAudio className="h-3.5 w-3.5 text-blue-500 shrink-0" />
                            <span className="truncate font-medium text-slate-900 dark:text-white">{t.filename}</span>
                          </div>
                          <span className="text-[10px] font-mono text-slate-400 shrink-0 ml-2">
                            {Math.round(t.duration)}s • {t.language}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-slate-400 italic py-2">No transcriptions created yet.</p>
                    )}
                  </div>
                </div>

                {/* Recent Errors */}
                {userDossier.recentErrors.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="font-bold text-red-600 dark:text-red-400 text-xs">
                      Incident History ({userDossier.recentErrors.length})
                    </span>
                    <div className="flex flex-col gap-1.5 max-h-40 overflow-y-auto">
                      {userDossier.recentErrors.map((e) => (
                        <div
                          key={e.id}
                          className="p-2.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200/50 dark:border-red-900/40 flex flex-col gap-1"
                        >
                          <span className="font-bold text-red-700 dark:text-red-400 text-[10px]">
                            {e.errorType} • {new Date(e.createdAt).toLocaleTimeString()}
                          </span>
                          <p className="text-slate-700 dark:text-slate-300 font-mono text-[11px] truncate">
                            {e.errorMessage}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : null}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
