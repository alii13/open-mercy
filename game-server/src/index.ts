/// <reference types="@cloudflare/workers-types" />

import { verifySupabaseToken, type AuthEnv } from './auth'
import type { ClientMsg, GameEvent, PresencePlayer, ServerMsg } from './protocol'
import { applyIntent, applyUnoCatch, autoResolveAbsentTurn, forceEliminate, persistResults, personalView, startGame, updateStats, viewEventFor, type GameRecord } from './game'
import { dirCodes, liveTables, normalizeDir, type DirEntry } from './directory'
import { addParticipant, createMeeting, deactivateMeeting, voiceConfigured, type VoiceEnv } from './voice'
import { gcWindowMs, shouldPushGc } from './roomGc'
import { ROOM_CODE_ALPHABET, isRoomCode, normalizeRoomCode } from '../../shared/roomCode'
import { canSeat, MAX_PLAYERS } from './seats'
import { autoStartTick, autoStartBump, autoStartBumpsLeft, AUTO_START_MIN_PLAYERS, type AutoStartState } from './autoStart'
import { chatAllowed } from './chatLimit'
import { sendRoomInvite } from './invites'
import { quickChatPhrase } from '../../shared/quickChat'
import type { StackingMode } from '../../shared/engine'

interface Env extends AuthEnv, VoiceEnv {
    ROOM: DurableObjectNamespace
    /** Optional wrangler secret; enables server-side game_results persistence. */
    SUPABASE_SERVICE_KEY?: string
}

const CONTINENT_HINTS: Record<string, string> = {
    AS: 'apac',
    OC: 'oc',
    EU: 'weur',
    NA: 'enam',
    SA: 'sam',
    AF: 'afr',
}

// Placement lottery (phase 0 finding: auto-placement lands a continent away
// ~60% of the time even with a location hint). Each room code maps to
// CANDIDATES sibling objects; at creation the worker — which runs at the
// creator's edge colo — times a probe to each and activates the closest.
// Joins ask all candidates in parallel who is active.
const CANDIDATES = 3

// A disconnected player holding the turn gets this long to come back before
// the room resolves the turn for them (the server-side watchdog).
const TURN_GRACE_MS = 20 * 1000

// How long a player who hit 1 card without calling UNO stays catchable.
const CATCH_WINDOW_MS = 8 * 1000

// The alphabet is shared with the client (../../shared/roomCode). It lived in two
// places with different rules, which is what let a code containing 0 or 1 pass the
// client and then miss this worker's route.
function generateRoomCode(): string {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    let code = ''
    for (const b of bytes) code += ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]
    return code
}

function candidateStub(env: Env, code: string, i: number, hint?: string): DurableObjectStub {
    const id = env.ROOM.idFromName(`${code}#${i}`)
    return env.ROOM.get(id, hint ? { locationHint: hint as DurableObjectLocationHint } : undefined)
}

// Singleton directory of open public rooms (quick match). Reuses the room DO
// class under a reserved name that can't collide with share codes.
function directoryStub(env: Env): DurableObjectStub {
    return env.ROOM.get(env.ROOM.idFromName('!directory'))
}

/** Find which lottery candidate holds the active room, if any. */
async function locateRoom(env: Env, code: string): Promise<DurableObjectStub | null> {
    const probes = Array.from({ length: CANDIDATES }, async (_, i) => {
        const stub = candidateStub(env, code, i)
        const res = await stub.fetch('https://do/is-active')
        if (!(await res.json<boolean>())) throw new Error('inactive')
        return stub
    })
    return Promise.any(probes).catch(() => null)
}

// Browser origins allowed to call the HTTP endpoints (WebSockets don't
// preflight). Allowlist, not '*': the game's domains plus local dev.
function corsOrigin(req: Request): string | null {
    const origin = req.headers.get('Origin')
    if (!origin) return null
    if (origin === 'https://uno-no-mercy.com' || origin === 'https://www.uno-no-mercy.com') return origin
    if (origin === 'https://open-mercy.com' || origin === 'https://www.open-mercy.com') return origin
    if (origin === 'https://uno-no-mercy.pages.dev') return origin
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin
    if (/^https:\/\/[a-z0-9-]+\.uno-no-mercy\.pages\.dev$/.test(origin)) return origin
    return null
}

/** Accept the socket just long enough to say the room is gone, then close. */
function roomGoneSocket(): Response {
    const pair = new WebSocketPair()
    const server = pair[1]
    server.accept()
    server.send(JSON.stringify({ t: 'error', code: 'room-not-found' }))
    server.close(1011, 'room gone')
    return new Response(null, { status: 101, webSocket: pair[0] })
}

function withCors(res: Response, req: Request): Response {
    const origin = corsOrigin(req)
    if (!origin) return res
    const out = new Response(res.body, res)
    out.headers.set('Access-Control-Allow-Origin', origin)
    out.headers.set('Vary', 'Origin')
    return out
}

