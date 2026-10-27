/**
 * The multiplayer store is a thin client of the authoritative game server:
 * it sends intents and renders personalized snapshots. These tests drive the
 * public API through a scripted fake WebSocket and pin the adapter contract
 * the views rely on, the optimistic echo, and the rollback-on-rejection path.
 * Game RULES are not tested here — they live in shared/engine and the
 * game-server's own gate.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { PersonalView, ServerMsg } from '@protocol'
import type { Card } from '../../types/card'

vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: async () => ({ data: { session: { access_token: 'test-token' } } }),
        },
    },
}))

vi.mock('../authStore', () => ({
    useAuthStore: () => ({ username: 'TESTER', user: { id: 'me' } }),
}))

const { track } = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('../../utils/analytics', () => ({ track }))

class FakeWebSocket {
    static OPEN = 1
    static instances: FakeWebSocket[] = []
    readyState = 1
    sent: string[] = []
    onopen: (() => void) | null = null
    onmessage: ((e: { data: string }) => void) | null = null
    onerror: (() => void) | null = null
    onclose: ((e?: { code?: number; reason?: string }) => void) | null = null
    url: string
    constructor(url: string) {
        this.url = url
        FakeWebSocket.instances.push(this)
    }
    send(data: string) { this.sent.push(data) }
    close() { this.readyState = 3; this.onclose?.() }
    // test helpers
    open() { this.onopen?.() }
    receive(msg: ServerMsg) { this.onmessage?.({ data: JSON.stringify(msg) }) }
    // A failed connection: the error event never carries details; the close that follows has the code.
    fail(code: number) { this.readyState = 3; this.onerror?.(); this.onclose?.({ code }) }
    lastSent<T = unknown>(): T { return JSON.parse(this.sent[this.sent.length - 1]!) }
}

vi.stubGlobal('WebSocket', FakeWebSocket)
const fakeStorage = {
    store: {} as Record<string, string>,
    getItem(k: string) { return this.store[k] ?? null },
    setItem(k: string, v: string) { this.store[k] = v },
    removeItem(k: string) { delete this.store[k] },
}
vi.stubGlobal('localStorage', fakeStorage)

import { useMultiplayerStore } from '../multiplayerStore'

const card = (id: string, color: Card['color'], type: Card['type'], value?: number): Card => ({ id, color, type, value })
const red5 = card('c-r5', 'red', 'number', 5)
const blue3 = card('c-b3', 'blue', 'number', 3)

function playingView(overrides: Partial<PersonalView> = {}): PersonalView {
    return {
        status: 'playing',
        gameId: 'do-AB12CD-1',
        hostUserId: 'me',
        players: [
            { userId: 'me', name: 'TESTER', seat: 0, handCount: 2, isEliminated: false, connected: true, calledUno: false },
            { userId: 'opp', name: 'RIVAL', seat: 1, handCount: 7, isEliminated: false, connected: true, calledUno: false },
        ],
        you: { userId: 'me', seat: 0, hand: [red5, blue3] },
        currentPlayerId: 'me',
        turnState: 'WAITING_FOR_ACTION',
        direction: 1,
        drawStack: 0,
        currentColor: 'red',
        discardTop: card('c-top', 'red', 'number', 9),
        deckCount: 100,
        discardCount: 12,
        rouletteTargetColor: null,
        pendingDiscardAllCards: null,
        pendingDrawnWildCard: null,
        pendingDrawnCard: null,
        canChallengeDraw4: false,
        stackingMode: 'official',
        winnerId: null,
        ...overrides,
    }
}

async function joinRoom(mp: ReturnType<typeof useMultiplayerStore>) {
    const joining = mp.joinGame('AB12CD')
    // connect() awaits the auth token before opening the socket.
    for (let i = 0; i < 20 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
    const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
    ws.open()
    // skin rides the auth frame so the room can echo it in presence
    expect(JSON.parse(ws.sent[0]!)).toMatchObject({ t: 'auth', token: 'test-token', name: 'TESTER', skin: 'ember' })
    ws.receive({ t: 'hello', roomCode: 'AB12CD', userId: 'me', hostUserId: 'me' })
    ws.receive({ t: 'presence', players: [{ userId: 'me', name: 'TESTER', connected: true }] })
    // connect() resolves on the first snapshot (callers read currentGame off it).
    ws.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })
    await joining
    return ws
}

beforeEach(() => {
    setActivePinia(createPinia())
    FakeWebSocket.instances = []
    fakeStorage.store = {}
    track.mockClear()
})

describe('joining and the lobby adapter', () => {
    it('uses the chosen Couch name and sends readiness over the authoritative socket', async () => {
        const mp = useMultiplayerStore()
        const joining = mp.joinCouchGame('AB12CD', 'Rúna 🐉')
        for (let i = 0; i < 20 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
        const ws = FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
        ws.open()
        expect(ws.lastSent()).toMatchObject({ t: 'auth', name: 'Rúna 🐉', token: 'test-token' })
        ws.receive({ t: 'hello', roomCode: 'AB12CD', userId: 'me', hostUserId: 'tv', role: 'player', couch: true })
        ws.receive({ t: 'presence', players: [{ userId: 'me', name: 'Rúna 🐉', connected: true, ready: false }] })
        ws.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })
        await joining
        mp.setReady(true)
        expect(ws.lastSent()).toEqual({ t: 'ready', ready: true })
    })

    it('authenticates, exposes the waiting room from presence, and knows the host', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 1, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })

        expect(mp.roomCode).toBe('AB12CD')
        expect(mp.currentGame?.status).toBe('waiting')
        expect(mp.isHost).toBe(true)
        expect(mp.gamePlayers.map(p => p.name)).toEqual(['TESTER'])
        expect(mp.realtimeStatus).toBe('SUBSCRIBED')
    })
})

describe('the playing snapshot adapter', () => {
    it('maps the personalized view onto the legacy row shapes', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        const g = mp.currentGame!
        expect(g.status).toBe('playing')
        expect(g.current_player_id).toBe('me')
        expect(g.draw_stack).toBe(0)
        expect(g.deck.length).toBe(100)
        expect(g.discard_pile[g.discard_pile.length - 1]).toMatchObject({ id: 'c-top' })

        expect(mp.myPlayer?.hand.map(c => c.id)).toEqual(['c-r5', 'c-b3'])
        const opp = mp.opponents[0]!
        expect(opp.hand.length).toBe(7)
        // Opponent cards are placeholders — the server never sent their hand.
        expect(opp.hand.every((c: Card) => c.id.startsWith('hidden-'))).toBe(true)
        expect(mp.isMyTurn).toBe(true)
    })

    it('derives eliminatedIds from the snapshot', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        const v = playingView()
        v.players[1]!.isEliminated = true
        ws.receive({ t: 'snapshot', seq: 2, game: v })

        expect(mp.eliminatedIds.has('opp')).toBe(true)
        expect(mp.currentGame?.eliminated_user_ids).toEqual(['opp'])
    })
})

describe('optimistic play', () => {
    it('echoes the card to the pile immediately and the snapshot confirms', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        await mp.playCard(red5)

        // Local echo before any server frame:
        expect(mp.myPlayer?.hand.map(c => c.id)).toEqual(['c-b3'])
        expect(mp.currentGame?.discard_pile.pop()).toMatchObject({ id: 'c-r5' })
        expect(mp.actionInProgress).toBe(true)
        expect(ws.lastSent()).toMatchObject({ t: 'intent', action: { kind: 'PLAY_CARD', cardId: 'c-r5' } })

        // Authoritative confirmation releases the guard.
        const confirmed = playingView({ currentPlayerId: 'opp', discardTop: red5 })
        confirmed.you!.hand = [blue3]
        confirmed.players[0]!.handCount = 1
        ws.receive({ t: 'snapshot', seq: 3, game: confirmed })
        expect(mp.actionInProgress).toBe(false)
        expect(mp.isMyTurn).toBe(false)
    })

    it('rolls the render back when the server rejects the intent', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        await mp.playCard(red5)
        const intentId = ws.lastSent<{ id: string }>().id
        expect(mp.myPlayer?.hand.length).toBe(1)

        ws.receive({ t: 'error', code: 'invalid-intent', intentId })

        expect(mp.myPlayer?.hand.map(c => c.id)).toEqual(['c-r5', 'c-b3'])
        expect(mp.actionInProgress).toBe(false)
        expect(mp.error).toBe('That move is not allowed')
    })
})

describe('remote events', () => {
    it('sets lastRemotePlay for an opponent throw before the snapshot lands', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView({ currentPlayerId: 'opp' }) })

        const played = card('c-opp-play', 'red', 'skip')
        ws.receive({ t: 'event', seq: 3, ev: { t: 'CARD_PLAYED', by: 'opp', card: played } })

        // Action-before-state: the throw is known while the pile still shows the old top.
        expect(mp.lastRemotePlay).toMatchObject({ userId: 'opp', card: { id: 'c-opp-play' } })
        expect(mp.currentGame?.discard_pile.pop()).toMatchObject({ id: 'c-top' })

        ws.receive({ t: 'snapshot', seq: 3, game: playingView({ discardTop: played }) })
        expect(mp.currentGame?.discard_pile.pop()).toMatchObject({ id: 'c-opp-play' })
    })

    it('shouts eliminations into the action feed', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        ws.receive({ t: 'event', seq: 3, ev: { t: 'ELIMINATED', playerId: 'opp' } })

        expect(mp.lastAction?.text).toBe('RIVAL is ELIMINATED')
    })
})

describe('UNO catch windows', () => {
    it('tracks the catchable player from window events and sends the catch intent', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        ws.receive({ t: 'event', seq: 3, ev: { t: 'UNO_WINDOW_OPEN', playerId: 'opp' } })
        expect(mp.catchableUserId).toBe('opp')

        await mp.catchPlayer('opp')
        expect(ws.lastSent()).toMatchObject({ t: 'intent', action: { kind: 'CATCH_UNO', targetUserId: 'opp' } })

        ws.receive({ t: 'event', seq: 4, ev: { t: 'UNO_WINDOW_CLOSED', playerId: 'opp' } })
        expect(mp.catchableUserId).toBeNull()

        // Catching nobody in particular is a no-op.
        const sentBefore = ws.sent.length
        await mp.catchPlayer('opp')
        expect(ws.sent.length).toBe(sentBefore)
    })
})

describe('analytics events', () => {
    it('tracks the room and game lifecycle', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        expect(track).toHaveBeenCalledWith('mp_room_joined', { method: 'code' })

        // STARTED arms the tracker; the playing snapshot fires it with real data.
        ws.receive({ t: 'event', seq: 1, ev: { t: 'STARTED' } })
        ws.receive({ t: 'snapshot', seq: 1, game: playingView() })
        expect(track).toHaveBeenCalledWith('mp_game_started', { players: 2, rules: 'official', rematch: false })

        ws.receive({ t: 'event', seq: 2, ev: { t: 'GAME_OVER', winnerId: 'me' } })
        expect(track).toHaveBeenCalledWith('mp_game_finished', expect.objectContaining({ result: 'won', players: 2 }))

        // A rematch in the same room is marked as one.
        ws.receive({ t: 'event', seq: 3, ev: { t: 'STARTED' } })
        ws.receive({ t: 'snapshot', seq: 3, game: playingView({ gameId: 'do-AB12CD-2' }) })
        expect(track).toHaveBeenCalledWith('mp_game_started', expect.objectContaining({ rematch: true }))

        await mp.leaveGame()
        expect(track).toHaveBeenCalledWith('mp_room_left', expect.objectContaining({ phase: 'playing' }))
    })

    it('a reconnect mid-game does not refire game_started', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        track.mockClear()
        // Snapshot arrives with a game already running (refresh/reconnect) — no STARTED.
        ws.receive({ t: 'snapshot', seq: 5, game: playingView() })
        expect(track).not.toHaveBeenCalledWith('mp_game_started', expect.anything())
    })
})

describe('presence skins', () => {
    it('exposes each seat\'s reported skin from the presence frame', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'presence', players: [
            { userId: 'me', name: 'TESTER', connected: true, skin: 'ember' },
            { userId: 'opp', name: 'RIVAL', connected: true, skin: 'toxic' },
        ] })
        expect(mp.presence.find(p => p.userId === 'opp')?.skin).toBe('toxic')
    })
})

describe('couch room closure', () => {
    it('does not reconnect after the authorized TV host closes the room', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        ws.receive({ t: 'error', code: 'room-closed' })
        ws.onclose?.({ code: 1000, reason: 'room-closed' })

        expect(mp.roomCode).toBe('')
        expect(mp.currentGame).toBeNull()
        expect(mp.error).toBe('Der TV-Host hat den Raum geschlossen.')
        expect(FakeWebSocket.instances).toHaveLength(1)
    })
})

describe('join failure reasons and retry', () => {
    async function startJoin(mp: ReturnType<typeof useMultiplayerStore>) {
        const joining = mp.joinGame('DEADCD')
        for (let i = 0; i < 20 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
        return { joining, ws: FakeWebSocket.instances[FakeWebSocket.instances.length - 1]! }
    }

    async function nextSocket(n: number) {
        for (let i = 0; i < 40 && FakeWebSocket.instances.length < n; i++) await Promise.resolve()
        expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(n)
        return FakeWebSocket.instances[n - 1]!
    }

    it('reports the close code, retries once, and joins when the retry connects', async () => {
        vi.useFakeTimers()
        try {
            const mp = useMultiplayerStore()
            const { joining, ws } = await startJoin(mp)

            ws.fail(1006)
            await vi.advanceTimersByTimeAsync(0)
            await vi.advanceTimersByTimeAsync(2_000)

            const ws2 = await nextSocket(2)
            ws2.open()
            ws2.receive({ t: 'hello', roomCode: 'DEADCD', userId: 'me', hostUserId: 'me' })
            ws2.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })

            expect(await joining).not.toBeNull()
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1006', attempt: 1 , method: 'code' })
            expect(track).toHaveBeenCalledWith('mp_room_joined', { method: 'code' })
        } finally {
            vi.useRealTimers()
        }
    })

    it('gives up after a second transient failure', async () => {
        vi.useFakeTimers()
        try {
            const mp = useMultiplayerStore()
            const { joining, ws } = await startJoin(mp)

            ws.fail(1006)
            await vi.advanceTimersByTimeAsync(0)
            await vi.advanceTimersByTimeAsync(2_000)

            const ws2 = await nextSocket(2)
            ws2.fail(1011)

            expect(await joining).toBeNull()
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1006', attempt: 1 , method: 'code' })
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1011', attempt: 2 , method: 'code' })
            // A transport failure has no server message — the user still needs one.
            expect(mp.error).toBe('Could not reach the game server')
        } finally {
            vi.useRealTimers()
        }
    })

    it('does not retry when the server says the room is gone', async () => {
        const mp = useMultiplayerStore()
        const { joining, ws } = await startJoin(mp)

        ws.open()
        ws.receive({ t: 'error', code: 'room-not-found' })

        expect(await joining).toBeNull()
        expect(FakeWebSocket.instances.length).toBe(1)
        expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'Room not found', attempt: 1 , method: 'code' })
    })

    it('reports a timeout on both attempts when the socket never answers', async () => {
        vi.useFakeTimers()
        try {
            const mp = useMultiplayerStore()
            const { joining } = await startJoin(mp)

            await vi.advanceTimersByTimeAsync(10_000)
            await vi.advanceTimersByTimeAsync(2_000)
            await nextSocket(2)
            await vi.advanceTimersByTimeAsync(10_000)

            expect(await joining).toBeNull()
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'timeout', attempt: 1 , method: 'code' })
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'timeout', attempt: 2 , method: 'code' })
        } finally {
            vi.useRealTimers()
        }
    })
})

describe('join failures are tracked from every connect entry point', () => {
    // Let createRoom's fetch + connect's getSession settle so the socket appears.
    async function firstSocket() {
        for (let i = 0; i < 60 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
        return FakeWebSocket.instances[FakeWebSocket.instances.length - 1]!
    }

    async function socketNo(n: number) {
        for (let i = 0; i < 60 && FakeWebSocket.instances.length < n; i++) await Promise.resolve()
        expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(n)
        return FakeWebSocket.instances[n - 1]!
    }

    it('retries a host who cannot reach the room they just created', async () => {
        vi.useFakeTimers()
        try {
            vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ code: 'NEWRM1' }) }))
            const mp = useMultiplayerStore()
            const creating = mp.createGame('official')
            const ws = await firstSocket()
            ws.fail(1006)
            await vi.advanceTimersByTimeAsync(0)
            await vi.advanceTimersByTimeAsync(2_000)

            // The host's own room is reachable on the second try — a cold
            // Durable Object costs a reconnect, not the whole game.
            const ws2 = await socketNo(2)
            ws2.open()
            ws2.receive({ t: 'hello', roomCode: 'NEWRM1', userId: 'me', hostUserId: 'me' })
            ws2.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })

            expect(await creating).not.toBeNull()
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1006', attempt: 1, method: 'created' })
            expect(track).toHaveBeenCalledWith('mp_room_joined', { method: 'created' })
        } finally {
            vi.useRealTimers()
        }
    })

    it('gives up on a created room after the retry also fails', async () => {
        vi.useFakeTimers()
        try {
            vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ({ code: 'NEWRM2' }) }))
            const mp = useMultiplayerStore()
            const creating = mp.createGame('official')
            const ws = await firstSocket()
            ws.fail(1006)
            await vi.advanceTimersByTimeAsync(0)
            await vi.advanceTimersByTimeAsync(2_000)

            const ws2 = await socketNo(2)
            ws2.fail(1011)

            expect(await creating).toBeNull()
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1006', attempt: 1, method: 'created' })
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1011', attempt: 2, method: 'created' })
        } finally {
            vi.useRealTimers()
        }
    })

    it('retries a quick-match that hosts a public room but cannot connect', async () => {
        vi.useFakeTimers()
        try {
            vi.stubGlobal('fetch', async (url: string) =>
                String(url).includes('public-rooms')
                    ? { ok: true, json: async () => [] }
                    : { ok: true, json: async () => ({ code: 'QMRM01' }) })
            const mp = useMultiplayerStore()
            const matching = mp.quickMatch('official')
            const ws = await firstSocket()
            ws.fail(1006)
            await vi.advanceTimersByTimeAsync(0)
            await vi.advanceTimersByTimeAsync(2_000)

            const ws2 = await socketNo(2)
            ws2.fail(1011)

            expect(await matching).toBeNull()
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1006', attempt: 1, method: 'quick_match' })
            expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1011', attempt: 2, method: 'quick_match' })
        } finally {
            vi.useRealTimers()
        }
    })

    it('reports a refresh into a closed room as an expiry, not a join failure', async () => {
        fakeStorage.store['uno_mp_room'] = JSON.stringify({ code: 'DEADRM', at: Date.now() })
        const mp = useMultiplayerStore()
        const restoring = mp.restoreActiveGame()
        const ws = await firstSocket()
        ws.receive({ t: 'error', code: 'room-not-found' })

        await restoring
        // A GC'd room is the normal end of a room's life. Counting it as a join
        // failure made restore the biggest bucket in that metric and buried the
        // failures a player actually asked for.
        expect(track).toHaveBeenCalledWith('mp_restore_expired')
        expect(track).not.toHaveBeenCalledWith('mp_join_failed', expect.objectContaining({ method: 'restore' }))
        // The dead room is forgotten so the next refresh doesn't retry it.
        expect(fakeStorage.store['uno_mp_room']).toBeUndefined()
    })

    it('still reports a restore that failed on transport, not on a verdict', async () => {
        fakeStorage.store['uno_mp_room'] = JSON.stringify({ code: 'DROPRM', at: Date.now() })
        const mp = useMultiplayerStore()
        const restoring = mp.restoreActiveGame()
        const ws = await firstSocket()
        ws.fail(1006)

        await restoring
        expect(track).toHaveBeenCalledWith('mp_join_failed', { reason: 'ws_closed_1006', attempt: 1, method: 'restore' })
        expect(track).not.toHaveBeenCalledWith('mp_restore_expired')
    })
})

/**
 * A bare code with no timestamp was retried on every visit forever, so a tab
 * closed mid-game produced a "failed join" days later that no user ever saw. That
 * was 43% of all recorded join failures.
 */
