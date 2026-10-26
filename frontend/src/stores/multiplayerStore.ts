import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { Card, CardColor } from '../types/card'
import { DEFAULT_STACKING_MODE, type StackingMode } from '../utils/gameRules'
import { getDrawValue } from '../utils/gameRules'
import { supabase, type GameRow, type GamePlayerRow } from '../lib/supabase'
import { track } from '../utils/analytics'
import { getEquippedId } from '../utils/cosmetics'
import { useAuthStore } from './authStore'
import { useVoiceStore } from './voiceStore'
import type { ClientMsg, IntentAction, PersonalView, PresencePlayer, ServerMsg } from '@protocol'
import { quickChatPhrase } from '@quickChat'

// The authoritative game server (Cloudflare Worker + one Durable Object per
// room). The client is a thin mirror: it sends intents and renders the
// personalized snapshots the room answers with. All rules run server-side —
// opponents' hands never reach this client.
const GAME_SERVER = (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) || 'https://uno-game-server.shekhaliul44.workers.dev'
const STORED_ROOM_KEY = 'uno_mp_room'

/**
 * How long a stored room code is worth trying to rejoin.
 *
 * The code used to be stored bare, with no expiry, so a tab closed mid-game left
 * it behind forever and every later visit tried to rejoin a room that had been
 * garbage-collected days earlier. Those attempts were silent and self-healing,
 * but they were 156 of 365 recorded join failures — 43% of the number was the app
 * chasing its own ghost rather than a player failing to get in.
 *
 * Two hours comfortably covers a refresh, a dropped connection, or a phone
 * locking mid-game. Past that the room is gone unless others kept it alive, and
 * a failed restore tells us nothing.
 */
const STORED_ROOM_TTL_MS = 2 * 60 * 60 * 1000

interface StoredRoom {
    code: string
    at: number
}

function storeRoom(code: string): void {
    try {
        localStorage.setItem(STORED_ROOM_KEY, JSON.stringify({ code, at: Date.now() } satisfies StoredRoom))
    } catch { /* noop */ }
}

/** The stored code if it's still plausibly live, else null (clearing as it goes). */
function storedRoom(): string | null {
    let raw: string | null = null
    try { raw = localStorage.getItem(STORED_ROOM_KEY) } catch { return null }
    if (!raw) return null

    let entry: StoredRoom | null = null
    try {
        const parsed = JSON.parse(raw) as unknown
        if (parsed && typeof parsed === 'object' && 'code' in parsed) entry = parsed as StoredRoom
    } catch {
        // Written by a build that stored the bare code. Nothing to date it by, so
        // drop it rather than chase a room of unknown age.
    }
    if (!entry || typeof entry.code !== 'string' || typeof entry.at !== 'number') {
        try { localStorage.removeItem(STORED_ROOM_KEY) } catch { /* noop */ }
        return null
    }
    if (Date.now() - entry.at > STORED_ROOM_TTL_MS) {
        try { localStorage.removeItem(STORED_ROOM_KEY) } catch { /* noop */ }
        return null
    }
    return entry.code
}

