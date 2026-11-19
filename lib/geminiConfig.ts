export const DEFAULT_GEMINI_MODELS = ['gemini-2.5-flash', 'gemini-2.5-flash-lite', 'gemini-flash-latest']
export const GEMINI_UNAVAILABLE = 'Transcription and reports are temporarily unavailable. Please try again later.'

export function cleanGeminiModelName(value?: string | null): string {
  let model = value?.trim() || ''
  try {
    model = decodeURIComponent(model)
  } catch {}
  // Extract clean model pattern if environment variable name or concatenation was accidentally included
  const patternMatch = model.match(/gemini-(?:[0-9]+(?:\.[0-9]+)?-)?(?:flash|pro)(?:-(?:lite|latest|[a-z0-9]+))?/i)?.[0]
  if (patternMatch) {
    model = patternMatch
  }
  return model
    .replace(/:.*$/, '')
    .replace(/["'\\`\s=]/g, '')
    .replace(/^(models\/)+/i, '')
    .replace(/GEMINI_MODELS?/gi, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
}

export function getConfiguredModels(): string[] {
  const envModels = (process.env.GEMINI_MODELS || '').split(',').map(cleanGeminiModelName).filter(Boolean)
  const singleModel = cleanGeminiModelName(process.env.GEMINI_MODEL)
  // Always include standard fallbacks behind user preferences to prevent hard 404s on newly provisioned API keys
  const preferred = [...envModels, singleModel, ...DEFAULT_GEMINI_MODELS]
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
