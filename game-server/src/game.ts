import * as engine from '../../shared/engine'
import type { Card, EngineEvent, EngineState, StackingMode } from '../../shared/engine'
import { chooseCard, chooseDiscardAllTop, chooseSwapTarget, chooseWildColor, wantsSwap, type BotProfile } from '../../shared/engine/bot'
import { MAX_TURN_TIMEOUTS, type GameEvent, type IntentAction, type PersonalView, type SnapshotPlayer } from './protocol'
import { isWildColor } from './validate'

export interface PlayerGameStats {
    cardsPlayedTotal: number
    drawCardsPlayed: number
    wildCardsPlayed: number
    skipsDealt: number
    swapsMade: number
    drawsTaken: number
    peakCards: number
    biggestStackSurvived: number
    unoCalls: number
    unoPenalties: number
}

export function emptyStats(): PlayerGameStats {
    return {
        cardsPlayedTotal: 0, drawCardsPlayed: 0, wildCardsPlayed: 0, skipsDealt: 0,
        swapsMade: 0, drawsTaken: 0, peakCards: 0, biggestStackSurvived: 0,
        unoCalls: 0, unoPenalties: 0,
    }
}

export interface GameRecord {
    engine: EngineState
    /** Card drawn via draw-until-playable that is a wild — waiting for its color. */
    pendingDrawnWildCardId: string | null
    startedAt: number
    /** Per-player stats, persisted to game_results at game end. */
    stats?: Record<string, PlayerGameStats>
    resultsLogged?: boolean
    /** A seat was kicked out of this game. Such games are not scored: a host
     *  could otherwise kick the table and farm wins. */
    hadKick?: boolean
    /** Turns in a row each seat let the clock run out; any move of its own resets it. */
    timeouts?: Record<string, number>
    /** Seats taken out for running out the clock MAX_TURN_TIMEOUTS turns in a row. */
    timedOut?: string[]
    /** The last opponent was taken out by the clock. The winner's row is not
     *  saved, so idling a second account cannot farm a win; the timed-out
     *  seat's loss still is, so closing the tab cannot erase one. */
    timeoutWalkover?: boolean
}

export function statsFor(game: GameRecord, userId: string): PlayerGameStats {
    if (!game.stats) game.stats = {}
    return (game.stats[userId] ??= emptyStats())
}

/** Fold a batch of wire events into the per-player stats. */
export function updateStats(game: GameRecord, events: GameEvent[]): void {
    for (const ev of events) {
        switch (ev.t) {
            case 'CARD_PLAYED': {
                const s = statsFor(game, ev.by)
                s.cardsPlayedTotal++
                if (ev.card.color === 'wild') s.wildCardsPlayed++
                if (engine.getDrawValue(ev.card) > 0) s.drawCardsPlayed++
                if (ev.card.type === 'skip' || ev.card.type === 'skipEveryone') s.skipsDealt++
                break
            }
            case 'YOU_DREW': {
                const owner = (ev as GameEvent & { _owner?: string })._owner
                if (owner) statsFor(game, owner).drawsTaken += ev.cards.length
                break
            }
            case 'UNO_CALLED':
                statsFor(game, ev.playerId).unoCalls++
                break
            case 'UNO_PENALTY':
                statsFor(game, ev.playerId).unoPenalties++
                break
        }
    }
    for (const p of game.engine.players) {
        const s = statsFor(game, p.id)
        if (p.hand.length > s.peakCards) s.peakCards = p.hand.length
    }
}

export interface SeatedPlayer {
    userId: string
    name: string
}

export interface IntentResult {
    ok: boolean
    errorCode?: 'invalid-intent'
    /** Engine + synthesized events, in order; personalize with viewEventFor. */
    events: GameEvent[]
    /** Events only the acting player should receive (e.g. their drawn cards). */
    privateEvents?: { userId: string; events: GameEvent[] }[]
}

