export const transcriptionStageLabels = {
  preparing: 'Preparing file',
  uploading: 'Uploading',
  queued: 'Waiting to start',
  processing: 'Transcribing',
  reconnecting: 'Reconnecting'
}

export type TranscriptionStage = keyof typeof transcriptionStageLabels
export type TranscriptionSections = { completed: number; total: number }
export type EngineProgressEvent = { type: 'progress'; progress: number; sections?: TranscriptionSections }

export type TranscribeProgressEvent =
  | { type: 'status'; phase: TranscriptionStage; duration?: number; message?: string; background?: boolean }
  | { type: 'upload-progress'; percent?: number }
  | EngineProgressEvent

export type TranscriptionActivity = {
  stage: TranscriptionStage
  uploadPercent?: number
  sections?: TranscriptionSections
  background?: boolean
}

export function updateTranscriptionActivity(activity: TranscriptionActivity, event: TranscribeProgressEvent): TranscriptionActivity {
  if (event.type === 'status') {
    if (activity.stage === event.phase && activity.background === event.background) return activity
    return { stage: event.phase, background: event.background }
  }
  if (event.type === 'upload-progress' && activity.stage === 'uploading') {
    return { ...activity, uploadPercent: event.percent }
  }
  if (event.type === 'progress' && activity.stage === 'processing' && event.sections) {
    const { completed, total } = event.sections
    if (Number.isInteger(completed) && Number.isInteger(total) && total > 1 && completed >= 0 && completed <= total) {
      return { ...activity, sections: { completed, total } }
    }
  }
  return activity
}
