'use client'

import { FileDown, Download, CheckCircle2, FileAudio, FileText } from 'lucide-react'
import { MAX_MEDIA_UPLOAD_MB } from '@/lib/uploadLimits'

export default function FormatsPage() {
  return (
    <div className="mx-auto w-full max-w-5xl px-4 pb-24 pt-12 sm:px-6 sm:pt-16">
      
      <header className="mx-auto mb-12 max-w-2xl text-center">
        <span className="mb-4 inline-flex rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
          Media Guide
        </span>
        <h1 className="text-4xl font-semibold tracking-tight text-slate-950 sm:text-5xl">
          Supported Formats
        </h1>
        <p className="mt-4 text-base leading-7 text-slate-600 sm:text-lg">
          Complete guide to supported input media and export transcript formats.
        </p>
      </header>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
        {/* Input formats */}
        <section className="flex flex-col">
          <div className="relative flex flex-col h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/40 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <FileAudio className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-semibold text-slate-950">Input Capabilities</h2>
            </div>
            
            <div className="space-y-3 text-sm">
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                <span className="font-medium text-slate-600">File Upload Limit</span>
                <span className="font-semibold text-blue-700">{MAX_MEDIA_UPLOAD_MB} MB</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                <span className="font-medium text-slate-600">Audio Formats</span>
                <span className="font-semibold text-slate-900">MP3 · WAV · M4A · AAC · OGG · FLAC</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                <span className="font-medium text-slate-600">Video Formats</span>
                <span className="font-semibold text-slate-900">MP4 · WEBM · MOV · M4V · AVI · MKV</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                <span className="font-medium text-slate-600">Batch Processing</span>
                <span className="font-semibold text-slate-900">Up to 10 files at once</span>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-slate-50 p-3.5">
                <span className="font-medium text-slate-600">Media Links</span>
                <span className="font-semibold text-slate-900">Direct URLs & YouTube Links</span>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-100 pt-6">
              <h3 className="text-sm font-semibold text-slate-900 mb-3">Optimal Audio Recommendations</h3>
              <ul className="space-y-2.5 text-sm text-slate-600">
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>16kHz sample rate or higher for best accuracy</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Stereo or mono accepted (automatically optimized)</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Clear speech with minimal background music</span>
                </li>
              </ul>
            </div>
          </div>
        </section>

        {/* Output formats */}
        <section className="flex flex-col">
          <div className="relative flex flex-col h-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl shadow-slate-200/40 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <FileText className="h-5 w-5" />
              </span>
              <h2 className="text-xl font-semibold text-slate-950">Export Formats</h2>
            </div>
            
            <div className="space-y-5">
              {[
                { 
                  name: 'Plain Text (.TXT)',
                  badge: 'Reading & Notes',
                  desc: 'Clean text without timestamps. Perfect for copying into notes, documents, or summaries.',
                  mock: 'The speaker began the presentation at the scheduled time...'
                },
                { 
                  name: 'SubRip Subtitles (.SRT)',
                  badge: 'Video Captions',
                  desc: 'Industry-standard subtitle file with millisecond timestamps for video editors and players.',
                  mock: '1\n00:00:01,000 --> 00:00:04,500\nThe speaker began the presentation...'
                },
                { 
                  name: 'WebVTT Tracks (.VTT)',
                  badge: 'Web Video',
                  desc: 'Modern web video text tracks format built for HTML5 video players.',
                  mock: 'WEBVTT\n\n00:01.000 --> 00:04.500\nThe speaker began the presentation...'
                }
              ].map((format) => (
                <div key={format.name} className="flex flex-col gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-slate-900">
                      {format.name}
                    </h3>
                    <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-700">
                      {format.badge}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600">{format.desc}</p>
                  <pre className="mt-1 rounded-lg bg-slate-900 p-2.5 font-mono text-[11px] text-slate-200 whitespace-pre-wrap">
                    {format.mock}
                  </pre>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

    </div>
  )
}