describe('the stored room expires', () => {
    it('still restores a room stored moments ago', async () => {
        fakeStorage.store['uno_mp_room'] = JSON.stringify({ code: 'DEADRM', at: Date.now() - 60_000 })
        const mp = useMultiplayerStore()
        void mp.restoreActiveGame()

        // Reaching the point of opening a socket is all this needs to prove.
        for (let i = 0; i < 60 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
        expect(FakeWebSocket.instances.length).toBeGreaterThan(0)
    })

    it('ignores a room stored hours ago, without recording a failure', async () => {
        fakeStorage.store['uno_mp_room'] = JSON.stringify({
            code: 'DEADRM',
            at: Date.now() - 3 * 60 * 60 * 1000,
        })
        const mp = useMultiplayerStore()

        await mp.restoreActiveGame()

        expect(track).not.toHaveBeenCalledWith('mp_join_failed', expect.anything())
        expect(fakeStorage.store['uno_mp_room']).toBeUndefined()
    })

    it('drops an undateable entry written by an older build', async () => {
        fakeStorage.store['uno_mp_room'] = 'DEADRM'
        const mp = useMultiplayerStore()

        await mp.restoreActiveGame()

        expect(track).not.toHaveBeenCalledWith('mp_join_failed', expect.anything())
        expect(fakeStorage.store['uno_mp_room']).toBeUndefined()
    })
})

describe('elimination and spectating', () => {
    const threePlayers = () => [
        { userId: 'me', name: 'TESTER', seat: 0, handCount: 5, isEliminated: false, connected: true, calledUno: false },
        { userId: 'opp', name: 'RIVAL', seat: 1, handCount: 7, isEliminated: false, connected: true, calledUno: false },
        { userId: 'opp2', name: 'THIRD', seat: 2, handCount: 4, isEliminated: false, connected: true, calledUno: false },
    ]

    it('tracks elimination order and derives my placement', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 1, game: playingView({ players: threePlayers() }) })

        ws.receive({ t: 'event', seq: 9, ev: { t: 'ELIMINATED', playerId: 'opp2' } })
        expect(mp.myPlacement).toBeNull() // I'm still alive

        ws.receive({ t: 'event', seq: 9, ev: { t: 'ELIMINATED', playerId: 'me' } })
        expect(mp.myPlacement).toBe(2) // second knocked out of three = 2nd place
    })

    it('fires the KO trigger and spectate analytics only for my own elimination', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 1, game: playingView({ players: threePlayers() }) })

        ws.receive({ t: 'event', seq: 9, ev: { t: 'ELIMINATED', playerId: 'opp' } })
        expect(mp.selfEliminated).toBeNull()
        expect(track).not.toHaveBeenCalledWith('mp_spectate_start', expect.anything())

        ws.receive({ t: 'event', seq: 9, ev: { t: 'ELIMINATED', playerId: 'me' } })
        expect(mp.selfEliminated).not.toBeNull()
        expect(track).toHaveBeenCalledWith('mp_spectate_start', expect.objectContaining({
            players_left: expect.any(Number),
        }))
    })

    it('closes the spectate clock once at game over, and on leave', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 1, game: playingView({ players: threePlayers() }) })
        ws.receive({ t: 'event', seq: 9, ev: { t: 'ELIMINATED', playerId: 'me' } })

        ws.receive({ t: 'event', seq: 9, ev: { t: 'GAME_OVER', winnerId: 'opp' } })
        expect(track).toHaveBeenCalledWith('mp_spectate_end', expect.objectContaining({ via: 'game_over' }))

        track.mockClear()
        await mp.leaveGame()
        expect(track).not.toHaveBeenCalledWith('mp_spectate_end', expect.anything())
    })

    it('closes the spectate clock when leaving mid-spectate', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 1, game: playingView({ players: threePlayers() }) })
        ws.receive({ t: 'event', seq: 9, ev: { t: 'ELIMINATED', playerId: 'me' } })

        await mp.leaveGame()
        expect(track).toHaveBeenCalledWith('mp_spectate_end', expect.objectContaining({ via: 'leave' }))
    })

    it('a rematch clears spectator state and counts the rejoin', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 1, game: playingView({ players: threePlayers() }) })
        ws.receive({ t: 'event', seq: 9, ev: { t: 'ELIMINATED', playerId: 'me' } })
        ws.receive({ t: 'event', seq: 9, ev: { t: 'GAME_OVER', winnerId: 'opp' } })

        ws.receive({ t: 'event', seq: 9, ev: { t: 'STARTED' } })
        expect(mp.selfEliminated).toBeNull()
        expect(mp.myPlacement).toBeNull()
        expect(track).toHaveBeenCalledWith('mp_spectate_rematch_joined', expect.anything())
    })

    it('a fresh game never counts a spectate rejoin', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'event', seq: 9, ev: { t: 'STARTED' } })
        expect(track).not.toHaveBeenCalledWith('mp_spectate_rematch_joined', expect.anything())
    })
})

