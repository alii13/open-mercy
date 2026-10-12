/**
 * Bot difficulty simulator: a fixed reference player (seat p-0, standing in
 * for a decent human) plays full 1v1 solo games against one bot (seat p-1)
 * through the real engine and the store's host rules (see playout.ts).
 *
 * Not part of the game runtime. The heavy run lives behind BOT_SIM=1 in
 * __tests__/sim.heavy.test.ts.
 *
 * The reference must stay FIXED: difficulty is measured as the reference's
 * win rate, so changing it moves every number.
 */

import type { Card, CardColor, EngineEvent, EngineState, Player, Rng, StackingMode } from './types'
import { generateFullDeck, shuffleDeck } from './deck'
import { canPlayCard, countByColor, getDrawValue } from './rules'
import * as engine from './engine'
import type { BotProfile } from './bot'
import { botSeat, mulberry32 } from './botSearch'
import { playOut, type Seat } from './playout'

const HUMAN = 'p-0'
const BOT = 'p-1'
const MAX_STEPS = 4000
const COLORS = ['red', 'blue', 'green', 'yellow'] as const

// --- Reference player: a fixed heuristic standing in for a decent human ---

function mostHeldColor(hand: Card[], rng: Rng): CardColor {
    const counts = countByColor(hand)
    let best: typeof COLORS[number] | null = null
    for (const c of COLORS) if (counts[c] > 0 && (!best || counts[c] > counts[best])) best = c
    return best ?? COLORS[Math.floor(rng() * COLORS.length)]!
}

/** Trading hands (a 0, or a 7's swap) helps only when the other hand is smaller. */
function tradeHelps(myHandAfter: number, oppHand: number): boolean {
    return oppHand < myHandAfter
}

/**
 * Stack live: pass it on with the smallest legal draw. Otherwise shed
 * coloured non-draw cards (most-held colour first), then coloured draws, then
 * plain wilds and roulette, then wild draws. A 0 or 7 jumps the queue when
 * trading hands helps and drops to last when it hurts.
 */
export function referenceChooseCard(s: EngineState, me: Player, opp: Player): Card | null {
    const top = engine.topCard(s)
    if (!top) return null
    const playable = me.hand.filter(c => canPlayCard(c, top, s.currentColor, s.drawStack, s.stackingMode))
    if (!playable.length) return null
    if (s.drawStack > 0) return [...playable].sort((a, b) => getDrawValue(a) - getDrawValue(b))[0]!

    const counts = countByColor(me.hand)
    const isTrade = (c: Card) => c.type === 'number' && (c.value === 0 || c.value === 7)
    const good = tradeHelps(me.hand.length - 1, opp.hand.length)
    const rank = (c: Card): number => {
        if (isTrade(c)) return good ? 0 : 5
        if (c.color !== 'wild' && getDrawValue(c) === 0) return 1
        if (c.color !== 'wild') return 2
        if (getDrawValue(c) === 0) return 3
        return 4
    }
    const weight = (c: Card) => (c.color === 'wild' ? 0 : counts[c.color])
    return [...playable].sort((a, b) => rank(a) - rank(b) || weight(b) - weight(a))[0]!
}

function referenceDiscardAllTop(cards: Card[]): Card {
    const rank = (c: Card) => {
        const d = getDrawValue(c)
        if (d > 0) return -d
        if (c.type === 'skip' || c.type === 'reverse' || c.type === 'skipEveryone') return 0
        if (c.type === 'number' && (c.value === 0 || c.value === 7)) return 2
        return 1
    }
    return [...cards].sort((a, b) => rank(a) - rank(b))[0]!
}

/**
 * The reference seat. Always calls MERCY, catches a bot's missed MERCY at
 * `catchRate`. Its own coin flips use a private stream so they never shift
 * the deck's or the bot's random sequence.
 */
export function referenceSeat(rng: Rng, catchRate = 0.5): Seat {
    return {
        chooseCard: (s, me, opp) => referenceChooseCard(s, me, opp),
        wildColor: (_s, me) => mostHeldColor(me.hand, rng),
        rouletteColor: (_s, me) => mostHeldColor(me.hand, rng),
        wantsSwap: (_s, me, opp) => tradeHelps(me.hand.length, opp.hand.length),
        discardAllTop: (_s, _me, cards) => referenceDiscardAllTop(cards),
        callsMercy: () => true,
        catchesMercy: () => rng() < catchRate,
    }
}

// --- Game driver ---

export interface SimResult {
    winner: 'reference' | 'bot' | 'none'
    /** True when the loser was knocked out by the mercy limit, not out-shed. */
    byMercy: boolean
    steps: number
    /** Every play and stack eaten, in order — the determinism fingerprint. */
    trace: string[]
}

export interface SimOptions {
    stackingMode?: StackingMode
    /** Chance the reference catches a bot that forgot MERCY. */
    referenceCatchRate?: number
}

/** One solo game, seeded. Same seed and profile → identical game. */
export function simulateGame(seed: number, bot: BotProfile, opts: SimOptions = {}): SimResult {
    const rng = mulberry32(seed)
    const players: Player[] = [
        { id: HUMAN, name: 'Reference', hand: [], isEliminated: false, isBot: false, score: 0 },
        { id: BOT, name: bot.name, hand: [], isEliminated: false, isBot: true, score: 0 },
    ]
    const s: EngineState = {
        players,
        deck: shuffleDeck(generateFullDeck(), rng),
        discardPile: [],
        currentPlayerIndex: 0,
        direction: 1,
        drawStack: 0,
        currentColor: 'red',
        turnState: 'DEALING',
        gameState: 'PLAYING',
        winnerId: null,
        rouletteTargetColor: null,
        pendingDiscardAllCards: [],
        swapInitiatorId: null,
        hasCalledUno: {},
        stackingMode: opts.stackingMode ?? 'official',
    }

    const ev: EngineEvent[] = []
    for (let round = 0; round < 7; round++) {
        for (const p of players) {
            const c = engine.drawCardFromDeck(s, ev, rng)
            if (c) p.hand.push(c)
        }
    }
    engine.drawFirstDiscard(s, ev, rng)
    s.turnState = 'WAITING_FOR_ACTION'

    const trace: string[] = []
    const seats = {
        [HUMAN]: referenceSeat(mulberry32(seed ^ 0x9E3779B9), opts.referenceCatchRate ?? 0.5),
        [BOT]: botSeat(bot),
    }
    const steps = playOut({ s, seats, rng, trace }, MAX_STEPS)

    const winner = s.winnerId === HUMAN ? 'reference' : s.winnerId === BOT ? 'bot' : 'none'
    return { winner, byMercy: players.some(p => p.isEliminated), steps, trace }
}

export interface MatchupStats {
    botId: string
    games: number
    referenceWins: number
    botWins: number
    unfinished: number
    /** Reference win rate over finished games. */
    p: number
    /** 95% normal-approximation half-width on p. */
    ci95: number
}

export function simulateMatchup(bot: BotProfile, games: number, seedBase = 1, opts: SimOptions = {}): MatchupStats {
    let referenceWins = 0
    let botWins = 0
    let unfinished = 0
    for (let i = 0; i < games; i++) {
        const r = simulateGame(seedBase + i, bot, opts)
        if (r.winner === 'reference') referenceWins++
        else if (r.winner === 'bot') botWins++
        else unfinished++
    }
    const n = referenceWins + botWins
    const p = n ? referenceWins / n : 0
    return { botId: bot.id, games, referenceWins, botWins, unfinished, p, ci95: n ? 1.96 * Math.sqrt(p * (1 - p) / n) : 0 }
}
