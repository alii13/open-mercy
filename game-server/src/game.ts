import * as engine from '../../shared/engine'
import type { Card, CardColor, EngineEvent, EngineState, GameRuleset, StackingMode } from '../../shared/engine'
import type { GameEvent, IntentAction, PersonalView, SnapshotPlayer } from './protocol'
import { isWildColor } from './validate'
import {
    applyChaosEventAction,
    autoResolveChaosEvent,
    chaosViewFor,
    createChaosRuntime,
    endChaosByTime,
    finishResolvedChaosEvent,
    markChaosEventDue,
    rollD6,
    startDueChaosEvent,
    type ChaosRuntime,
} from './chaos'

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
    /** Classic draw-one: only this freshly drawn card may still be played. */
    pendingDrawnCardId?: string | null
    /** A final +2/+4 must still be paid before the round is declared over. */
    pendingWinnerId?: string | null
    /** Server-private +4 legality; no hand contents cross the wire. */
    pendingDraw4Challenge?: {
        offenderId: string
        victimId: string
        wasLegal: boolean
    } | null
    startedAt: number
    /** Per-player stats, persisted to game_results at game end. */
    stats?: Record<string, PlayerGameStats>
    resultsLogged?: boolean
    /** A seat was kicked out of this game. Such games are not scored: a host
     *  could otherwise kick the table and farm wins. */
    hadKick?: boolean
    /** Present only in Couch Chaos games; persisted with the authoritative game. */
    chaos?: ChaosRuntime
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
export function startGame(players: SeatedPlayer[], stackingMode: StackingMode, ruleset: GameRuleset = 'mercy', now = Date.now()): { game: GameRecord; events: GameEvent[] } {
    const s: EngineState = {
        players: players.map(p => ({ id: p.userId, name: p.name, hand: [], isEliminated: false, score: 0 })),
        deck: engine.shuffleDeck(ruleset === 'chaos'
            ? engine.generateChaosDeck()
            : ruleset === 'classic' ? engine.generateClassicDeck() : engine.generateFullDeck()),
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
        ruleset,
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
        game: {
            engine: s,
            pendingDrawnWildCardId: null,
            pendingDrawnCardId: null,
            pendingWinnerId: null,
            pendingDraw4Challenge: null,
            startedAt: now,
            stats,
            resultsLogged: false,
            chaos: ruleset === 'chaos' ? createChaosRuntime(now) : undefined,
        },
        events: [{ t: 'STARTED' }, ...translateEngineEvents(ev)],
    }
}

