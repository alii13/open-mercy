import { describe, expect, it, vi, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const { rpc, channelFor, unsubscribe, getSession } = vi.hoisted(() => {
    const unsubscribe = vi.fn()
    const channelFor = vi.fn()
    const getSession = vi.fn(async () => ({
        data: { session: { access_token: 't' } as { access_token: string } | null },
        error: null as { message: string } | null,
    }))
    return { rpc: vi.fn(), channelFor, unsubscribe, getSession }
})

// One fake channel per name, so a test can fire the row event the way
// Realtime would and assert the subscription is torn down.
vi.mock('../../lib/supabase', () => ({
    supabase: {
        rpc,
        // Owner-scoped RPCs are guarded by hasLiveSession(). Live by default,
        // so the rest of these tests are about RPC behaviour.
        auth: { getSession },
        channel: (name: string) => {
            const handlers: ((payload: unknown) => void)[] = []
            const ch = {
                name,
                handlers,
                on: (_e: string, _cfg: unknown, cb: (p: unknown) => void) => { handlers.push(cb); return ch },
                // Realtime reports the join through this callback; the store
                // reads again on success.
                subscribe: (cb?: (status: string) => void) => { cb?.('SUBSCRIBED'); return ch },
                unsubscribe,
            }
            channelFor(ch)
            return ch
        },
    },
}))

// The real guard reaches the client through import(). Two of those in flight
// at once can resolve past the mock above and read a real, empty session,
// which hides any same-tick race. Same rule, same session source.
vi.mock('../../utils/liveSession', () => ({
    hasLiveSession: async () => {
        const { data, error } = await getSession()
        return !error && !!data.session
    },
}))

import { useInviteStore, type RoomInvite } from '../inviteStore'
import { useAuthStore } from '../authStore'

const invite = (over: Partial<RoomInvite> = {}): RoomInvite => ({
    id: 'i1',
    from_user: 'u2',
    from_username: 'RIVAL',
    room_code: 'ABC123',
    players: 2,
    mode: 'official',
    created_at: '2026-08-15T12:00:00Z',
    ...over,
})

function rpcReturns(rows: RoomInvite[], sendResult = 'sent') {
    rpc.mockImplementation(async (fn: string) =>
        fn === 'my_invites' ? { data: rows, error: null } : { data: sendResult, error: null })
}

describe('invite store', () => {
    beforeEach(() => {
        setActivePinia(createPinia())
        rpc.mockReset()
        channelFor.mockReset()
        unsubscribe.mockReset()
        getSession.mockReset()
        getSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null })
    })

    it('opens a channel for the signed-in player and reads on start', async () => {
        rpcReturns([invite()])
        const store = useInviteStore()
        const auth = useAuthStore()
        auth.user = { id: 'me' } as never
        await nextTick()

        expect(channelFor).toHaveBeenCalledWith(expect.objectContaining({ name: 'invites:me' }))
        await vi.waitFor(() => expect(store.current?.from_username).toBe('RIVAL'))
    })

    it('re-reads when a row arrives, because the payload carries no name', async () => {
        rpcReturns([])
        const store = useInviteStore()
        const auth = useAuthStore()
        auth.user = { id: 'me' } as never
        await nextTick()
        await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('my_invites'))
        expect(store.current).toBeNull()

        rpcReturns([invite({ id: 'i2', from_username: 'NEWCOMER' })])
        const ch = channelFor.mock.calls[0]![0] as { handlers: ((p: unknown) => void)[] }
        ch.handlers[0]!({ new: { id: 'i2' } })
        await vi.waitFor(() => expect(store.current?.from_username).toBe('NEWCOMER'))
    })

    it('drops the invite from the screen before the server confirms', async () => {
        rpcReturns([invite()])
        const store = useInviteStore()
        await store.refresh()
        expect(store.current).not.toBeNull()

        // Never resolves: the toast must still clear.
        rpc.mockImplementation(() => new Promise(() => {}))
        void store.dismiss('i1')
        expect(store.current).toBeNull()
    })

    it('hides itself and opens no channel until the SQL is run', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202' } })
        const store = useInviteStore()
        await store.refresh()
        expect(store.unavailable).toBe(true)

        store.start('me')
        expect(channelFor).not.toHaveBeenCalled()
    })

    it('reads again when the tab comes back', async () => {
        const listeners: Record<string, () => void> = {}
        vi.stubGlobal('document', {
            visibilityState: 'visible',
            addEventListener: (e: string, cb: () => void) => { listeners[e] = cb },
            removeEventListener: () => { delete listeners.visibilitychange },
        })
        rpcReturns([])
        const store = useInviteStore()
        store.start('me')
        await vi.waitFor(() => expect(rpc).toHaveBeenCalled())

        // An invite inserted while the socket was down is never replayed, so
        // waking up has to re-read.
        rpc.mockClear()
        rpcReturns([invite({ from_username: 'ARRIVED WHILE ASLEEP' })])
        // Sleep long enough that the wake-up read is outside the coalescing gap.
        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date().getTime() + 60_000)
        listeners.visibilitychange!()
        await vi.waitFor(() => expect(store.current?.from_username).toBe('ARRIVED WHILE ASLEEP'))
        nowSpy.mockRestore()

        store.stop()
        expect(listeners.visibilitychange).toBeUndefined()
        vi.unstubAllGlobals()
    })

    it('tears the channel down on sign-out and keeps no invites', async () => {
        rpcReturns([invite()])
        const store = useInviteStore()
        const auth = useAuthStore()
        auth.user = { id: 'me' } as never
        await nextTick()
        await vi.waitFor(() => expect(store.current).not.toBeNull())

        auth.user = null
        await nextTick()
        expect(unsubscribe).toHaveBeenCalled()
        expect(store.invites).toHaveLength(0)
    })

    it('coalesces wake-up reads inside the gap, and reads again past it', async () => {
        const listeners: Record<string, () => void> = {}
        vi.stubGlobal('document', {
            visibilityState: 'visible',
            addEventListener: (e: string, cb: () => void) => { listeners[e] = cb },
            removeEventListener: () => { delete listeners.visibilitychange },
        })
        rpcReturns([])
        const store = useInviteStore()
        store.start('me')
        await vi.waitFor(() => expect(rpc).toHaveBeenCalled())

        // Rapid app-flips: every one used to trigger a read.
        rpc.mockClear()
        listeners.visibilitychange!()
        listeners.visibilitychange!()
        expect(rpc).not.toHaveBeenCalled()

        const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(new Date().getTime() + 60_000)
        listeners.visibilitychange!()
        await vi.waitFor(() => expect(rpc).toHaveBeenCalledWith('my_invites'))
        nowSpy.mockRestore()
        store.stop()
        vi.unstubAllGlobals()
    })

    it('sends one read when two wake-up listeners fire in the same tick', async () => {
        // The store's listener and the toast's poll both run on visibilitychange,
        // and the gap is stamped only after the session check.
        rpcReturns([])
        const store = useInviteStore()
        await Promise.all([store.refresh(), store.refresh()])
        expect(rpc.mock.calls.filter(([fn]) => fn === 'my_invites')).toHaveLength(1)
    })

    it('a row event reads immediately even inside the gap', async () => {
        rpcReturns([])
        const store = useInviteStore()
        store.start('me')
        await vi.waitFor(() => expect(rpc).toHaveBeenCalled())

        rpc.mockClear()
        rpcReturns([invite({ id: 'i9', from_username: 'INSTANT' })])
        const ch = channelFor.mock.calls[0]![0] as { handlers: ((p: unknown) => void)[] }
        ch.handlers[0]!({ new: { id: 'i9' } })
        await vi.waitFor(() => expect(store.current?.from_username).toBe('INSTANT'))
    })

    it('sends no read when the session is dead', async () => {
        getSession.mockResolvedValue({ data: { session: null }, error: { message: 'refresh_token_not_found' } })
        rpcReturns([invite()])
        const store = useInviteStore()
        useAuthStore().user = { id: 'u1' } as never
        await nextTick()
        await store.refresh({ force: true })
        expect(rpc).not.toHaveBeenCalled()
    })

    it('does not let a guard-blocked attempt consume the refresh gap', async () => {
        // The gap deduplicates reads. An attempt the guard turned back was not a
        // read, so the next one must still go out - otherwise invites stay stale
        // for another 20 s after the token has already recovered.
        const store = useInviteStore()
        getSession.mockResolvedValue({ data: { session: null }, error: { message: 'dead' } })
        await store.refresh({ force: true })
        expect(rpc).not.toHaveBeenCalled()

        getSession.mockResolvedValue({ data: { session: { access_token: 't' } }, error: null })
        rpcReturns([invite()])
        await store.refresh()
        expect(rpc).toHaveBeenCalledWith('my_invites')
    })
})