export default {
    async fetch(req: Request, env: Env): Promise<Response> {
        const url = new URL(req.url)
        const hint = CONTINENT_HINTS[(req.cf?.continent as string) ?? '']

        if (req.method === 'OPTIONS') {
            const origin = corsOrigin(req)
            if (!origin) return new Response(null, { status: 403 })
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': origin,
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
                    'Access-Control-Max-Age': '86400',
                    'Vary': 'Origin',
                },
            })
        }

        // Create a room: run the placement lottery and activate the winner.
        // Creation is authenticated — the creator becomes the room host.
        if (req.method === 'POST' && url.pathname === '/rooms') {
            const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
            const creator = await verifySupabaseToken(token, env)
            if (!creator) return withCors(new Response('unauthorized', { status: 401 }), req)
            const opts = await req.json<{ public?: boolean; stackingMode?: string }>().catch(() => ({} as { public?: boolean; stackingMode?: string }))
            const code = generateRoomCode()
            const timings = await Promise.all(
                Array.from({ length: CANDIDATES }, async (_, i) => {
                    const stub = candidateStub(env, code, i, hint)
                    // First probe pays cold creation; the second measures the
                    // settled worker→DO path.
                    await stub.fetch('https://do/probe')
                    const t1 = Date.now()
                    await stub.fetch('https://do/probe')
                    return { i, ms: Date.now() - t1 }
                })
            )
            timings.sort((a, b) => a.ms - b.ms)
            const winner = timings[0]!
            await candidateStub(env, code, winner.i).fetch('https://do/activate', {
                method: 'POST',
                body: JSON.stringify({ code, hostUserId: creator.userId, stackingMode: opts.stackingMode ?? 'official', isPublic: !!opts.public }),
            })
            if (opts.public) {
                await directoryStub(env).fetch('https://do/dir-register', { method: 'POST', body: JSON.stringify({ code }) })
            }
            return withCors(Response.json({ code, placementMs: winner.ms }), req)
        }

        if (url.pathname === '/health') {
            console.log('health check, secret bound:', !!env.SUPABASE_SERVICE_KEY)
            return withCors(Response.json({ ok: true, resultsPersistence: !!env.SUPABASE_SERVICE_KEY, voice: voiceConfigured(env) }), req)
        }

        // Open public rooms for quick match. Stays a bare array of codes:
        // deployed clients consume this shape, and the Worker ships ahead of
        // the frontend.
        if (url.pathname === '/public-rooms') {
            const res = await directoryStub(env).fetch('https://do/dir-list')
            return withCors(Response.json(await res.json()), req)
        }

        // Same directory, enough detail to render a table without a round trip
        // per room. Carries no player names by design — see directory.ts.
        if (url.pathname === '/live-tables') {
            const res = await directoryStub(env).fetch('https://do/dir-tables')
            return withCors(Response.json(await res.json()), req)
        }

        // Join a room over WebSocket: /room/CODE/ws
        // Deliberately loose: match any code shape here and judge it below. The
        // pattern used to be [A-Za-z2-9]+, so a code containing 0 or 1 missed the
        // route entirely and fell through to the router's bare 404 — which is the
        // very thing the comment below warns about. That accounted for one in
        // eight hand-typed joins, reported only as an anonymous ws_closed_1006.
        const roomWs = url.pathname.match(/^\/room\/([^/]{1,32})\/ws$/)
        if (roomWs) {
            if (req.headers.get('Upgrade') !== 'websocket') {
                return new Response('expected websocket', { status: 426 })
            }
            // A 404 on the upgrade reaches the client as an anonymous 1006 —
            // indistinguishable from a network drop. Accept the socket and
            // deliver the verdict in-protocol so dead links are diagnosable.
            const code = normalizeRoomCode(roomWs[1]!)
            if (!isRoomCode(code)) return roomGoneSocket()
            const stub = await locateRoom(env, code)
            if (!stub) return roomGoneSocket()
            return stub.fetch('https://do/room-ws', req)
        }

        // Phase 0 diagnostics: echo WS + latency page.
        if (url.pathname === '/ws') {
            if (req.headers.get('Upgrade') !== 'websocket') {
                return new Response('expected websocket', { status: 426 })
            }
            const room = url.searchParams.get('room') ?? 'phase0'
            const id = env.ROOM.idFromName(room)
            return env.ROOM.get(id, hint ? { locationHint: hint as DurableObjectLocationHint } : undefined)
                .fetch('https://do/echo-ws', req)
        }

        const colo = (req.cf?.colo as string) ?? 'unknown'
        return new Response(PAGE.replace('{{COLO}}', colo), {
            headers: { 'content-type': 'text/html; charset=utf-8' },
        })
    },
}

interface RoomRecord {
    code: string
    createdAt: number
    hostUserId: string
    stackingMode: string
    isPublic: boolean
    /** RealtimeKit meeting backing this room's voice channel; created lazily. */
    voiceMeetingId?: string
}

interface RosterEntry {
    name: string
    joinedAt: number
    /** Equipped card-back skin id — cosmetic, client-reported at auth. */
    skin?: string
}

// One DO alarm serves four clocks; the earliest due time is armed.
interface RoomTimers {
    gcAt: number
    graceAt?: number
    graceSeat?: string
    catchAt?: number
    catchFor?: string
    // Auto-start for public lobbies (see autoStart.ts for the transitions).
    startAt?: number
    startLeftMs?: number
    // User ids counted into the clock. Rooms that armed a clock under the
    // build that stored a count hold a number here - readers must tolerate it.
    startSeen?: string[] | number
    /** Extensions the room has already bought. */
    startBumps?: number
}

