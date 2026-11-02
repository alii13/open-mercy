import { describe, expect, it } from 'vitest'
import { AVATAR_TINTS, avatarPath, avatarTint, cropRect, initialOf } from '../avatar'

describe('avatar fallback', () => {
    it('gives the same player the same tint every time', () => {
        const id = '0a263441-1111-4c4c-8888-1234567890ab'
        expect(avatarTint(id)).toEqual(avatarTint(id))
        expect(AVATAR_TINTS).toContainEqual(avatarTint(id))
    })

    it('spreads players across all four deck colours', () => {
        const seen = new Set<string>()
        for (let i = 0; i < 200; i++) seen.add(avatarTint(`user-${i}`).fg)
        expect(seen.size).toBe(AVATAR_TINTS.length)
    })

    it('shows the first letter of the name, uppercased', () => {
        expect(initialOf('nightOwl')).toBe('N')
        expect(initialOf('  _stack')).toBe('_')
        expect(initialOf('')).toBe('?')
    })
})

describe('crop', () => {
    it('takes the centre square of a landscape photo at zoom 1', () => {
        expect(cropRect({ width: 400, height: 200 }, 100, 1, { x: 0, y: 0 })).toEqual({ sx: 100, sy: 0, size: 200 })
    })

    it('takes a smaller square when zoomed in', () => {
        expect(cropRect({ width: 400, height: 400 }, 100, 2, { x: 0, y: 0 })).toEqual({ sx: 100, sy: 100, size: 200 })
    })

    it('follows a drag but never lets the photo leave the circle', () => {
        // Dragging right by 30px moves the window left on the photo.
        expect(cropRect({ width: 400, height: 200 }, 100, 1, { x: 30, y: 0 })).toEqual({ sx: 40, sy: 0, size: 200 })
        // A drag past the edge stops at the edge.
        expect(cropRect({ width: 400, height: 200 }, 100, 1, { x: 500, y: 500 })).toEqual({ sx: 0, sy: 0, size: 200 })
    })
})

describe('photo path', () => {
    it('keeps each version inside the player folder, so a new photo is a new url', () => {
        expect(avatarPath('abc', 1730000000000)).toBe('abc/1730000000000')
    })
})
