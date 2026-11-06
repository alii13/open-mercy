import { describe, expect, it, vi } from 'vitest'
import { shortCache } from './shortCache'

describe('shortCache', () => {
    it('serves the cached value inside the window without loading again', async () => {
        let now = 0
        const cache = shortCache<string[]>(1_000, () => now)
        const load = vi.fn(async () => ['AAAAAA'])

        expect(await cache(load)).toEqual(['AAAAAA'])
        now = 999
        expect(await cache(load)).toEqual(['AAAAAA'])
        expect(load).toHaveBeenCalledTimes(1)
    })

    it('loads again once the window has passed', async () => {
        let now = 0
        const cache = shortCache<number>(1_000, () => now)
        let n = 0
        const load = async () => ++n

        expect(await cache(load)).toBe(1)
        now = 1_000
        expect(await cache(load)).toBe(2)
    })

    it('does not cache a failure', async () => {
        const cache = shortCache<string>(1_000, () => 0)
        await expect(cache(async () => { throw new Error('directory down') })).rejects.toThrow('directory down')
        expect(await cache(async () => 'ok')).toBe('ok')
    })
})
