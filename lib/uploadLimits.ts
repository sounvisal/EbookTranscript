export const MAX_MEDIA_UPLOAD_MB = 300
export const MAX_MEDIA_UPLOAD_BYTES = MAX_MEDIA_UPLOAD_MB * 1024 * 1024

// Reserve space for multipart boundaries and metadata under Vercel's 4.5 MB cap.
export const MAX_INLINE_UPLOAD_BYTES = 4_000_000