/**
 * The insta-defeat bug: the public-rooms pool could serve a room whose game
 * had already ended. The joiner was seated with no seat in the dead game and
 * instantly rendered someone else's game-over. These tests pin every client
 * layer of the fix; the directory filter is the server layer.
 */
describe('quick match never sits down in a finished room', () => {
    function finishedGhostView(): PersonalView {
        // A finished game between two strangers — 'me' has no seat in it.
        return playingView({
            status: 'finished',
            you: null,
            currentPlayerId: null,
            winnerId: 'opp',
            players: [
                { userId: 'opp', name: 'RIVAL', seat: 0, handCount: 0, isEliminated: false, connected: true, calledUno: false },
                { userId: 'opp2', name: 'THIRD', seat: 1, handCount: 9, isEliminated: true, connected: true, calledUno: false },
            ],
        })
    }

    async function socketAt(n: number) {
        for (let i = 0; i < 60 && FakeWebSocket.instances.length < n; i++) await Promise.resolve()
        expect(FakeWebSocket.instances.length).toBeGreaterThanOrEqual(n)
        return FakeWebSocket.instances[n - 1]!
    }

    it('skips a dead room and joins the next open one', async () => {
        vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ['DEAD01', 'OPEN02'] }))
        const mp = useMultiplayerStore()
        const matching = mp.quickMatch('official')

        // First room in the pool: game already over, I was never in it.
        const dead = await socketAt(1)
        dead.open()
        dead.receive({ t: 'hello', roomCode: 'DEAD01', userId: 'me', hostUserId: 'opp' })
        dead.receive({ t: 'snapshot', seq: 40, game: finishedGhostView() })

        // The store walks away and tries the next code.
        const open = await socketAt(2)
        open.open()
        open.receive({ t: 'hello', roomCode: 'OPEN02', userId: 'me', hostUserId: 'opp' })
        open.receive({ t: 'presence', players: [{ userId: 'me', name: 'TESTER', connected: true }] })
        open.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })

        expect(await matching).toBe('OPEN02')
        expect(dead.readyState).toBe(3)
        expect(mp.roomCode).toBe('OPEN02')
        expect(mp.currentGame?.status).toBe('waiting')
        expect(JSON.parse(localStorage.getItem('uno_mp_room')!).code).toBe('OPEN02')
    })

    it('renders the waiting room, never the game-over, for a seatless joiner', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'presence', players: [
            { userId: 'me', name: 'TESTER', connected: true },
            { userId: 'opp', name: 'RIVAL', connected: true },
        ] })
        ws.receive({ t: 'snapshot', seq: 41, game: finishedGhostView() })

        // Ghost in a finished game → treat the room as its waiting room; the
        // next deal seats everyone connected, ghost included.
        expect(mp.currentGame?.status).toBe('waiting')
        expect(mp.gamePlayers.map(p => p.name).sort()).toEqual(['RIVAL', 'TESTER'])
    })

    it('a player who actually sat in the finished game still sees its result', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 42, game: playingView({ status: 'finished', winnerId: 'opp', currentPlayerId: null }) })

        expect(mp.currentGame?.status).toBe('finished')
    })

    it('a restore that lands in a finished game it never sat in forgets the room', async () => {
        fakeStorage.store['uno_mp_room'] = JSON.stringify({ code: 'DEAD01', at: Date.now() })
        const mp = useMultiplayerStore()
        const restoring = mp.restoreActiveGame()

        const ws = await socketAt(1)
        ws.open()
        ws.receive({ t: 'hello', roomCode: 'DEAD01', userId: 'me', hostUserId: 'opp' })
        ws.receive({ t: 'snapshot', seq: 40, game: finishedGhostView() })
        await restoring

        expect(mp.currentGame).toBeNull()
        expect(mp.roomCode).toBe('')
        expect(fakeStorage.store['uno_mp_room']).toBeUndefined()
        expect(ws.readyState).toBe(3)
    })

    it('a superseded restore attempt does not wipe the room that superseded it', async () => {
        fakeStorage.store['uno_mp_room'] = JSON.stringify({ code: 'OLDRM1', at: Date.now() })
        const mp = useMultiplayerStore()
        const restoring = mp.restoreActiveGame()
        for (let i = 0; i < 60 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()

        // The user out-clicks the slow restore and joins a fresh room.
        const joining = mp.joinGame('FRESH2')
        for (let i = 0; i < 20 && FakeWebSocket.instances.length < 2; i++) await Promise.resolve()
        const fresh = FakeWebSocket.instances[1]!
        fresh.open()
        fresh.receive({ t: 'hello', roomCode: 'FRESH2', userId: 'me', hostUserId: 'me' })
        fresh.receive({ t: 'presence', players: [{ userId: 'me', name: 'TESTER', connected: true }] })
        fresh.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })
        await joining
        await restoring

        // The restore resolved as superseded: no reset, no phantom failure,
        // and the fresh room's stored code survives.
        expect(mp.roomCode).toBe('FRESH2')
        expect(mp.currentGame?.status).toBe('waiting')
        expect(JSON.parse(fakeStorage.store['uno_mp_room']!).code).toBe('FRESH2')
        expect(track).not.toHaveBeenCalledWith('mp_join_failed', expect.objectContaining({ method: 'restore' }))
    })

    it('the connect timeout on a superseded socket stands down too', async () => {
        vi.useFakeTimers()
        try {
            fakeStorage.store['uno_mp_room'] = JSON.stringify({ code: 'OLDRM1', at: Date.now() })
            const mp = useMultiplayerStore()
            const restoring = mp.restoreActiveGame()
            for (let i = 0; i < 60 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
            const stale = FakeWebSocket.instances[0]!
            // A stalled closing handshake: close() never delivers the event,
            // so the 10s connect timeout is what settles this socket.
            stale.close = () => { stale.readyState = 2 }

            const joining = mp.joinGame('FRESH2')
            for (let i = 0; i < 20 && FakeWebSocket.instances.length < 2; i++) await Promise.resolve()
            const fresh = FakeWebSocket.instances[1]!
            fresh.open()
            fresh.receive({ t: 'hello', roomCode: 'FRESH2', userId: 'me', hostUserId: 'me' })
            fresh.receive({ t: 'presence', players: [{ userId: 'me', name: 'TESTER', connected: true }] })
            fresh.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })
            await joining

            await vi.advanceTimersByTimeAsync(10_000)
            await restoring

            // The timeout resolved the restore as superseded, not failed.
            expect(mp.roomCode).toBe('FRESH2')
            expect(mp.currentGame?.status).toBe('waiting')
            expect(JSON.parse(fakeStorage.store['uno_mp_room']!).code).toBe('FRESH2')
            expect(track).not.toHaveBeenCalledWith('mp_join_failed', expect.objectContaining({ method: 'restore' }))
        } finally {
            vi.useRealTimers()
        }
    })

    it('a rejected candidate does not leave its error over the room we join', async () => {
        vi.stubGlobal('fetch', async () => ({ ok: true, json: async () => ['FULLRM', 'GOODRM'] }))
        const mp = useMultiplayerStore()
        const matching = mp.quickMatch('official')

        const full = await socketAt(1)
        full.open()
        full.receive({ t: 'error', code: 'room-full' })

        const good = await socketAt(2)
        good.open()
        good.receive({ t: 'hello', roomCode: 'GOODRM', userId: 'me', hostUserId: 'opp' })
        good.receive({ t: 'presence', players: [{ userId: 'me', name: 'TESTER', connected: true }] })
        good.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })

        expect(await matching).toBe('GOODRM')
        // Sitting in a healthy lobby under "Game is full" is a lie.
        expect(mp.error).toBeNull()
    })

    it('frames from a superseded socket cannot poison the new room', async () => {
        const mp = useMultiplayerStore()
        const stale = await joinRoom(mp)

        // A second join supersedes the first socket entirely.
        const joining = mp.joinGame('FRESH2')
        for (let i = 0; i < 20 && FakeWebSocket.instances.length < 2; i++) await Promise.resolve()
        const fresh = FakeWebSocket.instances[1]!
        fresh.open()
        fresh.receive({ t: 'hello', roomCode: 'FRESH2', userId: 'me', hostUserId: 'me' })
        fresh.receive({ t: 'presence', players: [{ userId: 'me', name: 'TESTER', connected: true }] })
        fresh.receive({ t: 'snapshot', seq: 0, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })
        await joining

        expect(stale.readyState).toBe(3)

        // The old room's high-seq finished snapshot arrives late — it must
        // neither replace the view nor outrank the new room's low seq.
        stale.receive({ t: 'snapshot', seq: 99, game: playingView({ status: 'finished', winnerId: 'opp' }) })
        expect(mp.roomCode).toBe('FRESH2')
        expect(mp.currentGame?.status).toBe('waiting')

        fresh.receive({ t: 'snapshot', seq: 1, game: playingView({ status: 'lobby', you: null, currentPlayerId: null, players: [] }) })
        expect(mp.currentGame?.status).toBe('waiting')
    })
})

