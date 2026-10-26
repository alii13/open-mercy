import { describe, it, expect } from 'vitest'
import { parseRoute, routePath } from '../routes'

describe('parseRoute', () => {
    it('maps / to home', () => {
        expect(parseRoute('/')).toEqual({ name: 'home' })
    })

    it('maps the couch TV and normalized phone join routes', () => {
        expect(parseRoute('/couch')).toEqual({ name: 'couch' })
        expect(parseRoute('/join/ab23cd')).toEqual({ name: 'couch-join', roomCode: 'AB23CD' })
        expect(parseRoute('/join/INVALID!')).toEqual({ name: 'home' })
    })

    it('maps /leaderboard to the leaderboard', () => {
        expect(parseRoute('/leaderboard')).toEqual({ name: 'leaderboard' })
    })

    it('maps /leaderboard/<tab> to that board', () => {
        expect(parseRoute('/leaderboard/alltime')).toEqual({ name: 'leaderboard', tab: 'alltime' })
        expect(parseRoute('/leaderboard/weekly')).toEqual({ name: 'leaderboard', tab: 'weekly' })
        expect(parseRoute('/leaderboard/daily')).toEqual({ name: 'leaderboard', tab: 'daily' })
    })

    it('rejects a board name that does not exist', () => {
        expect(parseRoute('/leaderboard/nonsense')).toEqual({ name: 'home' })
        expect(parseRoute('/leaderboard/')).toEqual({ name: 'home' })
    })

    it('maps /changelog to the changelog', () => {
        expect(parseRoute('/changelog')).toEqual({ name: 'changelog' })
    })

    it('maps /p/<code> to a profile', () => {
        expect(parseRoute('/p/9f3ac21b')).toEqual({ name: 'profile', code: '9f3ac21b' })
    })

    it('accepts mixed-case codes as-is', () => {
        expect(parseRoute('/p/Ab12Cd34')).toEqual({ name: 'profile', code: 'Ab12Cd34' })
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
        expect(routePath({ name: 'couch' })).toBe('/couch')
        expect(routePath({ name: 'couch-join', roomCode: 'AB23CD' })).toBe('/join/AB23CD')
        expect(routePath({ name: 'leaderboard' })).toBe('/leaderboard')
        expect(routePath({ name: 'leaderboard', tab: 'alltime' })).toBe('/leaderboard/alltime')
        // daily is the default, so it keeps the bare path rather than
        // minting a second URL for the same board.
        expect(routePath({ name: 'leaderboard', tab: 'daily' })).toBe('/leaderboard')
        expect(routePath({ name: 'changelog' })).toBe('/changelog')
        expect(routePath({ name: 'profile', code: '9f3ac21b' })).toBe('/p/9f3ac21b')
    })
})