type SocketTag = { echo: true } | { userId: string } | null

export class GameRoomDO {
    // In-memory game cache; undefined = not loaded from storage yet (fresh
    // wake), null = loaded and no game. Engine transitions are synchronous,
    // and storage ops are input-gated, so intents never interleave mid-move.
    private game: GameRecord | null | undefined
    private seq = 0
    // Cached room visibility so the GC clock picks its window without a storage
    // read per activity; hydrated at activate and lazily on a fresh wake.
    private roomIsPublic: boolean | undefined
    // Per-user quick-chat timestamps. In-memory: hibernation clears it, which
    // is acceptable for a best-effort spam guard.
    private chatTimes = new Map<string, number[]>()

    constructor(private ctx: DurableObjectState, private env: Env) {}

    private async loadGame(): Promise<GameRecord | null> {
        if (this.game === undefined) {
            const stored = await this.ctx.storage.get<{ game: GameRecord; seq: number }>('game')
            this.game = stored?.game ?? null
            this.seq = stored?.seq ?? 0
        }
        return this.game
    }

    private async saveGame(): Promise<void> {
        if (this.game) await this.ctx.storage.put('game', { game: this.game, seq: this.seq })
    }

    private roomStatus(): 'lobby' | 'playing' | 'finished' {
        if (!this.game) return 'lobby'
        return this.game.engine.gameState === 'GAME_OVER' ? 'finished' : 'playing'
    }

    // --- Timer multiplexing (GC, turn grace, catch window) ---

    private async getTimers(): Promise<RoomTimers> {
        return (await this.ctx.storage.get<RoomTimers>('timers')) ?? { gcAt: 0 }
    }

    private async putTimers(t: RoomTimers): Promise<void> {
        await this.ctx.storage.put('timers', t)
        const due = [t.gcAt, t.graceAt, t.catchAt, t.startAt].filter((x): x is number => !!x)
        if (due.length) await this.ctx.storage.setAlarm(Math.min(...due))
    }

    /** Public rooms back quick-match and must clear fast; private (invite-link)
     *  rooms linger so a shared link survives a join-later gap. Cached so this
     *  stays at most one storage read per DO wake. */
    private async isRoomPublic(): Promise<boolean> {
        if (this.roomIsPublic === undefined) {
            const room = await this.ctx.storage.get<RoomRecord>('room')
            this.roomIsPublic = !!room?.isPublic
        }
        return this.roomIsPublic
    }

    /**
     * Any room activity pushes garbage collection out, but not more than once
     * a minute. This runs on every move, and the write it skips is the biggest
     * single source of storage rows in the room.
     */
    private async touchGc(): Promise<void> {
        const t = await this.getTimers()
        const next = Date.now() + gcWindowMs(await this.isRoomPublic())
        if (!shouldPushGc(t.gcAt, next)) return
        t.gcAt = next
        await this.putTimers(t)
    }

    /** Arm (or cancel) the grace clock for a disconnected current player. */
    private async armTurnGrace(exclude?: WebSocket): Promise<void> {
        await this.loadGame()
        const t = await this.getTimers()
        const s = this.game?.engine
        const current = s && s.gameState === 'PLAYING' ? s.players[s.currentPlayerIndex] : null
        const connected = new Set(this.roomSockets(exclude).map(x => x.userId))
        if (current && !current.isEliminated && !connected.has(current.id)) {
            if (t.graceSeat !== current.id || !t.graceAt) {
                t.graceAt = Date.now() + TURN_GRACE_MS
                t.graceSeat = current.id
                await this.putTimers(t)
            }
        } else if (t.graceAt) {
            delete t.graceAt
            delete t.graceSeat
            await this.putTimers(t)
        }
    }

    /** Open/close UNO catch windows based on this batch's events. */
    private async processCatchWindows(events: GameEvent[]): Promise<void> {
        const t = await this.getTimers()
        let dirty = false
        for (const ev of [...events]) {
            if (ev.t === 'AT_ONE') {
                t.catchAt = Date.now() + CATCH_WINDOW_MS
                t.catchFor = ev.playerId
                dirty = true
                events.push({ t: 'UNO_WINDOW_OPEN', playerId: ev.playerId })
            }
            const closes = (ev.t === 'UNO_CALLED' || ev.t === 'ELIMINATED') && ev.playerId === t.catchFor
            if ((closes || ev.t === 'GAME_OVER') && t.catchFor) {
                const who = t.catchFor
                delete t.catchAt
                delete t.catchFor
                dirty = true
                events.push({ t: 'UNO_WINDOW_CLOSED', playerId: who })
            }
        }
        if (dirty) await this.putTimers(t)
    }

    private async rosterList(): Promise<{ userId: string; name: string; joinedAt: number }[]> {
        const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
        return Object.entries(roster)
            .map(([userId, e]) => ({ userId, name: e.name, joinedAt: e.joinedAt }))
            .sort((a, b) => a.joinedAt - b.joinedAt)
    }

    private viewFor(userId: string, roster: { userId: string; name: string }[], roomRec: RoomRecord | undefined) {
        const connected = new Set(this.roomSockets().map(s => s.userId))
        // Same id scheme as game_results rows — distinct per dealt game.
        const gameId = this.game && roomRec ? `do-${roomRec.code}-${this.game.startedAt}` : null
        const view = personalView(this.game ?? null, this.roomStatus(), userId, roster, connected, roomRec?.hostUserId ?? null, gameId)
        if (!this.game && roomRec) view.stackingMode = roomRec.stackingMode as StackingMode
        return view
    }

