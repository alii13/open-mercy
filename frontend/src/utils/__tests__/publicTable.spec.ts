import { describe, expect, it } from 'vitest'
import { publicTableView } from '../publicTable'
import type { LiveTable } from '../../composables/useLiveTables'

const table = (code: string, players: number, mode = 'house'): LiveTable => ({
    code, players, seatsFree: 20 - players, inProgress: false, mode, skins: [], status: 'lobby',
})

describe('public table card', () => {
    it('describes the fullest open table, the one a tap sits you at', () => {
        const view = publicTableView([table('AAAAAA', 2), table('BBBBBB', 4)], 0, true)

        expect(view.target?.code).toBe('BBBBBB')
        expect(view.headline).toBe('4 AT THE TABLE')
        expect(view.status).toBe('')
        expect(view.body).toBe('Play people from anywhere, right now. No code to share, and the game starts on its own.')
    })

    it('picks and counts by who is connected when the server says, not by seats a closed tab holds', () => {
        const ghosts = { ...table('GHOSTS', 3), connected: 0 }
        const live = { ...table('LIVE', 1), connected: 1 }
        const view = publicTableView([ghosts, live], 0, true)

        expect(view.target?.code).toBe('LIVE')
        expect(view.headline).toBe('1 AT THE TABLE')
    })

    it('tells a lone waiting player apart from a running clock', () => {
        const view = publicTableView([table('AAAAAA', 1)], 0, true)

        expect(view.headline).toBe('1 AT THE TABLE')
        expect(view.status).toBe('STARTS ITSELF ONCE 2 ARE IN')
    })

    it("names the rules of the table you would join, not the default", () => {
        expect(publicTableView([table('AAAAAA', 3, 'official')], 0, true).rules).toBe('OFFICIAL RULES')
        expect(publicTableView([], 0, true).rules).toBe('HOUSE RULES')
    })

    it('offers an open table when nobody is waiting', () => {
        const view = publicTableView([], 0, true)

        expect(view.target).toBeNull()
        expect(view.headline).toBe('OPEN TABLE')
        expect(view.status).toBe('')
        expect(view.body).toBe('Take a seat. The game starts when someone joins.')
    })

    it('mentions games in progress when every table is mid-game', () => {
        expect(publicTableView([], 1, true).status).toBe('1 GAME IN PROGRESS · START THE NEXT')
        expect(publicTableView([], 3, true).status).toBe('3 GAMES IN PROGRESS · START THE NEXT')
    })

    it('claims nothing about who is waiting before the first fetch succeeds', () => {
        const view = publicTableView([], 0, false)

        expect(view.headline).toBe('OPEN TABLE')
        expect(view.status).toBe('STARTS ITSELF ONCE 2 ARE IN')
        expect(view.body).not.toMatch(/Nobody/)
    })
})
