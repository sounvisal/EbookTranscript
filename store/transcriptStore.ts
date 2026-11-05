import { create } from 'zustand'
import type { TranscriptSegment } from '@/lib/transcript'

type TranscriptResult = {
  id?: string
  text: string
  segments?: TranscriptSegment[]
  language?: string
  duration?: number
  source?: string
  kind?: 'transcript' | 'meeting-report' | 'summary'
  alreadySaved?: boolean
}

export type AdvancedOptions = {
  customVocabulary: string[]
  speakerDiarization: boolean
  languagePreference: 'auto' | 'khmer' | 'english' | 'bilingual'
  highSensitivity?: boolean
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
  audioUrl: string | null
  customAudioUrl: string | null

  setFile: (file: File | null) => void
  setStatus: (status: 'idle' | 'uploading' | 'processing' | 'complete' | 'error') => void
  setProgress: (progress: number) => void
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

// In-memory session media cache indexed by transcript ID, filename, and source name
export const sessionMediaCache = new Map<string, { url: string; file?: File | null; blob?: Blob | null }>()

export function cacheSessionMedia(key: string | undefined | null, data: { url: string; file?: File | null; blob?: Blob | null }) {
  if (!key || !data?.url) return
  sessionMediaCache.set(key, data)
  const clean = key.trim().toLowerCase()
  if (clean !== key) sessionMediaCache.set(clean, data)
}

export function getCachedSessionMedia(key: string | undefined | null) {
  if (!key) return undefined
  return sessionMediaCache.get(key) || sessionMediaCache.get(key.trim().toLowerCase())
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
  audioUrl: null,
  customAudioUrl: null,

  setFile: (file) =>
    set((state) => {
      if (state.audioUrl && state.audioUrl.startsWith('blob:')) {
        const isStillCached = Array.from(sessionMediaCache.values()).some((c) => c.url === state.audioUrl)
        if (!isStillCached) {
          try { URL.revokeObjectURL(state.audioUrl) } catch {}
        }
      }
      const newUrl = file ? URL.createObjectURL(file) : null
      if (file && newUrl) {
        cacheSessionMedia(file.name, { url: newUrl, file })
      }
      return { file, audioUrl: newUrl, audioBlob: null }
    }),
  setStatus: (status) => set({ status }),
  setProgress: (progress) => set({ progress }),
  setTranscript: (transcript) =>
    set((state) => {
      if (transcript && (state.audioUrl || state.file || state.audioBlob)) {
        const media = {
          url: state.audioUrl || (state.file ? URL.createObjectURL(state.file) : ''),
          file: state.file,
          blob: state.audioBlob
        }
        if (media.url) {
          if (transcript.id) cacheSessionMedia(transcript.id, media)
          if (transcript.source) cacheSessionMedia(transcript.source, media)
          if (state.file?.name) cacheSessionMedia(state.file.name, media)
        }
      }
      return { transcript, status: 'complete', errorMessage: null }
    }),
  setTranscriptWithAudio: (transcript, audioUrl = null, file = null, audioBlob = null) =>
    set((state) => {
      let resolvedUrl = audioUrl
      let resolvedFile = file
      let resolvedBlob = audioBlob

      // If no audio was provided, restore from sessionMediaCache!
      if (!resolvedUrl && transcript) {
        const cached =
          (transcript.id ? getCachedSessionMedia(transcript.id) : undefined) ||
          (transcript.source ? getCachedSessionMedia(transcript.source) : undefined)
        if (cached) {
          resolvedUrl = cached.url
          resolvedFile = cached.file ?? null
          resolvedBlob = cached.blob ?? null
        }
      }

      if (state.audioUrl && state.audioUrl.startsWith('blob:') && state.audioUrl !== resolvedUrl) {
        const isStillCached = Array.from(sessionMediaCache.values()).some((c) => c.url === state.audioUrl)
        if (!isStillCached) {
          try { URL.revokeObjectURL(state.audioUrl) } catch {}
        }
      }

      if (transcript && resolvedUrl) {
        if (transcript.id) cacheSessionMedia(transcript.id, { url: resolvedUrl, file: resolvedFile, blob: resolvedBlob })
        if (transcript.source) cacheSessionMedia(transcript.source, { url: resolvedUrl, file: resolvedFile, blob: resolvedBlob })
      }

      return {
        transcript: transcript ? { ...transcript, alreadySaved: true } : null,
        status: 'complete',
        errorMessage: null,
        customAudioUrl: resolvedUrl,
        audioUrl: resolvedUrl,
        file: resolvedFile,
        audioBlob: resolvedBlob
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
      if (state.audioUrl && state.audioUrl.startsWith('blob:')) {
        const isStillCached = Array.from(sessionMediaCache.values()).some((c) => c.url === state.audioUrl)
        if (!isStillCached) {
          try { URL.revokeObjectURL(state.audioUrl) } catch {}
        }
      }
      const newUrl = blob ? URL.createObjectURL(blob) : null
      if (blob && newUrl) {
        if (state.file?.name) cacheSessionMedia(state.file.name, { url: newUrl, file: state.file, blob })
        if (state.transcript?.id) cacheSessionMedia(state.transcript.id, { url: newUrl, file: state.file, blob })
      }
      return { audioBlob: blob, audioUrl: newUrl }
    }),
  setCustomAudioUrl: (url) =>
    set((state) => {
      if (url && state.transcript) {
        if (state.transcript.id) cacheSessionMedia(state.transcript.id, { url, file: state.file, blob: state.audioBlob })
        if (state.transcript.source) cacheSessionMedia(state.transcript.source, { url, file: state.file, blob: state.audioBlob })
      }
      return { customAudioUrl: url, audioUrl: url }
    }),
  resetAll: () =>
    set((state) => {
      if (state.audioUrl && state.audioUrl.startsWith('blob:')) {
        try { URL.revokeObjectURL(state.audioUrl) } catch {}
      }
      return {
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
        audioUrl: null,
        customAudioUrl: null
      }
    })
}))
