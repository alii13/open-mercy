import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const { rpc, channels, unsubscribe } = vi.hoisted(() => ({
    rpc: vi.fn(),
    channels: [] as { name: string, filters: unknown[], fire: (i?: number) => void }[],
    unsubscribe: vi.fn(),
}))
vi.mock('../../lib/supabase', () => ({
    supabase: {
        rpc,
        // Owner-scoped RPCs are guarded by hasLiveSession(). These suites are
        // about RPC behaviour, so the session is simply live.
        auth: { getSession: async () => ({ data: { session: { access_token: 't' } }, error: null }) },
        channel: (name: string) => {
            const handlers: (() => void)[] = []
            const ch = {
                name,
                filters: [] as unknown[],
                // One change matches one filter, so Realtime calls one handler.
                fire: (i = 0) => handlers[i]?.(),
                on: (_e: string, cfg: unknown, cb: () => void) => { ch.filters.push(cfg); handlers.push(cb); return ch },
                subscribe: () => ch,
                unsubscribe,
            }
            channels.push(ch)
            return ch
        },
    },
}))

import { useSocialStore, type FriendRow } from '../socialStore'
import { useAuthStore } from '../authStore'

const row = (over: Partial<FriendRow> = {}): FriendRow => ({
    user_id: 'u2',
    username: 'RIVAL',
    share_code: 'abc123',
    skin: null,
    last_seen_at: null,
    status: 'accepted',
    incoming: false,
    created_at: '2026-08-15T10:00:00Z',
    ...over,
})

function listReturns(rows: FriendRow[]) {
    rpc.mockImplementation(async (fn: string) =>
        fn === 'my_friends' ? { data: rows, error: null } : { data: 'sent', error: null })
}