    private async snapshotFor(userId: string): Promise<ServerMsg> {
        const roster = await this.rosterList()
        const roomRec = await this.ctx.storage.get<RoomRecord>('room')
        return { t: 'snapshot', seq: this.seq, game: this.viewFor(userId, roster, roomRec) }
    }

    /** Send an intent's events (personalized) + a fresh snapshot to every seated socket. */
    private async broadcastGame(events: GameEvent[], intentId?: string): Promise<void> {
        this.seq++
        await this.processCatchWindows(events)
        if (this.game) updateStats(this.game, events)
        const roster = await this.rosterList()
        const roomRec = await this.ctx.storage.get<RoomRecord>('room')
        for (const { ws, userId } of this.roomSockets()) {
            for (const ev of events) {
                this.send(ws, { t: 'event', seq: this.seq, ev: viewEventFor(ev, userId), intentId })
            }
            this.send(ws, { t: 'snapshot', seq: this.seq, game: this.viewFor(userId, roster, roomRec) })
        }
        if (this.game && roomRec && events.some(e => e.t === 'GAME_OVER')) {
            await persistResults(this.game, roomRec.code, this.env)
            // The room just left the joinable pool. Tell the directory now —
            // waiting for the next presence change would leave a window where
            // a finished room (inProgress: false) re-enters quick match.
            if (roomRec.isPublic) {
                await this.refreshDirectory(await this.ctx.storage.get<Record<string, RosterEntry>>('roster') ?? {})
            }
        }
        await this.saveGame()
        await this.armTurnGrace()
        await this.touchGc()
    }

    async fetch(req: Request): Promise<Response> {
        const url = new URL(req.url)

        switch (url.pathname) {
            case '/probe':
                return new Response('ok')

            case '/is-active':
                return Response.json(!!(await this.ctx.storage.get('room')))

            case '/activate': {
                const body = await req.json<{ code: string; hostUserId: string; stackingMode?: string; isPublic?: boolean }>()
                const room: RoomRecord = {
                    code: body.code, createdAt: Date.now(), hostUserId: body.hostUserId,
                    stackingMode: body.stackingMode ?? 'official', isPublic: !!body.isPublic,
                }
                await this.ctx.storage.put('room', room)
                this.roomIsPublic = !!body.isPublic
                await this.touchGc()
                return new Response('ok')
            }

            // --- Public-rooms directory (this DO under the reserved '!directory' name) ---
            case '/dir-register': {
                const body = await req.json<{ code: string; snapshot?: Partial<DirEntry> }>()
                const dir = normalizeDir(await this.ctx.storage.get('dir'))
                const prev = dir[body.code]
                dir[body.code] = {
                    // Keep the original registration time: it is the ordering
                    // key for quick match, and a re-register on every roster
                    // change would otherwise send a room to the back forever.
                    at: prev?.at ?? Date.now(),
                    updatedAt: Date.now(),
                    ...body.snapshot,
                }
                await this.ctx.storage.put('dir', dir)
                return new Response('ok')
            }
            case '/dir-unregister': {
                const { code } = await req.json<{ code: string }>()
                const dir = normalizeDir(await this.ctx.storage.get('dir'))
                delete dir[code]
                await this.ctx.storage.put('dir', dir)
                return new Response('ok')
            }
            case '/dir-list': {
                return Response.json(dirCodes(await this.ctx.storage.get('dir')))
            }
            case '/dir-tables': {
                return Response.json(liveTables(await this.ctx.storage.get('dir'), Date.now()))
            }

            case '/room-ws': {
                if (!(await this.ctx.storage.get('room'))) {
                    // Same in-protocol verdict as the router: a 404 upgrade
                    // rejection reaches the client as an anonymous 1006.
                    return roomGoneSocket()
                }
                const pair = new WebSocketPair()
                this.ctx.acceptWebSocket(pair[1])
                return new Response(null, { status: 101, webSocket: pair[0] })
            }

            // Echo mode for the latency diagnostics page.
            case '/echo-ws': {
                const pair = new WebSocketPair()
                this.ctx.acceptWebSocket(pair[1])
                pair[1].serializeAttachment({ echo: true })
                return new Response(null, { status: 101, webSocket: pair[0] })
            }

            default:
                return new Response('not found', { status: 404 })
        }
    }

