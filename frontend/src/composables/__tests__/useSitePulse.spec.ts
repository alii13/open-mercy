import { describe, expect, it, vi, beforeEach } from 'vitest'

type RpcResult = { data: unknown; error: { code?: string } | null }

const { rpc } = vi.hoisted(() => ({
    rpc: vi.fn<() => Promise<RpcResult>>(async () => ({
        data: [{ players_7d: 733, games_7d: 4210 }],
        error: null,
    })),
}))

vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { useSitePulse, PULSE_FLOOR } from '../useSitePulse'

async function settled() {
    await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
    await new Promise(r => setTimeout(r, 0))
}

describe('site pulse', () => {
    beforeEach(() => rpc.mockClear())

    it('shows the weekly figures once there is a crowd to report', async () => {
        const pulse = useSitePulse()
        await settled()
        expect(pulse.show.value).toBe(true)
        expect(pulse.players.value).toBe(733)
        expect(pulse.games.value).toBe(4210)
    })

    it('stays hidden under the floor', async () => {
        rpc.mockResolvedValueOnce({ data: [{ players_7d: PULSE_FLOOR - 1, games_7d: 900 }], error: null })
        const pulse = useSitePulse()
        await settled()
        expect(pulse.show.value).toBe(false)
    })

    it('stays hidden until the SQL has been run', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: 'PGRST202' } })
        const pulse = useSitePulse()
        await settled()
        expect(pulse.show.value).toBe(false)
    })
})