/** Deal and start a game for the seated players (roster join order = seats). */
export function startGame(players: SeatedPlayer[], stackingMode: StackingMode): { game: GameRecord; events: GameEvent[] } {
    const s: EngineState = {
        players: players.map(p => ({ id: p.userId, name: p.name, hand: [], isEliminated: false, score: 0 })),
        deck: engine.shuffleDeck(engine.generateFullDeck()),
        discardPile: [],
        currentPlayerIndex: 0,
        direction: 1,
        drawStack: 0,
        currentColor: 'red',
        turnState: 'WAITING_FOR_ACTION',
        gameState: 'PLAYING',
        winnerId: null,
        rouletteTargetColor: null,
        pendingDiscardAllCards: [],
        swapInitiatorId: null,
        hasCalledUno: {},
        stackingMode,
    }

    // Server-side deal: hands never leave this object except to their owner.
    for (let round = 0; round < 7; round++) {
        for (const p of s.players) {
            const card = s.deck.pop()
            if (card) p.hand.push(card)
        }
    }
    const ev: EngineEvent[] = []
    engine.drawFirstDiscard(s, ev)

    const stats: Record<string, PlayerGameStats> = {}
    for (const p of s.players) {
        stats[p.id] = emptyStats()
        stats[p.id]!.peakCards = p.hand.length
    }

    return {
        game: { engine: s, pendingDrawnWildCardId: null, startedAt: Date.now(), stats, resultsLogged: false },
        events: [{ t: 'STARTED' }, ...translateEngineEvents(ev)],
    }
}

/** Apply one client intent to the authoritative state. Fully synchronous. */
export function applyIntent(game: GameRecord, userId: string, action: IntentAction): IntentResult {
    const s = game.engine
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }

    if (s.gameState !== 'PLAYING') return invalid

    // CALL_UNO is the only intent allowed off-turn.
    if (action.kind === 'CALL_UNO') {
        const player = s.players.find(p => p.id === userId)
        if (!player || player.isEliminated || player.hand.length > 2) return invalid
        s.hasCalledUno[userId] = true
        return { ok: true, events: [{ t: 'UNO_CALLED', playerId: userId }] }
    }

    if (engine.currentPlayer(s)?.id !== userId) return invalid

    switch (action.kind) {
        case 'PLAY_CARD': {
            if (s.turnState !== 'WAITING_FOR_ACTION') return invalid
            if (action.chosenColor !== undefined && !isWildColor(action.chosenColor)) return invalid
            const card = engine.currentPlayer(s)?.hand.find(c => c.id === action.cardId)
            if (!card) return invalid
            const res = engine.playCard(s, userId, action.cardId, { selectedColor: action.chosenColor })
            if (!res.ok) return invalid
            return {
                ok: true,
                events: [
                    { t: 'CARD_PLAYED', by: userId, card, chosenColor: action.chosenColor },
                    ...translateEngineEvents(res.events),
                ],
            }
        }

        case 'DRAW': {
            if (s.turnState !== 'WAITING_FOR_ACTION') return invalid
            return resolveDraw(game, userId)
        }

        case 'PICK_DISCARD_ALL_TOP': {
            if (s.turnState !== 'CHOOSING_DISCARD_ALL_TOP') return invalid
            const before = s.pendingDiscardAllCards.length
            const ev = engine.selectDiscardAllTop(s, action.cardId)
            if (s.pendingDiscardAllCards.length === before && before > 0) return invalid
            return { ok: true, events: translateEngineEvents(ev) }
        }

        case 'CHOOSE_DRAWN_WILD_COLOR': {
            if (s.turnState !== 'CHOOSING_DRAWN_WILD_COLOR' || !game.pendingDrawnWildCardId) return invalid
            if (!isWildColor(action.color)) return invalid
            const cardId = game.pendingDrawnWildCardId
            const card = engine.currentPlayer(s)?.hand.find(c => c.id === cardId)
            game.pendingDrawnWildCardId = null
            s.turnState = 'WAITING_FOR_ACTION'
            if (!card) return invalid
            const res = engine.playCard(s, userId, cardId, { selectedColor: action.color })
            if (!res.ok) return invalid
            return {
                ok: true,
                events: [
                    { t: 'CARD_PLAYED', by: userId, card, chosenColor: action.color },
                    ...translateEngineEvents(res.events),
                ],
            }
        }

        case 'SET_ROULETTE_COLOR': {
            if (!isWildColor(action.color)) return invalid
            if (!engine.setRouletteColor(s, action.color)) return invalid
            // Resolve the whole spin synchronously; clients pace the reveal
            // from the per-draw events.
            const ev: EngineEvent[] = []
            let outcome = engine.rouletteDrawStep(s, ev)
            while (outcome === 'continue') outcome = engine.rouletteDrawStep(s, ev)
            // The match stays in the victim's hand (last card drawn) — the
            // discard top is still the roulette card itself.
            const victim = s.players[s.currentPlayerIndex]
            const matchCard = outcome === 'match' ? victim?.hand[victim.hand.length - 1] : undefined
            if (outcome === 'match' || outcome === 'eliminated') {
                engine.finishRouletteTurn(s, ev)
            }
            const events = translateEngineEvents(ev)
            events.push({
                t: 'ROULETTE_ENDED',
                playerId: userId,
                outcome: outcome === 'invalid' ? 'exhausted' : outcome,
                matchCard,
            })
            return { ok: true, events }
        }

        case 'SWAP_HANDS': {
            const ev: EngineEvent[] = []
            const target = s.players.find(p => p.id === action.targetUserId)
            if (!target || target.id === userId) return invalid
            const swapped = engine.swapHands(s, action.targetUserId, ev)
            if (!swapped && s.turnState === 'CHOOSING_PLAYER_TO_SWAP') return invalid
            if (swapped) statsFor(game, userId).swapsMade++
            return { ok: true, events: translateEngineEvents(ev) }
        }

        case 'SKIP_SWAP': {
            const ev: EngineEvent[] = []
            if (!engine.skipSwap(s, ev)) return invalid
            return { ok: true, events: translateEngineEvents(ev) }
        }

        default:
            return invalid
    }
}