describe('lobby auto-start countdown', () => {
    const seats = [
        { userId: 'me', name: 'TESTER', connected: true },
        { userId: 'opp', name: 'RIVAL', connected: true },
    ]

    it('mirrors the countdown carried on presence frames', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)

        ws.receive({ t: 'presence', players: seats, autoStartInMs: 60_000, autoStartBumpsLeft: 1 })
        expect(mp.autoStart?.paused).toBe(false)
        // Sent as a duration; the store anchors it to its own clock.
        expect(mp.autoStart!.deadline).toBeGreaterThan(Date.now() + 59_000)

        ws.receive({ t: 'presence', players: seats.slice(0, 1), autoStartInMs: 12_000, autoStartPaused: true })
        expect(mp.autoStart?.paused).toBe(true)

        // A frame with no countdown clears it (old worker, private room).
        ws.receive({ t: 'presence', players: seats })
        expect(mp.autoStart).toBeNull()
    })

    it('clears the countdown when the deal happens', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'presence', players: seats, autoStartInMs: 10_000 })

        ws.receive({ t: 'event', seq: 1, ev: { t: 'STARTED' } })
        expect(mp.autoStart).toBeNull()
    })

    it('asks for more time only while the room still has an extension', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)

        ws.receive({ t: 'presence', players: seats, autoStartInMs: 60_000, autoStartBumpsLeft: 1 })
        mp.extendAutoStart()
        expect(ws.lastSent()).toEqual({ t: 'extend-start' })

        // The button goes as the press lands, not when the next frame does:
        // the allowance is the room's, so a second press could only be
        // refused, and the server refuses it without a word.
        expect(mp.autoStart?.bumpsLeft).toBe(0)
        const sentBefore = ws.sent.length
        mp.extendAutoStart()
        expect(ws.sent.length).toBe(sentBefore)

        // The server's own count agrees on the next frame.
        ws.receive({ t: 'presence', players: seats, autoStartInMs: 118_000, autoStartBumpsLeft: 0 })
        expect(mp.autoStart?.bumpsLeft).toBe(0)
    })

    it('sends an invite on the room socket and waits for the room to answer', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)

        const pending = mp.sendInvite('friend-1')
        expect(ws.lastSent()).toEqual({ t: 'invite', userId: 'friend-1' })

        // The verdict is the room's, not a guess: it knows the block list,
        // the cooldown and whether this socket is even seated here.
        ws.receive({ t: 'invite-result', userId: 'friend-1', result: 'too_soon' })
        expect(await pending).toBe('too_soon')
    })

    it('answers unavailable rather than hanging when there is no room socket', async () => {
        const mp = useMultiplayerStore()
        expect(await mp.sendInvite('friend-1')).toBe('unavailable')
    })

    it('ignores a verdict meant for a different player', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)

        const pending = mp.sendInvite('friend-1')
        ws.receive({ t: 'invite-result', userId: 'someone-else', result: 'sent' })
        ws.receive({ t: 'invite-result', userId: 'friend-1', result: 'sent' })
        expect(await pending).toBe('sent')
    })

    it('reads an old worker frame as no extension on offer', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)

        ws.receive({ t: 'presence', players: seats, autoStartInMs: 30_000 })
        expect(mp.autoStart?.bumpsLeft).toBe(0)
    })
})