    async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string) {
        const tag = ws.deserializeAttachment() as SocketTag

        if (tag && 'echo' in tag) {
            ws.send(raw)
            return
        }

        let msg: ClientMsg
        try {
            msg = JSON.parse(typeof raw === 'string' ? raw : new TextDecoder().decode(raw))
        } catch {
            this.send(ws, { t: 'error', code: 'bad-message' })
            return
        }

        // First frame must authenticate the socket.
        if (!tag) {
            if (msg.t !== 'auth') {
                this.send(ws, { t: 'error', code: 'unauthorized' })
                ws.close(1008, 'auth required')
                return
            }
            const verified = await verifySupabaseToken(msg.token, this.env)
            if (!verified) {
                this.send(ws, { t: 'error', code: 'unauthorized' })
                ws.close(1008, 'invalid token')
                return
            }
            const room = await this.ctx.storage.get<RoomRecord>('room')
            if (!room) {
                this.send(ws, { t: 'error', code: 'room-not-found' })
                ws.close(1011, 'room gone')
                return
            }
            const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
            if (!canSeat(roster, verified.userId)) {
                this.send(ws, { t: 'error', code: 'room-full' })
                ws.close(1008, 'room full')
                return
            }
            const entry = roster[verified.userId]
            if (entry) {
                entry.name = msg.name || entry.name
                entry.skin = msg.skin || entry.skin
            } else {
                roster[verified.userId] = { name: msg.name || 'PLAYER', joinedAt: Date.now(), skin: msg.skin }
            }
            await this.ctx.storage.put('roster', roster)
            ws.serializeAttachment({ userId: verified.userId })
            // Activity resets the GC clock.
            await this.touchGc()

            this.send(ws, { t: 'hello', roomCode: room.code, userId: verified.userId, hostUserId: room.hostUserId })
            await this.broadcastPresence(roster)
            // Catch the joiner up — lobby state or a running game.
            await this.loadGame()
            this.send(ws, await this.snapshotFor(verified.userId))
            // A reconnecting current player cancels their grace clock.
            await this.armTurnGrace()
            return
        }

        switch (msg.t) {
            case 'ping':
                this.send(ws, { t: 'pong', now: msg.now })
                return

            case 'leave': {
                // Leaving the lobby removes the seat; leaving a running game
                // keeps the roster entry so the player can reconnect.
                await this.loadGame()
                if (!this.game) {
                    const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
                    delete roster[tag.userId]
                    await this.ctx.storage.put('roster', roster)
                }
                ws.close(1000, 'left')
                return
            }

            case 'rename': {
                const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
                const entry = roster[tag.userId]
                if (entry && msg.name) {
                    entry.name = msg.name
                    await this.ctx.storage.put('roster', roster)
                    await this.loadGame()
                    const seated = this.game?.engine.players.find(p => p.id === tag.userId)
                    if (seated) seated.name = msg.name
                    await this.saveGame()
                }
                await this.broadcastPresence(roster)
                return
            }

            case 'voice-join': {
                // Voice rides the authed game socket: only seated roster
                // members can mint a RealtimeKit token. Never blocks the game.
                const room = await this.ctx.storage.get<RoomRecord>('room')
                if (!room || !voiceConfigured(this.env)) {
                    this.send(ws, { t: 'error', code: 'voice-unavailable' })
                    return
                }
                try {
                    let meetingId = room.voiceMeetingId
                    if (!meetingId) {
                        meetingId = await createMeeting(this.env, `uno-${room.code}`)
                        // Two simultaneous joiners can race the creation —
                        // whoever persisted first wins, the loser's meeting
                        // is abandoned (free).
                        const latest = await this.ctx.storage.get<RoomRecord>('room')
                        if (latest?.voiceMeetingId) {
                            meetingId = latest.voiceMeetingId
                        } else if (latest) {
                            latest.voiceMeetingId = meetingId
                            await this.ctx.storage.put('room', latest)
                        }
                    }
                    const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
                    const name = roster[tag.userId]?.name ?? 'PLAYER'
                    // The room host gets the moderation preset (mute others).
                    const token = await addParticipant(this.env, meetingId, {
                        name, customParticipantId: tag.userId, isHost: tag.userId === room.hostUserId,
                    })
                    this.send(ws, { t: 'voice-token', token, meetingId })
                    await this.touchGc()
                } catch (err) {
                    console.error('voice-join failed:', err)
                    this.send(ws, { t: 'error', code: 'voice-unavailable' })
                }
                return
            }

            case 'badge-up': {
                // A cosmetic "so-and-so reached a new badge" — relay to everyone
                // else at the table. No game state, no persistence.
                const tier = Number(msg.tier)
                if (!Number.isFinite(tier) || tier < 1 || tier > 10) return
                for (const s of this.roomSockets()) {
                    if (s.userId !== tag.userId) this.send(s.ws, { t: 'badge-up', userId: tag.userId, tier })
                }
                return
            }

            case 'chat': {
                // Id-only quick chat: relay nothing outside the shared
                // catalog, and echo to everyone including the sender so one
                // frame drives every client's bubbles.
                const phrase = quickChatPhrase(String(msg.phraseId))
                if (!phrase) {
                    this.send(ws, { t: 'error', code: 'bad-message' })
                    return
                }
                const times = this.chatTimes.get(tag.userId) ?? []
                // Over the limit: drop silently — an error per spam tap is
                // itself spam.
                if (!chatAllowed(times, Date.now())) return
                this.chatTimes.set(tag.userId, times)
                for (const s of this.roomSockets()) {
                    // Relay the canonical id, never the raw payload — a value
                    // that merely stringifies to a valid id must not ride to
                    // every socket in the room.
                    this.send(s.ws, { t: 'chat', userId: tag.userId, phraseId: phrase.id })
                }
                return
            }

            case 'kick': {
                const roomRec = await this.ctx.storage.get<RoomRecord>('room')
                if (roomRec?.hostUserId !== tag.userId || msg.userId === tag.userId) {
                    this.send(ws, { t: 'error', code: 'not-host' })
                    return
                }
                const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
                delete roster[msg.userId]
                await this.ctx.storage.put('roster', roster)
                for (const s of this.roomSockets()) {
                    if (s.userId === msg.userId) s.ws.close(1008, 'kicked')
                }
                await this.broadcastPresence(roster)
                // Mid-game, a kick is a forced elimination — the seat can't return.
                await this.loadGame()
                if (this.game && this.roomStatus() === 'playing') {
                    const events = forceEliminate(this.game, msg.userId)
                    if (events) await this.broadcastGame(events)
                }
                return
            }

            case 'start': {
                await this.loadGame()
                if (this.game && this.roomStatus() === 'playing') {
                    this.send(ws, { t: 'error', code: 'already-started' })
                    return
                }
                const roomRec = await this.ctx.storage.get<RoomRecord>('room')
                if (roomRec?.hostUserId !== tag.userId) {
                    this.send(ws, { t: 'error', code: 'not-host' })
                    return
                }
                const roster = await this.rosterList()
                const connected = new Set(this.roomSockets().map(s => s.userId))
                const seated = roster.filter(r => connected.has(r.userId))
                if (seated.length < 2) {
                    this.send(ws, { t: 'error', code: 'need-players' })
                    return
                }
                const { game, events } = startGame(seated, msg.stackingMode ?? (roomRec.stackingMode as StackingMode) ?? 'official')
                this.game = game
                {
                    // A manual start beats the countdown to the punch —
                    // disarm it so the alarm doesn't fire into a running game.
                    const t = await this.getTimers()
                    if (t.startAt !== undefined || t.startLeftMs !== undefined) {
                        delete t.startAt
                        delete t.startLeftMs
                        delete t.startSeen
                        delete t.startBumps
                        await this.putTimers(t)
                    }
                }
                if (roomRec.isPublic) {
                    // A started room stays in the directory but flips to
                    // inProgress: the landing strip wants to show a live game,
                    // and dirCodes() is what keeps quick match from joining it.
                    await this.refreshDirectory(await this.ctx.storage.get<Record<string, RosterEntry>>('roster') ?? {})
                }
                await this.broadcastGame(events)
                return
            }

            case 'extend-start': {
                // Anyone at the table can hold the lobby open; the allowance
                // is the room's, so the second press is refused for everyone.
                await this.loadGame()
                if (this.roomStatus() !== 'lobby') return
                const t = await this.getTimers()
                // A private room never arms this clock, so the bump is a
                // no-op there and needs no visibility check of its own.
                const prev: AutoStartState = { at: t.startAt, bumps: t.startBumps }
                const next = autoStartBump(prev, Date.now())
                if (next.at === prev.at) return
                t.startAt = next.at
                t.startBumps = next.bumps
                await this.putTimers(t)
                await this.touchGc()
                // One ring, one deadline: everybody's clock moves together.
                await this.broadcastPresence()
                return
            }

            case 'invite': {
                // The socket is what proves membership: this DO authenticated
                // it into this room. Nothing else can make that claim, which
                // is the whole reason the invite does not go straight from
                // the client to Supabase.
                await this.loadGame()
                const target = String(msg.userId ?? '')
                if (!target) return
                if (this.roomStatus() !== 'lobby') {
                    this.send(ws, { t: 'invite-result', userId: target, result: 'not-in-lobby' })
                    return
                }
                const roomRec = await this.ctx.storage.get<RoomRecord>('room')
                if (!roomRec) return
                // Only the room knows how full it is and what rules it deals.
                const result = await sendRoomInvite(this.env, tag.userId, target, roomRec.code, {
                    players: this.roomSockets().length,
                    mode: String(roomRec.stackingMode ?? 'official'),
                })
                this.send(ws, { t: 'invite-result', userId: target, result })
                await this.touchGc()
                return
            }

            case 'intent': {
                const game = await this.loadGame()
                if (!game || this.roomStatus() !== 'playing') {
                    this.send(ws, { t: 'error', code: 'not-started', intentId: msg.id })
                    return
                }

                // Catching a missed UNO call is window-gated room state, not a rule.
                if (msg.action.kind === 'CATCH_UNO') {
                    const target = msg.action.targetUserId
                    const t = await this.getTimers()
                    const targetPlayer = game.engine.players.find(p => p.id === target)
                    const windowOpen = t.catchFor === target && (t.catchAt ?? 0) > Date.now()
                    if (!windowOpen || target === tag.userId || !targetPlayer || targetPlayer.isEliminated
                        || targetPlayer.hand.length !== 1 || game.engine.hasCalledUno[target]) {
                        this.send(ws, { t: 'error', code: 'invalid-intent', intentId: msg.id })
                        return
                    }
                    delete t.catchAt
                    delete t.catchFor
                    await this.putTimers(t)
                    const events = applyUnoCatch(game, target)
                    events.push({ t: 'UNO_WINDOW_CLOSED', playerId: target })
                    await this.broadcastGame(events, msg.id)
                    return
                }

                const res = applyIntent(game, tag.userId, msg.action)
                if (!res.ok) {
                    this.send(ws, { t: 'error', code: 'invalid-intent', intentId: msg.id })
                    return
                }
                await this.broadcastGame(res.events, msg.id)
                return
            }

            default:
                this.send(ws, { t: 'error', code: 'bad-message' })
        }
    }

    // The closing socket is still enumerable in getWebSockets() while these
    // handlers run — exclude it or it counts itself as connected.
    async webSocketClose(ws: WebSocket) {
        await this.broadcastPresence(undefined, ws)
        await this.armTurnGrace(ws)
    }

    async webSocketError(ws: WebSocket) {
        await this.broadcastPresence(undefined, ws)
        await this.armTurnGrace(ws)
    }

    // The single alarm dispatches whichever clocks are due: catch-window
    // expiry, turn grace for an absent player, and room GC.
    async alarm() {
        const now = Date.now()
        const t = await this.getTimers()

        const catchDue = !!t.catchAt && t.catchAt <= now
        const catchWho = t.catchFor
        if (catchDue) { delete t.catchAt; delete t.catchFor }

        const graceDue = !!t.graceAt && t.graceAt <= now
        const graceSeat = t.graceSeat
        if (graceDue) { delete t.graceAt; delete t.graceSeat }

        const startDue = !!t.startAt && t.startAt <= now
        if (startDue) { delete t.startAt; delete t.startLeftMs; delete t.startSeen; delete t.startBumps }

        const gcDue = !!t.gcAt && t.gcAt <= now
        if (gcDue) t.gcAt = now + gcWindowMs(await this.isRoomPublic())
        await this.putTimers(t)

        if (catchDue && catchWho) {
            await this.loadGame()
            if (this.game && this.roomStatus() === 'playing') {
                await this.broadcastGame([{ t: 'UNO_WINDOW_CLOSED', playerId: catchWho }])
            }
        }

        if (graceDue && graceSeat) {
            await this.loadGame()
            const s = this.game?.engine
            const connected = new Set(this.roomSockets().map(x => x.userId))
            if (this.game && s && this.roomStatus() === 'playing'
                && s.players[s.currentPlayerIndex]?.id === graceSeat
                && !connected.has(graceSeat)) {
                const events = autoResolveAbsentTurn(this.game, graceSeat)
                await this.broadcastGame(events)
            }
        }

        if (startDue) {
            // The lobby countdown hit zero — deal, exactly as a host start
            // would, if the room still qualifies. If it no longer does, the
            // next presence change re-arms a fresh clock.
            await this.loadGame()
            const roomRec = await this.ctx.storage.get<RoomRecord>('room')
            const connected = new Set(this.roomSockets().map(x => x.userId))
            const seated = (await this.rosterList()).filter(r => connected.has(r.userId))
            if (roomRec?.isPublic && this.roomStatus() === 'lobby' && seated.length >= AUTO_START_MIN_PLAYERS) {
                const { game, events } = startGame(seated, roomRec.stackingMode as StackingMode)
                this.game = game
                await this.refreshDirectory(await this.ctx.storage.get<Record<string, RosterEntry>>('roster') ?? {})
                await this.broadcastGame(events)
            }
        }

        if (gcDue && this.roomSockets().length === 0) {
            const roomRec = await this.ctx.storage.get<RoomRecord>('room')
            if (roomRec?.isPublic) {
                await directoryStub(this.env).fetch('https://do/dir-unregister', {
                    method: 'POST', body: JSON.stringify({ code: roomRec.code }),
                })
            }
            if (roomRec?.voiceMeetingId) await deactivateMeeting(this.env, roomRec.voiceMeetingId)
            await this.ctx.storage.deleteAll()
            this.game = undefined
            this.roomIsPublic = undefined
        }
    }

    private roomSockets(exclude?: WebSocket): { ws: WebSocket; userId: string }[] {
        const sockets: { ws: WebSocket; userId: string }[] = []
        for (const ws of this.ctx.getWebSockets()) {
            if (ws === exclude) continue
            const tag = ws.deserializeAttachment() as SocketTag
            if (tag && 'userId' in tag) sockets.push({ ws, userId: tag.userId })
        }
        return sockets
    }

    private send(ws: WebSocket, msg: ServerMsg) {
        try {
            ws.send(JSON.stringify(msg))
        } catch { /* socket already gone */ }
    }

    private async broadcastPresence(rosterIn?: Record<string, RosterEntry>, exclude?: WebSocket) {
        const roster = rosterIn ?? (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
        const sockets = this.roomSockets(exclude)
        const connectedIds = new Set(sockets.map(s => s.userId))
        const players: PresencePlayer[] = Object.entries(roster)
            .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
            .map(([userId, entry]) => ({ userId, name: entry.name, connected: connectedIds.has(userId), skin: entry.skin }))
        // Presence changes are exactly when the auto-start clock moves, so the
        // frame carries it and the clients never need to poll.
        const auto = await this.tickAutoStart([...connectedIds], Object.keys(roster).length)
        const frame: ServerMsg = { t: 'presence', players, ...auto }
        for (const { ws } of sockets) {
            this.send(ws, frame)
        }
        // Pass the connected count: this path runs from close handlers where
        // the closing socket is excluded, and roomSockets() would recount it.
        await this.refreshDirectory(roster, connectedIds.size)
    }

    /** Advance the auto-start clock; returns the presence-frame fields. */
    private async tickAutoStart(connectedIds: string[], seated: number): Promise<{ autoStartInMs?: number; autoStartPaused?: boolean; autoStartBumpsLeft?: number }> {
        if (!(await this.isRoomPublic())) return {}
        await this.loadGame()
        const t = await this.getTimers()
        const prev: AutoStartState = {
            at: t.startAt,
            leftMs: t.startLeftMs,
            // A clock armed by the count-storing build holds a number - drop
            // it and let identity tracking rebuild from this tick.
            seen: Array.isArray(t.startSeen) ? t.startSeen : undefined,
            bumps: t.startBumps,
        }
        const now = Date.now()
        const next = autoStartTick(prev, {
            isPublic: true,
            phase: this.roomStatus(),
            connectedIds,
            seatsFree: Math.max(0, MAX_PLAYERS - seated),
            now,
        })
        const seenChanged = (next.seen ?? []).join(',') !== (prev.seen ?? []).join(',')
        if (next.at !== prev.at || next.leftMs !== prev.leftMs || next.bumps !== prev.bumps || seenChanged || typeof t.startSeen === 'number') {
            if (next.at === undefined) delete t.startAt; else t.startAt = next.at
            if (next.leftMs === undefined) delete t.startLeftMs; else t.startLeftMs = next.leftMs
            if (next.seen === undefined) delete t.startSeen; else t.startSeen = next.seen
            if (next.bumps === undefined) delete t.startBumps; else t.startBumps = next.bumps
            await this.putTimers(t)
        }
        if (next.at !== undefined) {
            return { autoStartInMs: Math.max(0, next.at - now), autoStartBumpsLeft: autoStartBumpsLeft(next) }
        }
        if (next.leftMs !== undefined) return { autoStartInMs: next.leftMs, autoStartPaused: true }
        return {}
    }

    /**
     * Publish this room's snapshot to the public directory so the landing page
     * can render it without a round trip per room. Private rooms are never in
     * the directory, so they skip it entirely.
     *
     * Never allowed to fail loudly: the directory is a shop window, and a
     * window that will not update must not take the game down with it.
     */
    private async refreshDirectory(roster: Record<string, RosterEntry>, connected?: number): Promise<void> {
        try {
            if (!(await this.isRoomPublic())) return
            const room = await this.ctx.storage.get<RoomRecord>('room')
            if (!room) return
            connected ??= this.roomSockets().length
            // A hibernated DO wakes with `game` unloaded and roomStatus()
            // reads it directly — without this, the presence broadcast a
            // backgrounded phone triggers would report a playing or finished
            // room as a fresh lobby and hand it back to quick match.
            await this.loadGame()
            const players = Object.keys(roster).length
            const skins = Object.values(roster).map(e => e.skin).filter(Boolean) as string[]
            await directoryStub(this.env).fetch('https://do/dir-register', {
                method: 'POST',
                body: JSON.stringify({
                    code: room.code,
                    snapshot: {
                        players,
                        connected,
                        seatsFree: Math.max(0, MAX_PLAYERS - players),
                        // Kept alongside status so a rollback still reads sane entries.
                        inProgress: this.roomStatus() === 'playing',
                        status: this.roomStatus(),
                        mode: room.stackingMode,
                        skins,
                    },
                }),
            })
        } catch {
            // Directory unreachable — the room plays on regardless.
        }
    }
}