/** Apply one client intent to the authoritative state. Fully synchronous. */
export function applyIntent(game: GameRecord, userId: string, action: IntentAction): IntentResult {
    const s = game.engine
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }

    if (s.gameState !== 'PLAYING') return invalid

    if (game.chaos?.event) {
        const result = applyChaosEventAction(s, game.chaos, userId, action, Date.now())
        return result.ok ? { ok: true, events: result.events } : invalid
    }

    if (game.chaos?.reaction) {
        if (action.kind === 'CHAOS_REACT') return resolveChaosReaction(game, userId, action)
        if (action.kind === 'CHAOS_DECLINE_REACTION') return declineChaosReaction(game, userId)
        return invalid
    }

    // CALL_UNO is the only intent allowed off-turn.
    if (action.kind === 'CALL_UNO') {
        const player = s.players.find(p => p.id === userId)
        if (!player || player.isEliminated || player.hand.length > 2) return invalid
        s.hasCalledUno[userId] = true
        return { ok: true, events: [{ t: 'UNO_CALLED', playerId: userId }] }
    }

    if (engine.currentPlayer(s)?.id !== userId) return invalid

    switch (action.kind) {
        case 'PLAY_CHAOS_CARD': {
            if (s.ruleset !== 'chaos' || (s.turnState !== 'WAITING_FOR_ACTION' && s.turnState !== 'CHOOSING_DRAWN_CARD')) return invalid
            const card = engine.currentPlayer(s)?.hand.find(c => c.id === action.cardId)
            if (!card || !isChaosCard(card)) return invalid
            if (s.turnState === 'CHOOSING_DRAWN_CARD' && game.pendingDrawnCardId !== card.id) return invalid
            game.pendingDrawnCardId = null
            return playChaosCard(game, userId, card, action.chosenColor, action.targetUserId)
        }

        case 'USE_TREASURE':
            return useTreasure(game, userId, action)

        case 'PLAY_CARD': {
            if (s.turnState !== 'WAITING_FOR_ACTION') return invalid
            const card = engine.currentPlayer(s)?.hand.find(c => c.id === action.cardId)
            if (!card || isChaosCard(card)) return invalid
            return playCardIntent(game, userId, card, action.chosenColor)
        }

        case 'DRAW': {
            if (s.turnState !== 'WAITING_FOR_ACTION') return invalid
            return resolveDraw(game, userId)
        }

        case 'PLAY_DRAWN_CARD': {
            if (s.ruleset === 'mercy' || s.turnState !== 'CHOOSING_DRAWN_CARD' || !game.pendingDrawnCardId) return invalid
            const card = engine.currentPlayer(s)?.hand.find(c => c.id === game.pendingDrawnCardId)
            if (!card) return invalid
            game.pendingDrawnCardId = null
            s.turnState = 'WAITING_FOR_ACTION'
            return playCardIntent(game, userId, card, action.chosenColor)
        }

        case 'PASS_DRAWN_CARD': {
            if (s.ruleset === 'mercy' || s.turnState !== 'CHOOSING_DRAWN_CARD' || !game.pendingDrawnCardId) return invalid
            game.pendingDrawnCardId = null
            s.turnState = 'WAITING_FOR_ACTION'
            const ev: EngineEvent[] = []
            engine.advanceTurn(s, ev)
            return { ok: true, events: translateEngineEvents(ev) }
        }

        case 'ACCEPT_DRAW4':
            return resolveClassicDraw4(game, userId, false)

        case 'CHALLENGE_DRAW4':
            return resolveClassicDraw4(game, userId, true)

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

const CHAOS_CARD_TYPES = new Set(['fateSwap', 'curseMirror', 'diceCurse', 'runeShield', 'runeWhirl'])

function isChaosCard(card: Card): boolean {
    return CHAOS_CARD_TYPES.has(card.type)
}

function canChaosReact(game: GameRecord, userId: string): boolean {
    const player = game.engine.players.find(candidate => candidate.id === userId)
    return !!player?.hand.some(card => card.type === 'runeShield' || card.type === 'curseMirror')
        || game.chaos?.treasures[userId] === 'block-penalty'
}

function setCurrentPlayer(game: GameRecord, userId: string): void {
    const index = game.engine.players.findIndex(player => player.id === userId)
    if (index >= 0) game.engine.currentPlayerIndex = index
}

function beginChaosReaction(
    game: GameRecord,
    sourceId: string,
    targetId: string,
    amount: number,
    resumePlayerId: string,
    after: 'advance' | 'draw4-challenge' | 'keep-turn',
): void {
    if (!game.chaos) return
    game.engine.drawStack = 0
    game.engine.turnState = 'AWAITING_CHAOS_REACTION'
    game.chaos.reaction = { sourceId, targetId, amount, reflected: false, resumePlayerId, after, deadlineAt: Date.now() + 12_000 }
}

function removeReactionCard(game: GameRecord, userId: string, cardId: string | undefined, type: 'runeShield' | 'curseMirror'): Card | null {
    if (!cardId) return null
    const player = game.engine.players.find(candidate => candidate.id === userId)
    const index = player?.hand.findIndex(card => card.id === cardId && card.type === type) ?? -1
    if (!player || index < 0) return null
    const card = player.hand.splice(index, 1)[0]!
    game.engine.discardPile.push(card)
    return card
}

function drawCards(game: GameRecord, userId: string, amount: number): GameEvent[] {
    const ev: EngineEvent[] = []
    for (let i = 0; i < amount; i++) engine.drawCardToHand(game.engine, userId, ev)
    return translateEngineEvents(ev)
}

function settleReaction(game: GameRecord): void {
    if (!game.chaos) return
    const reaction = game.chaos.reaction
    game.chaos.reaction = null
    game.pendingDraw4Challenge = null
    game.engine.drawStack = 0
    if (reaction) setCurrentPlayer(game, reaction.resumePlayerId)
    game.engine.turnState = 'WAITING_FOR_ACTION'
}

function resolveChaosReaction(game: GameRecord, userId: string, action: Extract<IntentAction, { kind: 'CHAOS_REACT' }>): IntentResult {
    const reaction = game.chaos?.reaction
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }
    if (!reaction || reaction.targetId !== userId) return invalid

    if (action.treasure) {
        if (game.chaos?.treasures[userId] !== 'block-penalty') return invalid
        delete game.chaos.treasures[userId]
        settleReaction(game)
        const ev: EngineEvent[] = []
        finishPendingClassicWinner(game, ev)
        return { ok: true, events: [{ t: 'CHAOS_REACTION', by: userId, reaction: 'shield' }, ...translateEngineEvents(ev)] }
    }

    const player = game.engine.players.find(candidate => candidate.id === userId)
    const selected = player?.hand.find(card => card.id === action.cardId)
    if (selected?.type === 'runeShield') {
        if (!removeReactionCard(game, userId, action.cardId, 'runeShield')) return invalid
        settleReaction(game)
        const ev: EngineEvent[] = []
        finishPendingClassicWinner(game, ev)
        return { ok: true, events: [{ t: 'CHAOS_REACTION', by: userId, reaction: 'shield' }, ...translateEngineEvents(ev)] }
    }
    if (selected?.type === 'curseMirror' && !reaction.reflected) {
        const target = game.engine.players.find(candidate => candidate.id === action.targetUserId && !candidate.isEliminated)
        if (!target || target.id === userId) return invalid
        if (!removeReactionCard(game, userId, action.cardId, 'curseMirror')) return invalid
        const events = drawCards(game, target.id, reaction.amount)
        settleReaction(game)
        const ev: EngineEvent[] = []
        finishPendingClassicWinner(game, ev)
        return {
            ok: true,
            events: [{ t: 'CHAOS_REACTION', by: userId, reaction: 'mirror', targetUserId: target.id }, ...events, ...translateEngineEvents(ev)],
        }
    }
    return invalid
}

