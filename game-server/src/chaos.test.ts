import { describe, expect, it } from 'vitest'
import { generateChaosDeck } from '../../shared/engine'
import { applyIntent, personalView, processChaosDeadline, startGame } from './game'
import { applyChaosEventAction, autoResolveChaosEvent, createChaosRuntime, endChaosByTime, startDueChaosEvent, timeLimitWinner } from './chaos'

const seats = [
  { userId: 'u1', name: 'Alice' },
  { userId: 'u2', name: 'Bob' },
  { userId: 'u3', name: 'Cara' },
]

function chaosGame(now = 0) {
  return startGame(seats, 'official', 'chaos', now).game
}

describe('Chaos deck and cards', () => {
  it('adds exactly one of each Chaos card to the 108-card Classic deck', () => {
    const deck = generateChaosDeck()
    expect(deck).toHaveLength(113)
    for (const type of ['fateSwap', 'curseMirror', 'diceCurse', 'runeShield', 'runeWhirl']) {
      expect(deck.filter(card => card.type === type)).toHaveLength(1)
    }
  })

  it('swaps complete hands without exposing them through another player view', () => {
    const game = chaosGame()
    const actor = game.engine.players[0]!
    const target = game.engine.players[1]!
    actor.hand = [
      { id: 'swap', color: 'wild', type: 'fateSwap' },
      { id: 'a', color: 'red', type: 'number', value: 1 },
    ]
    target.hand = [{ id: 'secret-b', color: 'blue', type: 'number', value: 2 }]
    game.engine.currentPlayerIndex = 0
    game.engine.direction = 1
    game.engine.currentColor = 'red'
    game.engine.drawStack = 0
    game.engine.turnState = 'WAITING_FOR_ACTION'

    const result = applyIntent(game, actor.id, { kind: 'PLAY_CHAOS_CARD', cardId: 'swap', chosenColor: 'green', targetUserId: target.id })

    expect(result.ok).toBe(true)
    expect(actor.hand.map(card => card.id)).toEqual(['secret-b'])
    expect(target.hand.map(card => card.id)).toEqual(['a'])
    const targetView = personalView(game, 'playing', target.id, seats, new Set(seats.map(p => p.userId)), 'host')
    expect(JSON.stringify(targetView)).not.toContain('secret-b')
  })

  it('lets a shield cancel a draw penalty and consumes the shield', () => {
    const game = chaosGame()
    const actor = game.engine.players[0]!
    const victim = game.engine.players[1]!
    actor.hand = [
      { id: 'draw2', color: 'red', type: 'draw2' },
      { id: 'keep', color: 'blue', type: 'number', value: 1 },
    ]
    victim.hand = [{ id: 'shield', color: 'wild', type: 'runeShield' }]
    game.engine.currentPlayerIndex = 0
    game.engine.direction = 1
    game.engine.currentColor = 'red'
    game.engine.drawStack = 0
    game.engine.turnState = 'WAITING_FOR_ACTION'

    expect(applyIntent(game, actor.id, { kind: 'PLAY_CARD', cardId: 'draw2' }).ok).toBe(true)
    expect(game.engine.turnState).toBe('AWAITING_CHAOS_REACTION')
    expect(applyIntent(game, victim.id, { kind: 'CHAOS_REACT', cardId: 'shield' }).ok).toBe(true)
    expect(victim.hand).toHaveLength(0)
    expect(game.engine.turnState).toBe('WAITING_FOR_ACTION')
    expect(game.engine.currentPlayerIndex).toBe(1)
  })

  it('allows one mirror redirect but never creates a second reaction chain', () => {
    const game = chaosGame()
    const actor = game.engine.players[0]!
    const victim = game.engine.players[1]!
    const redirected = game.engine.players[2]!
    actor.hand = [{ id: 'draw2', color: 'red', type: 'draw2' }, { id: 'keep', color: 'red', type: 'number', value: 3 }]
    victim.hand = [{ id: 'mirror', color: 'wild', type: 'curseMirror' }]
    redirected.hand = [{ id: 'shield-2', color: 'wild', type: 'runeShield' }]
    game.engine.currentPlayerIndex = 0
    game.engine.direction = 1
    game.engine.currentColor = 'red'
    game.engine.drawStack = 0
    game.engine.turnState = 'WAITING_FOR_ACTION'
    const before = redirected.hand.length

    applyIntent(game, actor.id, { kind: 'PLAY_CARD', cardId: 'draw2' })
    const result = applyIntent(game, victim.id, { kind: 'CHAOS_REACT', cardId: 'mirror', targetUserId: redirected.id })

    expect(result.ok).toBe(true)
    expect(redirected.hand.length).toBe(before + 2)
    expect(game.chaos?.reaction).toBeNull()
  })
})

