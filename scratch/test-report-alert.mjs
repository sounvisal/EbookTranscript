import { sendTelegramErrorAlert } from '../lib/telegram.ts'

async function testAlert() {
  console.log('Testing formatted Telegram alert...')
  const ok = await sendTelegramErrorAlert({
    title: 'Direct User Incident Report',
    endpoint: '/api/transcribe (User Report)',
    errorMessage: 'Gemini API request failed (400 Bad Request): The File janw08uhnk5p is not in an ACTIVE state and usage is not allowed.',
    errorType: 'USER_REPORTED_ISSUE',
    fileFormat: 'snaptik_7675769349042425110_v3.mp4',
    userEmail: 'user@example.com',
    userComment: '⚡ Transcript cut off / incomplete — Audio stopped transcribing after 1 minute',
    metadata: {
      filename: 'snaptik_7675769349042425110_v3.mp4',
      fileSizeBytes: '10.17 MB',
      inputType: 'batch',
      detectedLanguage: 'Khmer / English',
      reportedAt: new Date().toISOString()
    }
  })

  console.log('Alert dispatched. Status:', ok)
}

testAlert().catch(console.error)
