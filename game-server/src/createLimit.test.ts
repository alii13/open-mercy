import { describe, expect, it } from 'vitest'
import { createAllowed, CREATE_MAX, CREATE_WINDOW_MS } from './createLimit'

const NOW = 1_700_000_000_000

describe('createAllowed', () => {
    it('allows CREATE_MAX rooms in the window, then refuses', () => {
        const times: number[] = []
        for (let i = 0; i < CREATE_MAX; i++) expect(createAllowed(times, NOW + i)).toBe(true)
        expect(createAllowed(times, NOW + CREATE_MAX)).toBe(false)
        expect(times).toHaveLength(CREATE_MAX)
    })

    it('allows again once the oldest creation leaves the window', () => {
        const times: number[] = []
        for (let i = 0; i < CREATE_MAX; i++) createAllowed(times, NOW + i)
        expect(createAllowed(times, NOW + CREATE_WINDOW_MS)).toBe(true)
    })
})
