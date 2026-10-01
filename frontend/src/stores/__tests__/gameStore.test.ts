/**
 * Regression tests for single-player engine soft-locks and rematch leaks.
 * Each test pins a specific bug fixed in the 2026-06 bug sweep so a future
 * refactor can't silently reintroduce it.
 */

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: { getUser: async () => ({ data: { user: null } }) },
        from: () => {
            throw new Error('unexpected supabase call in single-player test')
        },
    },
}))

vi.mock('../../composables/useSoundEffects', () => ({
    soundEffects: new Proxy({}, { get: () => () => undefined }),
}))

const { track } = vi.hoisted(() => ({ track: vi.fn() }))
vi.mock('../../utils/analytics', () => ({ track, trackScreen: vi.fn() }))

import { useGameStore } from '../gameStore'
import type { Card, Player } from '../../types/card'

function makePlayer(id: string, name: string, hand: Card[] = []): Player {
    return { id, name, hand, isEliminated: false, isBot: false, score: 0 }
}

const red5: Card = { id: 'c-red-5', color: 'red', type: 'number', value: 5 }

beforeEach(() => {
    setActivePinia(createPinia())
    track.mockClear()
})

afterEach(() => {
    vi.useRealTimers()
})

describe('roulette draw with an exhausted deck', () => {
    it('ends the turn instead of spinning forever when nothing can be drawn', () => {
        vi.useFakeTimers()
        const store = useGameStore()
        store.players = [makePlayer('p-0', 'You'), makePlayer('p-1', 'Friend')]
        store.gameState = 'PLAYING'
        // Deck empty + single-card discard means reshuffleDeck refuses, so
        // every draw returns undefined — the pre-fix loop respawned itself
        // via setTimeout forever in ROULETTE_DRAWING.
        store.deck = []
        store.discardPile = [red5]
        store.currentPlayerIndex = 1
        store.turnState = 'ROULETTE_DRAWING'
        store.rouletteTargetColor = 'blue'
        store.actionInProgress = true

        store.executeRouletteDraw()

        expect(store.turnState).toBe('WAITING_FOR_ACTION')
        expect(store.currentPlayerIndex).toBe(0)
        expect(store.actionInProgress).toBe(false)
        // No respawned roulette tick waiting to fire.
        expect(vi.getTimerCount()).toBe(0)
    })
})

describe('initializeGame', () => {
    it('clears in-flight flags leaked from the previous game', () => {
        const store = useGameStore()
        store.actionInProgress = true
        store.suppressDiscardSlam = true
        store.pendingDealCard = { playerId: 'p-0', card: red5 }
        store.pendingDiscardAllCards = [red5]
        store.pendingDrawnWildCard = red5

        store.initializeGame(['You', 'Bot'])

        expect(store.actionInProgress).toBe(false)
        expect(store.suppressDiscardSlam).toBe(false)
        expect(store.pendingDealCard).toBeNull()
        expect(store.pendingDiscardAllCards).toEqual([])
        expect(store.pendingDrawnWildCard).toBeNull()
    })
})

describe('UNO button visibility', () => {
    function setupTable() {
        const store = useGameStore()
        store.players = [
            makePlayer('p-0', 'You', [red5, { ...red5, id: 'c-2' }]),
            { ...makePlayer('p-1', 'Bot', [red5]), isBot: true } satisfies Player,
        ]
        store.gameState = 'PLAYING'
        store.turnState = 'WAITING_FOR_ACTION'
        store.currentPlayerIndex = 0
        // Mutations must go through the store's reactive proxies, not the raw
        // objects, or the computed under test never re-evaluates.
        return { store, human: store.players[0]! }
    }

    it('shows at 2 cards on the human turn and hides again when the hand grows', () => {
        const { store, human } = setupTable()
        expect(store.showUnoButton).toBe(true)

        // Eating a penalty used to leave the latched button visible forever —
        // the bug where a UNO button showed at 3+ cards.
        human.hand.push({ ...red5, id: 'c-3' }, { ...red5, id: 'c-4' })
        expect(store.showUnoButton).toBe(false)
    })

    it('hides after calling UNO', () => {
        const { store } = setupTable()
        expect(store.showUnoButton).toBe(true)
        store.callUno('p-0')
        expect(store.showUnoButton).toBe(false)
    })

    it('shows while the human is exposed in a catch window, even off-turn', () => {
        const { store, human } = setupTable()
        human.hand = [red5]
        store.currentPlayerIndex = 1
        expect(store.showUnoButton).toBe(false)

        store.catchableId = 'p-0'
        expect(store.showUnoButton).toBe(true)

        store.catchableId = null
        expect(store.showUnoButton).toBe(false)
    })

    it('stays hidden when a bot is the one exposed', () => {
        const { store } = setupTable()
        store.currentPlayerIndex = 1
        store.catchableId = 'p-1'
        expect(store.showUnoButton).toBe(false)
    })
})

