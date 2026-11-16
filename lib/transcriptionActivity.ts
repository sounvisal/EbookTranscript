export const transcriptionStageLabels = {
  preparing: 'Preparing file',
  uploading: 'Uploading',
  queued: 'Waiting to start',
  processing: 'Transcribing',
  reconnecting: 'Reconnecting'
}

export type TranscriptionStage = keyof typeof transcriptionStageLabels

export type TranscribeProgressEvent =
  | { type: 'status'; phase: TranscriptionStage; duration?: number; message?: string; background?: boolean }
  | { type: 'upload-progress'; percent?: number }
  | { type: 'progress'; progress: number }

export type TranscriptionActivity = { stage: TranscriptionStage; uploadPercent?: number; background?: boolean }

export function updateTranscriptionActivity(activity: TranscriptionActivity, event: TranscribeProgressEvent): TranscriptionActivity {
  if (event.type === 'status') {
    if (activity.stage === event.phase && activity.background === event.background) return activity
    return { stage: event.phase, background: event.background }
  }
  if (event.type === 'upload-progress' && activity.stage === 'uploading') {
    return { ...activity, uploadPercent: event.percent }
  }
  return activity
}
