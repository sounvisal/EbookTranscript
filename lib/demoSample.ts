import { useTranscriptStore } from '@/store/transcriptStore'

export const DEMO_SAMPLE_PAYLOAD = {
  text: `[Speaker 1]: សួស្តីអ្នកទាំងអស់គ្នា! Welcome to Signal AI podcast where we demonstrate bilingual speech transcription.\n\n[Speaker 2]: បាទ សួស្តី! ការបម្លែងសម្លេងជាភាសាខ្មែរ ឥឡូវនេះមានភាពត្រឹមត្រូវខ្ពស់ ដោយបែងចែករវាងសម្លេងមនុស្សនិយាយ និងសម្លេងតន្ត្រីយ៉ាងច្បាស់។\n\n[Speaker 1]: Exactly! You can click any timestamp to jump the audio, edit phrases in-line, or export directly to Premiere Pro SRT subtitles.`,
  segments: [
    {
      start: 0.0,
      end: 8.0,
      text: "[Speaker 1]: សួស្តីអ្នកទាំងអស់គ្នា! Welcome to Signal AI podcast where we demonstrate bilingual speech transcription."
    },
    {
      start: 8.2,
      end: 22.5,
      text: "[Speaker 2]: បាទ សួស្តី! ការបម្លែងសម្លេងជាភាសាខ្មែរ ឥឡូវនេះមានភាពត្រឹមត្រូវខ្ពស់ ដោយបែងចែករវាងសម្លេងមនុស្សនិយាយ និងសម្លេងតន្ត្រីយ៉ាងច្បាស់។"
    },
    {
      start: 22.8,
      end: 32.3,
      text: "[Speaker 1]: Exactly! You can click any timestamp to jump the audio, edit phrases in-line, or export directly to Premiere Pro SRT subtitles."
    }
  ],
  source: 'demo_khmer_english_sample.mp3',
  language: 'Khmer / English',
  duration: 32.3,
  kind: 'transcript' as const,
  alreadySaved: true
}

export function loadDemoSample() {
  const store = useTranscriptStore.getState()
  store.setFile(null)
  store.setErrorMessage(null)
  // Use real spoken human voice mp3
  store.setCustomAudioUrl('/audio/demo_khmer_english_sample.mp3')
  store.setTranscript(DEMO_SAMPLE_PAYLOAD)
  store.setStatus('complete')
}
