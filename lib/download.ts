import {
  buildDisplaySegments,
  formatSrtTimestamp,
  formatVttTimestamp,
  type TranscriptSegment
} from './transcript'

export function downloadFile(content: string, filename: string, mimeType: string) {
  const blob = new Blob([content], { type: mimeType })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadTxt(text: string, source: string = 'transcript') {
  downloadFile(text, `${source}.txt`, 'text/plain;charset=utf-8')
}

export function downloadSrt(text: string, source: string = 'transcript', segments?: TranscriptSegment[]) {
  const timedSegments = buildDisplaySegments(text, segments)
  const srt = timedSegments
    .map((segment, index) => [
      String(index + 1),
      `${formatSrtTimestamp(segment.start)} --> ${formatSrtTimestamp(segment.end || segment.start + 3)}`,
      segment.text
    ].join('\n'))
    .join('\n\n')

  downloadFile(srt, `${source}.srt`, 'text/plain;charset=utf-8')
}

export function downloadVtt(text: string, source: string = 'transcript', segments?: TranscriptSegment[]) {
  const timedSegments = buildDisplaySegments(text, segments)
  const vtt = `WEBVTT\n\n${timedSegments
    .map((segment) => [
      `${formatVttTimestamp(segment.start)} --> ${formatVttTimestamp(segment.end || segment.start + 3)}`,
      segment.text
    ].join('\n'))
    .join('\n\n')}`

  downloadFile(vtt, `${source}.vtt`, 'text/vtt;charset=utf-8')
}
