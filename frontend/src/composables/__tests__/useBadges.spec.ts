import { describe, expect, it, vi } from 'vitest'

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn() }))
vi.mock('../../lib/supabase', () => ({ supabase: { rpc } }))

import { useBadges } from '../useBadges'

const points = (n: number) => ({ data: [{ user_id: 'me', points: n, days_idle: 0 }], error: null })

describe('useBadges', () => {
    it('gives the badges page the total after this session\'s games, even after a dropped request', async () => {
        const { badges, fetchBadges } = useBadges()
        // A dropped request is not a missing function: badges stay on.
        rpc.mockResolvedValueOnce({ data: null, error: { message: 'Failed to fetch' } })
        await fetchBadges(['me'])
        rpc.mockResolvedValueOnce(points(300))
        await fetchBadges(['me'])
        expect(badges.value.me?.points).toBe(300)

        // Games since then: a cached total is the old one, so the page asks fresh.
        rpc.mockResolvedValueOnce(points(500))
        await fetchBadges(['me'], { fresh: true })
        expect(badges.value.me?.points).toBe(500)
    })
})
