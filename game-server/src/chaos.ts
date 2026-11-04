import * as engine from '../../shared/engine'
import type { Card, CardColor, EngineEvent, EngineState, Rng, TurnState } from '../../shared/engine'
import type { ChaosEventKind, ChaosEventView, ChaosView, GameEvent, IntentAction, TreasureAbility } from './protocol'

export const CHAOS_EVENT_INTERVAL_MS = 3 * 60 * 1000
export const CHAOS_EVENT_ACTION_MS = 12 * 1000
export const CHAOS_EVENT_RESULT_MS = 4 * 1000
export const CHAOS_FINAL_PHASE_MS = 20 * 60 * 1000
export const CHAOS_MATCH_LIMIT_MS = 25 * 60 * 1000

export interface ChaosReaction {
    sourceId: string
    targetId: string
    amount: number
    reflected: boolean
    resumePlayerId: string
    after: 'advance' | 'draw4-challenge' | 'keep-turn'
    deadlineAt: number
}

interface ChaosEventInternal extends ChaosEventView {
    selections: Record<string, string>
}

export interface ChaosRuntime {
    nextEventAt: number
    matchEndsAt: number
    eventCounter: number
    eventDue: boolean
    event: ChaosEventInternal | null
    treasures: Record<string, TreasureAbility | undefined>
    reaction: ChaosReaction | null
    oracleReveals: Record<string, { targetUserId: string; card: Card } | undefined>
    winReason: 'cards' | 'time' | null
    resumeTurnState: TurnState
}

const EVENT_ORDER: ChaosEventKind[] = [
    'treasure', 'goblin-trade', 'rune-trial', 'oracle', 'color-storm', 'dragon-curse',
]

function secureUnit(): number {
    const value = new Uint32Array(1)
    crypto.getRandomValues(value)
    return value[0]! / 0x1_0000_0000
}

export function rollD6(rng: Rng = secureUnit): number {
    return 1 + Math.floor(rng() * 6)
}

function pick<T>(values: T[], rng: Rng): T | undefined {
    return values[Math.floor(rng() * values.length)]
}

export function createChaosRuntime(startedAt: number): ChaosRuntime {
    return {
        nextEventAt: startedAt + CHAOS_EVENT_INTERVAL_MS,
        matchEndsAt: startedAt + CHAOS_MATCH_LIMIT_MS,
        eventCounter: 0,
        eventDue: false,
        event: null,
        treasures: {},
        reaction: null,
        oracleReveals: {},
        winReason: null,
        resumeTurnState: 'WAITING_FOR_ACTION',
    }
}

export function markChaosEventDue(chaos: ChaosRuntime, now: number): boolean {
    if (now < chaos.nextEventAt || chaos.event) return false
    chaos.eventDue = true
    return true
}

function allowedEvents(chaos: ChaosRuntime, now: number): ChaosEventKind[] {
    const finalPhase = now >= chaos.matchEndsAt - (CHAOS_MATCH_LIMIT_MS - CHAOS_FINAL_PHASE_MS)
    return finalPhase
        ? EVENT_ORDER.filter(kind => kind !== 'treasure' && kind !== 'dragon-curse')
        : EVENT_ORDER
}

/** Start only at a server-confirmed turn boundary. */
export function startDueChaosEvent(s: EngineState, chaos: ChaosRuntime, now: number): GameEvent[] {
    if (!chaos.eventDue || chaos.event || chaos.reaction || s.gameState !== 'PLAYING' || s.turnState !== 'WAITING_FOR_ACTION') return []
    const available = allowedEvents(chaos, now)
    const kind = available[chaos.eventCounter % available.length]!
    chaos.eventCounter++
    chaos.eventDue = false
    chaos.oracleReveals = {}
    chaos.resumeTurnState = s.turnState
    s.turnState = 'CHAOS_EVENT'
    const phase = kind === 'goblin-trade' ? 'select-card' : kind === 'oracle' ? 'select-player' : 'rolling'
    chaos.event = {
        kind,
        phase,
        deadlineAt: now + CHAOS_EVENT_ACTION_MS,
        participants: s.players.filter(player => !player.isEliminated).map(player => ({ userId: player.id, status: 'waiting' })),
        selections: {},
    }
    return [{ t: 'CHAOS_EVENT_STARTED', kind }]
}

function participant(event: ChaosEventInternal, userId: string) {
    return event.participants.find(item => item.userId === userId)
}

function allDone(event: ChaosEventInternal): boolean {
    return event.participants.every(item => item.status === 'done' || item.status === 'not-eligible')
}

