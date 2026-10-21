'use client'

import React from 'react'
import {
  Users,
  Download,
  Search,
  Loader2,
  UserCheck,
  UserX,
  Trash2
} from 'lucide-react'
import type { ManagedUser } from '../../types'

interface UserManagementTabProps {
  users: ManagedUser[]
  filteredUsers: ManagedUser[]
  usersLoading: boolean
  actionUserId: string | null
  userSearch: string
  setUserSearch: (v: string) => void
  userRoleFilter: 'all' | 'admin' | 'user'
  setUserRoleFilter: (v: 'all' | 'admin' | 'user') => void
  onInspectUser: (id: string) => void
  onRoleChange: (id: string, role: 'admin' | 'user') => void
  onDeleteUser: (id: string, email: string) => void
  onExportCsv: () => void
  currentAdminEmail?: string | null
}

export function UserManagementTab({
  users,
  filteredUsers,
  usersLoading,
  actionUserId,
  userSearch,
  setUserSearch,
  userRoleFilter,
  setUserRoleFilter,
  onInspectUser,
  onRoleChange,
  onDeleteUser,
  onExportCsv,
  currentAdminEmail
}: UserManagementTabProps) {
  return (
    <div className="flex flex-col gap-6 rounded-3xl border border-slate-200/80 dark:border-slate-800 bg-white/80 dark:bg-slate-900/60 p-6 shadow-xs backdrop-blur-md">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="h-4 w-4 text-blue-500" />
            <span>User Directory & Intelligence Dossiers</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Click any user to inspect their quota consumption, upload history, and personal failure logs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {/* CSV Export Button */}
          <button
            onClick={onExportCsv}
            className="flex items-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors cursor-pointer"
            title="Download user directory and telemetry metrics to CSV"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export CSV</span>
          </button>

          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="text"
              placeholder="Search name or email..."
              value={userSearch}
              onChange={(e) => setUserSearch(e.target.value)}
              className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 pl-9 pr-3 py-1.5 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Role filter */}
          <select
            value={userRoleFilter}
            onChange={(e) => setUserRoleFilter(e.target.value as typeof userRoleFilter)}
            className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 px-3 py-1.5 text-xs text-slate-700 dark:text-slate-300 focus:outline-none"
          >
            <option value="all">All Roles ({users.length})</option>
            <option value="admin">Admins ({users.filter((u) => u.role === 'admin').length})</option>
            <option value="user">Standard Users ({users.filter((u) => u.role === 'user').length})</option>
          </select>
        </div>
      </div>

      {/* User Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200/80 dark:border-slate-800 text-slate-400 font-semibold">
              <th className="pb-3 pr-4">User</th>
              <th className="pb-3 px-4">Role</th>
              <th className="pb-3 px-4">Last Active</th>
              <th className="pb-3 px-4 text-center">Transcripts</th>
              <th className="pb-3 px-4 text-center">Audio (mins)</th>
              <th className="pb-3 pl-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {usersLoading ? (
              <tr>
                <td colSpan={6} className="py-8 text-center">
                  <Loader2 className="h-6 w-6 animate-spin mx-auto text-blue-500" />
                </td>
              </tr>
            ) : filteredUsers.length > 0 ? (
              filteredUsers.map((u) => {
                const isSelf = u.email === currentAdminEmail
                const isAdmin = u.role === 'admin'

                return (
                  <tr
                    key={u.id}
                    onClick={() => onInspectUser(u.id)}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                  >
                    <td className="py-3 pr-4">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          {u.name}
                          {isSelf && (
                            <span className="rounded-md bg-blue-100 dark:bg-blue-950 px-1.5 py-0.2 text-[10px] font-bold text-blue-700 dark:text-blue-300">
                              You
                            </span>
                          )}
                        </span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">{u.email}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                          isAdmin
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border border-amber-300/60 dark:border-amber-800/60'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500 dark:text-slate-400 font-mono text-[11px]">
                      {new Date(u.lastActive).toLocaleDateString()}{' '}
                      {new Date(u.lastActive).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="py-3 px-4 text-center font-bold font-mono text-slate-900 dark:text-white">
                      {u.transcriptionCount}
                    </td>
                    <td className="py-3 px-4 text-center font-mono text-slate-600 dark:text-slate-300">
                      {u.totalAudioMinutes}m
                    </td>
                    <td className="py-3 pl-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onInspectUser(u.id)}
                          className="rounded-lg bg-blue-50 dark:bg-blue-950/60 px-2 py-1 text-[11px] font-semibold text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900 transition-colors"
                        >
                          Dossier
                        </button>

                        {isAdmin ? (
                          <button
                            onClick={() => onRoleChange(u.id, 'user')}
                            disabled={actionUserId === u.id || isSelf}
                            className="flex items-center gap-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 disabled:opacity-40 transition-colors cursor-pointer"
                            title="Demote to standard user"
                          >
                            <UserX className="h-3 w-3 text-amber-500" />
                          </button>
                        ) : (
                          <button
                            onClick={() => onRoleChange(u.id, 'admin')}
                            disabled={actionUserId === u.id}
                            className="flex items-center gap-1 rounded-lg bg-blue-600 dark:bg-blue-500 px-2 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-blue-700 disabled:opacity-40 transition-all cursor-pointer"
                            title="Promote to administrator"
                          >
                            <UserCheck className="h-3 w-3" />
                          </button>
                        )}

                        {!isSelf && (
                          <button
                            onClick={() => onDeleteUser(u.id, u.email)}
                            disabled={actionUserId === u.id}
                            className="rounded-lg p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400 transition-colors cursor-pointer"
                            title="Delete user account"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })
            ) : (
              <tr>
                <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                  No users found matching query.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
