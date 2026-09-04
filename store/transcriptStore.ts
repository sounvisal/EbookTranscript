import { create } from 'zustand'
import type { TranscriptSegment } from '@/lib/transcript'

type TranscriptResult = {
  text: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
  source?: string
  kind?: 'transcript' | 'meeting-report' | 'summary'
}

export type AdvancedOptions = {
  customVocabulary: string[]
  speakerDiarization: boolean
  languagePreference: 'auto' | 'khmer' | 'english' | 'bilingual'
}

interface TranscriptState {
  file: File | null
  status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error'
  progress: number
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
  customAudioUrl: string | null

  setFile: (file: File | null) => void
  setStatus: (status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error') => void
  setProgress: (progress: number) => void
  setTranscript: (transcript: TranscriptResult | null) => void
  setTranscriptWithAudio: (transcript: TranscriptResult | null, audioUrl?: string | null) => void
  setErrorMessage: (message: string | null) => void
  setWorkflowMode: (mode: 'transcript' | 'meeting' | 'summary') => void
  setInputMode: (mode: 'upload' | 'voice' | 'batch') => void
  setVoiceMode: (mode: 'live' | 'record') => void
  setCustomVocabulary: (vocab: string[]) => void
  addCustomTerm: (term: string) => void
  removeCustomTerm: (term: string) => void
  setSpeakerDiarization: (enabled: boolean) => void
  setLanguagePreference: (pref: 'auto' | 'khmer' | 'english' | 'bilingual') => void
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

export const useTranscriptStore = create<TranscriptState>((set) => ({
  file: null,
  status: 'idle',
  progress: 0,
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
  customAudioUrl: null,

  setFile: (file) => set({ file }),
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setTranscript: (transcript) => set({ transcript, status: 'complete', errorMessage: null }),
  setTranscriptWithAudio: (transcript, audioUrl = null) =>
    set({
      transcript,
      status: 'complete',
      errorMessage: null,
      customAudioUrl: audioUrl,
      file: null,
      audioBlob: null
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
  resetAdvancedOptions: () =>
    set((state) => ({
      advancedOptions: {
        customVocabulary: [],
        speakerDiarization: false,
        languagePreference: 'auto'
      }
    })),
  startListening: () => set({ isListening: true }),
  stopListening: () => set({ isListening: false }),
  startRecording: () => set({ isRecording: true }),
  stopRecording: () => set({ isRecording: false }),
  appendLiveText: (text) => set((state) => ({ liveText: state.liveText + text })),
  setInterimText: (text) => set({ interimText: text }),
  setAudioBlob: (blob) => set({ audioBlob: blob }),
  setCustomAudioUrl: (url) => set({ customAudioUrl: url }),
  resetAll: () => set({
    file: null,
    status: 'idle',
    progress: 0,
    transcript: null,
    errorMessage: null,
    isListening: false,
    isRecording: false,
    liveText: '',
    interimText: '',
    audioBlob: null,
    customAudioUrl: null
  })
}))
