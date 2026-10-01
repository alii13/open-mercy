import { describe, it, expect } from 'vitest'
import { startGame, applyIntent } from './game'

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
