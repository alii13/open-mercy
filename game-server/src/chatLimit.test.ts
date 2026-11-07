import { describe, expect, it } from 'vitest'
import { chatAllowed, loungeAllowed, CHAT_MIN_GAP_MS, CHAT_BURST, CHAT_WINDOW_MS, LOUNGE_PER_SECOND } from './chatLimit'

const NOW = 1_700_000_000_000

describe('chatAllowed', () => {
    it('lets a first message through and records it', () => {
        const times: number[] = []
        expect(chatAllowed(times, NOW)).toBe(true)
        expect(times).toEqual([NOW])
    })

    it('blocks a message inside the minimum gap', () => {
        const times: number[] = []
        chatAllowed(times, NOW)
        expect(chatAllowed(times, NOW + CHAT_MIN_GAP_MS - 1)).toBe(false)
        expect(chatAllowed(times, NOW + CHAT_MIN_GAP_MS)).toBe(true)
    })

    it('blocks the burst cap inside the window', () => {
        const times: number[] = []
        for (let i = 0; i < CHAT_BURST; i++) {
            expect(chatAllowed(times, NOW + i * CHAT_MIN_GAP_MS)).toBe(true)
        }
        expect(chatAllowed(times, NOW + CHAT_BURST * CHAT_MIN_GAP_MS)).toBe(false)
    })

    it('forgets messages older than the window', () => {
        const times: number[] = []
        for (let i = 0; i < CHAT_BURST; i++) chatAllowed(times, NOW + i * CHAT_MIN_GAP_MS)
        expect(chatAllowed(times, NOW + CHAT_WINDOW_MS)).toBe(true)
    })

    it('a blocked message does not count toward the limit', () => {
        const times: number[] = []
        chatAllowed(times, NOW)
        chatAllowed(times, NOW + 10) // blocked spam attempt
        expect(times.length).toBe(1)
    })
})

describe('loungeAllowed', () => {
    it('lets a drag stream through and stops a flood', () => {
        const times: number[] = []
        const sent = Array.from({ length: 30 }, (_, i) => loungeAllowed(times, NOW + i * 10)).filter(Boolean).length
        expect(sent).toBe(LOUNGE_PER_SECOND)
    })

    it('allows a steady drag of one move every 120 ms indefinitely', () => {
        const times: number[] = []
        const all = Array.from({ length: 50 }, (_, i) => loungeAllowed(times, NOW + i * 120))
        expect(all.every(Boolean)).toBe(true)
    })
})