describe('all six timed Chaos events', () => {
  const kinds = ['treasure', 'goblin-trade', 'rune-trial', 'oracle', 'color-storm', 'dragon-curse'] as const

  for (const [index, kind] of kinds.entries()) {
    it(`resolves ${kind} with server-side automatic decisions`, () => {
      const game = chaosGame()
      const chaos = game.chaos!
      chaos.eventCounter = index
      chaos.eventDue = true
      expect(startDueChaosEvent(game.engine, chaos, 100)[0]).toEqual({ t: 'CHAOS_EVENT_STARTED', kind })

      for (let pass = 0; pass < 4 && chaos.event?.phase !== 'resolved'; pass++) {
        autoResolveChaosEvent(game.engine, chaos, 101 + pass, () => 0.8 - pass * 0.05)
      }

      expect(chaos.event?.phase).toBe('resolved')
      expect(chaos.event?.message).toBeTruthy()
      expect(game.engine.turnState).toBe('CHAOS_EVENT')
    })
  }

  it('keeps Oracle card information private to its recipient', () => {
    const game = chaosGame()
    const chaos = game.chaos!
    chaos.eventCounter = 3
    chaos.eventDue = true
    startDueChaosEvent(game.engine, chaos, 100)
    for (const player of game.engine.players) {
      const target = game.engine.players.find(candidate => candidate.id !== player.id)!
      applyChaosEventAction(game.engine, chaos, player.id, { kind: 'CHAOS_EVENT_SELECT_PLAYER', targetUserId: target.id }, 101, () => 0)
    }
    const alice = personalView(game, 'playing', 'u1', seats, new Set(seats.map(p => p.userId)), 'host')
    const display = personalView(game, 'playing', '!couch-display', seats, new Set(seats.map(p => p.userId)), 'host')
    expect(alice.chaos?.oracleReveal?.card).toBeTruthy()
    expect(display.chaos?.oracleReveal).toBeNull()
  })
})

describe('Chaos clocks and time decision', () => {
  it('uses fewest cards, then lowest value sum, then a server die tie-break', () => {
    const game = chaosGame()
    game.engine.players[0]!.hand = [{ id: 'a', color: 'red', type: 'number', value: 8 }]
    game.engine.players[1]!.hand = [{ id: 'b', color: 'blue', type: 'number', value: 2 }]
    game.engine.players[2]!.hand = [{ id: 'c', color: 'green', type: 'number', value: 2 }]
    const tieRolls = [0.9, 0.1]
    expect(timeLimitWinner(game.engine, () => tieRolls.shift() ?? 0)).toBe('u2')
    const events = endChaosByTime(game.engine, game.chaos!, () => 0)
    expect(events.some(event => event.t === 'TIME_LIMIT_REACHED')).toBe(true)
    expect(game.chaos?.winReason).toBe('time')
  })

  it('marks an event due at three minutes but only starts it after a completed action', () => {
    const game = chaosGame(0)
    processChaosDeadline(game, 180_000)
    expect(game.chaos?.eventDue).toBe(true)
    expect(game.chaos?.event).toBeNull()
  })

  it('auto-resolves nonresponders and resumes after the result window', () => {
    const game = chaosGame(0)
    const chaos = game.chaos!
    chaos.eventCounter = 1
    chaos.eventDue = true
    startDueChaosEvent(game.engine, chaos, 180_000)
    expect(chaos.event?.kind).toBe('goblin-trade')

    processChaosDeadline(game, chaos.event!.deadlineAt)
    expect(chaos.event?.phase).toBe('resolved')
    processChaosDeadline(game, chaos.event!.deadlineAt)
    expect(chaos.event).toBeNull()
    expect(game.engine.turnState).toBe('WAITING_FOR_ACTION')
  })

  it('declines an unanswered reaction at its server deadline', () => {
    const game = chaosGame(0)
    const actor = game.engine.players[0]!
    const victim = game.engine.players[1]!
    actor.hand = [{ id: 'draw2-timeout', color: 'red', type: 'draw2' }, { id: 'keep', color: 'red', type: 'number', value: 1 }]
    victim.hand = [{ id: 'shield-timeout', color: 'wild', type: 'runeShield' }]
    game.engine.currentPlayerIndex = 0
    game.engine.direction = 1
    game.engine.currentColor = 'red'
    game.engine.drawStack = 0
    game.engine.turnState = 'WAITING_FOR_ACTION'
    applyIntent(game, actor.id, { kind: 'PLAY_CARD', cardId: 'draw2-timeout' })
    const before = victim.hand.length

    processChaosDeadline(game, game.chaos!.reaction!.deadlineAt)

    expect(game.chaos?.reaction).toBeNull()
    expect(victim.hand.length).toBe(before + 2)
    expect(victim.hand.some(card => card.id === 'shield-timeout')).toBe(true)
  })

  it('does not start draw-oriented events after minute twenty', () => {
    const game = chaosGame(0)
    game.chaos!.eventCounter = 0
    game.chaos!.eventDue = true
    startDueChaosEvent(game.engine, game.chaos!, 20 * 60_000)
    expect(game.chaos?.event?.kind).toBe('goblin-trade')
  })
})
