import { describe, it, expect, vi, afterEach } from 'vitest'
import { startGame, applyIntent, forceEliminate, persistResults, timeOutTurn, clearTimeouts, personalView } from './game'
import type { Card, CardColor } from '../../shared/engine'
import * as engine from '../../shared/engine'

const twoPlayers = () => startGame(
  [
    { userId: 'u1', name: 'Alice' },
    { userId: 'u2', name: 'Bob' },
  ],
  'official',
)

describe('wild colour validation', () => {
  it('rejects a PLAY_CARD whose chosenColor is not a suit colour, without touching state', () => {
    const { game } = twoPlayers()
    const me = game.engine.players[game.engine.currentPlayerIndex]!
    me.hand.push({ id: 'w-test', color: 'wild', type: 'wild' } as any)
    const before = JSON.stringify(game.engine)
    for (const bad of ['wild', 'purple', '', { x: 1 }]) {
      const res = applyIntent(game, me.id, { kind: 'PLAY_CARD', cardId: 'w-test', chosenColor: bad as CardColor })
      expect(res).toMatchObject({ ok: false, errorCode: 'invalid-intent' })
    }
    expect(JSON.stringify(game.engine)).toBe(before)
  })

  it('rejects a bad drawn-wild colour and leaves the pick pending', () => {
    const { game } = twoPlayers()
    const me = game.engine.players[game.engine.currentPlayerIndex]!
    me.hand.push({ id: 'w-drawn', color: 'wild', type: 'wild' } as any)
    game.pendingDrawnWildCardId = 'w-drawn'
    game.engine.turnState = 'CHOOSING_DRAWN_WILD_COLOR'
    const res = applyIntent(game, me.id, { kind: 'CHOOSE_DRAWN_WILD_COLOR', color: 'wild' })
    expect(res.ok).toBe(false)
    expect(game.pendingDrawnWildCardId).toBe('w-drawn')
    expect(game.engine.turnState).toBe('CHOOSING_DRAWN_WILD_COLOR')
  })

  it('rejects a bad roulette colour', () => {
    const { game } = twoPlayers()
    const me = game.engine.players[game.engine.currentPlayerIndex]!
    game.engine.turnState = 'CHOOSING_ROULETTE_COLOR'
    const res = applyIntent(game, me.id, { kind: 'SET_ROULETTE_COLOR', color: 'black' as CardColor })
    expect(res.ok).toBe(false)
    expect(game.engine.rouletteTargetColor).toBeNull()
  })
})

describe('persistResults and kicks', () => {
  const env = { SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-key' }
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it('does not score a game that ended by kicking a seat', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    const { game } = twoPlayers()
    forceEliminate(game, 'u2')
    expect(game.engine.gameState).toBe('GAME_OVER')
    expect(await persistResults(game, 'ABCDEF', env)).toBe(false)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('still scores a game that ended without a kick', async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 201 }))
    vi.stubGlobal('fetch', fetchMock)
    vi.spyOn(console, 'log').mockImplementation(() => {})
    const { game } = twoPlayers()
    game.engine.gameState = 'GAME_OVER'
    game.engine.winnerId = 'u1'
    expect(await persistResults(game, 'ABCDEF', env)).toBe(true)
    expect(fetchMock).toHaveBeenCalledOnce()
  })
})

// The client can't derive who ate a penalty stack (the snapshot arrives after
// the turn has advanced and drawStack is back to 0), so the server tags it with
// a STACK_EATEN event carrying the victim and the +N. Guard that contract.
describe('STACK_EATEN signal', () => {
  it('fires with the victim and the stack size when a penalty stack is drawn', () => {
    const { game } = startGame(
      [
        { userId: 'u1', name: 'Alice' },
        { userId: 'u2', name: 'Bob' },
      ],
      'official',
    )
    // Current player (seat 0) faces a pending +8 and chooses to draw it.
    game.engine.drawStack = 8
    const victim = game.engine.players[game.engine.currentPlayerIndex]!.id

    const res = applyIntent(game, victim, { kind: 'DRAW' })

    expect(res.ok).toBe(true)
    const eaten = res.events.find((e) => e.t === 'STACK_EATEN')
    expect(eaten).toEqual({ t: 'STACK_EATEN', playerId: victim, amount: 8 })
    // The stack is consumed.
    expect(game.engine.drawStack).toBe(0)
  })

  it('does not fire on an ordinary draw-until-playable (no stack)', () => {
    const { game } = startGame(
      [
        { userId: 'u1', name: 'Alice' },
        { userId: 'u2', name: 'Bob' },
      ],
      'official',
    )
    // Pin the no-stack case: startGame's random opening discard can itself be
    // a draw card, which would leave a penalty stack for seat 0 to eat.
    game.engine.drawStack = 0
    const player = game.engine.players[game.engine.currentPlayerIndex]!.id
    const res = applyIntent(game, player, { kind: 'DRAW' })

    expect(res.ok).toBe(true)
    expect(res.events.some((e) => e.t === 'STACK_EATEN')).toBe(false)
  })
})

