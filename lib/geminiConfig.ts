export const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash-lite', 'gemini-2.5-flash']
export const GEMINI_UNAVAILABLE = 'Transcription and reports are temporarily unavailable. Please try again later.'

export function cleanGeminiModelName(value?: string | null): string {
  let model = value?.trim() || ''
  try {
    model = decodeURIComponent(model)
  } catch {}
  return model
    .replace(/:.*$/, '')
    .replace(/["'\\`\s]/g, '')
    .replace(/^(models\/)+/i, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
}

export function getConfiguredModels(): string[] {
  const models = (process.env.GEMINI_MODELS || '').split(',').map(cleanGeminiModelName).filter(Boolean)
  const preferred = models.length ? models : [cleanGeminiModelName(process.env.GEMINI_MODEL), ...DEFAULT_GEMINI_MODELS]
  const supported = preferred.filter((model) => model && !/^gemini-(?:1(?:\.|-)|2\.0(?:\.|-))/i.test(model))
  return [...new Set(supported.length ? supported : DEFAULT_GEMINI_MODELS)]
}

export function getConfiguredKeys(): string[] {
  const parse = (value?: string) => (value || '').split(',')
    .map((key) => key.trim().replace(/["'\r\n]/g, ''))
    .filter((key) => key && key !== 'AIzaSyYourGoogleApiKeyHere')

  const keys = parse(process.env.GEMINI_API_KEYS)
  return [...new Set(keys.length ? keys : parse(process.env.GEMINI_API_KEY))]
}

export function isGeminiDemoEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.ENABLE_GEMINI_DEMO === 'true'
}