describe('single-player rule fixes', () => {
    // Issue #182: a drawn Color Roulette opened the drawn-wild colour picker,
    // so it looked like a plain Wild. The victim picks the roulette colour.
    it('plays a drawn Color Roulette without asking the drawer for a colour', () => {
        vi.useFakeTimers()
        const store = useGameStore()
        const roulette: Card = { id: 'c-roul-182', color: 'wild', type: 'wildColorRoulette' }
        const blue1: Card = { id: 'c-blue-1', color: 'blue', type: 'number', value: 1 }
        const bot = makePlayer('p-1', 'Bot', [blue1])
        bot.isBot = true
        store.players = [makePlayer('p-0', 'You', [{ ...blue1, id: 'c-blue-1b' }]), bot]
        store.gameState = 'PLAYING'
        store.currentPlayerIndex = 0
        store.discardPile = [red5]
        store.currentColor = 'red'
        store.drawStack = 0
        store.deck = [roulette]
        store.turnState = 'WAITING_FOR_ACTION'

        store.drawCardsForCurrentPlayer()
        vi.advanceTimersByTime(3000)

        expect(store.pendingDrawnWildCard).toBeNull()
        expect(store.turnState).not.toBe('CHOOSING_DRAWN_WILD_COLOR')
        expect(store.discardPile[store.discardPile.length - 1]?.id).toBe('c-roul-182')
    })

    it('detects a win when wildColorRoulette is played as the last card', () => {
        vi.useFakeTimers()
        const store = useGameStore()
        const roulette: Card = { id: 'c-roul', color: 'wild', type: 'wildColorRoulette' }
        const bot = makePlayer('p-1', 'Bot')
        bot.isBot = true
        store.players = [makePlayer('p-0', 'You', [roulette]), bot]
        store.gameState = 'PLAYING'
        store.currentPlayerIndex = 0
        store.discardPile = [red5]
        store.currentColor = 'red'
        store.turnState = 'WAITING_FOR_ACTION'

        store.playCard('p-0', roulette)

        // Pre-fix, the roulette early-return skipped the win check entirely and
        // the game limped on with a 0-card player.
        expect(store.winnerId).toBe('p-0')
        expect(store.gameState).toBe('GAME_OVER')
    })

    it('rotates hands only among active players, skipping eliminated seats', () => {
        vi.useFakeTimers()
        const store = useGameStore()
        const zero: Card = { id: 'c-zero', color: 'red', type: 'number', value: 0 }
        const cardA: Card = { id: 'c-a', color: 'blue', type: 'number', value: 1 }
        const cardB: Card = { id: 'c-b', color: 'green', type: 'number', value: 2 }
        const cardC: Card = { id: 'c-c', color: 'yellow', type: 'number', value: 3 }
        const elim = makePlayer('p-1', 'Elim', [])
        elim.isEliminated = true
        store.players = [
            makePlayer('p-0', 'You', [zero, cardA]),
            elim,
            makePlayer('p-2', 'Bot', [cardB, cardC]),
        ]
        store.gameState = 'PLAYING'
        store.currentPlayerIndex = 0
        store.discardPile = [red5]
        store.currentColor = 'red'
        store.turnState = 'WAITING_FOR_ACTION'

        store.playCard('p-0', zero)

        // The eliminated seat is never dealt into the rotation (pre-fix it would
        // receive an active hand and strand an active player on 0 cards).
        expect(store.players[1]!.hand).toEqual([])
        // The two active players swapped hands (p-0 held [cardA] after playing 0).
        expect(store.players[0]!.hand.map(c => c.id).sort()).toEqual(['c-b', 'c-c'])
        expect(store.players[2]!.hand.map(c => c.id)).toEqual(['c-a'])
    })

    it('applies the top card effect on an auto (single-match) DiscardAll', () => {
        vi.useFakeTimers()
        const store = useGameStore()
        const discallRed: Card = { id: 'c-da', color: 'red', type: 'discardAll' }
        const redReverse: Card = { id: 'c-rr', color: 'red', type: 'reverse' }
        const blue3: Card = { id: 'c-b3', color: 'blue', type: 'number', value: 3 }
        store.players = [
            makePlayer('p-0', 'You', [discallRed, redReverse, blue3]),
            makePlayer('p-1', 'B1'),
            makePlayer('p-2', 'B2'),
        ]
        store.gameState = 'PLAYING'
        store.currentPlayerIndex = 0
        store.discardPile = [red5]
        store.currentColor = 'red'
        store.direction = 1
        store.turnState = 'WAITING_FOR_ACTION'

        store.playCard('p-0', discallRed)

        // The single matching red card (reverse) became the top and its effect
        // fired — a 3-player reverse flips direction. Pre-fix it was dropped.
        expect(store.direction).toBe(-1)
        // Both red cards were dumped; only the non-matching blue card remains.
        expect(store.players[0]!.hand.map(c => c.id)).toEqual(['c-b3'])
    })
})

