/**
 * Utilities for generating and parsing clean URL slugs for transcripts.
 * Format: /transcribe/clean-file-title--<cuid>
 * Example: /transcribe/snaptik-770282489-v3--cm34h891x000108l07a2c8e19
 */

export function createTranscriptSlug(filenameOrSource: string | null | undefined, id: string): string {
  if (!id) return ''
  const base = (filenameOrSource || 'transcript')
    .replace(/\.[^/.]+$/, '') // remove file extension (e.g. .mp4, .mp3, .wav)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-') // replace non-letters/marks/numbers with dash (preserves Khmer & Unicode)
    .replace(/^-+|-+$/g, '') // trim leading/trailing dashes
    .slice(0, 45) // limit slug title length for clean URLs

  return base ? `${base}--${id}` : id
}

export function extractIdFromSlug(slugOrId: string | null | undefined): string {
  if (!slugOrId) return ''
  const clean = slugOrId.trim()
  if (clean.includes('--')) {
    const parts = clean.split('--')
    return parts[parts.length - 1]
  }
  return clean
}

export function buildTranscriptUrl(filenameOrSource: string | null | undefined, id: string, origin?: string): string {
  const slug = createTranscriptSlug(filenameOrSource, id)
  const path = `/transcribe/${encodeURIComponent(slug)}`
  return origin ? `${origin}${path}` : path
}