function declineChaosReaction(game: GameRecord, userId: string): IntentResult {
    const reaction = game.chaos?.reaction
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }
    if (!reaction || reaction.targetId !== userId) return invalid
    if (reaction.after === 'draw4-challenge') {
        game.chaos!.reaction = null
        game.engine.drawStack = reaction.amount
        game.engine.turnState = 'AWAITING_DRAW4_CHALLENGE'
        return { ok: true, events: [{ t: 'CHAOS_REACTION', by: userId, reaction: 'decline' }] }
    }
    const events = drawCards(game, userId, reaction.amount)
    game.chaos!.reaction = null
    setCurrentPlayer(game, reaction.resumePlayerId)
    game.engine.turnState = 'WAITING_FOR_ACTION'
    if (reaction.after === 'advance') {
        const ev: EngineEvent[] = []
        engine.advanceTurn(game.engine, ev)
        events.push(...translateEngineEvents(ev))
    }
    const ev: EngineEvent[] = []
    finishPendingClassicWinner(game, ev)
    return { ok: true, events: [{ t: 'CHAOS_REACTION', by: userId, reaction: 'decline' }, ...events, ...translateEngineEvents(ev)] }
}

function playChaosCard(game: GameRecord, userId: string, card: Card, chosenColor: CardColor, targetUserId?: string): IntentResult {
    const s = game.engine
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }
    if (chosenColor === 'wild' || card.type === 'curseMirror' || card.type === 'runeShield') return invalid
    const player = engine.currentPlayer(s)
    const top = engine.topCard(s)
    if (!player || player.id !== userId || !top || !engine.canPlayCard(card, top, s.currentColor, s.drawStack, s.stackingMode, 'chaos')) return invalid
    const cardIndex = player.hand.findIndex(candidate => candidate.id === card.id)
    if (cardIndex < 0) return invalid
    const target = targetUserId ? s.players.find(candidate => candidate.id === targetUserId && !candidate.isEliminated) : undefined
    if ((card.type === 'fateSwap' || card.type === 'diceCurse') && (!target || target.id === userId)) return invalid

    player.hand.splice(cardIndex, 1)
    s.discardPile.push(card)
    s.currentColor = chosenColor
    const events: GameEvent[] = []
    let roll: number | undefined

    if (card.type === 'fateSwap') {
        const own = player.hand
        player.hand = target!.hand
        target!.hand = own
        statsFor(game, userId).swapsMade++
    } else if (card.type === 'runeWhirl') {
        engine.rotateActiveHands(s)
    } else if (card.type === 'diceCurse') {
        roll = rollD6()
    }

    events.push({ t: 'CHAOS_CARD', by: userId, card, targetUserId: target?.id, roll })
    const engineEvents: EngineEvent[] = []
    if (player.hand.length === 1 && !s.hasCalledUno[player.id]) engineEvents.push({ t: 'AT_ONE_UNCALLED', playerId: player.id })
    if (player.hand.length === 0) game.pendingWinnerId = player.id
    engine.advanceTurn(s, engineEvents)

    if (card.type === 'diceCurse') {
        const resume = engine.currentPlayer(s)?.id ?? userId
        if (canChaosReact(game, target!.id)) beginChaosReaction(game, userId, target!.id, roll!, resume, 'keep-turn')
        else events.push(...drawCards(game, target!.id, roll!))
    }
    if (!game.chaos?.reaction) finishPendingClassicWinner(game, engineEvents)
    events.push(...translateEngineEvents(engineEvents))
    return { ok: true, events }
}