// Issue #182: a drawn Color Roulette was parked in the drawn-wild colour picker,
// so the drawer was asked to pick a colour as if it were a plain Wild. The
// roulette colour belongs to the victim, so it must play straight through.
describe('drawn Color Roulette', () => {
  it('plays immediately and hands the colour choice to the next player', () => {
    const { game } = startGame(
      [
        { userId: 'u1', name: 'Alice' },
        { userId: 'u2', name: 'Bob' },
      ],
      'official',
    )
    game.engine.drawStack = 0
    const drawer = game.engine.players[game.engine.currentPlayerIndex]!
    // Strip every playable card so the draw loop is what reaches the roulette.
    drawer.hand = []
    game.engine.deck.push({ id: 'roulette-182', color: 'wild', type: 'wildColorRoulette' } as any)

    const res = applyIntent(game, drawer.id, { kind: 'DRAW' })

    expect(res.ok).toBe(true)
    expect(game.pendingDrawnWildCardId).toBeNull()
    expect(game.engine.turnState).toBe('CHOOSING_ROULETTE_COLOR')
    expect(game.engine.discardPile.at(-1)?.id).toBe('roulette-182')
  })
})

describe('turn clock timeouts', () => {
  const num = (id: string, color: CardColor, value: number) => ({ id, color, type: 'number', value }) as Card
  const threePlayers = () => startGame(
    [
      { userId: 'u1', name: 'Alice' },
      { userId: 'u2', name: 'Bob' },
      { userId: 'u3', name: 'Cara' },
    ],
    'official',
  )
  // A red 3 on top, nothing pending, seat `seat` on turn holding `hand`.
  const setTable = (game: ReturnType<typeof startGame>['game'], seat: number, hand: Card[]) => {
    const s = game.engine
    s.discardPile.push(num('top', 'red', 3))
    s.currentColor = 'red'
    s.drawStack = 0
    s.turnState = 'WAITING_FOR_ACTION'
    s.currentPlayerIndex = seat
    s.players[seat]!.hand = hand
    return s.players[seat]!
  }

  it('plays a legal card for a present seat and passes the turn', () => {
    const { game } = threePlayers()
    const me = setTable(game, 0, [num('play-me', 'red', 5), num('keep', 'green', 8)])

    const events = timeOutTurn(game, me.id, true)

    expect(events[0]).toEqual({ t: 'TURN_TIMED_OUT', playerId: me.id, timeouts: 1 })
    expect(events.some((e) => e.t === 'CARD_PLAYED' && e.card.id === 'play-me')).toBe(true)
    expect(engine.currentPlayer(game.engine)?.id).not.toBe(me.id)
  })

  it('takes the normal draw for a present seat with nothing playable', () => {
    const { game } = threePlayers()
    const me = setTable(game, 0, [num('dead', 'green', 8)])

    const events = timeOutTurn(game, me.id, true)

    expect(events.some((e) => e.t === 'YOU_DREW')).toBe(true)
    expect(game.engine.gameState === 'GAME_OVER' || engine.currentPlayer(game.engine)?.id !== me.id).toBe(true)
  })

  it('gives an absent seat the minimal draw, not a play', () => {
    const { game } = threePlayers()
    const me = setTable(game, 0, [num('playable', 'red', 5), num('keep', 'green', 8)])

    const events = timeOutTurn(game, me.id, false)

    expect(events.some((e) => e.t === 'CARD_PLAYED')).toBe(false)
    expect(events.filter((e) => e.t === 'YOU_DREW')).toHaveLength(1)
    expect(events.some((e) => e.t === 'TURN_AUTO_RESOLVED')).toBe(false)
    expect(engine.currentPlayer(game.engine)?.id).not.toBe(me.id)
  })

  it('takes a seat out on its third timeout in a row and keeps a continuing game scored', () => {
    const { game } = threePlayers()
    for (const expected of [1, 2]) {
      setTable(game, 0, [num(`p${expected}`, 'red', 5), num(`k${expected}`, 'green', 8)])
      expect(timeOutTurn(game, 'u1', true)[0]).toMatchObject({ t: 'TURN_TIMED_OUT', timeouts: expected })
    }
    setTable(game, 0, [num('p3', 'red', 5), num('k3', 'green', 8)])

    const events = timeOutTurn(game, 'u1', true)

    expect(events[0]).toEqual({ t: 'TURN_TIMED_OUT', playerId: 'u1', timeouts: 3 })
    expect(events).toContainEqual({ t: 'ELIMINATED', playerId: 'u1' })
    expect(events.some((e) => e.t === 'CARD_PLAYED')).toBe(false)
    expect(game.engine.players[0]!.isEliminated).toBe(true)
    expect(game.engine.gameState).toBe('PLAYING')
    expect(engine.currentPlayer(game.engine)?.id).not.toBe('u1')
    expect(game.hadKick).toBeFalsy()
    const view = personalView(game, 'playing', 'u2', [], new Set(), null)
    expect(view.players[0]).toMatchObject({ isEliminated: true, timedOut: true, timeouts: 3 })
  })

  it('does not score a game that a timeout ends, the same as a leave', () => {
    const { game } = twoPlayers()
    game.timeouts = { u1: 2 }
    setTable(game, 0, [num('p', 'red', 5)])

    const events = timeOutTurn(game, 'u1', true)

    expect(events).toContainEqual({ t: 'GAME_OVER', winnerId: 'u2' })
    expect(game.hadKick).toBe(true)
  })

  it('resets the count once the seat moves on its own', () => {
    const { game } = threePlayers()
    game.timeouts = { u1: 2 }
    clearTimeouts(game, 'u1')
    const view = personalView(game, 'playing', 'u1', [], new Set(), null)
    expect(view.players[0]).toMatchObject({ timeouts: 0, timedOut: false })
  })
})
