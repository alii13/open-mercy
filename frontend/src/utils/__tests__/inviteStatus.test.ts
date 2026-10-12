import { describe, expect, it } from 'vitest'
import { inviteStatus, canInviteAgain } from '../inviteStatus'

const T0 = Date.parse('2026-10-12T12:00:00Z')
const MIN = 60_000
const sent = (over: { seen_at?: string | null, created_at?: string } = {}) => ({
    created_at: new Date(T0).toISOString(),
    seen_at: null,
    ...over,
})

describe('invite status', () => {
    it('is nothing until an invite goes out', () => {
        expect(inviteStatus(undefined, T0, false)).toBe('none')
    })

    it('waits while the invite is young and unanswered', () => {
        expect(inviteStatus(sent(), T0 + 3 * MIN, false)).toBe('waiting')
    })

    it('is joined once they are sitting at the table, whatever the row says', () => {
        expect(inviteStatus(sent({ seen_at: new Date(T0 + MIN).toISOString() }), T0 + 2 * MIN, true)).toBe('joined')
        expect(inviteStatus(undefined, T0, true)).toBe('joined')
    })

    it('reads as "not now" when they answered and did not come', () => {
        expect(inviteStatus(sent({ seen_at: new Date(T0 + MIN).toISOString() }), T0 + 2 * MIN, false)).toBe('declined')
    })

    it('is missed after the ten minutes the toast lives for', () => {
        expect(inviteStatus(sent(), T0 + 10 * MIN, false)).toBe('missed')
    })
})

describe('inviting again', () => {
    it('is not offered inside the five-minute cooldown the server enforces', () => {
        expect(canInviteAgain(sent({ seen_at: new Date(T0 + MIN).toISOString() }), T0 + 4 * MIN)).toBe(false)
    })

    it('is offered once the cooldown has passed', () => {
        expect(canInviteAgain(sent(), T0 + 10 * MIN)).toBe(true)
    })

    it('is offered when there was never an invite', () => {
        expect(canInviteAgain(undefined, T0)).toBe(true)
    })
})