/**
 * DRAW resolves server-side exactly like single-player:
 *  - facing a stack: draw it all (mercy may fire mid-stack), then pass the turn
 *  - otherwise: draw until playable; a playable non-wild auto-plays, a playable
 *    wild parks in CHOOSING_DRAWN_WILD_COLOR for the owner's color choice
 */
function resolveDraw(game: GameRecord, userId: string): IntentResult {
    const s = game.engine
    const ev: EngineEvent[] = []
    const events: GameEvent[] = []
    const player = engine.currentPlayer(s)
    if (!player) return { ok: false, errorCode: 'invalid-intent', events: [] }

    if (s.drawStack > 0) {
        const count = s.drawStack
        s.drawStack = 0
        const stats = statsFor(game, userId)
        if (count > stats.biggestStackSurvived) stats.biggestStackSurvived = count
        for (let i = 0; i < count; i++) {
            if (player.isEliminated || s.gameState === 'GAME_OVER') break
            engine.drawCardToHand(s, userId, ev)
        }
        if (s.gameState !== 'GAME_OVER') engine.advanceTurn(s, ev)
        return { ok: true, events: [{ t: 'STACK_EATEN', playerId: userId, amount: count }, ...events, ...translateEngineEvents(ev)] }
    }

    // Draw until playable.
    for (let sanity = 0; sanity < 300; sanity++) {
        const top = engine.topCard(s)
        if (!top) { engine.advanceTurn(s, ev); break }
        const card = engine.drawCardToHand(s, userId, ev)
        if (!card) { engine.advanceTurn(s, ev); break }
        if (player.isEliminated || s.gameState === 'GAME_OVER') break
        if (engine.canPlayCard(card, top, s.currentColor, 0, s.stackingMode)) {
            // Color Roulette's colour is the victim's call, so it plays straight through.
            if (card.color === 'wild' && card.type !== 'wildColorRoulette') {
                game.pendingDrawnWildCardId = card.id
                s.turnState = 'CHOOSING_DRAWN_WILD_COLOR'
                break
            }
            events.push(...translateEngineEvents(ev))
            ev.length = 0
            const res = engine.playCard(s, userId, card.id, {})
            if (res.ok) {
                events.push({ t: 'CARD_PLAYED', by: userId, card })
                events.push(...translateEngineEvents(res.events))
            }
            return { ok: true, events }
        }
    }
    return { ok: true, events: [...events, ...translateEngineEvents(ev)] }
}