function useTreasure(game: GameRecord, userId: string, action: Extract<IntentAction, { kind: 'USE_TREASURE' }>): IntentResult {
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }
    const chaos = game.chaos
    const player = engine.currentPlayer(game.engine)
    const ability = chaos?.treasures[userId]
    if (!chaos || !ability || !player || player.id !== userId || game.engine.turnState !== 'WAITING_FOR_ACTION') return invalid
    if (ability === 'block-penalty') return invalid

    if (ability === 'discard-one') {
        const index = player.hand.findIndex(card => card.id === action.cardId)
        if (index < 0 || player.hand.length <= 1) return invalid
        game.engine.discardPile.push(player.hand.splice(index, 1)[0]!)
        delete chaos.treasures[userId]
        return { ok: true, events: [{ t: 'TREASURE_USED', by: userId, ability }] }
    }

    const target = game.engine.players.find(candidate => candidate.id === action.targetUserId && !candidate.isEliminated)
    if (!target || target.id === userId) return invalid
    delete chaos.treasures[userId]
    const events: GameEvent[] = [{ t: 'TREASURE_USED', by: userId, ability, targetUserId: target.id }]
    if (canChaosReact(game, target.id)) beginChaosReaction(game, userId, target.id, 3, userId, 'keep-turn')
    else events.push(...drawCards(game, target.id, 3))
    return { ok: true, events }
}

function playCardIntent(game: GameRecord, userId: string, card: Card, chosenColor?: CardColor): IntentResult {
    const s = game.engine
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }
    if (chosenColor !== undefined && !isWildColor(chosenColor)) return invalid
    if (s.ruleset !== 'mercy' && card.color === 'wild' && !isWildColor(chosenColor)) return invalid

    const activeColorBefore = s.currentColor
    const player = engine.currentPlayer(s)
    if (!player || player.id !== userId) return invalid
    const draw4WasLegal = card.type !== 'draw4'
        || !player.hand.some(held => held.id !== card.id && held.color === activeColorBefore)
    const scoreBefore = player.score
    const res = engine.playCard(s, userId, card.id, { selectedColor: chosenColor })
    if (!res.ok) return invalid

    const engineEvents = [...res.events]
    const isClassicFinalPenalty = s.ruleset !== 'mercy'
        && player.hand.length === 0
        && (card.type === 'draw2' || card.type === 'draw4')
    if (isClassicFinalPenalty) {
        // Official play still charges a final +2/+4. The shared Mercy path
        // ends immediately, so defer that result until the penalty resolves.
        s.gameState = 'PLAYING'
        s.winnerId = null
        player.score = scoreBefore
        game.pendingWinnerId = userId
        for (let i = engineEvents.length - 1; i >= 0; i--) {
            if (engineEvents[i]?.t === 'GAME_OVER') engineEvents.splice(i, 1)
        }
        engine.advanceTurn(s, engineEvents)
    }

    if (s.ruleset !== 'mercy' && card.type === 'draw4') {
        const victim = engine.currentPlayer(s)
        if (!victim) return invalid
        game.pendingDraw4Challenge = { offenderId: userId, victimId: victim.id, wasLegal: draw4WasLegal }
        s.turnState = 'AWAITING_DRAW4_CHALLENGE'
    }

    if (s.ruleset === 'chaos' && (card.type === 'draw2' || card.type === 'draw4')) {
        const victim = engine.currentPlayer(s)
        if (victim && canChaosReact(game, victim.id)) {
            const after = card.type === 'draw4' ? 'draw4-challenge' : 'advance'
            beginChaosReaction(game, userId, victim.id, card.type === 'draw4' ? 4 : 2, victim.id, after)
        }
    }

    return {
        ok: true,
        events: [
            { t: 'CARD_PLAYED', by: userId, card, chosenColor },
            ...translateEngineEvents(engineEvents),
        ],
    }
}