function uniqueExtreme(ids: string[], rolls: Record<string, number>, high: boolean, rng: Rng): string {
    let tied = [...ids]
    for (let round = 0; tied.length > 1 && round < 64; round++) {
        const best = high
            ? Math.max(...tied.map(id => rolls[id] ?? 0))
            : Math.min(...tied.map(id => rolls[id] ?? 7))
        tied = tied.filter(id => rolls[id] === best)
        if (tied.length <= 1) break
        for (const id of tied) rolls[id] = rollD6(rng)
    }
    return tied.length === 1 ? tied[0]! : tied[Math.floor(rng() * tied.length)]!
}

function resolveRollEvent(s: EngineState, chaos: ChaosRuntime, now: number, rng: Rng, out: GameEvent[]): void {
    const event = chaos.event!
    const rolls = Object.fromEntries(event.participants.map(item => [item.userId, item.roll ?? 1]))
    const ids = event.participants.map(item => item.userId)

    if (event.kind === 'treasure') {
        const winnerId = uniqueExtreme(ids, rolls, true, rng)
        const pool: TreasureAbility[] = ['draw-three', 'discard-one', 'block-penalty']
        chaos.treasures[winnerId] = pick(pool, rng)!
        event.winnerId = winnerId
        resolveEvent(chaos, now, `Schatztruhe: ${playerName(s, winnerId)} erhält eine Schatzfähigkeit.`, out)
        return
    }

    if (event.kind === 'color-storm') {
        const winnerId = uniqueExtreme(ids, rolls, true, rng)
        event.winnerId = winnerId
        event.phase = 'select-color'
        event.deadlineAt = now + CHAOS_EVENT_ACTION_MS
        for (const item of event.participants) item.status = item.userId === winnerId ? 'waiting' : 'done'
        return
    }

    if (event.kind === 'rune-trial') {
        let eligible = 0
        for (const item of event.participants) {
            const player = s.players.find(p => p.id === item.userId)
            if ((item.roll ?? 0) >= 4 && (player?.hand.length ?? 0) > 1) {
                item.status = 'eligible'
                eligible++
            } else item.status = 'not-eligible'
        }
        if (eligible === 0) resolveEvent(chaos, now, 'Runenprüfung: Niemand darf eine Karte abwerfen.', out)
        else {
            event.phase = 'select-card'
            event.deadlineAt = now + CHAOS_EVENT_ACTION_MS
        }
        return
    }

    if (event.kind === 'dragon-curse') {
        const winnerId = uniqueExtreme(ids, { ...rolls }, true, rng)
        const loserPool = ids.filter(id => id !== winnerId)
        const loserId = uniqueExtreme(loserPool.length ? loserPool : ids, { ...rolls }, false, rng)
        event.winnerId = winnerId
        event.loserId = loserId
        const winner = s.players.find(p => p.id === winnerId)
        if (winner && winner.hand.length > 1) {
            const discarded = pick(winner.hand, rng)!
            winner.hand.splice(winner.hand.indexOf(discarded), 1)
            s.discardPile.push(discarded)
        }
        const ev: EngineEvent[] = []
        engine.drawCardToHand(s, loserId, ev, rng)
        out.push(...wireEvents(ev))
        resolveEvent(chaos, now, `Drachenfluch: ${playerName(s, winnerId)} wirft ab, ${playerName(s, loserId)} zieht.`, out)
    }
}

function resolveSelections(s: EngineState, chaos: ChaosRuntime, now: number, rng: Rng, out: GameEvent[]): void {
    const event = chaos.event!
    if (event.kind === 'goblin-trade') {
        const transfers: { from: number; card: Card }[] = []
        s.players.forEach((player, index) => {
            const cardId = event.selections[player.id]
            const cardIndex = player.hand.findIndex(card => card.id === cardId)
            if (cardIndex >= 0) transfers.push({ from: index, card: player.hand.splice(cardIndex, 1)[0]! })
        })
        for (const transfer of transfers) {
            const targetIndex = engine.calculateNextPlayerIndex(transfer.from, s.direction, s.players.length)
            s.players[targetIndex]!.hand.push(transfer.card)
        }
        resolveEvent(chaos, now, 'Goblin-Handel: Die geheim gewählten Karten wurden weitergereicht.', out)
        return
    }
    if (event.kind === 'rune-trial') {
        for (const [userId, cardId] of Object.entries(event.selections)) {
            const player = s.players.find(p => p.id === userId)
            if (!player || player.hand.length <= 1) continue
            const index = player.hand.findIndex(card => card.id === cardId)
            if (index >= 0) s.discardPile.push(player.hand.splice(index, 1)[0]!)
        }
        resolveEvent(chaos, now, 'Runenprüfung: Erfolgreiche Prüflinge haben je eine Karte abgelegt.', out)
        return
    }
    if (event.kind === 'oracle') {
        for (const [viewerId, targetId] of Object.entries(event.selections)) {
            const target = s.players.find(p => p.id === targetId)
            const card = target ? pick(target.hand, rng) : undefined
            if (card) chaos.oracleReveals[viewerId] = { targetUserId: targetId, card }
        }
        resolveEvent(chaos, now, 'Orakelblick: Jede Vision wurde nur ihrem Empfänger offenbart.', out)
    }
}

