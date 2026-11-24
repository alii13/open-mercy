import { describe, expect, it } from 'vitest'
import { pointsBoost, shouldOffer, type Announcement } from '../announcement'

const live: Announcement = {
    id: '2026-11-25-10k',
    eyebrow: null,
    hero: '2X',
    heroTitle: null,
    heroNote: null,
    body: 'Every point counts double.',
    imagePath: null,
    imageCaption: null,
    buttonLabel: 'COUNT ME IN',
    pointsMultiplier: 2,
    endsAt: 10_000,
    joined: false,
    skips: 0,
}

describe('announcement', () => {
    it('stops offering itself after the second "Not now"', () => {
        expect(shouldOffer({ ...live, skips: 1 }, false)).toBe(true)
        expect(shouldOffer({ ...live, skips: 2 }, false)).toBe(false)
    })

    it('boosts only players who joined, and only until it ends', () => {
        expect(pointsBoost(live, 5_000)).toBe(1)
        expect(pointsBoost({ ...live, joined: true }, 5_000)).toBe(2)
        expect(pointsBoost({ ...live, joined: true }, 10_000)).toBe(1)
    })
})
