function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function formatTelegramAlert(params) {
  const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19) + ' UTC'
  const isUserReport = params.errorType === 'USER_REPORTED_ISSUE' || (params.title && params.title.includes('User'))

  const lines = [
    isUserReport
      ? `📢 <b>DIRECT USER INCIDENT REPORT</b>`
      : `🚨 <b>${escapeHtml(params.title || 'Signal Incident Alert — Transcription Error')}</b>`,
    ''
  ]

  const user = params.userEmail || (params.metadata?.userEmail)
  if (user) {
    lines.push(`👤 <b>User:</b> <code>${escapeHtml(user)}</code>`)
  }

  const filename = (params.metadata?.filename) || params.fileFormat
  const fileSize = (params.metadata?.fileSizeBytes)
  if (filename && filename !== 'media' && filename !== 'unknown') {
    lines.push(`📁 <b>File:</b> <code>${escapeHtml(filename)}${fileSize ? ` (${fileSize})` : ''}</code>`)
  }

  const inputType = params.metadata?.inputType
  if (inputType) {
    lines.push(`⚙️ <b>Input Mode:</b> <code>${escapeHtml(inputType)}</code>`)
  }

  const detectedLanguage = params.metadata?.detectedLanguage
  if (detectedLanguage) {
    lines.push(`🌐 <b>Language:</b> <code>${escapeHtml(detectedLanguage)}</code>`)
  }

  const comment = params.userComment || (params.metadata?.userComment)
  if (comment) {
    lines.push('', `💬 <b>User Note / Issue:</b>`, `<i>"${escapeHtml(comment)}"</i>`, '')
  }

  lines.push(`⚠️ <b>Error Details:</b>`)
  lines.push(`<code>${escapeHtml(params.errorMessage.slice(0, 1000))}</code>`)

  if (params.errorType && params.errorType !== 'USER_REPORTED_ISSUE') {
    lines.push(`🏷 <b>Type:</b> <code>${escapeHtml(params.errorType)}</code>`)
  }
  if (params.model) {
    lines.push(`🤖 <b>Model:</b> <code>${escapeHtml(params.model)}</code>`)
  }
  if (params.endpoint) {
    lines.push(`📍 <b>Endpoint:</b> <code>${escapeHtml(params.endpoint)}</code>`)
  }

  const snippet = params.metadata?.transcriptSnippet
  if (snippet) {
    lines.push('', `📝 <b>Transcript Excerpt:</b>`, `<i>${escapeHtml(snippet.slice(0, 300))}...</i>`)
  }

  lines.push(`⏱ <b>Time:</b> <code>${timestamp}</code>`)
  lines.push('', `🛠 <i>Telemetric log recorded in Signal Intelligence.</i>`)

  return lines.join('\n')
}

const rendered = formatTelegramAlert({
  title: 'Direct User Incident Report',
  endpoint: '/api/transcribe (User Report)',
  errorMessage: 'Gemini API request failed (400 Bad Request): The File janw08uhnk5p is not in an ACTIVE state and usage is not allowed.',
  errorType: 'USER_REPORTED_ISSUE',
  fileFormat: 'snaptik_7675769349042425110_v3.mp4',
  userEmail: 'sounvisal154@gmail.com',
  userComment: '⚡ Transcript cut off / incomplete — Audio stopped transcribing after 1 minute',
  metadata: {
    filename: 'snaptik_7675769349042425110_v3.mp4',
    fileSizeBytes: '10.17 MB',
    inputType: 'batch',
    detectedLanguage: 'Khmer / English',
    transcriptSnippet: 'សួស្តីបងប្អូនទាំងអស់គ្នា ថ្ងៃនេះយើងនឹងនិយាយអំពី...',
    reportedAt: new Date().toISOString()
  }
})

console.log('--- PREVIEW OF TELEGRAM ALERT MESSAGE ---')
console.log(rendered)