export const useMultiplayerStore = defineStore('multiplayer', () => {
    const authStore = useAuthStore()

    // --- Server state mirrors ---
    const view = ref<PersonalView | null>(null)
    const presence = ref<PresencePlayer[]>([])
    const roomCodeRef = ref<string | null>(null)
    // Legacy contract: always a string ('' when not in a room).
    const roomCode = computed(() => roomCodeRef.value ?? '')
    const myUserId = ref<string | null>(null)
    const hostUserId = ref<string | null>(null)
    let lastSeq = 0

    // --- Connection ---
    const realtimeStatus = ref<'CONNECTING' | 'SUBSCRIBED' | 'CLOSED'>('CLOSED')
    let ws: WebSocket | null = null
    let closedByUs = false
    let reconnectAttempts = 0
    let couchConnectionName: string | null = null
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null
    // Why the last connect() failed when the server never said (for mp_join_failed).
    let connectFailReason: string | null = null
    const CONNECT_TIMEOUT_MS = 10_000
    const JOIN_RETRY_BACKOFF_MS = 2_000
    /** The server's verdict for a room that no longer exists. */
    const ROOM_GONE = 'Room not found'

    // --- Host/UI concerns ---
    const loading = ref(false)
    const error = ref<string | null>(null)
    const actionInProgress = ref(false)
    const suppressDiscardSlam = ref(false)
    const stackingMode = ref<StackingMode>(DEFAULT_STACKING_MODE)
    const opponentLeft = ref(false)
    // Catch windows are a phase-5 server feature; until then nobody is catchable.
    const catchableUserId = ref<string | null>(null)
    // --- Spectating: you're out, the round plays on ---
    // Knock-out order this game, client-observed from ELIMINATED events.
    const eliminationOrder = ref<string[]>([])
    // Bumps once when WE get knocked out — the view keys the KO stinger off it.
    const selfEliminated = ref<{ n: number } | null>(null)
    // The clock times watch duration; the flag survives GAME_OVER so a
    // rematch still knows this seat sat the round out.
    let spectateStartedAt = 0
    let spectatedThisGame = false
    let koN = 0
    let stackEatenN = 0
    let mercyCallN = 0
    const lastAction = ref<{ text: string; n: number } | null>(null)
    const lastRemotePlay = ref<{ userId: string; card: Card; n: number } | null>(null)
    // One-shot FX signals from the server: who ate a +N stack, who called Mercy.
    // The monotonic `n` makes the view's watcher fire even on identical repeats.
    const lastStackEaten = ref<{ playerId: string; amount: number; n: number } | null>(null)
    const lastMercyCall = ref<{ playerId: string; n: number } | null>(null)
    // Another seat crossed into a new badge — drives the in-room banner.
    const lastBadgeUp = ref<{ name: string; tier: number; n: number } | null>(null)
    // Public-lobby auto-start countdown, mirrored from presence frames. The
    // server sends a duration; anchoring it to the local clock here makes the
    // deadline immune to client clock skew.
    // bumpsLeft is the room's remaining allowance to hold the lobby open; an
    // older worker sends none, so the button simply never shows.
    const autoStart = ref<{ deadline: number; paused: boolean; bumpsLeft: number } | null>(null)
    // Quick chat: newest frame (drives bubbles) + a capped per-match log.
    // Mutes are client-side and room-scoped — a muted sender's frames are
    // dropped at receive, instantly and without a server round trip.
    const lastChat = ref<{ userId: string; name: string; text: string; n: number } | null>(null)
    const chatLog = ref<{ userId: string; name: string; text: string; n: number }[]>([])
    const mutedChatIds = ref<Set<string>>(new Set())
    let chatN = 0
    let badgeUpN = 0
    let actionN = 0
    let playN = 0
    let intentN = 0

    const mpStats = ref({
        peakCards: 0,
        drawCardsPlayed: 0,
        wildCardsPlayed: 0,
        cardsPlayedTotal: 0,
        skipsDealt: 0,
        swapsMade: 0,
        drawsTaken: 0,
        biggestStackSurvived: 0,
        unoCalls: 0,
        unoPenalties: 0,
    })

    // One in-flight optimistic intent: remember the pre-mutation view so a
    // server rejection can roll the render back.
    let pendingIntent: { id: string; prevView: PersonalView | null } | null = null

    // --- Analytics clocks (never affect gameplay) ---
    // STARTED only fires on a real deal (never a reconnect); the player count
    // lives in the snapshot that follows, so the event arms and the snapshot fires.
    let pendingStartTrack = false
    let trackedGameId: string | null = null
    let gameStartedAt = 0
    let roomJoinedAt = 0

    // --- Adapters: legacy row shapes the views already consume ---

    function hiddenHand(userId: string, count: number): Card[] {
        return Array.from({ length: count }, (_, i) => ({
            id: `hidden-${userId}-${i}`, color: 'red' as CardColor, type: 'number' as const, value: 0,
        }))
    }

    // A joiner with no seat in a finished game (a stale invite link, or a
    // directory race serving a room right as its game ended) must not stare
    // at someone else's game-over. Treat the room as its waiting room — the
    // next deal seats everyone connected, this joiner included.
    const ghostInFinishedGame = computed(() => {
        const v = view.value
        const me = myUserId.value
        return !!v && v.status === 'finished' && !!me && !v.players.some(p => p.userId === me)
    })

    const currentGame = computed<GameRow | null>(() => {
        const v = view.value
        if (!v || !roomCodeRef.value) return null
        return {
            id: v.gameId ?? roomCode.value,
            room_code: roomCode.value,
            status: v.status === 'lobby' || ghostInFinishedGame.value ? 'waiting' : v.status,
            host_id: v.hostUserId ?? hostUserId.value ?? '',
            current_player_id: v.currentPlayerId,
            direction: v.direction,
            draw_stack: v.drawStack,
            current_color: v.currentColor,
            deck: Array.from({ length: v.deckCount }),
            discard_pile: v.discardTop ? [v.discardTop] : [],
            winner_id: v.winnerId,
            turn_state: v.turnState,
            roulette_target_color: v.rouletteTargetColor,
            eliminated_user_ids: v.players.filter(p => p.isEliminated).map(p => p.userId),
            stacking_mode: v.stackingMode,
            is_public: false,
            version: lastSeq,
            created_at: '',
            updated_at: '',
        }
    })

    const gamePlayers = computed<GamePlayerRow[]>(() => {
        const v = view.value
        if (v && v.status !== 'lobby' && !ghostInFinishedGame.value) {
            return v.players.map(p => ({
                id: p.userId,
                game_id: roomCodeRef.value ?? '',
                user_id: p.userId,
                name: p.name,
                hand: p.userId === myUserId.value ? (v.you?.hand ?? []) : hiddenHand(p.userId, p.handCount),
                seat_order: p.seat,
                is_eliminated: p.isEliminated,
                has_called_uno: p.calledUno,
                score: 0,
                joined_at: '',
            }))
        }
        // Waiting room: live presence is the roster.
        return presence.value.map((p, i) => ({
            id: p.userId, game_id: roomCodeRef.value ?? '', user_id: p.userId, name: p.name,
            hand: [], seat_order: i, is_eliminated: false, has_called_uno: false, score: 0, joined_at: '',
        }))
    })

    const myPlayer = computed(() => gamePlayers.value.find(p => p.user_id === myUserId.value) ?? null)
    const opponents = computed(() => gamePlayers.value.filter(p => p.user_id !== myUserId.value))
    const opponent = computed(() => opponents.value[0] ?? null)
    const eliminatedIds = computed(() => new Set((view.value?.players ?? []).filter(p => p.isEliminated).map(p => p.userId)))
    const playersLeft = computed(() => (view.value?.players ?? []).filter(p => !p.isEliminated).length)
    // First knocked out of N places Nth; only meaningful once I'm out.
    const myPlacement = computed(() => {
        const me = myUserId.value
        const total = view.value?.players.length ?? 0
        const idx = me ? eliminationOrder.value.indexOf(me) : -1
        return idx === -1 || total === 0 ? null : total - idx
    })
    const isHost = computed(() => !!myUserId.value && (view.value?.hostUserId ?? hostUserId.value) === myUserId.value)
    const isMyTurn = computed(() => view.value?.status === 'playing' && view.value.currentPlayerId === myUserId.value)
    const gameStatus = computed(() => currentGame.value?.status ?? null)
    // Arrays, not Sets — the views call .includes()/.length on these.
    const presentUserIds = computed(() => presence.value.filter(p => p.connected).map(p => p.userId))
    const disconnectedUserIds = computed(() => {
        const connected = new Set(presentUserIds.value)
        return (view.value?.players ?? []).map(p => p.userId).filter(id => !connected.has(id))
    })
    const pendingDrawnWildCard = computed(() => view.value?.pendingDrawnWildCard ?? null)
    const pendingDiscardAllCards = computed(() => view.value?.pendingDiscardAllCards ?? [])

    // --- Wire handling ---

    function playerName(userId: string): string {
        return view.value?.players.find(p => p.userId === userId)?.name
            ?? presence.value.find(p => p.userId === userId)?.name
            ?? 'PLAYER'
    }

    function shout(text: string) {
        lastAction.value = { text, n: ++actionN }
    }

    function handleServerMsg(msg: ServerMsg) {
        switch (msg.t) {
            case 'hello':
                myUserId.value = msg.userId
                hostUserId.value = msg.hostUserId
                realtimeStatus.value = 'SUBSCRIBED'
                reconnectAttempts = 0
                break

            case 'presence':
                presence.value = msg.players
                autoStart.value = typeof msg.autoStartInMs === 'number'
                    ? {
                        deadline: Date.now() + msg.autoStartInMs,
                        paused: !!msg.autoStartPaused,
                        bumpsLeft: msg.autoStartBumpsLeft ?? 0,
                    }
                    : null
                break

            case 'badge-up': {
                const name = view.value?.players.find(p => p.userId === msg.userId)?.name
                    ?? presence.value.find(p => p.userId === msg.userId)?.name
                    ?? 'A player'
                lastBadgeUp.value = { name, tier: msg.tier, n: ++badgeUpN }
                break
            }

            case 'invite-result': {
                const settle = invitePending.get(msg.userId)
                if (settle) {
                    invitePending.delete(msg.userId)
                    settle(msg.result)
                }
                break
            }

            case 'chat': {
                if (mutedChatIds.value.has(msg.userId)) break
                const phrase = quickChatPhrase(msg.phraseId)
                if (!phrase) break
                const entry = { userId: msg.userId, name: playerName(msg.userId), text: phrase.text, n: ++chatN }
                chatLog.value = [...chatLog.value.slice(-49), entry]
                lastChat.value = entry
                break
            }

            case 'snapshot':
                if (msg.seq < lastSeq) break
                lastSeq = msg.seq
                view.value = msg.game
                stackingMode.value = msg.game.stackingMode
                pendingIntent = null
                actionInProgress.value = false
                if (msg.game.you && msg.game.you.hand.length > mpStats.value.peakCards) {
                    mpStats.value.peakCards = msg.game.you.hand.length
                }
                if (pendingStartTrack && msg.game.status === 'playing') {
                    pendingStartTrack = false
                    track('mp_game_started', {
                        players: msg.game.players.length,
                        rules: msg.game.stackingMode,
                        rematch: trackedGameId !== null,
                    })
                    trackedGameId = msg.game.gameId
                    gameStartedAt = Date.now()
                }
                break

            case 'event': {
                const ev = msg.ev
                switch (ev.t) {
                    case 'STARTED':
                        autoStart.value = null
                        // Fresh deal (first game or a rematch) — stats are per game.
                        mpStats.value = {
                            peakCards: 0, drawCardsPlayed: 0, wildCardsPlayed: 0, cardsPlayedTotal: 0,
                            skipsDealt: 0, swapsMade: 0, drawsTaken: 0, biggestStackSurvived: 0,
                            unoCalls: 0, unoPenalties: 0,
                        }
                        catchableUserId.value = null
                        // Rematch re-seats spectating ex-players automatically.
                        if (spectatedThisGame) track('mp_spectate_rematch_joined', { rules: stackingMode.value })
                        eliminationOrder.value = []
                        selfEliminated.value = null
                        spectateStartedAt = 0
                        spectatedThisGame = false
                        pendingStartTrack = true
                        break

                    case 'GAME_OVER':
                        track('mp_game_finished', {
                            players: view.value?.players.length,
                            result: ev.winnerId === myUserId.value ? 'won' : 'lost',
                            duration_seconds: gameStartedAt ? Math.round((Date.now() - gameStartedAt) / 1000) : undefined,
                            rules: stackingMode.value,
                        })
                        if (spectateStartedAt) {
                            track('mp_spectate_end', {
                                via: 'game_over',
                                seconds: Math.round((Date.now() - spectateStartedAt) / 1000),
                            })
                            spectateStartedAt = 0
                        }
                        break
                    case 'CARD_PLAYED':
                        if (ev.by !== myUserId.value) {
                            lastRemotePlay.value = { userId: ev.by, card: ev.card, n: ++playN }
                        } else {
                            mpStats.value.cardsPlayedTotal++
                            if (ev.card.color === 'wild') mpStats.value.wildCardsPlayed++
                            if (getDrawValue(ev.card) > 0) mpStats.value.drawCardsPlayed++
                            if (ev.card.type === 'skip' || ev.card.type === 'skipEveryone') mpStats.value.skipsDealt++
                        }
                        break
                    case 'YOU_DREW':
                        mpStats.value.drawsTaken++
                        break
                    case 'STACK_EATEN':
                        lastStackEaten.value = { playerId: ev.playerId, amount: ev.amount, n: ++stackEatenN }
                        break
                    case 'ELIMINATED':
                        if (!eliminationOrder.value.includes(ev.playerId)) eliminationOrder.value.push(ev.playerId)
                        shout(`${playerName(ev.playerId)} is ELIMINATED`)
                        if (catchableUserId.value === ev.playerId) catchableUserId.value = null
                        if (ev.playerId === myUserId.value && !selfEliminated.value) {
                            selfEliminated.value = { n: ++koN }
                            spectateStartedAt = Date.now()
                            spectatedThisGame = true
                            // The event outruns its snapshot, so the view still counts me as alive.
                            track('mp_spectate_start', { players_left: Math.max(0, playersLeft.value - 1) })
                        }
                        break
                    case 'UNO_CALLED':
                        if (ev.playerId === myUserId.value) mpStats.value.unoCalls++
                        shout(`${playerName(ev.playerId)} called MERCY`)
                        lastMercyCall.value = { playerId: ev.playerId, n: ++mercyCallN }
                        if (catchableUserId.value === ev.playerId) catchableUserId.value = null
                        break
                    case 'UNO_WINDOW_OPEN':
                        catchableUserId.value = ev.playerId
                        break
                    case 'UNO_WINDOW_CLOSED':
                        if (catchableUserId.value === ev.playerId) catchableUserId.value = null
                        break
                    case 'UNO_PENALTY':
                        if (ev.playerId === myUserId.value) mpStats.value.unoPenalties++
                        shout(`${playerName(ev.playerId)} got caught — draw 10`)
                        break
                    case 'TURN_AUTO_RESOLVED':
                        shout(`${playerName(ev.playerId)} was away — turn resolved`)
                        break
                }
                break
            }

            case 'voice-token':
                useVoiceStore().onVoiceToken(msg.token)
                break

            case 'error':
                if (msg.code === 'voice-unavailable') {
                    useVoiceStore().onVoiceUnavailable()
                    break
                }
                if (msg.code === 'need-players') {
                    error.value = 'Need at least 2 connected players to start'
                }
                if (msg.code === 'not-ready') error.value = 'Every connected player must be ready'
                if (msg.code === 'name-invalid') error.value = 'Name must contain 2 to 16 characters'
                if (msg.code === 'name-taken') error.value = 'That name is already taken in this room'
                if (msg.intentId && pendingIntent?.id === msg.intentId) {
                    // Server refused the intent — roll the optimistic render back.
                    view.value = pendingIntent.prevView
                    pendingIntent = null
                    actionInProgress.value = false
                }
                if (msg.code === 'room-not-found') {
                    try { localStorage.removeItem(STORED_ROOM_KEY) } catch { /* noop */ }
                }
                break

            case 'pong':
                break
        }
    }

    function wsUrl(code: string): string {
        return GAME_SERVER.replace(/^http/, 'ws') + `/room/${code}/ws`
    }

    async function accessToken(): Promise<string | null> {
        const { data } = await supabase.auth.getSession()
        return data.session?.access_token ?? null
    }

    function myNickname(): string {
        return authStore.username || 'PLAYER'
    }

    /** Open + authenticate a socket to a room. Resolves true on the first
     *  snapshot, false on refusal/transport failure, and 'superseded' when a
     *  newer connect() replaced this attempt mid-flight (callers must treat
     *  that as "stand down", never as a failure to clean up after). */
    async function connect(code: string): Promise<boolean | 'superseded'> {
        const token = await accessToken()
        if (!token) { error.value = 'You must be logged in to play online'; return false }

        closedByUs = false
        connectFailReason = null
        realtimeStatus.value = 'CONNECTING'
        // Supersede any previous socket. Null the ref first so its close
        // handler sees itself replaced and neither reconnects nor touches
        // shared state — a late restore socket racing a quick match used to
        // overwrite the new room's state with the old room's game-over.
        const prev = ws
        ws = null
        try { prev?.close() } catch { /* noop */ }
        return new Promise<boolean | 'superseded'>((resolve) => {
            const socket = new WebSocket(wsUrl(code))
            ws = socket
            let settled = false
            const timer = setTimeout(() => {
                // Same guard as onclose: a superseded socket whose closing
                // handshake stalls must not resolve its old caller as failed.
                if (ws !== socket) { settle('superseded'); return }
                connectFailReason ??= 'timeout'
                try { socket.close() } catch { /* noop */ }
                settle(false)
            }, CONNECT_TIMEOUT_MS)
            const settle = (result: boolean | 'superseded') => { if (!settled) { settled = true; clearTimeout(timer); resolve(result) } }

            socket.onopen = () => {
                socket.send(JSON.stringify({ t: 'auth', token, name: couchConnectionName ?? myNickname(), skin: getEquippedId() } satisfies ClientMsg))
            }
            socket.onmessage = (e) => {
                // Only the current socket may drive the store.
                if (ws !== socket) return
                const msg = JSON.parse(e.data) as ServerMsg
                if (msg.t === 'hello') {
                    roomCodeRef.value = code
                    storeRoom(code)
                }
                if (msg.t === 'error' && (msg.code === 'unauthorized' || msg.code === 'room-not-found' || msg.code === 'room-full')) {
                    error.value = msg.code === 'room-not-found' ? ROOM_GONE
                        : msg.code === 'room-full' ? 'Game is full (max 20 players)'
                        : 'Could not authenticate'
                    settle(false)
                }
                handleServerMsg(msg)
                // Settle on the first snapshot, not hello — callers read
                // currentGame off the result, and the view fills in here.
                if (msg.t === 'snapshot') settle(true)
            }
            // No settle on error: the close event that always follows carries the code,
            // and settling early would read the failure before the code arrives.
            socket.onclose = (e) => {
                if (ws !== socket) {
                    // A newer connect() took over mid-flight. This attempt is
                    // void, not failed — its caller must not run failure
                    // cleanup against the room that superseded it, and it must
                    // not pollute connectFailReason for the newer attempt.
                    settle('superseded')
                    return
                }
                if (!settled && !error.value) connectFailReason ??= `ws_closed_${e?.code ?? 'unknown'}`
                settle(false)
                realtimeStatus.value = 'CLOSED'
                if (e?.reason === 'kicked') {
                    // Being removed ends the whole session — voice included.
                    closedByUs = true
                    void useVoiceStore().leaveVoice()
                    try { localStorage.removeItem(STORED_ROOM_KEY) } catch { /* noop */ }
                    resetState()
                    error.value = 'You were removed from the room'
                    return
                }
                if (!closedByUs && roomCodeRef.value) scheduleReconnect()
            }
        })
    }

    function scheduleReconnect() {
        if (reconnectTimer) return
        const delay = Math.min(1000 * 2 ** reconnectAttempts, 10_000)
        reconnectAttempts++
        realtimeStatus.value = 'CONNECTING'
        reconnectTimer = setTimeout(async () => {
            reconnectTimer = null
            if (closedByUs || !roomCodeRef.value) return
            const ok = await connect(roomCodeRef.value)
            if (ok === false && !closedByUs && roomCodeRef.value) scheduleReconnect()
        }, delay)
    }

    function sendMsg(msg: ClientMsg) {
        if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg))
    }

    /** Drop the socket and forget the room, without the leave ceremony —
     *  for backing out of a room we should never have sat down in. */
    function quietDisconnect() {
        closedByUs = true
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        const prev = ws
        ws = null
        try { prev?.close() } catch { /* noop */ }
        realtimeStatus.value = 'CLOSED'
        try { localStorage.removeItem(STORED_ROOM_KEY) } catch { /* noop */ }
        resetState()
    }

    function sendBadgeUp(tier: number) {
        sendMsg({ t: 'badge-up', tier })
    }

    function sendChat(phraseId: string) {
        sendMsg({ t: 'chat', phraseId })
    }

    // One pending invite per target, resolved by the room's answer. The room
    // owns this rather than the invite store, because only a socket that is
    // seated in the room can send it - which is exactly what makes the invite
    // trustworthy at the other end.
    const invitePending = new Map<string, (result: string) => void>()

    /** Ask a player to this room. Resolves with the room's verdict, or
     *  'unavailable' if the answer never comes. */
    function sendInvite(userId: string): Promise<string> {
        if (!roomCodeRef.value || ws?.readyState !== WebSocket.OPEN) return Promise.resolve('unavailable')
        invitePending.get(userId)?.('unavailable')
        return new Promise((resolve) => {
            const timer = setTimeout(() => {
                if (invitePending.get(userId) === settle) invitePending.delete(userId)
                resolve('unavailable')
            }, 8_000)
            const settle = (result: string) => { clearTimeout(timer); resolve(result) }
            invitePending.set(userId, settle)
            sendMsg({ t: 'invite', userId })
        })
    }

    /** Ask the room to wait a minute longer before it deals itself. */
    function extendAutoStart() {
        if (!autoStart.value?.bumpsLeft) return
        sendMsg({ t: 'extend-start' })
        // Spend the allowance locally too. It belongs to the room, so a
        // second press can only ever be refused - and the server refuses it
        // silently, which used to leave a live-looking button on screen until
        // some other presence change happened to arrive. Two players pressing
        // together is exactly when that bites.
        autoStart.value = { ...autoStart.value, bumpsLeft: 0 }
    }

    function toggleChatMute(userId: string) {
        const next = new Set(mutedChatIds.value)
        if (next.has(userId)) next.delete(userId)
        else next.add(userId)
        mutedChatIds.value = next
    }

    function sendIntent(action: IntentAction, opts: { optimistic?: (v: PersonalView) => void } = {}) {
        const id = `i${++intentN}`
        if (opts.optimistic && view.value) {
            pendingIntent = { id, prevView: JSON.parse(JSON.stringify(view.value)) }
            opts.optimistic(view.value)
        }
        sendMsg({ t: 'intent', id, action })
    }

    // --- Lobby actions ---

    function resetState() {
        pendingStartTrack = false
        trackedGameId = null
        gameStartedAt = 0
        roomJoinedAt = 0
        view.value = null
        presence.value = []
        roomCodeRef.value = null
        hostUserId.value = null
        lastSeq = 0
        pendingIntent = null
        actionInProgress.value = false
        suppressDiscardSlam.value = false
        opponentLeft.value = false
        eliminationOrder.value = []
        selfEliminated.value = null
        spectateStartedAt = 0
        spectatedThisGame = false
        lastAction.value = null
        lastRemotePlay.value = null
        lastStackEaten.value = null
        lastMercyCall.value = null
        autoStart.value = null
        lastChat.value = null
        chatLog.value = []
        mutedChatIds.value = new Set()
        error.value = null
        mpStats.value = {
            peakCards: 0, drawCardsPlayed: 0, wildCardsPlayed: 0, cardsPlayedTotal: 0,
            skipsDealt: 0, swapsMade: 0, drawsTaken: 0, biggestStackSurvived: 0,
            unoCalls: 0, unoPenalties: 0,
        }
    }

    async function createRoom(mode: StackingMode, isPublic: boolean): Promise<string | null> {
        const token = await accessToken()
        if (!token) { error.value = 'You must be logged in to create a game'; return null }
        try {
            const res = await fetch(`${GAME_SERVER}/rooms`, {
                method: 'POST',
                headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                body: JSON.stringify({ stackingMode: mode, public: isPublic }),
            })
            if (!res.ok) { error.value = 'Could not create the room'; return null }
            const { code } = await res.json() as { code: string }
            return code
        } catch {
            // Network/CORS failure — surface it instead of dying silently.
            error.value = 'Could not reach the game server'
            return null
        }
    }

    // 'live' is a join from the lobby's live-games entry — kept distinct from
    // 'quick_match' so we can tell whether showing the room actually converts.
    type JoinMethod = 'created' | 'code' | 'link' | 'quick_match' | 'restore' | 'live'

    function trackJoined(method: JoinMethod) {
        roomJoinedAt = Date.now()
        track('mp_room_joined', { method })
    }

    // Every failed connect reports why and via which entry point, so the true
    // join-failure surface is visible — not just the code/link join path.
    // `method` reuses the mp_room_joined dimension so failures slice the same way.
    function trackJoinFailed(method: JoinMethod, attempt: 1 | 2) {
        track('mp_join_failed', { reason: error.value ?? connectFailReason ?? 'unknown', attempt, method })
    }

    /**
     * Connect, retrying once when the failure carried no server verdict — a
     * dropped handshake or a cold Durable Object. A refusal the server spelled
     * out (room gone, room full, unauthorized) is final and retrying it just
     * doubles the wait before the same answer.
     */
    async function connectWithRetry(code: string, method: JoinMethod): Promise<boolean | 'superseded'> {
        const first = await connect(code)
        if (first !== false) return first
        trackJoinFailed(method, 1)
        if (error.value) return false
        await new Promise(r => setTimeout(r, JOIN_RETRY_BACKOFF_MS))
        const second = await connect(code)
        if (second === false) {
            trackJoinFailed(method, 2)
            // Transport failures carry no server message — leave the user an
            // actionable one instead of a silent reset.
            if (!error.value) error.value = 'Could not reach the game server'
        }
        return second
    }

    async function createGame(mode: StackingMode = DEFAULT_STACKING_MODE) {
        loading.value = true
        error.value = null
        resetState()
        try {
            const code = await createRoom(mode, false)
            if (!code) return null
            stackingMode.value = mode
            track('mp_room_created', { rules: mode, visibility: 'private' })
            // Room exists server-side but we couldn't reach it — a host-side
            // failure that was previously invisible to analytics, and until now
            // had no retry either. A superseded attempt is not a failure.
            const res = await connectWithRetry(code, 'created')
            if (res !== true) return null
            trackJoined('created')
            return currentGame.value
        } finally {
            loading.value = false
        }
    }

    async function joinGame(code: string, via: 'code' | 'link' | 'live' = 'code') {
        loading.value = true
        error.value = null
        resetState()
        try {
            const ok = await connectWithRetry(code.trim().toUpperCase(), via)
            if (ok !== true) return null
            trackJoined(via)
            return currentGame.value
        } finally {
            loading.value = false
        }
    }

    /** Join the private phone-controller route with the name chosen there. */
    async function joinCouchGame(code: string, name: string) {
        loading.value = true
        error.value = null
        resetState()
        couchConnectionName = name.trim()
        try {
            const ok = await connectWithRetry(code.trim().toUpperCase(), 'code')
            return ok === true ? currentGame.value : null
        } finally {
            loading.value = false
        }
    }

    async function quickMatch(mode: StackingMode = DEFAULT_STACKING_MODE) {
        loading.value = true
        error.value = null
        resetState()
        try {
            const codes = await fetch(`${GAME_SERVER}/public-rooms`)
                .then(res => (res.ok ? (res.json() as Promise<string[]>) : []))
                .catch(() => [] as string[])
            for (const code of codes) {
                // Each candidate is a fresh attempt — a rejected one (full,
                // vanished) must not leave its verdict on screen over the
                // room we do get into.
                error.value = null
                const res = await connect(code)
                // Another flow (a restore, a second tap) took over — stand down.
                if (res === 'superseded') return null
                if (res === true) {
                    // Directory races aside, never sit down in a room whose
                    // game is not in its lobby — a finished room renders
                    // someone else's game-over on arrival.
                    if (view.value?.status === 'lobby') {
                        trackJoined('quick_match')
                        return code
                    }
                    quietDisconnect()
                }
            }
            // Nothing open — host a public room and wait for company.
            error.value = null
            const code = await createRoom(mode, true)
            if (!code) return null
            stackingMode.value = mode
            track('mp_room_created', { rules: mode, visibility: 'public' })
            const hosted = await connectWithRetry(code, 'quick_match')
            if (hosted !== true) return null
            trackJoined('quick_match')
            return currentGame.value
        } finally {
            loading.value = false
        }
    }

    /** Resume the room stored from a previous session (page refresh). */
    async function restoreActiveGame() {
        const code = storedRoom()
        if (!code) return
        const ok = await connect(code)
        // The user out-clicked the restore (quick match, a code join) and a
        // newer connect superseded it: the new room's state must survive.
        if (ok === 'superseded') return
        if (!ok) {
            // Refresh into a room that's since closed — track before resetState
            // wipes the reason.
            //
            // A GC'd room is the normal end of a room's life, not a join the
            // player asked for and lost. Counting it as one made restore the
            // single largest bucket in mp_join_failed (214 of 449 "Room not
            // found" events in the 30 days to 2026-08-14) and hid the real
            // failures behind it. A transport failure here is still genuine.
            if (error.value === ROOM_GONE) track('mp_restore_expired')
            else trackJoinFailed('restore', 1)
            try { localStorage.removeItem(STORED_ROOM_KEY) } catch { /* noop */ }
            resetState()
            return
        }
        // A restore that lands in a finished game this user never sat in is
        // the ghost trap, not a resume — forget the room. A finished game
        // they DID sit in keeps its game-over (and the rematch button).
        if (ghostInFinishedGame.value) {
            quietDisconnect()
            return
        }
        // A restored game keeps its identity so a rematch isn't miscounted
        // as a first game, and finish duration isn't nonsense.
        trackedGameId = view.value?.gameId ?? null
        gameStartedAt = 0
        trackJoined('restore')
    }

    async function startGame() {
        sendMsg({ t: 'start', stackingMode: stackingMode.value })
    }

    /** The voice store asks for a RealtimeKit token over the game socket. */
    function requestVoiceJoin() {
        sendMsg({ t: 'voice-join' })
    }

    async function leaveGame() {
        track('mp_room_left', {
            phase: view.value?.status,
            seconds_in_room: roomJoinedAt ? Math.round((Date.now() - roomJoinedAt) / 1000) : undefined,
        })
        if (spectateStartedAt) {
            track('mp_spectate_end', {
                via: 'leave',
                seconds: Math.round((Date.now() - spectateStartedAt) / 1000),
            })
            spectateStartedAt = 0
        }
        // Leaving the room leaves its voice channel; rematches keep it.
        void useVoiceStore().leaveVoice()
        closedByUs = true
        if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
        sendMsg({ t: 'leave' })
        ws?.close()
        ws = null
        realtimeStatus.value = 'CLOSED'
        try { localStorage.removeItem(STORED_ROOM_KEY) } catch { /* noop */ }
        resetState()
    }

    async function kickPlayer(userId: string) {
        sendMsg({ t: 'kick', userId })
        // Eject them from the voice channel too (host permission; no-op otherwise —
        // the kicked client also leaves voice itself when its socket closes).
        void useVoiceStore().kickFromVoice(userId)
    }

    async function updateMyName(name: string) {
        couchConnectionName = name.trim()
        sendMsg({ t: 'rename', name })
    }

    function setReady(ready: boolean) {
        sendMsg({ t: 'ready', ready })
    }

    // --- Game intents ---

    async function playCard(card: Card, selectedColor?: CardColor) {
        if (!isMyTurn.value || actionInProgress.value) return
        actionInProgress.value = true
        suppressDiscardSlam.value = true
        sendIntent({ kind: 'PLAY_CARD', cardId: card.id, chosenColor: selectedColor }, {
            // Optimistic echo: the card leaves the hand and lands on the pile
            // now; the authoritative snapshot confirms (or the error rolls back).
            optimistic: (v) => {
                if (v.you) v.you.hand = v.you.hand.filter(c => c.id !== card.id)
                v.discardTop = card
                if (card.type !== 'wildColorRoulette') {
                    v.currentColor = card.color === 'wild' ? (selectedColor ?? v.currentColor) : card.color
                }
            },
        })
    }

    async function drawCard() {
        if (!isMyTurn.value || actionInProgress.value) return
        actionInProgress.value = true
        const stack = view.value?.drawStack ?? 0
        if (stack > mpStats.value.biggestStackSurvived) mpStats.value.biggestStackSurvived = stack
        sendIntent({ kind: 'DRAW' })
    }

    async function swapHands(targetUserId: string) {
        mpStats.value.swapsMade++
        sendIntent({ kind: 'SWAP_HANDS', targetUserId })
    }

    async function skipSwap() {
        sendIntent({ kind: 'SKIP_SWAP' })
    }

    async function setRouletteColor(color: CardColor) {
        sendIntent({ kind: 'SET_ROULETTE_COLOR', color })
    }

    async function playDrawnWildCard(color: CardColor) {
        sendIntent({ kind: 'CHOOSE_DRAWN_WILD_COLOR', color })
    }

    async function selectDiscardAllTop(cardId: string) {
        sendIntent({ kind: 'PICK_DISCARD_ALL_TOP', cardId })
    }

    async function callUno() {
        sendIntent({ kind: 'CALL_UNO' })
    }

    async function catchPlayer(userId: string) {
        if (catchableUserId.value !== userId) return
        sendIntent({ kind: 'CATCH_UNO', targetUserId: userId })
    }

    return {
        currentGame,
        gamePlayers,
        myPlayer,
        myUserId,
        opponent,
        opponents,
        eliminatedIds,
        playersLeft,
        myPlacement,
        selfEliminated,
        loading,
        error,
        isHost,
        isMyTurn,
        gameStatus,
        roomCode,
        stackingMode,
        opponentLeft,
        realtimeStatus,
        actionInProgress,
        suppressDiscardSlam,
        pendingDrawnWildCard,
        pendingDiscardAllCards,
        presentUserIds,
        presence,
        disconnectedUserIds,
        lastAction,
        lastRemotePlay,
        lastStackEaten,
        lastMercyCall,
        lastBadgeUp,
        autoStart,
        extendAutoStart,
        sendInvite,
        lastChat,
        chatLog,
        mutedChatIds,
        sendChat,
        toggleChatMute,
        sendBadgeUp,
        eliminationOrder,
        ghostInFinishedGame,
        catchableUserId,
        catchPlayer,
        mpStats,
        createGame,
        joinGame,
        joinCouchGame,
        quickMatch,
        restoreActiveGame,
        startGame,
        playCard,
        drawCard,
        swapHands,
        skipSwap,
        setRouletteColor,
        playDrawnWildCard,
        selectDiscardAllTop,
        callUno,
        kickPlayer,
        updateMyName,
        setReady,
        requestVoiceJoin,
        leaveGame,
    }
})
