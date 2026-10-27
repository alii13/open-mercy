export interface RuntimeConfig {
  supabaseUrl: string
  supabaseAnonKey: string
}

export type RuntimeConfigResult =
  | { ok: true; config: RuntimeConfig }
  | { ok: false; issues: string[] }

type RuntimeEnv = Record<string, unknown>

const PLACEHOLDER_PARTS = [
  'your-project-ref',
  'your-anon-key',
  'your-publishable',
  'replace-me',
  'change-me',
]

function textValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function isPlaceholder(value: string): boolean {
  const lower = value.toLowerCase()
  return PLACEHOLDER_PARTS.some((part) => lower.includes(part))
}

export function validateRuntimeConfig(env: RuntimeEnv): RuntimeConfigResult {
  const supabaseUrl = textValue(env.VITE_SUPABASE_URL)
  const supabaseAnonKey = textValue(env.VITE_SUPABASE_ANON_KEY)
  const issues: string[] = []

  if (!supabaseUrl) {
    issues.push('VITE_SUPABASE_URL is missing.')
  } else if (isPlaceholder(supabaseUrl)) {
    issues.push('VITE_SUPABASE_URL still contains the example placeholder.')
  } else {
    try {
      const parsed = new URL(supabaseUrl)
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
        issues.push('VITE_SUPABASE_URL must use http:// or https://.')
      }
    } catch {
      issues.push('VITE_SUPABASE_URL is not a valid URL.')
    }
  }

  if (!supabaseAnonKey) {
    issues.push('VITE_SUPABASE_ANON_KEY is missing.')
  } else if (isPlaceholder(supabaseAnonKey)) {
    issues.push('VITE_SUPABASE_ANON_KEY still contains the example placeholder.')
  } else if (!supabaseAnonKey.startsWith('sb_publishable_') && !supabaseAnonKey.startsWith('eyJ')) {
    issues.push('VITE_SUPABASE_ANON_KEY is not a recognized Supabase publishable/anon key.')
  }

  return issues.length
    ? { ok: false, issues }
    : { ok: true, config: { supabaseUrl, supabaseAnonKey } }
}

export function runtimeConfigErrorMessage(issues: string[]): string {
  return `Invalid local Supabase configuration: ${issues.join(' ')}`
}
