import { create } from 'zustand'
import type { TranscriptSegment } from '@/lib/transcript'
import type { TranscriptionActivity } from '@/lib/transcriptionActivity'
import type { TranscriptionRecovery } from '@/lib/transcribeClient'

type TranscriptResult = {
  id?: string
  text: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
  source?: string
  kind?: 'transcript' | 'meeting-report' | 'summary'
  alreadySaved?: boolean
  cacheId?: string
}

export type AdvancedOptions = {
  customVocabulary: string[]
  speakerDiarization: boolean
  languagePreference: 'auto' | 'khmer' | 'english' | 'bilingual'
  highSensitivity?: boolean
}

interface TranscriptState {
  accountId: string | null
  file: File | null
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error'
  transcriptionActivity: TranscriptionActivity
  transcriptionRecovery: TranscriptionRecovery | null
  transcript: TranscriptResult | null
  errorMessage: string | null
  language: string
  workflowMode: 'transcript' | 'meeting' | 'summary'
  outputFormat: 'text' | 'timestamps' | 'srt' | 'vtt'
  options: {
    speakerLabels: boolean
    punctuation: boolean
    removeFiller: boolean
  }
  advancedOptions: AdvancedOptions
  inputMode: 'upload' | 'voice' | 'batch'
  voiceMode: 'live' | 'record'
  isListening: boolean
  isRecording: boolean
  liveText: string
  interimText: string
  recordingDuration: number
  audioBlob: Blob | null
  audioUrl: string | null
  customAudioUrl: string | null