describe('dealInitialCards generation guard', () => {
    it('stops an abandoned deal loop from mutating the next game', async () => {
        const store = useGameStore()
        store.initializeGame(['You', 'Friend'])

        let dealt = 0
        await store.dealInitialCards(async () => {
            dealt++
            // Rematch fired while the first card's animation was awaiting —
            // the old loop must bail without touching the new game's state.
            if (dealt === 1) store.initializeGame(['You', 'Friend'])
        })

        expect(dealt).toBe(1)
        expect(store.pendingDealCard).toBeNull()
        expect(store.players.every(p => p.hand.length === 0)).toBe(true)
        // The old loop's tail must not flip the new game out of DEALING.
        expect(store.turnState).toBe('DEALING')
        expect(store.isDealing).toBe(true)
    })
})

describe('daily challenge seeding', () => {
    function deckIds(seed?: string): string[] {
        setActivePinia(createPinia())
        const store = useGameStore()
        store.initializeGame(['You', 'Terminator'], 'official', seed ? { dailySeed: seed } : undefined)
        return store.deck.map(c => c.id)
    }

    it('deals the identical deck for the same daily seed', () => {
        expect(deckIds('2026-07-24')).toEqual(deckIds('2026-07-24'))
    })

    it('deals a different deck on a different day', () => {
        expect(deckIds('2026-07-24')).not.toEqual(deckIds('2026-07-25'))
    })

    it('unseeded games stay random', () => {
        expect(deckIds()).not.toEqual(deckIds())
    })

    it('exposes dailyDate during a daily and clears it for a normal game', () => {
        setActivePinia(createPinia())
        const store = useGameStore()
        store.initializeGame(['You', 'Terminator'], 'official', { dailySeed: '2026-08-14' })
        expect(store.dailyDate).toBe('2026-08-14')
        store.initializeGame(['You', 'Terminator'], 'official')
        expect(store.dailyDate).toBeNull()
    })
})

describe('daily turn log', () => {
    const draw2: Card = { id: 'c-d2', color: 'red', type: 'draw2' }

    function seat(hand: Card[]) {
        const store = useGameStore()
        const bot = makePlayer('p-1', 'Terminator')
        bot.isBot = true
        store.players = [makePlayer('p-0', 'You', hand), bot]
        store.gameState = 'PLAYING'
        store.currentPlayerIndex = 0
        store.discardPile = [red5]
        store.currentColor = 'red'
        store.turnState = 'WAITING_FOR_ACTION'
        store.deck = Array.from({ length: 30 }, (_, i) => ({
            id: `deck-${i}`, color: 'blue', type: 'number', value: (i % 9) + 1,
        })) as Card[]
        return store
    }

    it('records a play for the human but not for the bot', () => {
        vi.useFakeTimers()
        const store = seat([red5, draw2])
        store.playCard('p-0', red5)
        store.players[1]!.hand = [{ id: 'b-1', color: 'red', type: 'number', value: 3 }]
        store.playCard('p-1', store.players[1]!.hand[0]!)
        expect(store.turnLog).toEqual(['p'])
    })

    it('distinguishes a plain draw from eating a stack', () => {
        vi.useFakeTimers()
        const store = seat([red5])
        store.drawCardsForCurrentPlayer()
        expect(store.turnLog).toEqual(['d'])

        store.currentPlayerIndex = 0
        store.turnState = 'WAITING_FOR_ACTION'
        store.drawStack = 6
        store.drawCardsForCurrentPlayer()
        expect(store.turnLog).toEqual(['d', 'x'])
    })

    it('starts empty on a new game', () => {
        vi.useFakeTimers()
        const store = seat([red5])
        store.drawCardsForCurrentPlayer()
        expect(store.turnLog.length).toBeGreaterThan(0)
        store.initializeGame(['You', 'Terminator'])
        expect(store.turnLog).toEqual([])
    })
})

