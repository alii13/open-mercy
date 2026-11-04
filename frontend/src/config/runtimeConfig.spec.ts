import { describe, expect, it } from 'vitest'
import { runtimeConfigErrorMessage, validateRuntimeConfig } from './runtimeConfig'

describe('validateRuntimeConfig', () => {
  it('reports both required values when the environment is empty', () => {
    const result = validateRuntimeConfig({})

    expect(result).toEqual({
      ok: false,
      issues: [
        'VITE_SUPABASE_URL is missing.',
        'VITE_SUPABASE_ANON_KEY is missing.',
      ],
    })
  })

  it('rejects the checked-in example placeholders', () => {
    const result = validateRuntimeConfig({
      VITE_SUPABASE_URL: 'https://your-project-ref.supabase.co',
      VITE_SUPABASE_ANON_KEY: 'your-anon-key-here',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toHaveLength(2)
  })

  it('accepts a Supabase URL and publishable client-key shape', () => {
    const result = validateRuntimeConfig({
      VITE_SUPABASE_URL: 'http://127.0.0.1:54321',
      VITE_SUPABASE_ANON_KEY: `sb_publishable_${'a'.repeat(24)}`,
    })

    expect(result).toEqual({
      ok: true,
      config: {
        supabaseUrl: 'http://127.0.0.1:54321',
        supabaseAnonKey: `sb_publishable_${'a'.repeat(24)}`,
      },
    })
  })

  it('formats a concise import-time error for defensive callers', () => {
    expect(runtimeConfigErrorMessage(['VITE_SUPABASE_URL is missing.']))
      .toContain('Invalid local Supabase configuration')
  })
})
