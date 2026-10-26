import { describe, it, expect, vi, afterEach } from 'vitest'
import { startGame, applyIntent, forceEliminate, persistResults, personalView, viewEventFor } from './game'
import type { CardColor } from '../../shared/engine'

const twoPlayers = () => startGame(
  [
    { userId: 'u1', name: 'Alice' },
    { userId: 'u2', name: 'Bob' },
  ],
  'official',
)

describe('couch display privacy', () => {
  it('cannot receive a private hand or a pending private choice', () => {
    const { game } = twoPlayers()
    const current = game.engine.players[game.engine.currentPlayerIndex]!
    game.pendingDrawnWildCardId = current.hand[0]!.id
    const view = personalView(
      game,
      'playing',
      '!couch-display',
      game.engine.players.map(p => ({ userId: p.id, name: p.name })),
      new Set(game.engine.players.map(p => p.id)),
      'tv-host',
    )
    expect(view.you).toBeNull()
    expect(view.pendingDrawnWildCard).toBeNull()
    expect(view.pendingDiscardAllCards).toBeNull()
    expect(JSON.stringify(view)).not.toContain(current.hand[0]!.id)
  })

  it('turns private draw events into public counts for the display', () => {
    const hidden = viewEventFor({ t: 'YOU_DREW', cards: [{ id: 'secret', color: 'red', type: 'number', value: 1 }], _owner: 'u1' } as any, '!couch-display')
    expect(hidden).toEqual({ t: 'PLAYER_DREW', playerId: 'u1', count: 1 })
    expect(JSON.stringify(hidden)).not.toContain('secret')
  })
})

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
