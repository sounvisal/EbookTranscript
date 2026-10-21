'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ShieldAlert, X } from 'lucide-react'
import type { AdminStats } from '../../types'

interface ErrorDetailModalProps {
  selectedError: AdminStats['errors']['recent'][0] | null
  onClose: () => void
}

export function ErrorDetailModal({ selectedError, onClose }: ErrorDetailModalProps) {
  return (
    <AnimatePresence>
      {selectedError && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="relative w-full max-w-2xl rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-bold text-sm">
                <ShieldAlert className="h-5 w-5" />
                <span>Incident Telemetry Inspector</span>
              </div>
              <button
                onClick={onClose}
                className="rounded-full p-1 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="flex flex-col gap-4 mt-4 text-xs">
              <div className="flex flex-col gap-1">
                <span className="font-semibold text-slate-400 uppercase text-[10px]">Error Message</span>
                <p className="rounded-xl bg-red-50 dark:bg-red-950/40 p-3 font-mono font-medium text-red-700 dark:text-red-300 border border-red-200/60 dark:border-red-900/50">
                  {selectedError.errorMessage}
                </p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 font-mono text-[11px]">
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <span className="text-slate-400 block text-[10px]">ENDPOINT</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedError.endpoint}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <span className="text-slate-400 block text-[10px]">FORMAT</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">{selectedError.fileFormat}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <span className="text-slate-400 block text-[10px]">USER</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{selectedError.userEmail}</span>
                </div>
                <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/60">
                  <span className="text-slate-400 block text-[10px]">TIME</span>
                  <span className="font-bold text-slate-800 dark:text-slate-200">
                    {new Date(selectedError.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              </div>

              {selectedError.metadata && (
                <div className="flex flex-col gap-1">
                  <span className="font-semibold text-slate-400 uppercase text-[10px]">
                    Payload Metadata & Diagnostics
                  </span>
                  <pre className="max-h-48 overflow-y-auto rounded-xl bg-slate-950 p-3 font-mono text-[11px] text-emerald-400 border border-slate-800">
                    {JSON.stringify(selectedError.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end">
              <button
                onClick={onClose}
                className="rounded-xl bg-slate-900 dark:bg-white px-4 py-2 text-xs font-bold text-white dark:text-slate-900 transition-colors cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