describe('quick chat', () => {
    it('logs a relayed phrase with the sender name resolved', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        ws.receive({ t: 'chat', userId: 'opp', phraseId: 'mercy' })

        expect(mp.lastChat).toMatchObject({ userId: 'opp', name: 'RIVAL', text: 'Riot!' })
        expect(mp.chatLog).toHaveLength(1)
    })

    it('drops messages from muted players', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })

        mp.toggleChatMute('opp')
        ws.receive({ t: 'chat', userId: 'opp', phraseId: 'hurry' })
        expect(mp.lastChat).toBeNull()
        expect(mp.chatLog).toHaveLength(0)

        // Unmute lets them speak again.
        mp.toggleChatMute('opp')
        ws.receive({ t: 'chat', userId: 'opp', phraseId: 'hurry' })
        expect(mp.lastChat?.text).toBe('Hurry up!')
    })

    it('ignores ids outside the catalog', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'chat', userId: 'opp', phraseId: 'not-a-phrase' })
        expect(mp.lastChat).toBeNull()
    })

    it('sends the phrase id over the socket', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        mp.sendChat('gg')
        expect(ws.lastSent()).toEqual({ t: 'chat', phraseId: 'gg' })
    })

    it('leaving clears the log and mutes', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'chat', userId: 'me', phraseId: 'hi' })
        mp.toggleChatMute('opp')
        await mp.leaveGame()
        expect(mp.chatLog).toHaveLength(0)
        expect(mp.lastChat).toBeNull()
        expect(mp.mutedChatIds.size).toBe(0)
    })
})

describe('leaving', () => {
    it('clears state and the stored room', async () => {
        const mp = useMultiplayerStore()
        const ws = await joinRoom(mp)
        ws.receive({ t: 'snapshot', seq: 2, game: playingView() })
        expect(JSON.parse(localStorage.getItem('uno_mp_room')!).code).toBe('AB12CD')

        await mp.leaveGame()

        expect(mp.currentGame).toBeNull()
        expect(mp.roomCode).toBe('')
        expect(localStorage.getItem('uno_mp_room')).toBeNull()
        expect(ws.sent.some(s => JSON.parse(s).t === 'leave')).toBe(true)
    })
})