function finishPendingClassicWinner(game: GameRecord, ev: EngineEvent[]): void {
    const winnerId = game.pendingWinnerId
    game.pendingWinnerId = null
    if (!winnerId) return
    const winner = game.engine.players.find(player => player.id === winnerId)
    if (winner?.hand.length === 0) engine.endGame(game.engine, winnerId, ev)
}

function drawPenalty(game: GameRecord, playerId: string, amount: number, ev: EngineEvent[]): void {
    for (let i = 0; i < amount; i++) engine.drawCardToHand(game.engine, playerId, ev)
}

function resolveClassicDraw4(game: GameRecord, userId: string, challenge: boolean): IntentResult {
    const s = game.engine
    const pending = game.pendingDraw4Challenge
    const invalid: IntentResult = { ok: false, errorCode: 'invalid-intent', events: [] }
    if (s.ruleset === 'mercy' || s.turnState !== 'AWAITING_DRAW4_CHALLENGE'
        || !pending || pending.victimId !== userId || engine.currentPlayer(s)?.id !== userId) return invalid

    const ev: EngineEvent[] = []
    const events: GameEvent[] = []
    game.pendingDraw4Challenge = null
    s.drawStack = 0

    if (challenge && !pending.wasLegal) {
        drawPenalty(game, pending.offenderId, 4, ev)
        s.turnState = 'WAITING_FOR_ACTION'
        events.push({
            t: 'DRAW4_RESOLVED', challengerId: userId, offenderId: pending.offenderId,
            outcome: 'challenge-succeeded', amount: 4,
        })
    } else {
        const amount = challenge ? 6 : 4
        drawPenalty(game, userId, amount, ev)
        s.turnState = 'WAITING_FOR_ACTION'
        engine.advanceTurn(s, ev)
        events.push({
            t: 'DRAW4_RESOLVED', challengerId: userId, offenderId: pending.offenderId,
            outcome: challenge ? 'challenge-failed' : 'accepted', amount,
        })
    }

    finishPendingClassicWinner(game, ev)
    return { ok: true, events: [...events, ...translateEngineEvents(ev)] }
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

    if (s.ruleset !== 'mercy') {
        if (s.drawStack > 0) {
            const count = s.drawStack
            s.drawStack = 0
            drawPenalty(game, userId, count, ev)
            if (s.gameState !== 'GAME_OVER') engine.advanceTurn(s, ev)
            finishPendingClassicWinner(game, ev)
            return {
                ok: true,
                events: [{ t: 'STACK_EATEN', playerId: userId, amount: count }, ...translateEngineEvents(ev)],
            }
        }

        const top = engine.topCard(s)
        if (!top) {
            engine.advanceTurn(s, ev)
            return { ok: true, events: translateEngineEvents(ev) }
        }
        const card = engine.drawCardToHand(s, userId, ev)
        if (!card) {
            engine.advanceTurn(s, ev)
            return { ok: true, events: translateEngineEvents(ev) }
        }
        if (engine.canPlayCard(card, top, s.currentColor, 0, s.stackingMode, 'classic')) {
            game.pendingDrawnCardId = card.id
            s.turnState = 'CHOOSING_DRAWN_CARD'
        } else {
            engine.advanceTurn(s, ev)
        }
        return { ok: true, events: translateEngineEvents(ev) }
    }

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
            if (s.ruleset !== 'mercy') finishPendingClassicWinner(game, ev)
            out.push(...translateEngineEvents(ev))
            continue
        }

        if (s.turnState === 'AWAITING_DRAW4_CHALLENGE') {
            const res = applyIntent(game, userId, { kind: 'ACCEPT_DRAW4' })
            out.push(...res.events)
            if (!res.ok) break
            continue
        }
        if (s.turnState === 'CHOOSING_DRAWN_CARD') {
            const res = applyIntent(game, userId, { kind: 'PASS_DRAWN_CARD' })
            out.push(...res.events)
            if (!res.ok) break
            continue
        }

        if (s.turnState === 'CHOOSING_DRAWN_WILD_COLOR' && game.pendingDrawnWildCardId) {
            const res = applyIntent(game, userId, { kind: 'CHOOSE_DRAWN_WILD_COLOR', color: engine.getWildCardColor(hand) })
            out.push(...res.events)
            if (!res.ok) break
            continue
        }
        if (s.turnState === 'CHOOSING_PLAYER_TO_SWAP') {
            const res = applyIntent(game, userId, { kind: 'SKIP_SWAP' })
            out.push(...res.events)
            if (!res.ok) break
            continue
        }
        if (s.turnState === 'CHOOSING_DISCARD_ALL_TOP' && s.pendingDiscardAllCards[0]) {
            const res = applyIntent(game, userId, { kind: 'PICK_DISCARD_ALL_TOP', cardId: s.pendingDiscardAllCards[0].id })
            out.push(...res.events)
            if (!res.ok) break
            continue
        }
        if (s.turnState === 'CHOOSING_ROULETTE_COLOR') {
            const res = applyIntent(game, userId, { kind: 'SET_ROULETTE_COLOR', color: engine.getWildCardColor(hand) })
            out.push(...res.events)
            if (!res.ok) break
            continue
        }
        break
    }
    return out
}

