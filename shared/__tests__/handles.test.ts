import { describe, expect, it } from 'vitest'
import { randomHandle } from '../handles'

describe('randomHandle', () => {
    it('reads as adjective, noun and a four-digit number', () => {
        for (let i = 0; i < 50; i++) expect(randomHandle()).toMatch(/^[A-Z][a-z]+[A-Z][a-z]+\d{4}$/)
    })

    it('is a pure function of the rng', () => {
        expect(randomHandle(() => 0)).toBe('RedFox1000')
        expect(randomHandle(() => 0.9999)).toBe('LethalJoker9999')
    })
})
