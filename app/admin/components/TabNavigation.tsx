'use client'

import { Activity, Radio, Users, Cpu, BarChart3, AlertTriangle } from 'lucide-react'

type TabId = 'overview' | 'feed' | 'users' | 'keys' | 'tokens' | 'errors'

interface TabNavigationProps {
  activeTab: TabId
  onTabChange: (tab: TabId) => void
  usersCount: number
  keyFleetCount: number
  recentErrorsCount: number
}

export function TabNavigation({ activeTab, onTabChange, usersCount, keyFleetCount, recentErrorsCount }: TabNavigationProps) {
  const tabs = [
    { id: 'overview' as TabId, label: 'Telemetry & Analytics', shortcut: '1', icon: Activity },
    { id: 'feed' as TabId, label: 'Live Activity Feed', shortcut: '2', icon: Radio },
    { id: 'users' as TabId, label: `User Directory (${usersCount})`, shortcut: '3', icon: Users },
    { id: 'keys' as TabId, label: `API Key Fleet & Models (${keyFleetCount})`, shortcut: '4', icon: Cpu },
    { id: 'tokens' as TabId, label: 'Tokens & Quotas', shortcut: '5', icon: BarChart3 },
    { id: 'errors' as TabId, label: `Error Intel & Clusters (${recentErrorsCount})`, shortcut: '6', icon: AlertTriangle }
  ]

  return (
    <div className="flex items-center gap-1.5 overflow-x-auto rounded-2xl bg-slate-100/90 dark:bg-slate-900/90 p-1.5 text-xs font-semibold text-slate-600 dark:text-slate-400 border border-slate-200/80 dark:border-slate-800 no-scrollbar">
      {tabs.map((tab) => {
        const Icon = tab.icon
        const isActive = activeTab === tab.id
        return (
          <button
            key={tab.id}
            onClick={() => onTabChange(tab.id)}
            title={`Switch to ${tab.label} (Press ${tab.shortcut})`}
            className={`flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2.5 transition-all cursor-pointer ${
              isActive
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs font-bold'
                : 'hover:text-slate-900 dark:hover:text-white hover:bg-white/40 dark:hover:bg-slate-800/40'
            }`}
          >
            <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-blue-600 dark:text-blue-400' : ''}`} />
            <span>{tab.label}</span>
            <span
              className={`hidden md:inline-flex items-center justify-center h-4 w-4 rounded text-[10px] font-mono transition-colors ${
                isActive
                  ? 'bg-blue-100 dark:bg-blue-950 text-blue-700 dark:text-blue-300'
                  : 'bg-slate-200/60 dark:bg-slate-800 text-slate-400 dark:text-slate-500'
              }`}
            >
              {tab.shortcut}
            </span>
          </button>
        )
      })}
    </div>
  )
}