/**
 * Resolve the turn of an absent (disconnected past grace) player, minimally:
 * eat a pending stack or draw one card, and resolve any choosing state with
 * the obvious pick. Never auto-plays from WAITING — an absent player drifts
 * toward the mercy threshold instead of playing on autopilot.
 */
export function autoResolveAbsentTurn(game: GameRecord, userId: string): GameEvent[] {
    const s = game.engine
    const out: GameEvent[] = [{ t: 'TURN_AUTO_RESOLVED', playerId: userId }]
    // Engine calls mutate gameState mid-loop; a closure keeps TS from narrowing it away.
    const gameOver = () => s.gameState === 'GAME_OVER'

    for (let sanity = 0; sanity < 5; sanity++) {
        if (gameOver()) break
        const current = engine.currentPlayer(s)
        if (!current || current.id !== userId || current.isEliminated) break
        const hand = current.hand

        if (s.turnState === 'WAITING_FOR_ACTION') {
            const ev: EngineEvent[] = []
            if (s.drawStack > 0) {
                const count = s.drawStack
                s.drawStack = 0
                out.push({ t: 'STACK_EATEN', playerId: userId, amount: count })
                for (let i = 0; i < count; i++) {
                    if (current.isEliminated || gameOver()) break
                    engine.drawCardToHand(s, userId, ev)
                }
            } else {
                engine.drawCardToHand(s, userId, ev)
            }
            if (!gameOver() && engine.currentPlayer(s)?.id === userId) {
                engine.advanceTurn(s, ev)
            }
            out.push(...translateEngineEvents(ev))
            continue
        }

        const choice = obviousChoice(game, hand)
        if (!choice) break
        const res = applyIntent(game, userId, choice)
        out.push(...res.events)
        if (!res.ok) break
    }
    return out
}

/** The obvious answer to a pending choice, or null when none is pending. */
function obviousChoice(game: GameRecord, hand: Card[]): IntentAction | null {
    const s = game.engine
    if (s.turnState === 'CHOOSING_DRAWN_WILD_COLOR' && game.pendingDrawnWildCardId) {
        return { kind: 'CHOOSE_DRAWN_WILD_COLOR', color: engine.getWildCardColor(hand) }
    }
    if (s.turnState === 'CHOOSING_PLAYER_TO_SWAP') return { kind: 'SKIP_SWAP' }
    if (s.turnState === 'CHOOSING_DISCARD_ALL_TOP' && s.pendingDiscardAllCards[0]) {
        return { kind: 'PICK_DISCARD_ALL_TOP', cardId: s.pendingDiscardAllCards[0].id }
    }
    if (s.turnState === 'CHOOSING_ROULETTE_COLOR') return { kind: 'SET_ROULETTE_COLOR', color: engine.getWildCardColor(hand) }
    return null
}

// Sharp policy with no lookahead: a strong pick that costs no rollouts. Skill 1
// never takes the loose branch, so only targeting matters: aim a swap at the
// smallest hand.
const AUTOPLAY: BotProfile = { id: 'autoplay', name: 'Autoplay', aggression: 0.5, wildDiscipline: 0.5, catchRate: 0, targeting: 1, skill: 1, search: 0 }

