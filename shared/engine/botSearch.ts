/**
 * The bot as a host seat, plus the lookahead the top rungs use.
 *
 * Lookahead is determinized Monte Carlo: the bot only knows public facts (its
 * own hand, the discard pile, hand sizes), so for each rollout it deals the
 * opponent a random hand from the cards it has not seen, tries every distinct
 * legal option, and plays each one out to the end with the sharp heuristic on
 * both sides. The option that wins most rollouts is played. It never looks at
 * the opponent's real hand or the real deck order.
 *
 * All randomness comes from the rng passed in, so the daily stays
 * reproducible.
 */

import type { Card, CardColor, EngineState, Player, Rng } from './types'
import { generateFullDeck, shuffleDeck } from './deck'
import { canPlayCard } from './rules'
import {
    chooseCard, chooseDiscardAllTop, chooseRouletteColor, chooseSwapTarget, chooseWildColor,
    wantsSwap, willCatchMercy, type BotProfile,
} from './bot'
import { cloneState, drawFor, playFor, playOut, type Seat } from './playout'

/** The store's chance a bot catches a human who forgot MERCY. */
const BOT_CATCHES_HUMAN = 0.7
const ROLLOUT_STEPS = 400

export function mulberry32(seed: number): Rng {
    let a = seed >>> 0
    return () => {
        a = (a + 0x6D2B79F5) | 0
        let t = Math.imul(a ^ (a >>> 15), 1 | a)
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
}

let fullDeck: Card[] | null = null
function allCards(): Card[] {
    fullDeck ??= generateFullDeck()
    return fullDeck
}

function legal(s: EngineState, me: Player): Card[] {
    const top = s.discardPile[s.discardPile.length - 1]
    if (!top) return []
    return me.hand.filter(c => canPlayCard(c, top, s.currentColor, s.drawStack, s.stackingMode))
}

/** A card to play, and for a wild, the colour to name (else the host picks). */
export interface BotMove {
    card: Card
    color?: CardColor
}

/** The bot's move, with lookahead when the profile asks for it. Null means draw / eat the stack. */
export function chooseBotCard(s: EngineState, me: Player, opp: Player, profile: BotProfile, rng: Rng): BotMove | null {
    const playable = legal(s, me)
    if ((profile.search ?? 0) > 0 && playable.length) {
        const pick = searchMove(s, me, playable, profile, rng)
        if (pick !== undefined) return pick
    }
    const card = chooseCard({ playable, drawStack: s.drawStack, opponents: [opp], self: me }, profile, rng)
    return card && { card }
}

/** The bot as a playout seat — the same calls the store makes for a bot. */
export function botSeat(profile: BotProfile): Seat {
    // The searched colour for the wild just chosen, handed to wildColor.
    let pendingColor: CardColor | undefined
    return {
        chooseCard: (s, me, opp, rng) => {
            const move = chooseBotCard(s, me, opp, profile, rng)
            pendingColor = move?.color
            return move?.card ?? null
        },
        wildColor: (_s, me, _opp, rng) => {
            const c = pendingColor
            pendingColor = undefined
            return c ?? chooseWildColor(me.hand, profile, rng)
        },
        rouletteColor: (s, me, rng) => chooseRouletteColor(me.hand, profile, rng, s.discardPile),
        wantsSwap: (_s, me, opp, rng) => {
            const target = chooseSwapTarget({ playable: [], drawStack: 0, opponents: [opp] }, profile, rng)
            return !!target && wantsSwap(me, target, profile, rng)
        },
        discardAllTop: (_s, _me, cards, rng) => chooseDiscardAllTop(cards, profile, rng),
        callsMercy: rng => willCatchMercy(profile, rng),
        catchesMercy: rng => rng() < BOT_CATCHES_HUMAN,
    }
}

const cardKey = (c: Card) => `${c.color}:${c.type}:${c.value ?? ''}`
const COLOURS: CardColor[] = ['red', 'blue', 'green', 'yellow']

/**
 * Determinized Monte Carlo over the distinct legal moves (each colour a wild
 * could name counts as its own move, plus eating the stack when one is live).
 * Returns undefined when there is nothing to weigh.
 */
function searchMove(s: EngineState, me: Player, playable: Card[], profile: BotProfile, rng: Rng): BotMove | null | undefined {
    const options: (BotMove | null)[] = []
    const seen = new Set<string>()
    const held = COLOURS.filter(c => me.hand.some(h => h.color === c))
    for (const c of playable) {
        const k = cardKey(c)
        if (seen.has(k)) continue
        seen.add(k)
        if (c.color === 'wild' && c.type !== 'wildColorRoulette' && held.length) {
            for (const color of held) options.push({ card: c, color })
        } else {
            options.push({ card: c })
        }
    }
    if (s.drawStack > 0) options.push(null)
    if (options.length < 2) return undefined

    const opp = s.players.find(p => p.id !== me.id && !p.isEliminated)
    if (!opp) return undefined
    const known = new Set([...me.hand, ...s.discardPile].map(c => c.id))
    const unseen = allCards().filter(c => !known.has(c.id))

    const rollout: BotProfile = { ...profile, skill: 1, search: 0, catchRate: 1 }
    const seats = { [me.id]: botSeat(rollout), [opp.id]: botSeat(rollout) }
    const rollouts = profile.search ?? 0
    const wins = options.map(() => 0)

    for (let r = 0; r < rollouts; r++) {
        // One deal per rollout, shared by every option, so options are
        // compared on the same hidden cards.
        const seed = Math.floor(rng() * 4294967296)
        const dealRng = mulberry32(seed)
        const pool = shuffleDeck(unseen, dealRng)
        const oppHand = pool.slice(0, opp.hand.length)
        const deck = pool.slice(opp.hand.length)

        options.forEach((opt, i) => {
            const g = { s: cloneState(s), seats, rng: mulberry32(seed ^ 0x5bd1e995) }
            g.s.players.find(p => p.id === opp.id)!.hand = [...oppHand]
            g.s.deck = [...deck]
            const self = g.s.players.find(p => p.id === me.id)!
            if (opt) playFor(g, self, self.hand.find(c => c.id === opt.card.id)!, opt.color)
            else drawFor(g, self)
            playOut(g, ROLLOUT_STEPS)
            if (g.s.winnerId === me.id) wins[i]!++
            else if (g.s.gameState === 'PLAYING') wins[i]! += 0.5
        })
    }

    let best = 0
    for (let i = 1; i < options.length; i++) if (wins[i]! > wins[best]!) best = i
    return options[best] ?? null
}
