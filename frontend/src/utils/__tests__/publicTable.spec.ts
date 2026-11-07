import { describe, expect, it } from 'vitest'
import { publicTableView } from '../publicTable'
import type { LiveTable } from '../../composables/useLiveTables'

const table = (code: string, players: number, mode = 'house'): LiveTable => ({
    code, players, seatsFree: 7 - players, inProgress: false, mode, skins: [], status: 'lobby',
})

describe('public table card', () => {
    it('describes the fullest open table, the one a tap sits you at', () => {
        const view = publicTableView([table('AAAAAA', 2), table('BBBBBB', 4)], true)

        expect(view.target?.code).toBe('BBBBBB')
        expect(view.headline).toBe('4 AT THE TABLE')
        expect(view.status).toBe('3 SEATS LEFT')
        expect(view.body).toBe('Play people from anywhere, right now. No code to share, and the game starts on its own.')
    })

    it('picks and counts by who is connected when the server says, not by seats a closed tab holds', () => {
        const ghosts = { ...table('GHOSTS', 3), connected: 0 }
        const live = { ...table('LIVE', 1), connected: 1 }
        const view = publicTableView([ghosts, live], true)

        expect(view.target?.code).toBe('LIVE')
        expect(view.headline).toBe('1 AT THE TABLE')
        expect(view.status).toBe('6 SEATS LEFT')
    })

    it('says one seat, not one seats', () => {
        expect(publicTableView([table('AAAAAA', 6)], true).status).toBe('1 SEAT LEFT')
    })

    it('never points at a full table: it is dealing, and the next player starts a new one', () => {
        const view = publicTableView([table('FULL', 7)], true)

        expect(view.target).toBeNull()
        expect(view.headline).toBe('OPEN TABLE')
    })

    it("names the rules of the table you would join, not the default", () => {
        expect(publicTableView([table('AAAAAA', 3, 'official')], true).rules).toBe('OFFICIAL RULES')
        expect(publicTableView([], true).rules).toBe('HOUSE RULES')
    })

    it('offers an open table when nobody is waiting', () => {
        const view = publicTableView([], true)

        expect(view.target).toBeNull()
        expect(view.headline).toBe('OPEN TABLE')
        expect(view.status).toBe('')
        expect(view.body).toBe('Take a seat. It deals itself when all 7 are in.')
    })

    it('claims nothing about who is waiting before the first fetch succeeds', () => {
        const view = publicTableView([], false)

        expect(view.headline).toBe('OPEN TABLE')
        expect(view.status).toBe('')
        expect(view.body).not.toMatch(/Nobody/)
    })
})