/**
 * Play the turn of a seat that is here but let the clock run out, the way the
 * sharp bot would: its card (else the normal draw), its swap and its Discard
 * All pick. Extra turns it earns are played the same way, and anything the bot
 * cannot answer gets the obvious answer, so the turn always moves on.
 */
function autoPlayTurn(game: GameRecord, userId: string): GameEvent[] {
    const s = game.engine
    const out: GameEvent[] = []
    for (let sanity = 0; sanity < 10; sanity++) {
        const me = engine.currentPlayer(s)
        if (s.gameState !== 'PLAYING' || !me || me.id !== userId || me.isEliminated) break
        const opponents = s.players.filter(p => p.id !== userId && !p.isEliminated)
        let action: IntentAction | null
        if (s.turnState === 'WAITING_FOR_ACTION') {
            const top = engine.topCard(s)
            const playable = top ? me.hand.filter(c => engine.canPlayCard(c, top, s.currentColor, s.drawStack, s.stackingMode)) : []
            const card = chooseCard({ playable, drawStack: s.drawStack, opponents, self: me }, AUTOPLAY, Math.random)
            // Color Roulette's colour is the victim's call, so it carries none.
            const color = card?.color === 'wild' && card.type !== 'wildColorRoulette'
                ? chooseWildColor(me.hand.filter(c => c.id !== card.id), AUTOPLAY, Math.random)
                : undefined
            action = card ? { kind: 'PLAY_CARD', cardId: card.id, chosenColor: color } : { kind: 'DRAW' }
        } else if (s.turnState === 'CHOOSING_PLAYER_TO_SWAP') {
            const target = chooseSwapTarget({ playable: [], drawStack: 0, opponents, self: me }, AUTOPLAY, Math.random)
            action = target && wantsSwap(me, target, AUTOPLAY, Math.random)
                ? { kind: 'SWAP_HANDS', targetUserId: target.id }
                : { kind: 'SKIP_SWAP' }
        } else if (s.turnState === 'CHOOSING_DISCARD_ALL_TOP' && s.pendingDiscardAllCards.length) {
            action = { kind: 'PICK_DISCARD_ALL_TOP', cardId: chooseDiscardAllTop(s.pendingDiscardAllCards, AUTOPLAY, Math.random).id }
        } else {
            action = obviousChoice(game, me.hand)
        }
        if (!action) break
        let res = applyIntent(game, userId, action)
        if (!res.ok) {
            const fallback: IntentAction | null = action.kind === 'PLAY_CARD' ? { kind: 'DRAW' } : obviousChoice(game, me.hand)
            if (fallback) res = applyIntent(game, userId, fallback)
        }
        out.push(...res.events)
        if (!res.ok) break
    }
    return out
}

/** Any move of the seat's own proves it is playing; its run of timeouts starts over. */
export function clearTimeouts(game: GameRecord, userId: string): void {
    if (game.timeouts?.[userId]) delete game.timeouts[userId]
}

/**
 * The turn clock ran out on `userId`. Count it. The MAX_TURN_TIMEOUTS-th in a
 * row takes the seat out of the game; otherwise the turn is played for it,
 * with the bot's pick if the seat is here (`present`) and the minimal absent
 * draw if it is not.
 */
export function timeOutTurn(game: GameRecord, userId: string, present: boolean): GameEvent[] {
    const timeouts = (game.timeouts ??= {})
    const count = (timeouts[userId] ?? 0) + 1
    timeouts[userId] = count
    const out: GameEvent[] = [{ t: 'TURN_TIMED_OUT', playerId: userId, timeouts: count }]

    if (count >= MAX_TURN_TIMEOUTS) {
        const aliveBefore = game.engine.players.filter(p => !p.isEliminated).length
        const ev: EngineEvent[] = []
        if (engine.eliminatePlayer(game.engine, userId, ev)) {
            ;(game.timedOut ??= []).push(userId)
            if (aliveBefore <= 2) game.timeoutWalkover = true
        }
        return [...out, ...translateEngineEvents(ev)]
    }
    if (present) return [...out, ...autoPlayTurn(game, userId)]
    // TURN_TIMED_OUT already says what happened; drop the older away notice.
    return [...out, ...autoResolveAbsentTurn(game, userId).filter(e => e.t !== 'TURN_AUTO_RESOLVED')]
}