describe('bot personalities', () => {
    it('gives each bot seat a profile', () => {
        const store = useGameStore()
        store.initializeGame(['You', 'A', 'B'], 'official', { botIds: ['vera', 'kobra'] })
        const ids = store.players.filter(p => p.isBot).map(p => store.botProfiles[p.id]?.id)
        expect(ids).toEqual(['vera', 'kobra'])
    })

    it('forces the daily opponent no matter what the caller asks for', () => {
        // Everyone in the world must face the same bot on the same deal, so
        // unlock state must not be able to reach into the daily.
        const store = useGameStore()
        store.initializeGame(['You', 'X'], 'official', { dailySeed: '2026-08-09', botIds: ['scrap'] })
        const bot = store.players.find(p => p.isBot)!
        expect(store.botProfiles[bot.id]?.id).toBe('terminator')
    })

    it('falls back to the first rung for an unknown bot id', () => {
        const store = useGameStore()
        store.initializeGame(['You', 'X'], 'official', { botIds: ['does-not-exist'] })
        const bot = store.players.find(p => p.isBot)!
        expect(store.botProfiles[bot.id]?.id).toBe('scrap')
    })

    it('clears profiles from the previous game on rematch', () => {
        const store = useGameStore()
        store.initializeGame(['You', 'A', 'B'], 'official', { botIds: ['vera', 'kobra'] })
        store.initializeGame(['You', 'A'], 'official', { botIds: ['rook'] })
        expect(Object.keys(store.botProfiles)).toHaveLength(1)
    })
})

/**
 * The daily and the ladder were entirely uninstrumented, so both retention
 * features shipped blind. These pin the events to the real finish path rather
 * than to a hand-built board, so a refactor that moves the watcher cannot
 * quietly stop reporting.
 *
 * The awaits matter: the finish block lives in a Vue watcher, which flushes on
 * the next tick, so asserting straight after playCard sees nothing at all.
 */
describe('daily and ladder analytics', () => {
    const red7: Card = { id: 'c-red-7', color: 'red', type: 'number', value: 7 }

    /** Put the human initializeGame actually created on turn, one card from winning. */
    async function winAsHuman(store: ReturnType<typeof useGameStore>) {
        const human = store.players.find(p => !p.isBot)!
        human.hand = [red7]
        store.discardPile = [red5]
        store.currentColor = 'red'
        store.currentPlayerIndex = store.players.indexOf(human)
        store.gameState = 'PLAYING'
        store.turnState = 'WAITING_FOR_ACTION'
        store.playCard(human.id, red7)
        await nextTick()
        return human
    }

    it('reports a finished daily with its outcome', async () => {
        vi.useFakeTimers()
        const store = useGameStore()
        store.initializeGame(['You', 'Terminator'], 'official', { dailySeed: '2026-08-10' })

        const human = await winAsHuman(store)

        expect(store.winnerId).toBe(human.id)
        expect(track).toHaveBeenCalledWith('daily_finished', expect.objectContaining({ result: 'won' }))
    })

    it('credits no ladder rung for the daily, which pins its own opponent', async () => {
        vi.useFakeTimers()
        const store = useGameStore()
        store.initializeGame(['You', 'Terminator'], 'official', { dailySeed: '2026-08-10' })

        await winAsHuman(store)

        expect(track).not.toHaveBeenCalledWith('bot_defeated', expect.anything())
    })

    it('credits the rung actually beaten in a practice game', async () => {
        vi.useFakeTimers()
        const store = useGameStore()
        store.initializeGame(['You', 'Scrap'], 'official', { botIds: ['scrap'] })

        await winAsHuman(store)

        expect(track).toHaveBeenCalledWith('bot_defeated', { bot_id: 'scrap', rung: 1 })
        expect(track).not.toHaveBeenCalledWith('daily_finished', expect.anything())
    })
})