/** Mark the three-minute clock due without interrupting the current turn. */
export function markChaosDue(game: GameRecord, now = Date.now()): boolean {
    return game.chaos ? markChaosEventDue(game.chaos, now) : false
}

/** Called after a completed normal action; events only start from a stable turn boundary. */
export function maybeStartChaosEvent(game: GameRecord, now = Date.now()): GameEvent[] {
    if (!game.chaos) return []
    markChaosEventDue(game.chaos, now)
    return startDueChaosEvent(game.engine, game.chaos, now)
}

/** Earliest authoritative Chaos deadline for Durable Object alarm multiplexing. */
export function nextChaosDeadline(game: GameRecord | null): number | undefined {
    const chaos = game?.chaos
    if (!chaos || game?.engine.gameState !== 'PLAYING') return undefined
    const deadlines = [
        chaos.matchEndsAt,
        chaos.event?.deadlineAt,
        chaos.reaction?.deadlineAt,
        chaos.eventDue ? undefined : chaos.nextEventAt,
    ].filter((value): value is number => typeof value === 'number')
    return deadlines.length ? Math.min(...deadlines) : undefined
}

/** Resolve timeouts deterministically enough for tests, securely by default. */
export function processChaosDeadline(game: GameRecord, now = Date.now()): GameEvent[] {
    const chaos = game.chaos
    if (!chaos || game.engine.gameState !== 'PLAYING') return []
    const events: GameEvent[] = []

    if (now >= chaos.matchEndsAt) {
        if (chaos.event && chaos.event.phase !== 'resolved') events.push(...autoResolveChaosEvent(game.engine, chaos, now))
        if (chaos.reaction) {
            const result = declineChaosReaction(game, chaos.reaction.targetId)
            if (result.ok) events.push(...result.events)
        }
        chaos.event = null
        game.engine.turnState = 'WAITING_FOR_ACTION'
        events.push(...endChaosByTime(game.engine, chaos))
        return events
    }

    if (chaos.reaction && chaos.reaction.deadlineAt <= now) {
        const result = declineChaosReaction(game, chaos.reaction.targetId)
        if (result.ok) events.push(...result.events)
    }
    if (chaos.event?.deadlineAt && chaos.event.deadlineAt <= now) {
        if (chaos.event.phase === 'resolved') finishResolvedChaosEvent(game.engine, chaos, now)
        else events.push(...autoResolveChaosEvent(game.engine, chaos, now))
    }
    markChaosEventDue(chaos, now)
    return events
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
    const rows = s.players.map(p => {
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
    engine.penalizeUnoDraws(game.engine, targetUserId, game.engine.ruleset === 'mercy' ? 10 : 2, ev)
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
            pendingDrawnCard: null,
            canChallengeDraw4: false,
            stackingMode: 'official',
            ruleset: 'mercy',
            winnerId: null,
        }
    }

    const s = game.engine
    if (game.chaos && s.gameState === 'GAME_OVER' && !game.chaos.winReason) game.chaos.winReason = 'cards'
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
    }))

    const pendingWild = game.pendingDrawnWildCardId && isChooser
        ? me?.hand.find(c => c.id === game.pendingDrawnWildCardId) ?? null
        : null
    const pendingDrawnCard = game.pendingDrawnCardId && isChooser
        ? me?.hand.find(c => c.id === game.pendingDrawnCardId) ?? null
        : null
    const canChallengeDraw4 = s.turnState === 'AWAITING_DRAW4_CHALLENGE'
        && game.pendingDraw4Challenge?.victimId === viewerId

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
        pendingDrawnCard,
        canChallengeDraw4,
        stackingMode: s.stackingMode,
        ruleset: s.ruleset ?? 'mercy',
        winnerId: s.winnerId,
        chaos: game.chaos ? chaosViewFor(game.chaos, viewerId, Date.now()) : undefined,
    }
}

export type { Card }