/**
 * Persist one game_results row per player, server-to-server. Requires the
 * service-role key (wrangler secret SUPABASE_SERVICE_KEY); without it this is
 * a no-op so the game itself never depends on stats plumbing.
 */
export async function persistResults(
    game: GameRecord,
    roomCode: string,
    env: { SUPABASE_URL: string; SUPABASE_SERVICE_KEY?: string },
): Promise<boolean> {
    if (!env.SUPABASE_SERVICE_KEY || game.resultsLogged || game.hadKick) return false
    const s = game.engine
    if (s.gameState !== 'GAME_OVER') return false
    game.resultsLogged = true

    const gameId = `do-${roomCode}-${game.startedAt}`
    const duration = Math.max(0, Math.round((Date.now() - game.startedAt) / 1000))
    const rows = s.players.filter(p => !(game.timeoutWalkover && p.id === s.winnerId)).map(p => {
        const st = statsFor(game, p.id)
        const result = s.winnerId === p.id ? 'won' : p.isEliminated ? 'eliminated' : 'lost'
        return {
            game_id: gameId,
            user_id: p.id,
            opponent_count: s.players.length - 1,
            result,
            cards_remaining: p.hand.length,
            peak_cards: st.peakCards,
            draw_cards_played: st.drawCardsPlayed,
            wild_cards_played: st.wildCardsPlayed,
            cards_played_total: st.cardsPlayedTotal,
            skips_dealt: st.skipsDealt,
            swaps_made: st.swapsMade,
            draws_taken: st.drawsTaken,
            biggest_stack_survived: st.biggestStackSurvived,
            uno_calls: st.unoCalls,
            uno_penalties: st.unoPenalties,
            game_duration_secs: duration,
            is_bot_game: false,
        }
    })

    const res = await fetch(`${env.SUPABASE_URL}/rest/v1/game_results`, {
        method: 'POST',
        headers: {
            apikey: env.SUPABASE_SERVICE_KEY,
            Authorization: `Bearer ${env.SUPABASE_SERVICE_KEY}`,
            'content-type': 'application/json',
            Prefer: 'return=minimal',
        },
        body: JSON.stringify(rows),
    })
    if (!res.ok) {
        console.log('game_results insert failed', res.status, (await res.text()).slice(0, 200))
        return false
    }
    console.log('game_results insert ok', rows.length, gameId)
    return true
}

/** Draw-10 penalty for a caught UNO miss. Window validation is the room's job. */
export function applyUnoCatch(game: GameRecord, targetUserId: string): GameEvent[] {
    const ev: EngineEvent[] = []
    engine.penalizeUnoDraws(game.engine, targetUserId, 10, ev)
    return [{ t: 'UNO_PENALTY', playerId: targetUserId }, ...translateEngineEvents(ev)]
}

/** Kick / permanent leave: force-eliminate the seat. Returns null if there was nothing to do. */
export function forceEliminate(game: GameRecord, userId: string): GameEvent[] | null {
    const ev: EngineEvent[] = []
    if (!engine.eliminatePlayer(game.engine, userId, ev)) return null
    game.hadKick = true
    return translateEngineEvents(ev)
}

