import { describe, expect, it } from 'vitest'
import { cleanName, cleanSkin, isStackingMode, isWildColor, NAME_MAX } from './validate'

describe('isStackingMode', () => {
    it('accepts the three modes', () => {
        for (const m of ['official', 'house', 'casual']) expect(isStackingMode(m)).toBe(true)
    })

    it('rejects anything else', () => {
        for (const m of ['', 'OFFICIAL', 'x'.repeat(10_000), 1, null, undefined, {}]) {
            expect(isStackingMode(m)).toBe(false)
        }
    })
})

describe('isWildColor', () => {
    it('accepts the four suit colours', () => {
        for (const c of ['red', 'yellow', 'green', 'blue']) expect(isWildColor(c)).toBe(true)
    })

    it('rejects wild itself and junk', () => {
        for (const c of ['wild', 'purple', '', 'RED', 0, undefined, ['red']]) expect(isWildColor(c)).toBe(false)
    })
})

describe('cleanSkin', () => {
    it('keeps a plausible card-back id', () => {
        expect(cleanSkin('ember')).toBe('ember')
        expect(cleanSkin('gold_2-x')).toBe('gold_2-x')
    })

    it('drops oversized, oddly-shaped or non-string values', () => {
        expect(cleanSkin('a'.repeat(33))).toBeUndefined()
        expect(cleanSkin('Ember')).toBeUndefined()
        expect(cleanSkin('<img>')).toBeUndefined()
        expect(cleanSkin('')).toBeUndefined()
        expect(cleanSkin(42)).toBeUndefined()
    })
})

describe('cleanName', () => {
    it('trims and caps at NAME_MAX', () => {
        expect(cleanName('  Alice  ')).toBe('Alice')
        expect(cleanName('x'.repeat(100))).toHaveLength(NAME_MAX)
    })

    it('strips control characters', () => {
        expect(cleanName('Bo\u0000b\n\u007f\u009b')).toBe('Bob')
    })

    it('falls back to PLAYER for empty or non-string input', () => {
        expect(cleanName('')).toBe('PLAYER')
        expect(cleanName('   \t')).toBe('PLAYER')
        expect(cleanName({ name: 'x' })).toBe('PLAYER')
        expect(cleanName(undefined)).toBe('PLAYER')
    })
})
