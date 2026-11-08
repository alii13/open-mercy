import { describe, it, expect } from 'vitest'
import { router, toRoute, routePath, navigate } from '../routes'

const parseRoute = (path: string) => toRoute(router.resolve(path))

describe('parseRoute', () => {
    it('maps / to home', () => {
        expect(parseRoute('/')).toEqual({ name: 'home' })
    })

    it('maps /leaderboard to the leaderboard', () => {
        expect(parseRoute('/leaderboard')).toEqual({ name: 'leaderboard' })
        expect(parseRoute('/leaderboard/')).toEqual({ name: 'leaderboard' })
    })

    it('maps /leaderboard/<tab> to that board', () => {
        expect(parseRoute('/leaderboard/alltime')).toEqual({ name: 'leaderboard', tab: 'alltime' })
        expect(parseRoute('/leaderboard/weekly')).toEqual({ name: 'leaderboard', tab: 'weekly' })
        expect(parseRoute('/leaderboard/daily')).toEqual({ name: 'leaderboard', tab: 'daily' })
    })

    it('rejects a board name that does not exist', () => {
        expect(parseRoute('/leaderboard/nonsense')).toEqual({ name: 'home' })
    })

    it('maps /badges and /changelog to their pages', () => {
        expect(parseRoute('/badges')).toEqual({ name: 'badges' })
        expect(parseRoute('/changelog')).toEqual({ name: 'changelog' })
    })

    it('maps /p/<code> to a profile', () => {
        expect(parseRoute('/p/9f3ac21b')).toEqual({ name: 'profile', code: '9f3ac21b' })
    })

    it('accepts mixed-case codes as-is', () => {
        expect(parseRoute('/p/Ab12Cd34')).toEqual({ name: 'profile', code: 'Ab12Cd34' })
    })

    it('maps /public to the public table', () => {
        expect(parseRoute('/public')).toEqual({ name: 'public' })
    })

    it('maps /r/<code> to that room, upper-casing a typed code', () => {
        expect(parseRoute('/r/ABCD')).toEqual({ name: 'room', code: 'ABCD' })
        expect(parseRoute('/r/xk7p2m')).toEqual({ name: 'room', code: 'XK7P2M' })
    })

    it('rejects a room code the server could never mint', () => {
        expect(parseRoute('/r/ABC')).toEqual({ name: 'home' })
        expect(parseRoute('/r/AB01')).toEqual({ name: 'home' })
        expect(parseRoute('/r/ABCDEFGHJ')).toEqual({ name: 'home' })
    })

    it('rejects junk paths to home', () => {
        expect(parseRoute('/leaderboard/extra')).toEqual({ name: 'home' })
        expect(parseRoute('/changelog/extra')).toEqual({ name: 'home' })
        expect(parseRoute('/p/')).toEqual({ name: 'home' })
        expect(parseRoute('/p/has spaces')).toEqual({ name: 'home' })
        expect(parseRoute('/p/way-too-long-to-be-a-share-code-way-too-long')).toEqual({ name: 'home' })
        expect(parseRoute('/anything-else')).toEqual({ name: 'home' })
    })
})

describe('routePath', () => {
    it('is the inverse of parseRoute', () => {
        expect(routePath({ name: 'home' })).toBe('/')
        expect(routePath({ name: 'leaderboard' })).toBe('/leaderboard')
        expect(routePath({ name: 'leaderboard', tab: 'alltime' })).toBe('/leaderboard/alltime')
        // daily is the default, so it keeps the bare path rather than
        // minting a second URL for the same board.
        expect(routePath({ name: 'leaderboard', tab: 'daily' })).toBe('/leaderboard')
        expect(routePath({ name: 'badges' })).toBe('/badges')
        expect(routePath({ name: 'changelog' })).toBe('/changelog')
        expect(routePath({ name: 'profile', code: '9f3ac21b' })).toBe('/p/9f3ac21b')
        expect(routePath({ name: 'public' })).toBe('/public')
        expect(routePath({ name: 'room', code: 'XK7P2M' })).toBe('/r/XK7P2M')
    })
})

describe('navigation', () => {
    it('sends an unknown path home, keeping the query and hash auth redirects ride on', async () => {
        await router.push('/nope?code=abc#type=recovery')
        expect(router.currentRoute.value.fullPath).toBe('/?code=abc#type=recovery')
    })

    it('sends an old invite link to its room, keeping the rest of the query', async () => {
        await router.push('/changelog')
        await router.push('/?join=xk7p2m&ref=x')
        expect(router.currentRoute.value.fullPath).toBe('/r/XK7P2M?ref=x')
    })

    it('leaves home alone when ?join holds no room code', async () => {
        await router.push('/changelog')
        await router.push('/?join=nope')
        expect(router.currentRoute.value.fullPath).toBe('/?join=nope')
    })

    it('keeps the invite query when navigating', async () => {
        await router.push('/?join=ABCDEF')
        await navigate({ name: 'leaderboard', tab: 'weekly' })
        expect(router.currentRoute.value.fullPath).toBe('/leaderboard/weekly?join=ABCDEF')
    })
})