const PAGE = `<!doctype html>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UNO latency test</title>
<style>
  body { font-family: ui-monospace, monospace; background: #111; color: #eee; padding: 2rem; max-width: 34rem; margin: auto; }
  h1 { font-size: 1.1rem; }
  .big { font-size: 2.4rem; margin: 1rem 0; }
  .dim { color: #888; }
  td { padding: 0.15rem 0.8rem 0.15rem 0; }
</style>
<h1>UNO game-server latency test</h1>
<p class="dim">edge colo: {{COLO}} &middot; room: <span id="room"></span></p>
<div class="big" id="status">connecting&hellip;</div>
<table>
  <tr><td>median</td><td id="p50">-</td></tr>
  <tr><td>p95</td><td id="p95">-</td></tr>
  <tr><td>min</td><td id="min">-</td></tr>
</table>
<p class="dim">20 pings over one WebSocket to a Durable Object. The room is shared:
whoever opens the link first decides where the object lives, everyone else
measures their distance to it - same as a real game.</p>
<script>
  const room = new URLSearchParams(location.search).get('room') || 'phase0'
  document.getElementById('room').textContent = room
  const ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws?room=' + room)
  const samples = []
  const WARMUP = 3, COUNT = 20
  let sent = 0
  const ping = () => { ws.send(String(performance.now())); sent++ }
  ws.onopen = ping
  ws.onerror = () => { document.getElementById('status').textContent = 'connection failed' }
  ws.onmessage = (e) => {
    const rtt = performance.now() - Number(e.data)
    if (sent > WARMUP) samples.push(rtt)
    if (sent < WARMUP + COUNT) { ping(); return }
    samples.sort((a, b) => a - b)
    const at = (q) => samples[Math.min(samples.length - 1, Math.floor(q * samples.length))].toFixed(1) + ' ms'
    document.getElementById('status').textContent = at(0.5)
    document.getElementById('p50').textContent = at(0.5)
    document.getElementById('p95').textContent = at(0.95)
    document.getElementById('min').textContent = samples[0].toFixed(1) + ' ms'
  }
</script>
`