function resolveEvent(chaos: ChaosRuntime, now: number, message: string, out: GameEvent[]): void {
    const event = chaos.event!
    event.phase = 'resolved'
    event.deadlineAt = now + CHAOS_EVENT_RESULT_MS
    event.message = message
    for (const item of event.participants) if (item.status !== 'not-eligible') item.status = 'done'
    out.push({ t: 'CHAOS_EVENT_RESOLVED', kind: event.kind, message })
}

function playerName(s: EngineState, id: string): string {
    return s.players.find(player => player.id === id)?.name ?? 'Unbekannt'
}

function wireEvents(events: EngineEvent[]): GameEvent[] {
    return events.flatMap(event => event.t === 'DRAW'
        ? [{ t: 'YOU_DREW', cards: [event.card], _owner: event.playerId } as GameEvent & { _owner: string }]
        : event.t === 'RESHUFFLE' ? [{ t: 'RESHUFFLED' } as GameEvent] : [])
}

export function applyChaosEventAction(
    s: EngineState,
    chaos: ChaosRuntime,
    userId: string,
    action: IntentAction,
    now: number,
    rng: Rng = secureUnit,
): { ok: boolean; events: GameEvent[] } {
    const event = chaos.event
    const item = event && participant(event, userId)
    if (!event || !item || event.phase === 'resolved') return { ok: false, events: [] }
    const out: GameEvent[] = []

    if (action.kind === 'CHAOS_EVENT_ROLL' && event.phase === 'rolling' && item.status === 'waiting') {
        item.roll = rollD6(rng)
        item.status = 'done'
        if (allDone(event)) resolveRollEvent(s, chaos, now, rng, out)
        return { ok: true, events: out }
    }
    if (action.kind === 'CHAOS_EVENT_SELECT_CARD' && event.phase === 'select-card'
        && (item.status === 'waiting' || item.status === 'eligible')) {
        const player = s.players.find(p => p.id === userId)
        const card = player?.hand.find(candidate => candidate.id === action.cardId)
        if (!player || !card || (event.kind === 'rune-trial' && player.hand.length <= 1)) return { ok: false, events: [] }
        event.selections[userId] = card.id
        item.status = 'done'
        if (allDone(event)) resolveSelections(s, chaos, now, rng, out)
        return { ok: true, events: out }
    }
    if (action.kind === 'CHAOS_EVENT_SELECT_PLAYER' && event.phase === 'select-player' && item.status === 'waiting') {
        const target = s.players.find(p => p.id === action.targetUserId && !p.isEliminated && p.hand.length > 0)
        if (!target || target.id === userId) return { ok: false, events: [] }
        event.selections[userId] = target.id
        item.status = 'done'
        if (allDone(event)) resolveSelections(s, chaos, now, rng, out)
        return { ok: true, events: out }
    }
    if (action.kind === 'CHAOS_EVENT_CHOOSE_COLOR' && event.phase === 'select-color'
        && event.winnerId === userId && action.color !== 'wild') {
        s.currentColor = action.color
        event.chosenColor = action.color
        item.status = 'done'
        resolveEvent(chaos, now, `Sturm der Farben: ${playerName(s, userId)} bestimmt die aktive Farbe.`, out)
        return { ok: true, events: out }
    }
    return { ok: false, events: [] }
}