describe('social store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        rpc.mockReset()
        channels.length = 0
        unsubscribe.mockReset()
    })

    it('splits one list into friends, requests received and requests sent', async () => {
        listReturns([
            row({ user_id: 'friend', status: 'accepted' }),
            row({ user_id: 'asked-me', status: 'pending', incoming: true }),
            row({ user_id: 'i-asked', status: 'pending', incoming: false }),
            row({ user_id: 'blocked', status: 'blocked' }),
        ])
        const social = useSocialStore()
        await social.refresh()

        expect(social.friends.map(r => r.user_id)).toEqual(['friend'])
        expect(social.incoming.map(r => r.user_id)).toEqual(['asked-me'])
        expect(social.outgoing.map(r => r.user_id)).toEqual(['i-asked'])
        expect(social.blocked.map(r => r.user_id)).toEqual(['blocked'])
        // One lookup for every "should this button offer ADD?" question.
        expect([...social.knownIds].sort()).toEqual(['asked-me', 'blocked', 'friend', 'i-asked'])
    })

    it('hides every friends surface until the SQL is run', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
        const social = useSocialStore()
        await social.refresh()
        expect(social.unavailable).toBe(true)

        // And stops asking, so a missing function costs one request, not one
        // per screen for the rest of the session.
        rpc.mockClear()
        await social.refresh()
        expect(rpc).not.toHaveBeenCalled()
    })

    it('keeps the list on screen through a dropped request', async () => {
        listReturns([row({ user_id: 'friend' })])
        const social = useSocialStore()
        await social.refresh()

        rpc.mockRejectedValueOnce(new Error('offline'))
        await social.refresh()
        expect(social.friends).toHaveLength(1)
        expect(social.unavailable).toBe(false)
    })

    it('re-reads after a request, because the server may have made you friends', async () => {
        // Both sides pressing ADD at once: the second call accepts the first.
        rpc.mockImplementation(async (fn: string) =>
            fn === 'send_friend_request'
                ? { data: 'accepted', error: null }
                : { data: [row({ user_id: 'u2', status: 'accepted' })], error: null })

        const social = useSocialStore()
        const result = await social.sendRequest('u2')

        expect(result).toBe('accepted')
        expect(rpc).toHaveBeenCalledWith('send_friend_request', { p_user: 'u2' })
        expect(social.friends.map(r => r.user_id)).toEqual(['u2'])
    })

    it('refuses a second press while one is in flight', async () => {
        let release: (v: unknown) => void = () => {}
        // Only the send hangs; the refresh it triggers on release answers
        // normally, or the test would wait on its own mock.
        rpc.mockImplementationOnce(() => new Promise(res => { release = res }))
            .mockResolvedValue({ data: [], error: null })

        const social = useSocialStore()
        const first = social.sendRequest('u2')
        expect(social.pendingIds.has('u2')).toBe(true)
        expect(await social.sendRequest('u2')).toBe('failed')

        // call() checks the session before the RPC, so the hanging promise does
        // not exist yet on the tick the second press resolves. Wait for the call
        // rather than assuming it has happened - releasing early released nothing.
        await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
        release({ data: 'sent', error: null })
        expect(await first).toBe('sent')
        expect(social.pendingIds.has('u2')).toBe(false)
    })

    it('drops one account\'s list when another signs in on the same device', async () => {
        listReturns([row({ user_id: 'friend' })])
        const social = useSocialStore()
        const auth = useAuthStore()
        auth.user = { id: 'first' } as never
        await nextTick()
        await social.refresh()
        expect(social.friends).toHaveLength(1)

        // A store outlives a sign-out; nothing reloads the page.
        auth.user = { id: 'second' } as never
        await nextTick()
        expect(social.rows).toHaveLength(0)
    })

    it('unfriends without blocking, and the row goes at once', async () => {
        listReturns([row({ user_id: 'friend', status: 'accepted' })])
        const social = useSocialStore()
        await social.refresh()
        expect(social.friends).toHaveLength(1)

        listReturns([])
        await social.remove('friend')
        expect(rpc).toHaveBeenCalledWith('remove_friend', { p_user: 'friend' })
        // Blocking is a different, heavier thing and must not be involved.
        expect(rpc).not.toHaveBeenCalledWith('block_player', expect.anything())
        expect(social.friends).toHaveLength(0)
    })

    it('drops an answered request from the list immediately', async () => {
        listReturns([row({ user_id: 'asked-me', status: 'pending', incoming: true })])
        const social = useSocialStore()
        await social.refresh()
        expect(social.incoming).toHaveLength(1)

        // The row must leave the screen on the tap, not a round trip later.
        listReturns([])
        await social.respond('asked-me', false)
        expect(social.incoming).toHaveLength(0)
    })

    describe('played recently', () => {
        const opponent = (over: Record<string, unknown> = {}) => ({
            user_id: 'rival', username: 'RIVAL', share_code: 'r1', last_seen_at: null,
            games: 3, my_wins: 2, their_wins: 1, last_played: '2026-08-15T10:00:00Z', ...over,
        })

        it('lists people from recent multiplayer games', async () => {
            rpc.mockImplementation(async (fn: string) =>
                fn === 'recent_opponents' ? { data: [opponent()], error: null } : { data: [], error: null })
            const social = useSocialStore()
            await social.fetchRecent()
            expect(social.recent.map(r => r.user_id)).toEqual(['rival'])
        })

        it('drops someone from the list once you ask them, without waiting for a re-read', async () => {
            rpc.mockImplementation(async (fn: string) =>
                fn === 'recent_opponents' ? { data: [opponent()], error: null }
                : fn === 'my_friends' ? { data: [row({ user_id: 'rival', status: 'pending', incoming: false })], error: null }
                : { data: 'sent', error: null })
            const social = useSocialStore()
            await social.fetchRecent()
            await social.sendRequest('rival')
            expect(social.recent).toHaveLength(0)
        })

        it('keeps someone on the list when the request did not go out', async () => {
            rpc.mockImplementation(async (fn: string) =>
                fn === 'recent_opponents' ? { data: [opponent()], error: null }
                : fn === 'my_friends' ? { data: [], error: null }
                : { data: 'rate_limited', error: null })
            const social = useSocialStore()
            await social.fetchRecent()
            expect(await social.sendRequest('rival')).toBe('rate_limited')
            expect(social.recent.map(r => r.user_id)).toEqual(['rival'])
        })

        it('leaves out anyone who is already a friend or a request', async () => {
            rpc.mockImplementation(async (fn: string) =>
                fn === 'recent_opponents' ? { data: [opponent(), opponent({ user_id: 'stranger' })], error: null }
                : { data: [row({ user_id: 'rival', status: 'pending', incoming: true })], error: null })
            const social = useSocialStore()
            await social.fetchRecent()
            await social.refresh()
            expect(social.recent.map(r => r.user_id)).toEqual(['stranger'])
        })

        it('drops a list that was asked for before a sign-out', async () => {
            let release: (v: unknown) => void = () => {}
            const social = useSocialStore()
            const auth = useAuthStore()
            auth.user = { id: 'first' } as never
            await nextTick()
            rpc.mockReset()
            rpc.mockImplementationOnce(() => new Promise(res => { release = res }))
            const pending = social.fetchRecent()
            await vi.waitFor(() => expect(rpc).toHaveBeenCalled())
            auth.user = { id: 'second' } as never
            await nextTick()
            release({ data: [opponent()], error: null })
            await pending
            expect(social.recent).toHaveLength(0)
        })

        it('hides the section until its SQL is run, and stops asking', async () => {
            rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
            const social = useSocialStore()
            await social.fetchRecent()
            expect(social.recent).toHaveLength(0)
            rpc.mockClear()
            await social.fetchRecent()
            expect(rpc).not.toHaveBeenCalled()
            // The friends list itself is not affected by a missing extra.
            expect(social.unavailable).toBe(false)
        })
    })

    describe('notices', () => {
        it('announces an unanswered request, newest first, even one that arrived while away', async () => {
            listReturns([
                row({ user_id: 'older', status: 'pending', incoming: true, created_at: '2026-08-15T09:00:00Z' }),
                row({ user_id: 'newer', status: 'pending', incoming: true, created_at: '2026-08-15T11:00:00Z' }),
            ])
            const social = useSocialStore()
            await social.refresh()

            expect(social.notice).toEqual({ kind: 'request', row: expect.objectContaining({ user_id: 'newer' }) })
        })

        it('does not announce the same request twice once dismissed', async () => {
            listReturns([row({ user_id: 'asked-me', status: 'pending', incoming: true })])
            const social = useSocialStore()
            await social.refresh()
            social.dismissNotice()
            expect(social.notice).toBeNull()

            await social.refresh()
            expect(social.notice).toBeNull()
        })

        it('announces a new request from someone whose earlier one was already shown', async () => {
            listReturns([row({ user_id: 'asked-me', status: 'pending', incoming: true, created_at: '2026-08-15T09:00:00Z' })])
            const social = useSocialStore()
            await social.refresh()
            social.dismissNotice()

            // Unfriended, then asked again: a new request, not the old one.
            listReturns([row({ user_id: 'asked-me', status: 'pending', incoming: true, created_at: '2026-08-15T12:00:00Z' })])
            await social.refresh()
            expect(social.notice?.kind).toBe('request')
        })

        it('tells the sender when a request they sent is accepted', async () => {
            listReturns([row({ user_id: 'i-asked', status: 'pending', incoming: false })])
            const social = useSocialStore()
            await social.refresh()
            expect(social.notice).toBeNull()

            listReturns([row({ user_id: 'i-asked', status: 'accepted', incoming: false })])
            await social.refresh()
            expect(social.notice).toEqual({ kind: 'accepted', row: expect.objectContaining({ user_id: 'i-asked' }) })
        })

        it('brings back a request that an accepted toast pushed off screen', async () => {
            listReturns([
                row({ user_id: 'asked-me', status: 'pending', incoming: true }),
                row({ user_id: 'i-asked', status: 'pending', incoming: false }),
            ])
            const social = useSocialStore()
            await social.refresh()
            expect(social.notice?.kind).toBe('request')

            listReturns([
                row({ user_id: 'asked-me', status: 'pending', incoming: true }),
                row({ user_id: 'i-asked', status: 'accepted', incoming: false }),
            ])
            await social.refresh()
            expect(social.notice?.kind).toBe('accepted')

            social.dismissNotice()
            await social.refresh()
            expect(social.notice).toEqual({ kind: 'request', row: expect.objectContaining({ user_id: 'asked-me' }) })
        })

        it('does not call an existing friend newly accepted', async () => {
            listReturns([row({ user_id: 'friend', status: 'accepted' })])
            const social = useSocialStore()
            await social.refresh()
            await social.refresh()
            expect(social.notice).toBeNull()
        })
    })

    describe('live updates', () => {
        it('re-reads when a friendship row changes for the signed-in player', async () => {
            listReturns([])
            const social = useSocialStore()
            const auth = useAuthStore()
            auth.user = { id: 'me' } as never
            await nextTick()

            const ch = channels.find(c => c.name === 'friendships:me')
            expect(ch).toBeDefined()
            // Requests to me arrive as inserts; my requests being accepted
            // arrive as updates.
            expect(ch!.filters).toEqual(expect.arrayContaining([
                expect.objectContaining({ table: 'friendships', event: 'INSERT', filter: 'addressee_id=eq.me' }),
                expect.objectContaining({ table: 'friendships', event: 'UPDATE', filter: 'requester_id=eq.me' }),
                // A request re-sent after a decline is an update that turns
                // the row around, not a new row.
                expect.objectContaining({ table: 'friendships', event: 'UPDATE', filter: 'addressee_id=eq.me' }),
            ]))

            listReturns([row({ user_id: 'asked-me', status: 'pending', incoming: true })])
            ch!.fire()
            await vi.waitFor(() => expect(social.incoming).toHaveLength(1))
        })

        it('closes the channel once the friends SQL turns out to be missing', async () => {
            rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
            const social = useSocialStore()
            const auth = useAuthStore()
            auth.user = { id: 'me' } as never
            await nextTick()
            await social.refresh()
            expect(social.unavailable).toBe(true)
            expect(unsubscribe).toHaveBeenCalled()
        })

        it('drops a read that started before a sign-out', async () => {
            let release: (v: unknown) => void = () => {}
            const social = useSocialStore()
            const auth = useAuthStore()
            auth.user = { id: 'first' } as never
            await nextTick()
            rpc.mockReset()
            rpc.mockImplementationOnce(() => new Promise(res => { release = res }))
            const pending = social.refresh()
            await vi.waitFor(() => expect(rpc).toHaveBeenCalled())

            auth.user = { id: 'second' } as never
            await nextTick()
            release({ data: [row({ user_id: 'asked-first', status: 'pending', incoming: true })], error: null })
            await pending

            // The first account's request must not land on the second account's screen.
            expect(social.rows).toHaveLength(0)
            expect(social.notice).toBeNull()
        })

        it('ignores a slow read that lands after a newer one', async () => {
            listReturns([row({ user_id: 'i-asked', status: 'pending', incoming: false })])
            const social = useSocialStore()
            await social.refresh()

            let release: (v: unknown) => void = () => {}
            rpc.mockImplementationOnce(() => new Promise(res => { release = res }))
            const slow = social.refresh()
            await vi.waitFor(() => expect(rpc).toHaveBeenCalledTimes(2))

            listReturns([row({ user_id: 'i-asked', status: 'accepted', incoming: false })])
            await social.refresh()
            expect(social.notice?.kind).toBe('accepted')
            social.dismissNotice()

            release({ data: [row({ user_id: 'i-asked', status: 'pending', incoming: false })], error: null })
            await slow
            expect(social.friends).toHaveLength(1)

            // And the friendship is not announced a second time.
            await social.refresh()
            expect(social.notice).toBeNull()
        })

        it('closes the channel on sign-out', async () => {
            listReturns([])
            useSocialStore()
            const auth = useAuthStore()
            auth.user = { id: 'me' } as never
            await nextTick()
            auth.user = null
            await nextTick()
            expect(unsubscribe).toHaveBeenCalled()
        })
    })
})
