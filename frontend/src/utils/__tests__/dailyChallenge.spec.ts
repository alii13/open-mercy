import { describe, expect, it, vi } from 'vitest'

// dailyChallenge imports the Supabase client for fetchServerDailyRecord, and
// lib/supabase throws at import time when VITE_SUPABASE_* are unset — which is
// the case in CI, where the workflow passes no env. Same mock gameStore.test.ts
// uses, and for the same reason.
vi.mock('../../lib/supabase', () => ({
    supabase: {
        from: () => {
            throw new Error('unexpected supabase call in a pure daily test')
        },
    },
}))

import { buildDailyShareText, dailyGridCells } from '../dailyChallenge'

const base = { date: '2026-08-09', result: 'won' as const, turns: 23, log: '' }

describe('buildDailyShareText', () => {
    it('leads with the game and the date so a pasted line is self-identifying', () => {
        expect(buildDailyShareText({ ...base, log: 'ppd' })).toContain('RUNE RIOT Daily 2026-08-09')
    })

    it('states the outcome in words', () => {
        expect(buildDailyShareText({ ...base })).toContain('Cleared in 23')
        expect(buildDailyShareText({ ...base, result: 'lost' })).toContain('Lost')
        expect(buildDailyShareText({ ...base, result: 'eliminated' })).toContain('Ruin claimed me')
    })

    it('includes the percentile when a rank is known', () => {
        expect(buildDailyShareText({ ...base }, { rank: 12, total: 100 })).toContain('top 12%')
    })

    it('omits the percentile entirely when rank is unknown', () => {
        const text = buildDailyShareText({ ...base })
        expect(text.toLowerCase()).not.toContain('top')
    })

    it('rounds the percentile up so rank 1 of 200 is not "top 0%"', () => {
        expect(buildDailyShareText({ ...base }, { rank: 1, total: 200 })).toContain('top 1%')
    })

    it('ends with the URL so the share is a funnel, not just a brag', () => {
        expect(buildDailyShareText({ ...base }).trim().endsWith('open-mercy.com/daily')).toBe(true)
    })

    it('carries no emoji — the grid lives in the image, not the text', () => {
        const text = buildDailyShareText({ ...base, log: 'pdxpdx' }, { rank: 3, total: 50 })
        expect([...text].every((ch) => ch.codePointAt(0)! < 0x2190)).toBe(true)
    })

    it('never leaks the deal itself', () => {
        // Word-bounded on purpose: "Cleared in 23" contains a bare "red".
        const text = buildDailyShareText({ ...base, log: 'pdxpdx' })
        expect(text).not.toMatch(/\b(red|blue|green|yellow|draw|wild)\b/i)
    })
})

describe('dailyGridCells', () => {
    it('maps each logged turn to a named cell kind for the renderer', () => {
        expect(dailyGridCells('pdx')).toEqual(['played', 'drew', 'stacked'])
    })

    it('ignores characters it does not recognise', () => {
        expect(dailyGridCells('pzd')).toEqual(['played', 'drew'])
    })

    it('returns an empty list for an empty log', () => {
        expect(dailyGridCells('')).toEqual([])
        expect(dailyGridCells(undefined)).toEqual([])
    })
})
