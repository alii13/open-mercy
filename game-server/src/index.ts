/// <reference types="@cloudflare/workers-types" />

import { verifySupabaseToken, type AuthEnv } from './auth'
import type { ClientMsg, GameEvent, PresencePlayer, ServerMsg } from './protocol'
import { applyIntent, applyUnoCatch, clearTimeouts, forceEliminate, persistResults, personalView, playHouseTurn, startGame, timeOutTurn, updateStats, viewEventFor, type GameRecord } from './game'
import { dueTimeout, nextTurnClock } from './turnClock'
import { dirCodes, dirRegister, liveTables, normalizeDir } from './directory'
import { cleanName, cleanSkin, isStackingMode } from './validate'
import { newBucket, socketVerdict, type Bucket } from './socketLimit'
import { createAllowed } from './createLimit'
import { addParticipant, createMeeting, deactivateMeeting, voiceConfigured, type VoiceEnv } from './voice'
import { gcWindowMs, shouldPushGc } from './roomGc'
import { ROOM_CODE_ALPHABET, isRoomCode, normalizeRoomCode } from '../../shared/roomCode'
import { doorVerdict, PUBLIC_SEATS } from './seats'
import { NEXT_DEAL_MS, autoStartTick, canDeal } from './autoStart'
import { houseClockFor, housePlanAtDeal, houseStep, leavesTable, newHouseSeat, thinkMs, walkDelayMs, type HouseSeat } from './house'
import { chatAllowed, loungeAllowed } from './chatLimit'
import { cleanLoungeAct, LOUNGE_FACES, LOUNGE_TABLE, type LoungeAct } from '../../shared/lounge'
import { sendRoomInvite } from './invites'
import { deleteSubscription, pushConfigured, saveSubscription, sendNudges, type PushEnv } from './push'
import { quickChatPhrase } from '../../shared/quickChat'
import type { StackingMode } from '../../shared/engine'