/** Fill every missing decision with a server-side fair choice. */
export function autoResolveChaosEvent(s: EngineState, chaos: ChaosRuntime, now: number, rng: Rng = secureUnit): GameEvent[] {
    const event = chaos.event
    if (!event || event.phase === 'resolved') return []
    const out: GameEvent[] = []
    for (const item of event.participants) {
        if (item.status !== 'waiting' && item.status !== 'eligible') continue
        let action: IntentAction
        if (event.phase === 'rolling') action = { kind: 'CHAOS_EVENT_ROLL' }
        else if (event.phase === 'select-color') {
            action = { kind: 'CHAOS_EVENT_CHOOSE_COLOR', color: pick(['red', 'blue', 'green', 'yellow'] as CardColor[], rng)! }
        } else if (event.phase === 'select-player') {
            const targets = s.players.filter(p => p.id !== item.userId && !p.isEliminated && p.hand.length > 0)
            const target = pick(targets, rng)
            if (!target) { item.status = 'done'; continue }
            action = { kind: 'CHAOS_EVENT_SELECT_PLAYER', targetUserId: target.id }
        } else {
            const player = s.players.find(p => p.id === item.userId)
            const card = player ? pick(player.hand, rng) : undefined
            if (!card || (event.kind === 'rune-trial' && (player?.hand.length ?? 0) <= 1)) {
                item.status = 'not-eligible'
                continue
            }
            action = { kind: 'CHAOS_EVENT_SELECT_CARD', cardId: card.id }
        }
        const result = applyChaosEventAction(s, chaos, item.userId, action, now, rng)
        out.push(...result.events)
    }
    if (chaos.event && chaos.event.phase !== 'resolved' && allDone(chaos.event)) {
        if (chaos.event.kind === 'goblin-trade' || chaos.event.kind === 'rune-trial' || chaos.event.kind === 'oracle') {
            resolveSelections(s, chaos, now, rng, out)
        }
    }
    return out
}

export function finishResolvedChaosEvent(s: EngineState, chaos: ChaosRuntime, now: number): boolean {
    if (!chaos.event || chaos.event.phase !== 'resolved' || chaos.event.deadlineAt > now) return false
    chaos.event = null
    chaos.nextEventAt = now + CHAOS_EVENT_INTERVAL_MS
    s.turnState = chaos.resumeTurnState === 'CHAOS_EVENT' ? 'WAITING_FOR_ACTION' : chaos.resumeTurnState
    return true
}

export function chaosViewFor(chaos: ChaosRuntime, viewerId: string, now: number): ChaosView {
    return {
        nextEventAt: chaos.nextEventAt,
        matchEndsAt: chaos.matchEndsAt,
        finalPhase: now >= chaos.matchEndsAt - (CHAOS_MATCH_LIMIT_MS - CHAOS_FINAL_PHASE_MS),
        event: chaos.event ? {
            kind: chaos.event.kind,
            phase: chaos.event.phase,
            deadlineAt: chaos.event.deadlineAt,
            participants: chaos.event.participants.map(item => ({ ...item })),
            winnerId: chaos.event.winnerId,
            loserId: chaos.event.loserId,
            chosenColor: chaos.event.chosenColor,
            message: chaos.event.message,
        } : null,
        myTreasure: chaos.treasures[viewerId] ?? null,
        treasureHolders: Object.entries(chaos.treasures).filter(([, value]) => !!value).map(([id]) => id),
        reaction: chaos.reaction ? {
            targetUserId: chaos.reaction.targetId,
            amount: chaos.reaction.amount,
            reflected: chaos.reaction.reflected,
        } : null,
        oracleReveal: chaos.oracleReveals[viewerId] ?? null,
        winReason: chaos.winReason,
    }
}

function cardPoints(card: Card): number {
    if (card.type === 'number') return card.value ?? 0
    return card.color === 'wild' ? 50 : 20
}

export function timeLimitWinner(s: EngineState, rng: Rng = secureUnit): string {
    const active = s.players.filter(player => !player.isEliminated)
    const fewest = Math.min(...active.map(player => player.hand.length))
    let tied = active.filter(player => player.hand.length === fewest)
    const sums = new Map(tied.map(player => [player.id, player.hand.reduce((sum, card) => sum + cardPoints(card), 0)]))
    const lowest = Math.min(...tied.map(player => sums.get(player.id)!))
    tied = tied.filter(player => sums.get(player.id) === lowest)
    for (let round = 0; tied.length > 1 && round < 64; round++) {
        const rolls = new Map(tied.map(player => [player.id, rollD6(rng)]))
        const high = Math.max(...rolls.values())
        tied = tied.filter(player => rolls.get(player.id) === high)
    }
    return (tied.length === 1 ? tied[0] : tied[Math.floor(rng() * tied.length)])!.id
}

export function endChaosByTime(s: EngineState, chaos: ChaosRuntime, rng: Rng = secureUnit): GameEvent[] {
    if (s.gameState !== 'PLAYING') return []
    const winnerId = timeLimitWinner(s, rng)
    const ev: EngineEvent[] = []
    engine.endGame(s, winnerId, ev)
    chaos.winReason = 'time'
    return [{ t: 'TIME_LIMIT_REACHED', winnerId }, { t: 'GAME_OVER', winnerId }]
}
