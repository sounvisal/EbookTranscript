'use client'

import { useEffect, useState } from 'react'

type Settings = { model: string; safeMode: boolean; updatedAt: string | null }
export function OperationsTab() {
  const [settings, setSettings] = useState<Settings | null>(null)
  const [model, setModel] = useState('auto')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const read = async () => {
    setError('')
    try {
      const response = await fetch('/api/admin/operations', { cache: 'no-store' })
      if (!response.ok) throw new Error('Could not load operations settings.')
      const data = await response.json()
      setSettings(data); setModel(data.model)
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not load settings.') }
  }
  useEffect(() => { void read() }, [])
  const save = async (setting: string, value: string | boolean) => {
    setBusy(true); setError(''); setMessage('')
    try {
      const response = await fetch('/api/admin/operations', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ setting, value }) })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Could not save settings.')
      setSettings(data); setModel(data.model); setMessage('Saved. Dashboard and Telegram now use these settings.')
    } catch (error) { setError(error instanceof Error ? error.message : 'Could not save settings.') }
    finally { setBusy(false) }
  }
  const button = 'rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40 dark:bg-white dark:text-slate-900'
  return <section className="space-y-6" aria-labelledby="operations-title">
    <div><h2 id="operations-title" className="text-xl font-semibold">Settings & operations</h2><p className="mt-1 text-sm text-slate-500">Persistent controls shared with your Telegram bot. Changes are recorded in Audit.</p></div>
    {error && <div role="alert" className="rounded-xl bg-red-50 p-4 text-sm text-red-700">{error} {!settings && <button onClick={read} className="underline">Try again</button>}</div>}
    {message && <p role="status" className="text-sm text-emerald-700 dark:text-emerald-400">{message}</p>}
    {!settings && !error && <p role="status">Loading settings…</p>}
    {settings && <>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <h3 className="font-semibold">Transcription model</h3>
        <p className="mt-1 text-sm text-slate-500">Choose the model for new work. Automatic keeps the existing adaptive routing and fallback behavior. A pinned model uses only that model.</p>
        <div className="mt-4 flex flex-wrap gap-3"><select aria-label="Transcription model" value={model} disabled={busy} onChange={event => setModel(event.target.value)} className="rounded-xl border border-slate-200 bg-transparent p-2 dark:border-slate-700">
          <option value="auto">Automatic</option><option value="gemini-2.5-flash">Gemini 2.5 Flash</option><option value="gemini-2.5-flash-lite">Gemini 2.5 Flash Lite</option>
        </select><button className={button} disabled={busy || model === settings.model} onClick={() => save('model', model)}>Save model</button></div>
      </div>
      <div className="rounded-2xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Safe Mode</h3><span className={`rounded-full px-3 py-1 text-xs font-semibold ${settings.safeMode ? 'bg-amber-100 text-amber-900' : 'bg-slate-100 text-slate-700'}`}>{settings.safeMode ? 'On · new work paused' : 'Off · accepting work'}</span></div>
        <p className="mt-2 text-sm text-slate-500">Pause new transcription starts during an outage. Accepted background jobs can finish, and users can still read their history. Turn this off to accept new work again.</p>
        <button className={`${button} mt-4`} disabled={busy} onClick={() => save('safeMode', !settings.safeMode)}>{settings.safeMode ? 'Resume new work' : 'Pause new work'}</button>
      </div>
      <p className="text-xs text-slate-500">{settings.updatedAt ? `Last changed ${new Date(settings.updatedAt).toLocaleString()}` : 'Using default settings. No changes recorded.'}</p>
    </>}
    <div className="rounded-2xl bg-slate-100 p-5 text-sm dark:bg-slate-900"><h3 className="font-semibold">Operate from Telegram</h3><p className="mt-2 text-slate-500">Send /ops for interactive buttons, /queue for background job counts, or /reset_quota user@email.com to reset today’s usage. Group administrators must have their individual Telegram user IDs listed in TELEGRAM_ADMIN_USER_IDS.</p></div>
  </section>
}
