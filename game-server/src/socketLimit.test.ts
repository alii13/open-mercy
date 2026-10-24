import { describe, expect, it } from 'vitest'
import { newBucket, socketVerdict, SOCKET_BURST, SOCKET_CLOSE_AFTER_MS, SOCKET_RATE } from './socketLimit'

const NOW = 1_700_000_000_000

describe('socketVerdict', () => {
    it('lets a full burst through, then drops', () => {
        const b = newBucket(NOW)
        for (let i = 0; i < SOCKET_BURST; i++) expect(socketVerdict(b, NOW)).toBe('ok')
        expect(socketVerdict(b, NOW)).toBe('drop')
    })

    it('refills at the steady rate', () => {
        const b = newBucket(NOW)
        for (let i = 0; i < SOCKET_BURST; i++) socketVerdict(b, NOW)
        expect(socketVerdict(b, NOW + 1000 / SOCKET_RATE)).toBe('ok')
        expect(socketVerdict(b, NOW + 1000 / SOCKET_RATE)).toBe('drop')
    })

    it('closes a socket that stays over the limit for the close window', () => {
        const b = newBucket(NOW)
        for (let i = 0; i < SOCKET_BURST; i++) socketVerdict(b, NOW)
        // Flood at 1000/s: a token still trickles through every 100ms, which
        // must not reset the overflow streak.
        const verdicts: string[] = []
        for (let t = NOW; t <= NOW + SOCKET_CLOSE_AFTER_MS + 10; t++) verdicts.push(socketVerdict(b, t))
        expect(verdicts.slice(SOCKET_BURST)).toContain('ok')
        expect(verdicts.indexOf('close')).toBeGreaterThanOrEqual(SOCKET_CLOSE_AFTER_MS)
    })

    it('does not close a socket that slows back down between bursts', () => {
        const b = newBucket(NOW)
        let t = NOW
        // Over the limit for a moment, then quiet, repeatedly - well past the close window.
        for (let round = 0; round < 10; round++) {
            for (let i = 0; i < SOCKET_BURST + 5; i++) expect(socketVerdict(b, t)).not.toBe('close')
            t += 2_000
        }
    })
})
