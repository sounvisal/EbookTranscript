'use client'

import { Activity, Radio, Users, Cpu, BarChart3, AlertTriangle, Database, Shield, ListChecks, Settings } from 'lucide-react'
export type TabId = 'overview' | 'feed' | 'users' | 'keys' | 'tokens' | 'errors' | 'cache' | 'audit' | 'jobs' | 'settings'
interface Props { activeTab: TabId; onTabChange: (tab: TabId) => void; usersCount: number; keyFleetCount: number; recentErrorsCount: number }
export function TabNavigation({ activeTab, onTabChange, usersCount, keyFleetCount, recentErrorsCount }: Props) {
  const tabs = [
    { id: 'overview', label: 'Overview', shortcut: '1', icon: Activity },
    { id: 'jobs', label: 'Jobs', shortcut: '9', icon: ListChecks },
    { id: 'feed', label: 'Activity', shortcut: '2', icon: Radio },
    { id: 'users', label: 'Users', count: usersCount, shortcut: '3', icon: Users },
    { id: 'keys', label: 'API keys', count: keyFleetCount, shortcut: '4', icon: Cpu },
    { id: 'errors', label: 'Errors', count: recentErrorsCount, shortcut: '8', icon: AlertTriangle },
    { id: 'tokens', label: 'Usage & cost', shortcut: '7', icon: BarChart3 },
    { id: 'cache', label: 'Cache', shortcut: '5', icon: Database },
    { id: 'audit', label: 'Audit', shortcut: '6', icon: Shield },
    { id: 'settings', label: 'Settings', shortcut: '0', icon: Settings }
  ]
  return <nav aria-label="Admin sections" className="lg:sticky lg:top-24 lg:self-start">
    <label className="flex items-center gap-3 text-sm font-medium lg:hidden">Section
      <select aria-label="Admin section" value={activeTab} onChange={event => onTabChange(event.target.value as TabId)} className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
        {tabs.map(tab => <option key={tab.id} value={tab.id}>{tab.label}</option>)}
      </select>
    </label>
    <div className="hidden space-y-1 rounded-2xl bg-slate-100/70 p-2 dark:bg-slate-900/70 lg:block">
      {tabs.map(tab => <button key={tab.id} aria-current={activeTab === tab.id ? 'page' : undefined} onClick={() => onTabChange(tab.id as TabId)} title={`${tab.label} (${tab.shortcut})`} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors ${activeTab === tab.id ? 'bg-white font-semibold text-blue-600 shadow-sm dark:bg-slate-800 dark:text-blue-400' : 'text-slate-600 hover:bg-white/60 dark:text-slate-400 dark:hover:bg-slate-800'}`}>
        <tab.icon className="h-4 w-4 shrink-0" /><span>{tab.label}</span>{tab.count !== undefined && <span className="ml-auto text-xs tabular-nums text-slate-400">{tab.count}</span>}
      </button>)}
    </div>
  </nav>
}