  setAccountId: (accountId: string | null) => void
  setFile: (file: File | null) => void
  setStatus: (status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error') => void
  setTranscript: (transcript: TranscriptResult | null) => void
  setTranscriptWithAudio: (
    transcript: TranscriptResult | null,
    audioUrl?: string | null,
    file?: File | null,
    audioBlob?: Blob | null
  ) => void
  updateTranscriptContent: (newText: string, newSegments?: TranscriptSegment[]) => void
  setErrorMessage: (message: string | null) => void
  setWorkflowMode: (mode: 'transcript' | 'meeting' | 'summary') => void
  setInputMode: (mode: 'upload' | 'voice' | 'batch') => void
  setVoiceMode: (mode: 'live' | 'record') => void
  setCustomVocabulary: (vocab: string[]) => void
  addCustomTerm: (term: string) => void
  removeCustomTerm: (term: string) => void
  setSpeakerDiarization: (enabled: boolean) => void
  setLanguagePreference: (pref: 'auto' | 'khmer' | 'english' | 'bilingual') => void
  setHighSensitivity: (enabled: boolean) => void
  resetAdvancedOptions: () => void
  startListening: () => void
  stopListening: () => void
  startRecording: () => void
  stopRecording: () => void
  appendLiveText: (text: string) => void
  setInterimText: (text: string) => void
  setAudioBlob: (blob: Blob | null) => void
  setCustomAudioUrl: (url: string | null) => void
  resetAll: () => void
}

function revokeAudioUrl(url: string | null, replacement?: string | null) {
  if (url?.startsWith('blob:') && url !== replacement) URL.revokeObjectURL(url)
}

export const useTranscriptStore = create<TranscriptState>((set) => ({
  accountId: null,
  file: null,
  status: 'idle',
  transcriptionActivity: { stage: 'preparing' },
  transcriptionRecovery: null,
  transcript: null,
  errorMessage: null,
  language: 'auto',
  workflowMode: 'transcript',
  outputFormat: 'text',
  options: {
    speakerLabels: false,
    punctuation: true,
    removeFiller: false
  },
  advancedOptions: {
    customVocabulary: [],
    speakerDiarization: false,
    languagePreference: 'auto'
  },
  inputMode: 'upload',
  voiceMode: 'live',
  isListening: false,
  isRecording: false,
  liveText: '',
  interimText: '',
  recordingDuration: 0,
  audioBlob: null,
  audioUrl: null,
  customAudioUrl: null,

  setAccountId: (accountId) => set({ accountId }),
  setFile: (file) =>
    set((state) => {
      revokeAudioUrl(state.audioUrl)
      return { file, audioUrl: file ? URL.createObjectURL(file) : null, audioBlob: null, customAudioUrl: null, transcriptionRecovery: null }
    }),
  setStatus: (status) => set({ status }),
  setTranscript: (transcript) => set({ transcript, status: 'complete', errorMessage: null, transcriptionRecovery: null }),
  setTranscriptWithAudio: (transcript, audioUrl = null, file = null, audioBlob = null) =>
    set((state) => {
      const media = audioBlob || file
      const url = audioUrl || (media ? URL.createObjectURL(media) : null)
      revokeAudioUrl(state.audioUrl, url)
      return {
        transcript: transcript ? { ...transcript, alreadySaved: Boolean(transcript.id) } : null,
        status: 'complete',
        errorMessage: null,
        transcriptionRecovery: null,
        customAudioUrl: url,
        audioUrl: url,
        file,
        audioBlob
      }
    }),
  updateTranscriptContent: (newText, newSegments) =>
    set((state) => {
      if (!state.transcript) return state
      return {
        transcript: {
          ...state.transcript,
          text: newText,
          segments: newSegments ?? state.transcript.segments
        }
      }
    }),
  setErrorMessage: (errorMessage) => set({ errorMessage }),
  setWorkflowMode: (workflowMode) => set({ workflowMode, errorMessage: null }),
  setInputMode: (mode) => set({ inputMode: mode, errorMessage: null }),
  setVoiceMode: (mode) => set({ voiceMode: mode, errorMessage: null }),
  setCustomVocabulary: (vocab) =>
    set((state) => ({
      advancedOptions: { ...state.advancedOptions, customVocabulary: vocab }
    })),
  addCustomTerm: (term) =>
    set((state) => {
      const trimmed = term.trim()
      if (!trimmed || state.advancedOptions.customVocabulary.includes(trimmed)) return state
      return {
        advancedOptions: {
          ...state.advancedOptions,
          customVocabulary: [...state.advancedOptions.customVocabulary, trimmed]
        }
      }
    }),
  removeCustomTerm: (term) =>
    set((state) => ({
      advancedOptions: {
        ...state.advancedOptions,
        customVocabulary: state.advancedOptions.customVocabulary.filter((t) => t !== term)
      }
    })),
  setSpeakerDiarization: (enabled) =>
    set((state) => ({
      advancedOptions: { ...state.advancedOptions, speakerDiarization: enabled }
    })),
  setLanguagePreference: (pref) =>
    set((state) => ({
      advancedOptions: { ...state.advancedOptions, languagePreference: pref }
    })),
  setHighSensitivity: (enabled) =>
    set((state) => ({
      advancedOptions: { ...state.advancedOptions, highSensitivity: enabled }
    })),
  resetAdvancedOptions: () =>
    set((state) => ({
      advancedOptions: {
        customVocabulary: [],
        speakerDiarization: false,
        languagePreference: 'auto',
        highSensitivity: false
      }
    })),
  startListening: () => set({ isListening: true }),
  stopListening: () => set({ isListening: false }),
  startRecording: () => set({ isRecording: true }),
  stopRecording: () => set({ isRecording: false }),
  appendLiveText: (text) => set((state) => ({ liveText: state.liveText + text })),
  setInterimText: (text) => set({ interimText: text }),
  setAudioBlob: (blob) =>
    set((state) => {
      revokeAudioUrl(state.audioUrl)
      return { audioBlob: blob, audioUrl: blob ? URL.createObjectURL(blob) : null, customAudioUrl: null }
    }),
  setCustomAudioUrl: (url) =>
    set((state) => {
      revokeAudioUrl(state.audioUrl, url)
      return { customAudioUrl: url, audioUrl: url }
    }),
  resetAll: () =>
    set((state) => {
      revokeAudioUrl(state.audioUrl)
      return {
        file: null,
        status: 'idle',
        transcriptionActivity: { stage: 'preparing' },
        transcriptionRecovery: null,
        transcript: null,
        errorMessage: null,
        isListening: false,
        isRecording: false,
        liveText: '',
        interimText: '',
        audioBlob: null,
        audioUrl: null,
        customAudioUrl: null
      }
    })
}))
