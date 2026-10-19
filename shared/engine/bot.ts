/**
 * Bot personalities.
 *
 * The old bot was one flat policy: pick a random playable card, prefer a
 * special if one is available, catch a missed MERCY 70% of the time. Every
 * opponent in the game played identically, so solo had no progression and no
 * reason to come back.
 *
 * A profile is four dials rather than a subclass, because the interesting
 * differences are tendencies, not rules. Two bots with the same dials at
 * different settings feel genuinely unlike each other across a whole game
 * without either playing "wrong".
 *
 * Everything here is a pure function of (state, profile, rng). That is what
 * lets the daily challenge stay reproducible: same seed plus same pinned
 * profile gives the same game on every device, forever.
 */

import type { Card, CardColor, Player } from './types'
import { getDrawValue } from './rules'

export interface BotProfile {
    id: string
    name: string
    /** Leans on draw and skip cards rather than shedding numbers. */
    aggression: number
    /** Holds wilds back for when they are needed instead of dumping them. */
    wildDiscipline: number
    /** Chance of catching an opponent who forgot to call MERCY. */
    catchRate: number
    /** Chance of aiming a swap or a stack at the player who is winning. */
    targeting: number
    /**
     * Chance each decision uses the full sharp policy (card scoring, swap
     * judgement, colour and roulette sense) instead of the loose dial-driven
     * pick. The main difficulty lever.
     */
    skill?: number
    /**
     * Lookahead rollouts per card choice (0 = none). See botSearch.ts. The
     * strongest lever, and the only one that costs CPU.
     */
    search?: number
}

/**
 * Eight rungs. The dials climb together but not in lockstep — a ladder where
 * every opponent is strictly "the last one but better" is a difficulty slider
 * wearing eight names.
 *
 * Difficulty comes mostly from skill (sharp policy) and search (lookahead).
 * They are tuned with the simulator (sim.ts, __tests__/sim.heavy.test.ts) so
 * a fixed reference player's odds of winning are about a third of what they
 * were against the original dial-only bots, with each rung harder than the
 * last. Retune with the simulator, not by feel. catchRate also decides how
 * often the bot calls its own MERCY in time.
 */
export const BOT_LADDER: BotProfile[] = [
    { id: 'scrap',      name: 'Scrap',      aggression: 0.15, wildDiscipline: 0.05, catchRate: 0.60, targeting: 0.0,  skill: 1, search: 0 },
    { id: 'pilot',      name: 'Pilot',      aggression: 0.30, wildDiscipline: 0.20, catchRate: 0.90, targeting: 0.0,  skill: 1, search: 10 },
    { id: 'vera',       name: 'Vera',       aggression: 0.20, wildDiscipline: 0.65, catchRate: 0.90, targeting: 0.2,  skill: 1, search: 12 },
    { id: 'rook',       name: 'Rook',       aggression: 0.55, wildDiscipline: 0.45, catchRate: 0.90, targeting: 0.5,  skill: 1, search: 16 },
    { id: 'marla',      name: 'Marla',      aggression: 0.75, wildDiscipline: 0.35, catchRate: 0.90, targeting: 0.6,  skill: 1, search: 22 },
    { id: 'kobra',      name: 'Kobra',      aggression: 0.85, wildDiscipline: 0.60, catchRate: 0.90, targeting: 0.75, skill: 1, search: 28 },
    { id: 'zenith',     name: 'Zenith',     aggression: 0.70, wildDiscipline: 0.90, catchRate: 0.92, targeting: 0.85, skill: 1, search: 42 },
    { id: 'terminator', name: 'Terminator', aggression: 0.90, wildDiscipline: 0.85, catchRate: 0.95, targeting: 1.0,  skill: 1, search: 56 },
]

/**
 * The daily challenge pins this one by id, never by ladder position. Everyone
 * in the world must face the same opponent on the same deal, so it can never
 * depend on what a given player has unlocked, and reordering the ladder must
 * not silently change the daily.
 */
export const DAILY_BOT_ID = 'terminator'

export function botById(id: string): BotProfile {
    return BOT_LADDER.find(b => b.id === id) ?? BOT_LADDER[0]!
}

export function dailyBot(): BotProfile {
    return botById(DAILY_BOT_ID)
}

