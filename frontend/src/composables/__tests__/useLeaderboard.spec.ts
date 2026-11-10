import { describe, expect, it, vi } from 'vitest'

const { rpc, record, auth } = vi.hoisted(() => ({
    rpc: vi.fn(async (_fn: string, _args?: unknown) => ({ data: [], error: null })),
    record: { value: null as null | { result: string } },
    auth: { user: { id: 'me' } },
}))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))
vi.mock('../../utils/dailyChallenge', () => ({ getDailyRecord: () => record.value }))
vi.mock('../../stores/authStore', () => ({ useAuthStore: () => auth }))

import { useLobbyBoard } from '../useLeaderboard'

describe('useLobbyBoard', () => {
    it('reads only what the lobby draws, once across remounts, and again after the daily or a new account', async () => {
        await useLobbyBoard().fetchDaily()
        expect(rpc.mock.calls.map(([fn]) => fn).sort()).toEqual(['daily_leaderboard', 'daily_my_rank'])
        expect(rpc).toHaveBeenCalledWith('daily_leaderboard', expect.objectContaining({ max_rows: 5 }))

        // The lobby unmounted for a game and came back.
        await useLobbyBoard().fetchDaily()
        expect(rpc).toHaveBeenCalledTimes(2)

        // The player finished today's deal, so their place moved.
        record.value = { result: 'won' }
        await useLobbyBoard().fetchDaily()
        expect(rpc).toHaveBeenCalledTimes(4)

        // Someone else signed in on this device: my_rank is theirs, not the last player's.
        auth.user = { id: 'someone-else' }
        await useLobbyBoard().fetchDaily()
        expect(rpc).toHaveBeenCalledTimes(6)
    })
})