interface Env extends AuthEnv, VoiceEnv, PushEnv {
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

// A public table shows the result this long, then goes back to the lounge for
// the next deal with everyone still seated.
const NEXT_HAND_MS = 10 * 1000

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
            const allowed = await directoryStub(env).fetch('https://do/create-allow', {
                method: 'POST', body: JSON.stringify({ userId: creator.userId }),
            })
            if (!(await allowed.json<boolean>())) return withCors(new Response('too many rooms', { status: 429 }), req)
            const opts = await req.json<{ public?: boolean; stackingMode?: string }>().catch(() => ({} as { public?: boolean; stackingMode?: string }))
            const stackingMode: StackingMode = isStackingMode(opts.stackingMode) ? opts.stackingMode : 'official'
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
                body: JSON.stringify({ code, hostUserId: creator.userId, stackingMode, isPublic: !!opts.public }),
            })
            if (opts.public) {
                await directoryStub(env).fetch('https://do/dir-register', { method: 'POST', body: JSON.stringify({ code }) })
            }
            return withCors(Response.json({ code, placementMs: winner.ms }), req)
        }

        if (url.pathname === '/health') {
            console.log('health check, secret bound:', !!env.SUPABASE_SERVICE_KEY)
            return withCors(Response.json({ ok: true, resultsPersistence: !!env.SUPABASE_SERVICE_KEY, voice: voiceConfigured(env), push: pushConfigured(env) }), req)
        }

        // Daily reminders. The public key is what a browser subscribes with;
        // null tells the client reminders are off on this deploy.
        if (url.pathname === '/push/key') {
            return withCors(Response.json({ key: pushConfigured(env) ? env.VAPID_PUBLIC_KEY : null }), req)
        }
        if (req.method === 'POST' && (url.pathname === '/push/subscribe' || url.pathname === '/push/unsubscribe')) {
            if (Number(req.headers.get('content-length') ?? 0) > 4096) return withCors(new Response('too large', { status: 413 }), req)
            const token = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '')
            const user = await verifySupabaseToken(token, env)
            if (!user) return withCors(new Response('unauthorized', { status: 401 }), req)
            const body = await req.json<Record<string, unknown>>().catch(() => null)
            const status = url.pathname === '/push/subscribe'
                ? await saveSubscription(env, user.userId, body)
                : await deleteSubscription(env, user.userId, body?.endpoint)
            return withCors(new Response(null, { status }), req)
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

        return new Response('not found', { status: 404 })
    },

    // Hourly (wrangler.toml [triggers]): send the reminders that are due.
    async scheduled(_ctrl: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
        ctx.waitUntil(sendNudges(env))
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

// One DO alarm serves seven clocks; the earliest due time is armed.
interface RoomTimers {
    gcAt: number
    graceAt?: number
    graceSeat?: string
    // The turn limit for whoever is on turn (see turnClock.ts).
    turnAt?: number
    turnSeat?: string
    catchAt?: number
    catchFor?: string
    // Auto-start for public lobbies (see autoStart.ts for the transitions).
    startAt?: number
    // House seats (house.ts): the next walk in or out and idle act in the
    // lobby ('lobby'), or the next action of the house seat on turn (its id).
    houseAt?: number
    houseFor?: string
    // A finished public game goes back to the lounge.
    nextHandAt?: number
}

type SocketTag = { userId: string } | null

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
    private loungeTimes = new Map<string, number[]>()
    /** Last spot on the 3D table per player, for late joiners. Memory only:
     *  after hibernation clients fall back to the shared seat spots. */
    private loungeSpots = new Map<string, [number, number]>()
    /** When each player's last socket closed, for the seat grace at the door. In memory: hibernation forgets it, which counts as long gone. */
    private goneAt = new Map<string, number>()
    // Per-socket message buckets (see socketLimit.ts).
    private buckets = new WeakMap<WebSocket, Bucket>()
    // Voice tokens already minted this wake, so a repeated voice-join reuses
    // one instead of adding another RealtimeKit participant.
    private voiceTokens = new Map<string, { meetingId: string; token: string }>()
    // Room creations per user; only the '!directory' instance uses this.
    private createTimes = new Map<string, number[]>()

    constructor(private ctx: DurableObjectState, private env: Env) {}

    private async loadGame(): Promise<GameRecord | null> {
        if (this.game === undefined) {
            const stored = await this.ctx.storage.get<{ game: GameRecord | null; seq: number }>('game')
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
        const due = [t.gcAt, t.graceAt, t.catchAt, t.startAt, t.turnAt, t.houseAt, t.nextHandAt].filter((x): x is number => !!x)
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
        const connected = await this.liveIds(exclude)
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

    /** Point the turn clock at whoever is on turn; `actor` made the turn move that led here. */
    private async armTurnClock(actor?: string): Promise<void> {
        const t = await this.getTimers()
        const s = this.game?.engine
        const current = s && s.gameState === 'PLAYING' ? s.players[s.currentPlayerIndex] : undefined
        // The seat on turn moved and is back to a fresh action: an extra turn.
        const newTurn = !!current && actor === current.id && s?.turnState === 'WAITING_FOR_ACTION'
        const next = nextTurnClock({ seat: t.turnSeat, at: t.turnAt }, current && !current.isEliminated ? current.id : null, newTurn, Date.now())
        if (next.seat === t.turnSeat && next.at === t.turnAt) return
        t.turnSeat = next.seat
        t.turnAt = next.at
        await this.putTimers(t)
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

    // --- House seats (house.ts) ---

    private async houseSeats(): Promise<Record<string, HouseSeat>> {
        return (await this.ctx.storage.get<Record<string, HouseSeat>>('house')) ?? {}
    }

    /** People connected, once each however many tabs they have open. */
    private humanCount(exclude?: WebSocket): number {
        return new Set(this.roomSockets(exclude).map(s => s.userId)).size
    }

    /** Open sockets plus house seats: everyone the game treats as at the table. */
    private async liveIds(exclude?: WebSocket): Promise<Set<string>> {
        const ids = new Set(this.roomSockets(exclude).map(s => s.userId))
        for (const id of Object.keys(await this.houseSeats())) ids.add(id)
        return ids
    }

    /** Roster and house seats in one join order: the lobby's player list. */
    private async seatList(): Promise<{ userId: string; name: string; joinedAt: number; skin?: string }[]> {
        const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
        const house = await this.houseSeats()
        return [...Object.entries(roster), ...Object.entries(house)]
            .map(([userId, e]) => ({ userId, name: e.name, joinedAt: e.joinedAt, skin: e.skin }))
            .sort((a, b) => a.joinedAt - b.joinedAt)
    }

    /** A house seat's lounge act, relayed exactly as a person's would be. */
    private houseAct(userId: string, act: LoungeAct): void {
        if (act.kind === 'move') this.loungeSpots.set(userId, [act.x, act.z])
        for (const s of this.roomSockets()) this.send(s.ws, { t: 'lounge', userId, act })
    }

    private houseChat(userId: string, phraseIds: string[]): void {
        const phrase = quickChatPhrase(phraseIds[Math.floor(Math.random() * phraseIds.length)]!)
        if (!phrase) return
        for (const s of this.roomSockets()) this.send(s.ws, { t: 'chat', userId, phraseId: phrase.id })
    }

    /**
     * Point the house clock at the next thing a house seat does: in the lobby
     * the next walk in or out, or an idle act while any are seated; in a game
     * the turn of a house seat on turn. Anything else clears it.
     */
    private async armHouse(): Promise<void> {
        if (!(await this.isRoomPublic())) return
        await this.loadGame()
        const t = await this.getTimers()
        const houseIds = Object.keys(await this.houseSeats())
        const s = this.game?.engine
        const current = s && s.gameState === 'PLAYING' ? s.players[s.currentPlayerIndex] : null
        const key = houseClockFor({ status: this.roomStatus(), humans: this.humanCount(), houseIds, current })
        if (key === null) {
            if (t.houseAt === undefined) return
            delete t.houseAt
            delete t.houseFor
        } else {
            if (t.houseAt !== undefined && t.houseFor === key) return
            let delay = walkDelayMs(Math.random)
            if (key !== 'lobby' && s) {
                const sockets = new Set(this.roomSockets().map(x => x.userId))
                const personPlaying = s.players.some(p => !p.isEliminated && sockets.has(p.id))
                delay = thinkMs(Math.random, personPlaying ? 'normal' : sockets.size ? 'brisk' : 'rush')
            }
            t.houseAt = Date.now() + delay
            t.houseFor = key
        }
        await this.putTimers(t)
    }

    /** The house clock fired. */
    private async houseTick(): Promise<void> {
        await this.loadGame()
        const status = this.roomStatus()
        const house = await this.houseSeats()

        if (status === 'playing' && this.game) {
            const s = this.game.engine
            const current = s.players[s.currentPlayerIndex]
            const seat = current && house[current.id]
            if (seat && !current.isEliminated) {
                await this.broadcastGame(playHouseTurn(this.game, current.id, seat.dials), undefined, current.id)
                return
            }
        }

        if (status === 'lobby') {
            const humans = this.humanCount()
            const ids = Object.keys(house).sort((a, b) => house[a]!.joinedAt - house[b]!.joinedAt)
            // Nobody left to see them go.
            if (humans === 0 && ids.length) {
                await this.ctx.storage.put('house', {})
                for (const id of ids) this.loungeSpots.delete(id)
                await this.broadcastPresence()
                return
            }
            const step = houseStep(humans, ids.length)
            if (step === 1) {
                const { id, seat } = newHouseSeat(Math.random, Date.now())
                house[id] = seat
                await this.ctx.storage.put('house', house)
                await this.broadcastPresence()
                if (Math.random() < 0.35) this.houseChat(id, ['hi', 'gl'])
                return
            }
            if (step === -1) {
                const id = ids[ids.length - 1]!
                delete house[id]
                this.loungeSpots.delete(id)
                await this.ctx.storage.put('house', house)
                await this.broadcastPresence()
                return
            }
            if (ids.length && Math.random() < 0.5) {
                const id = ids[Math.floor(Math.random() * ids.length)]!
                const r = Math.random()
                if (r < 0.45) {
                    this.houseAct(id, { kind: 'draw', face: LOUNGE_FACES[Math.floor(Math.random() * LOUNGE_FACES.length)]! })
                } else if (r < 0.8) {
                    const a = Math.random() * 2 * Math.PI
                    const k = 0.55 + Math.random() * 0.3
                    this.houseAct(id, { kind: 'move', x: Math.cos(a) * LOUNGE_TABLE.rx * k, z: Math.sin(a) * LOUNGE_TABLE.rz * k, drag: false })
                } else {
                    this.houseChat(id, ['gl', 'hi', 'e-fire', 'e-laugh'])
                }
            }
        }
        await this.armHouse()
    }

    /**
     * Deal a public table: everyone connected plus the house seats that fill
     * it to HOUSE_FILL. House seats a person has made room for leave now;
     * any that had not walked in yet sit down now.
     */
    private async dealPublic(mode: StackingMode): Promise<boolean> {
        const sockets = new Set(this.roomSockets().map(x => x.userId))
        const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
        const humans = Object.keys(roster).filter(id => sockets.has(id))
        const house = await this.houseSeats()
        const plan = housePlanAtDeal(Object.keys(house).sort((a, b) => house[a]!.joinedAt - house[b]!.joinedAt), humans.length)
        for (const id of plan.drop) {
            delete house[id]
            this.loungeSpots.delete(id)
        }
        const ids = [...plan.keep]
        for (let i = 0; i < plan.add; i++) {
            const { id, seat } = newHouseSeat(Math.random, Date.now())
            house[id] = seat
            ids.push(id)
        }
        if (!canDeal(humans.length, humans.length + ids.length)) return false
        for (const id of ids) house[id]!.hands++
        await this.ctx.storage.put('house', house)
        const seated = (await this.seatList()).filter(p => sockets.has(p.userId) || p.userId in house)
        const { game, events } = startGame(seated, mode)
        game.house = ids
        this.game = game
        await this.refreshDirectory(roster)
        await this.broadcastGame(events)
        return true
    }

    /**
     * A finished public game goes back to the lounge: the result clears,
     * whoever is still connected keeps their seat, people who left give theirs
     * up, and house seats that have played their hands leave. The next deal
     * is NEXT_DEAL_MS away: the 30-second wait is for people sitting down,
     * and everyone here already has.
     */
    private async nextHand(): Promise<void> {
        this.game = null
        this.seq++
        await this.ctx.storage.put('game', { game: null, seq: this.seq })
        const sockets = new Set(this.roomSockets().map(x => x.userId))
        const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
        for (const id of Object.keys(roster)) if (!sockets.has(id)) delete roster[id]
        await this.ctx.storage.put('roster', roster)
        const house = await this.houseSeats()
        for (const [id, seat] of Object.entries(house)) {
            if (leavesTable(seat)) {
                delete house[id]
                this.loungeSpots.delete(id)
            }
        }
        await this.ctx.storage.put('house', house)
        // The presence frame's tick keeps this deadline, or drops it if nobody stayed.
        const t = await this.getTimers()
        t.startAt = Date.now() + NEXT_DEAL_MS
        await this.putTimers(t)
        for (const { ws, userId } of this.roomSockets()) this.send(ws, await this.snapshotFor(userId))
        await this.broadcastPresence(roster)
    }

    private viewFor(userId: string, roster: { userId: string; name: string }[], roomRec: RoomRecord | undefined, turnAt: number | undefined, connected: Set<string>) {
        // Same id scheme as game_results rows — distinct per dealt game.
        const gameId = this.game && roomRec ? `do-${roomRec.code}-${this.game.startedAt}` : null
        const view = personalView(this.game ?? null, this.roomStatus(), userId, roster, connected, roomRec?.hostUserId ?? null, gameId)
        if (!this.game && roomRec) view.stackingMode = roomRec.stackingMode as StackingMode
        view.turnEndsInMs = turnAt && this.roomStatus() === 'playing' ? Math.max(0, turnAt - Date.now()) : null
        return view
    }

    private async snapshotFor(userId: string): Promise<ServerMsg> {
        const roster = await this.seatList()
        const roomRec = await this.ctx.storage.get<RoomRecord>('room')
        const { turnAt } = await this.getTimers()
        return { t: 'snapshot', seq: this.seq, game: this.viewFor(userId, roster, roomRec, turnAt, await this.liveIds()) }
    }

    /**
     * Send an intent's events (personalized) + a fresh snapshot to every seated
     * socket. `actor` is set only for a turn move (not a MERCY call or a
     * catch), so the turn clock can tell a new turn from anything else.
     */
    private async broadcastGame(events: GameEvent[], intentId?: string, actor?: string): Promise<void> {
        this.seq++
        await this.processCatchWindows(events)
        if (this.game) updateStats(this.game, events)
        // Before the snapshots, so they carry the new turn's time.
        await this.armTurnClock(actor)
        const { turnAt } = await this.getTimers()
        const roster = await this.seatList()
        const roomRec = await this.ctx.storage.get<RoomRecord>('room')
        const connected = await this.liveIds()
        for (const { ws, userId } of this.roomSockets()) {
            for (const ev of events) {
                this.send(ws, { t: 'event', seq: this.seq, ev: viewEventFor(ev, userId), intentId })
            }
            this.send(ws, { t: 'snapshot', seq: this.seq, game: this.viewFor(userId, roster, roomRec, turnAt, connected) })
        }
        if (this.game && roomRec && events.some(e => e.t === 'GAME_OVER')) {
            if (roomRec.isPublic) {
                const t = await this.getTimers()
                t.nextHandAt = Date.now() + NEXT_HAND_MS
                await this.putTimers(t)
                const house = this.game.house ?? []
                if (house.length && Math.random() < 0.4) this.houseChat(house[Math.floor(Math.random() * house.length)]!, ['gg', 'gg', 'close', 'wow'])
            }
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
        await this.armHouse()
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
                    stackingMode: isStackingMode(body.stackingMode) ? body.stackingMode : 'official', isPublic: !!body.isPublic,
                }
                await this.ctx.storage.put('room', room)
                this.roomIsPublic = !!body.isPublic
                await this.touchGc()
                return new Response('ok')
            }

            // --- Public-rooms directory (this DO under the reserved '!directory' name) ---
            case '/dir-register': {
                const body = await req.json<{ code: string; snapshot?: unknown }>()
                const dir = normalizeDir(await this.ctx.storage.get('dir'))
                if (!dirRegister(dir, body.code, body.snapshot, Date.now())) {
                    return new Response('directory full', { status: 409 })
                }
                await this.ctx.storage.put('dir', dir)
                return new Response('ok')
            }
            case '/create-allow': {
                const { userId } = await req.json<{ userId: string }>()
                const times = this.createTimes.get(userId) ?? []
                const ok = createAllowed(times, Date.now())
                this.createTimes.set(userId, times)
                return Response.json(ok)
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

            default:
                return new Response('not found', { status: 404 })
        }
    }

    async webSocketMessage(ws: WebSocket, raw: ArrayBuffer | string) {
        let bucket = this.buckets.get(ws)
        if (!bucket) this.buckets.set(ws, bucket = newBucket(Date.now()))
        const verdict = socketVerdict(bucket, Date.now())
        if (verdict === 'close') {
            ws.close(1008, 'rate limited')
            return
        }
        if (verdict === 'drop') return

        const tag = ws.deserializeAttachment() as SocketTag

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
            // The seat rules live in seats.ts: a seated player always gets
            // back in, a public table stays open to strangers until it deals,
            // and a full table in its lobby hands on a seat gone past its grace.
            await this.loadGame()
            const verdict = doorVerdict({
                userId: verified.userId,
                rosterIds: Object.keys(roster),
                liveIds: this.roomSockets(ws).map(s => s.userId),
                goneAt: Object.fromEntries(this.goneAt),
                isPublic: room.isPublic,
                phase: this.roomStatus(),
                now: Date.now(),
            })
            if (!verdict.seat) {
                this.send(ws, { t: 'error', code: 'room-full' })
                ws.close(1008, 'room full')
                return
            }
            if (verdict.evict) {
                delete roster[verdict.evict]
                this.loungeSpots.delete(verdict.evict)
                this.goneAt.delete(verdict.evict)
            }
            this.goneAt.delete(verified.userId)
            const entry = roster[verified.userId]
            const name = cleanName(msg.name)
            const skin = cleanSkin(msg.skin)
            if (entry) {
                if (name !== 'PLAYER') entry.name = name
                entry.skin = skin || entry.skin
            } else {
                roster[verified.userId] = { name, joinedAt: Date.now(), skin }
            }
            await this.ctx.storage.put('roster', roster)
            ws.serializeAttachment({ userId: verified.userId })
            // Activity resets the GC clock.
            await this.touchGc()

            this.send(ws, { t: 'hello', roomCode: room.code, userId: verified.userId, hostUserId: room.hostUserId, isPublic: room.isPublic })
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
                    const name = cleanName(msg.name)
                    entry.name = name
                    await this.ctx.storage.put('roster', roster)
                    await this.loadGame()
                    const seated = this.game?.engine.players.find(p => p.id === tag.userId)
                    if (seated) seated.name = name
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
                    const minted = this.voiceTokens.get(tag.userId)
                    let token: string
                    if (minted?.meetingId === meetingId) {
                        token = minted.token
                    } else {
                        const roster = (await this.ctx.storage.get<Record<string, RosterEntry>>('roster')) ?? {}
                        const name = roster[tag.userId]?.name ?? 'PLAYER'
                        // The room host gets the moderation preset (mute others).
                        token = await addParticipant(this.env, meetingId, {
                            name, customParticipantId: tag.userId, isHost: tag.userId === room.hostUserId,
                        })
                        this.voiceTokens.set(tag.userId, { meetingId, token })
                    }
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
                // Mirrors BADGES.length in frontend/src/utils/badges.ts.
                if (!Number.isFinite(tier) || tier < 1 || tier > 20) return
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

            case 'lounge': {
                // The 3D public table: relay a rebuilt act to the rest of the
                // table, only in a public room's lobby. Never the raw frame.
                if (!(await this.isRoomPublic())) return
                await this.loadGame()
                if (this.roomStatus() !== 'lobby') return
                const act = cleanLoungeAct(msg.act)
                if (!act) {
                    this.send(ws, { t: 'error', code: 'bad-message' })
                    return
                }
                const times = this.loungeTimes.get(tag.userId) ?? []
                // Over the limit: drop silently, like chat.
                if (!loungeAllowed(times, Date.now())) return
                this.loungeTimes.set(tag.userId, times)
                if (act.kind === 'move') this.loungeSpots.set(tag.userId, [act.x, act.z])
                for (const s of this.roomSockets()) {
                    if (s.userId !== tag.userId) this.send(s.ws, { t: 'lounge', userId: tag.userId, act })
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
                const house = await this.houseSeats()
                if (msg.userId in house) {
                    delete house[msg.userId]
                    this.loungeSpots.delete(msg.userId)
                    await this.ctx.storage.put('house', house)
                }
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
                const mode = isStackingMode(msg.stackingMode) ? msg.stackingMode
                    : isStackingMode(roomRec.stackingMode) ? roomRec.stackingMode : 'official'
                if (roomRec.isPublic) {
                    // Only from the lounge: dealing over a result screen would
                    // skip the return to the table and its seat clean-up.
                    if (this.roomStatus() !== 'lobby') {
                        this.send(ws, { t: 'error', code: 'already-started' })
                        return
                    }
                    const t = await this.getTimers()
                    delete t.startAt
                    delete t.nextHandAt
                    await this.putTimers(t)
                    if (!(await this.dealPublic(mode))) this.send(ws, { t: 'error', code: 'need-players' })
                    return
                }
                const roster = await this.rosterList()
                const connected = new Set(this.roomSockets().map(s => s.userId))
                const seated = roster.filter(r => connected.has(r.userId))
                if (seated.length < 2) {
                    this.send(ws, { t: 'error', code: 'need-players' })
                    return
                }
                const { game, events } = startGame(seated, mode)
                this.game = game
                {
                    // A manual start beats the countdown to the punch —
                    // disarm it so the alarm doesn't fire into a running game.
                    const t = await this.getTimers()
                    if (t.startAt !== undefined) {
                        delete t.startAt
                        await this.putTimers(t)
                    }
                }
                await this.broadcastGame(events)
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
                // A MERCY call is allowed on your own turn and repeatable, so
                // it neither restarts the clock nor counts as playing the turn.
                const turnMove = msg.action.kind !== 'CALL_UNO'
                if (turnMove) clearTimeouts(game, tag.userId)
                await this.broadcastGame(res.events, msg.id, turnMove ? tag.userId : undefined)
                return
            }

            default:
                this.send(ws, { t: 'error', code: 'bad-message' })
        }
    }

    // The closing socket is still enumerable in getWebSockets() while these
    // handlers run — exclude it or it counts itself as connected.
    private markGone(ws: WebSocket) {
        const tag = ws.deserializeAttachment() as SocketTag
        if (!tag || !('userId' in tag)) return
        if (this.roomSockets(ws).some(s => s.userId === tag.userId)) return
        this.goneAt.set(tag.userId, Date.now())
    }

    async webSocketClose(ws: WebSocket) {
        this.markGone(ws)
        await this.broadcastPresence(undefined, ws)
        await this.armTurnGrace(ws)
    }

    async webSocketError(ws: WebSocket) {
        this.markGone(ws)
        await this.broadcastPresence(undefined, ws)
        await this.armTurnGrace(ws)
    }

    // The single alarm dispatches whichever clocks are due: catch-window
    // expiry, turn grace for an absent player, the turn limit, lobby
    // auto-start, house seats, the return to the lounge, and room GC.
    async alarm() {
        const now = Date.now()
        const t = await this.getTimers()

        const catchDue = !!t.catchAt && t.catchAt <= now
        const catchWho = t.catchFor
        if (catchDue) { delete t.catchAt; delete t.catchFor }

        const graceDue = !!t.graceAt && t.graceAt <= now
        const graceSeat = t.graceSeat
        if (graceDue) { delete t.graceAt; delete t.graceSeat }

        const turnDue = !!t.turnAt && t.turnAt <= now
        const turnSeat = t.turnSeat
        if (turnDue) { delete t.turnAt; delete t.turnSeat }

        const startDue = !!t.startAt && t.startAt <= now
        if (startDue) delete t.startAt

        const houseDue = !!t.houseAt && t.houseAt <= now
        if (houseDue) { delete t.houseAt; delete t.houseFor }

        const nextHandDue = !!t.nextHandAt && t.nextHandAt <= now
        if (nextHandDue) delete t.nextHandAt

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
            const connected = await this.liveIds()
            if (this.game && s && this.roomStatus() === 'playing'
                && s.players[s.currentPlayerIndex]?.id === graceSeat
                && !connected.has(graceSeat)) {
                await this.broadcastGame(timeOutTurn(this.game, graceSeat, false))
            }
        }

        // The limit ran out. A seat that dropped is usually the grace clock's
        // (above, it acts sooner); if the limit lands first it still times out,
        // as absent, so going offline across the deadline cannot stop the clock.
        if (turnDue && turnSeat) {
            await this.loadGame()
            const s = this.game?.engine
            const connected = await this.liveIds()
            const due = this.game && s && this.roomStatus() === 'playing'
                ? dueTimeout(turnSeat, s.players[s.currentPlayerIndex]?.id ?? null, connected)
                : null
            if (this.game && due) await this.broadcastGame(timeOutTurn(this.game, due.seat, due.present))
        }

        if (startDue) {
            // The countdown hit zero: deal to whoever is connected plus the
            // house seats. A table nobody is at cannot deal, so the room
            // reopens and the presence frame clears every clock.
            await this.loadGame()
            const roomRec = await this.ctx.storage.get<RoomRecord>('room')
            if (roomRec?.isPublic && this.roomStatus() === 'lobby') {
                if (!(await this.dealPublic(roomRec.stackingMode as StackingMode))) await this.broadcastPresence()
            }
        }

        // A deal above re-arms the clock for its first house turn; that turn
        // waits for its own pause rather than going now.
        if (houseDue && (await this.getTimers()).houseAt === undefined) await this.houseTick()

        if (nextHandDue) {
            await this.loadGame()
            if ((await this.isRoomPublic()) && this.roomStatus() === 'finished') await this.nextHand()
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
        const house = await this.houseSeats()
        const players: PresencePlayer[] = [...Object.entries(roster), ...Object.entries(house)]
            .sort((a, b) => a[1].joinedAt - b[1].joinedAt)
            .map(([userId, entry]) => ({ userId, name: entry.name, connected: connectedIds.has(userId) || userId in house, skin: entry.skin }))
        // Presence changes are exactly when the auto-start clock moves, so the
        // frame carries it and the clients never need to poll.
        const auto = await this.tickAutoStart(connectedIds.size)
        const spots = Object.fromEntries([...this.loungeSpots].filter(([id]) => id in roster || id in house))
        const frame: ServerMsg = { t: 'presence', players, ...auto, ...(Object.keys(spots).length ? { spots } : {}) }
        for (const { ws } of sockets) {
            this.send(ws, frame)
        }
        // Pass the connected count: this path runs from close handlers where
        // the closing socket is excluded, and roomSockets() would recount it.
        await this.refreshDirectory(roster, connectedIds.size)
        await this.armHouse()
    }

    /** Advance the auto-start clock; returns the presence-frame fields. */
    private async tickAutoStart(humans: number): Promise<{ autoStartInMs?: number }> {
        if (!(await this.isRoomPublic())) return {}
        await this.loadGame()
        const t = await this.getTimers()
        const now = Date.now()
        const next = autoStartTick({ at: t.startAt }, { isPublic: true, phase: this.roomStatus(), humans, now })
        if (next.at !== t.startAt) {
            if (next.at === undefined) delete t.startAt; else t.startAt = next.at
            await this.putTimers(t)
        }
        return next.at === undefined ? {} : { autoStartInMs: Math.max(0, next.at - now) }
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
            const humans = connected ?? this.humanCount()
            // A hibernated DO wakes with `game` unloaded and roomStatus()
            // reads it directly — without this, the presence broadcast a
            // backgrounded phone triggers would report a playing or finished
            // room as a fresh lobby and hand it back to quick match.
            await this.loadGame()
            const house = Object.values(await this.houseSeats())
            const players = Object.keys(roster).length + house.length
            const skins = [...Object.values(roster), ...house].map(e => e.skin).filter(Boolean) as string[]
            await directoryStub(this.env).fetch('https://do/dir-register', {
                method: 'POST',
                body: JSON.stringify({
                    code: room.code,
                    snapshot: {
                        players,
                        connected: humans + house.length,
                        // Quick match sorts on people, so they concentrate.
                        humans,
                        // By people connected: the door hands a closed tab's
                        // seat to the next stranger, and a person always
                        // takes a seat over a house player.
                        seatsFree: Math.max(0, PUBLIC_SEATS - humans),
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