/** Engine events → wire events (viewer-neutral; DRAW personalization happens at send time). */
function translateEngineEvents(ev: EngineEvent[]): GameEvent[] {
    const out: GameEvent[] = []
    for (const e of ev) {
        switch (e.t) {
            case 'RESHUFFLE': out.push({ t: 'RESHUFFLED' }); break
            case 'DRAW': out.push({ t: 'YOU_DREW', cards: [e.card], _owner: e.playerId } as GameEvent & { _owner: string }); break
            case 'ELIMINATED': out.push({ t: 'ELIMINATED', playerId: e.playerId }); break
            case 'GAME_OVER': out.push({ t: 'GAME_OVER', winnerId: e.winnerId }); break
            case 'UNO_PENALTY': out.push({ t: 'UNO_PENALTY', playerId: e.playerId }); break
            case 'AT_ONE_UNCALLED': out.push({ t: 'AT_ONE', playerId: e.playerId }); break
            case 'TURN_ADVANCED':
            case 'PLAY_AGAIN':
            case 'CHOOSE_DISCARD_ALL_TOP':
                // Snapshots carry turn/picker state.
                break
        }
    }
    return out
}

/**
 * Personalize an event for one viewer. Draw events reveal card identities only
 * to their owner; everyone else sees a count.
 */
export function viewEventFor(ev: GameEvent, viewerId: string): GameEvent {
    if (ev.t === 'YOU_DREW') {
        const owner = (ev as GameEvent & { _owner?: string })._owner
        if (owner && owner !== viewerId) {
            return { t: 'PLAYER_DREW', playerId: owner, count: ev.cards.length }
        }
        return { t: 'YOU_DREW', cards: ev.cards }
    }
    return ev
}

export function personalView(
    game: GameRecord | null,
    roomStatus: 'lobby' | 'playing' | 'finished',
    viewerId: string,
    roster: { userId: string; name: string }[],
    connectedIds: Set<string>,
    hostUserId: string | null,
    gameId: string | null = null,
): PersonalView {
    if (!game) {
        return {
            status: 'lobby',
            gameId: null,
            hostUserId,
            players: roster.map((r, seat) => ({
                userId: r.userId, name: r.name, seat,
                handCount: 0, isEliminated: false,
                connected: connectedIds.has(r.userId), calledUno: false,
                timeouts: 0, timedOut: false,
            })),
            you: null,
            currentPlayerId: null,
            turnState: 'WAITING_FOR_ACTION',
            direction: 1,
            drawStack: 0,
            currentColor: 'red',
            discardTop: null,
            deckCount: 0,
            discardCount: 0,
            rouletteTargetColor: null,
            pendingDiscardAllCards: null,
            pendingDrawnWildCard: null,
            stackingMode: 'official',
            winnerId: null,
        }
    }

    const s = game.engine
    const current = engine.currentPlayer(s)
    const me = s.players.find(p => p.id === viewerId) ?? null
    const isChooser = current?.id === viewerId

    const players: SnapshotPlayer[] = s.players.map((p, seat) => ({
        userId: p.id,
        name: p.name,
        seat,
        handCount: p.hand.length,
        isEliminated: p.isEliminated,
        connected: connectedIds.has(p.id),
        calledUno: !!s.hasCalledUno[p.id],
        timeouts: game.timeouts?.[p.id] ?? 0,
        timedOut: !!game.timedOut?.includes(p.id),
    }))

    const pendingWild = game.pendingDrawnWildCardId && isChooser
        ? me?.hand.find(c => c.id === game.pendingDrawnWildCardId) ?? null
        : null

    return {
        status: roomStatus,
        gameId,
        hostUserId,
        players,
        you: me ? { userId: me.id, seat: s.players.indexOf(me), hand: me.hand } : null,
        currentPlayerId: current?.id ?? null,
        turnState: s.turnState,
        direction: s.direction,
        drawStack: s.drawStack,
        currentColor: s.currentColor,
        discardTop: engine.topCard(s) ?? null,
        deckCount: s.deck.length,
        discardCount: s.discardPile.length,
        rouletteTargetColor: s.rouletteTargetColor,
        pendingDiscardAllCards: isChooser && s.turnState === 'CHOOSING_DISCARD_ALL_TOP' ? s.pendingDiscardAllCards : null,
        pendingDrawnWildCard: pendingWild,
        stackingMode: s.stackingMode,
        winnerId: s.winnerId,
    }
}

export type { Card }
