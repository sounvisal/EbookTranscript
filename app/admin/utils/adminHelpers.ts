// Utility helper functions for Admin Dashboard
import type { AdminStats, ManagedUser } from '../types'

/**
 * Format large numbers with k/M suffixes
 * @example formatNumber(1200) => "1.2k"
 */
export function formatNumber(n: number): string {
  if (n >= 1000000) {
    return (n / 1000000).toFixed(1) + 'M'
  }
  if (n >= 1000) {
    return (n / 1000).toFixed(1) + 'k'
  }
  return n.toString()
}

/**
 * Format minutes to human-readable duration
 * @example formatDuration(125) => "2h 5m"
 */
export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const mins = Math.round(minutes % 60)

  if (hours > 0) {
    return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`
  }
  return `${mins}m`
}

/**
 * Format date to locale date string
 */
export function formatDate(date: string | Date): string {
  return new Date(date).toLocaleDateString()
}

/**
 * Format date to locale time string
 */
export function formatTime(date: string | Date): string {
  return new Date(date).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit'
  })
}

/**
 * Helper to download CSV text as a file in the browser
 */
export function triggerCsvDownload(filename: string, csvContent: string) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * Export raw error logs to CSV
 */
export function exportErrorsToCsv(errors: AdminStats['errors']['recent']) {
  const headers = ['Timestamp', 'Error Type', 'Error Message', 'Endpoint', 'Format', 'Model', 'User']
  const rows = errors.map((e) => [
    `"${new Date(e.createdAt).toISOString()}"`,
    `"${(e.errorType || '').replace(/"/g, '""')}"`,
    `"${(e.errorMessage || '').replace(/"/g, '""')}"`,
    `"${(e.endpoint || '').replace(/"/g, '""')}"`,
    `"${(e.fileFormat || '').replace(/"/g, '""')}"`,
    `"${(e.model || '').replace(/"/g, '""')}"`,
    `"${(e.userEmail || '').replace(/"/g, '""')}"`
  ])
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  triggerCsvDownload(`signal_error_logs_${new Date().toISOString().split('T')[0]}.csv`, csv)
}

/**
 * Export daily/hourly usage & telemetry timeline to CSV
 */
export function exportTelemetryToCsv(dailyStats: AdminStats['dailyStats'], rangeLabel: string) {
  const headers = ['Period / Date', 'Requests', 'Audio Duration (Mins)', 'Tokens Consumed', 'Errors']
  const rows = dailyStats.map((d) => [
    `"${d.date}"`,
    d.requests,
    d.duration.toFixed(2),
    d.tokens,
    d.errors
  ])
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n')
  triggerCsvDownload(`signal_telemetry_${rangeLabel}_${new Date().toISOString().split('T')[0]}.csv`, csv)
}
