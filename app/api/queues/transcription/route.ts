import { handleCallback } from '@vercel/queue'
import { runTranscriptionJob } from '@/lib/transcriptionJobs'

export const maxDuration = 300

const handleTranscription = handleCallback<{ jobId: string }>(async ({ jobId }) => {
  await runTranscriptionJob(jobId)
})

export async function POST(req: Request) {
  if (process.env.VERCEL !== '1' || process.env.TRANSCRIPTION_QUEUE_ENABLED !== 'true') {
    return new Response(null, { status: 404 })
  }
  return handleTranscription(req)
}