/**
 * A newcomer who meets the sharp policy on game one mostly does not come
 * back: three-day return for players whose first game was solo runs at about
 * half the rate it does when the bottom rung plays loose. A newcomer's first
 * few games (any mode counts) therefore seat these dials under whichever name
 * the ladder offers, so a first game is a coin flip and the unlock path is
 * unchanged.
 */
export const WARM_UP_GAMES = 3

export function warmUp(profile: BotProfile): BotProfile {
    return { ...profile, skill: 0, search: 0, catchRate: 0.15 }
}

export interface BotContext {
    /** Cards the bot may legally play right now. */
    playable: Card[]
    /** Live draw stack — non-zero means a chain is landing on someone. */
    drawStack: number
    /** Opponents still in the game, for targeting decisions. */
    opponents: Player[]
    /** The bot's own seat. Without it the sharp policy only sees `playable`. */
    self?: Player
}

/**
 * Which card to play. Returns null when the bot should draw instead.
 *
 * Each call is either sharp (chance = skill) or loose. The loose branch is the
 * original dial-driven pick. The sharp branch scores every legal card on what
 * a strong player weighs in 1v1 No Mercy: keep draw cards as stack defence,
 * spend them when they can finish or eliminate, chain extra-turn cards, only
 * trade hands when it helps, and shed into the colour the bot holds most.
 */
export function chooseCard(ctx: BotContext, profile: BotProfile, rng: () => number): Card | null {
    const { playable, drawStack } = ctx
    if (!playable.length) return null
    if (rng() < (profile.skill ?? 0)) return sharpCard(ctx)

    if (drawStack > 0) {
        // Pass the stack on, and an aggressive bot escalates with the biggest
        // draw it holds rather than the cheapest that happens to be legal.
        const byDraw = [...playable].sort((a, b) => getDrawValue(b) - getDrawValue(a))
        return (rng() < profile.aggression ? byDraw[0] : byDraw[byDraw.length - 1]) ?? playable[0]!
    }

    const specials = playable.filter(c => c.color !== 'wild' && c.type !== 'number')
    const numbers = playable.filter(c => c.type === 'number')

    // Discipline is the chance of NOT spending a wild while a coloured option
    // exists. A disciplined bot keeps them for when it is genuinely stuck.
    const holdWild = rng() < profile.wildDiscipline
    const coloured = [...specials, ...numbers]
    const pool = holdWild && coloured.length ? coloured : playable

    const poolSpecials = pool.filter(c => c.type !== 'number')
    const poolNumbers = pool.filter(c => c.type === 'number')

    if (poolSpecials.length && rng() < profile.aggression) return pick(poolSpecials, rng)
    if (poolNumbers.length) return pick(poolNumbers, rng)
    return pick(pool, rng)
}

/** Mercy elimination threshold — a hand this big is out. */
const MERCY_LIMIT = 25

const isExtraTurn = (c: Card) => c.type === 'skip' || c.type === 'reverse' || c.type === 'skipEveryone'
const isHandTrade = (c: Card) => c.type === 'number' && (c.value === 0 || c.value === 7)

function smallestOpponent(ctx: BotContext): number {
    const alive = ctx.opponents.filter(p => !p.isEliminated).map(p => p.hand.length)
    return alive.length ? Math.min(...alive) : 7
}

function sharpCard(ctx: BotContext): Card {
    const { playable, drawStack } = ctx
    const hand = ctx.self?.hand ?? playable
    const opp = smallestOpponent(ctx)

    if (drawStack > 0) {
        // Pass the stack on with the smallest legal draw: the big ones are
        // worth more held back for the next round of the same war.
        return [...playable].sort((a, b) => getDrawValue(a) - getDrawValue(b))[0]!
    }

    const tradeHelps = opp < hand.length - 1
    const counts = countColours(hand)
    // Draw cards are stack defence. Spend one only when it can end the game:
    // the opponent is about to go out, or near enough the mercy limit.
    const attackWith = (v: number) => opp <= 2 || opp >= MERCY_LIMIT - 6 || opp + v >= MERCY_LIMIT

    const score = (c: Card): number => {
        const after = c.color === 'wild' ? 0 : counts[c.color] - 1
        const keep = 2 * after
        const draw = getDrawValue(c)
        if (isHandTrade(c)) return tradeHelps ? 100 : (c.value === 7 ? 8 + keep : -40)
        if (c.type === 'discardAll') return 10 + 12 * after
        if (isExtraTurn(c)) return 30 + keep
        if (c.type === 'wildColorRoulette') return 25
        if (draw > 0) {
            if (attackWith(draw)) return 40 + draw + keep
            return c.color === 'wild' ? -30 - draw : -10 + keep
        }
        if (c.color === 'wild') return -20
        return 10 + keep
    }

    let best = playable[0]!
    let bestScore = score(best)
    for (const c of playable.slice(1)) {
        const sc = score(c)
        if (sc > bestScore) { best = c; bestScore = sc }
    }
    return best
}

