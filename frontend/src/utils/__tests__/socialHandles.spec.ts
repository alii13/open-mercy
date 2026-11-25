import { describe, expect, it } from 'vitest'
import { parseHandle, socialUrl } from '../socialHandles'

describe('parseHandle', () => {
    it('takes a handle typed with or without the @', () => {
        expect(parseHandle('x', '@velvethammer')).toEqual({ handle: 'velvethammer' })
        expect(parseHandle('instagram', ' velvet.hammer ')).toEqual({ handle: 'velvet.hammer' })
    })

    it('takes a pasted profile link', () => {
        expect(parseHandle('x', 'https://twitter.com/velvethammer?s=21')).toEqual({ handle: 'velvethammer' })
        expect(parseHandle('x', 'x.com/velvethammer/')).toEqual({ handle: 'velvethammer' })
        expect(parseHandle('instagram', 'https://www.instagram.com/velvet.hammer/?igsh=abc')).toEqual({ handle: 'velvet.hammer' })
    })

    it('clears the handle when the field is empty', () => {
        expect(parseHandle('x', '  @ ')).toEqual({ handle: null })
    })

    it('refuses what the network would refuse', () => {
        expect(parseHandle('x', 'velvet.hammer')).toHaveProperty('error')
        expect(parseHandle('x', 'a'.repeat(16))).toHaveProperty('error')
        expect(parseHandle('instagram', 'velvet..hammer')).toHaveProperty('error')
        expect(parseHandle('instagram', 'velvethammer.')).toHaveProperty('error')
        expect(parseHandle('x', 'https://evil.example/velvethammer')).toHaveProperty('error')
    })
})

describe('socialUrl', () => {
    it('links only to the network itself', () => {
        expect(socialUrl('x', 'velvethammer')).toBe('https://x.com/velvethammer')
        expect(socialUrl('instagram', 'velvet.hammer')).toBe('https://www.instagram.com/velvet.hammer/')
    })
})