const COLOURS = ['red', 'blue', 'green', 'yellow'] as const
type Colour = typeof COLOURS[number]

function countColours(hand: Card[]): Record<Colour, number> {
    const n = { red: 0, blue: 0, green: 0, yellow: 0 }
    for (const c of hand) if (c.color !== 'wild') n[c.color]++
    return n
}

/** Who to hit with a swap. Sharper bots aim at whoever is closest to winning. */
export function chooseSwapTarget(ctx: BotContext, profile: BotProfile, rng: () => number): Player | null {
    const alive = ctx.opponents.filter(p => !p.isEliminated)
    if (!alive.length) return null
    if (rng() < profile.targeting) {
        return [...alive].sort((a, b) => a.hand.length - b.hand.length)[0]!
    }
    return pick(alive, rng)
}

/** Whether this bot notices an opponent who failed to call MERCY. */
export function willCatchMercy(profile: BotProfile, rng: () => number): boolean {
    return rng() < profile.catchRate
}

/**
 * Wild colour. A sharp call names the colour the bot holds most of, ties
 * going to the colour with more extra-turn cards to chain. Otherwise a
 * targeting bot picks its most-held colour and the rest pick at random from
 * what they hold, which is the old behaviour.
 */
export function chooseWildColor(hand: Card[], profile: BotProfile, rng: () => number): CardColor {
    const colors: CardColor[] = ['red', 'blue', 'green', 'yellow']
    const counts = colors.map(c => ({ c, n: hand.filter(card => card.color === c).length }))
    const held = counts.filter(x => x.n > 0)
    if (!held.length) return colors[Math.floor(rng() * colors.length)]!
    if (rng() < (profile.skill ?? 0)) {
        const chain = (c: CardColor) => hand.filter(card => card.color === c && isExtraTurn(card)).length
        return [...held].sort((a, b) => b.n - a.n || chain(b.c) - chain(a.c))[0]!.c
    }
    if (rng() < profile.targeting) {
        return [...held].sort((a, b) => b.n - a.n)[0]!.c
    }
    return held[Math.floor(rng() * held.length)]!.c
}

/**
 * Which matching card ends on top of a multi-match Discard All. Every match
 * leaves the hand either way, so a sharp bot puts its biggest draw on top
 * (a free attack), else a card that keeps the turn. A loose one picks at
 * random, which is the old behaviour.
 */
export function chooseDiscardAllTop(cards: Card[], profile: BotProfile, rng: () => number): Card {
    if (rng() >= (profile.skill ?? 0)) return pick(cards, rng)
    const rank = (c: Card) => {
        const d = getDrawValue(c)
        if (d > 0) return -d
        if (isExtraTurn(c)) return 0
        if (isHandTrade(c)) return 2
        return 1
    }
    return [...cards].sort((a, b) => rank(a) - rank(b))[0]!
}

/**
 * The colour a bot names when it is the victim of a Colour Roulette: it keeps
 * drawing until that colour turns up. A sharp bot names the colour with the
 * most cards it has not seen (not in hand, not on the discard pile), which
 * ends the roulette soonest. A loose one names a wild colour as before.
 */
export function chooseRouletteColor(hand: Card[], profile: BotProfile, rng: () => number, seen: Card[] = []): CardColor {
    if (rng() >= (profile.skill ?? 0)) return chooseWildColor(hand, profile, rng)
    const held = countColours(hand)
    const shown = countColours(seen)
    return [...COLOURS].sort((a, b) => (held[a] + shown[a]) - (held[b] + shown[b]))[0]!
}

/**
 * Whether a bot that played a 7 goes through with the swap. A sharp bot only
 * trades into a smaller hand; a loose one always swaps, as before.
 */
export function wantsSwap(self: Player, target: Player, profile: BotProfile, rng: () => number): boolean {
    if (rng() >= (profile.skill ?? 0)) return true
    return target.hand.length < self.hand.length
}

function pick<T>(list: T[], rng: () => number): T {
    return list[Math.floor(rng() * list.length)]!
}
