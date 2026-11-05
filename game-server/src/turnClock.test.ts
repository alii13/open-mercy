import { describe, it, expect } from 'vitest'
import { dueTimeout, nextTurnClock } from './turnClock'
import { TURN_LIMIT_MS } from './protocol'

describe('nextTurnClock', () => {
  const now = 1_000_000

  it('starts a fresh clock when a new seat is on turn', () => {
    expect(nextTurnClock({ seat: 'u1', at: now + 5_000 }, 'u2', false, now)).toEqual({ seat: 'u2', at: now + TURN_LIMIT_MS })
  })

  it('restarts the clock when the same seat starts a new turn', () => {
    expect(nextTurnClock({ seat: 'u1', at: now + 5_000 }, 'u1', true, now)).toEqual({ seat: 'u1', at: now + TURN_LIMIT_MS })
  })

  it('leaves a running clock alone for a choice inside the turn or an off-turn move', () => {
    const clock = { seat: 'u1', at: now + 5_000 }
    expect(nextTurnClock(clock, 'u1', false, now)).toBe(clock)
  })

  it('restarts a clock that already fired for the same seat', () => {
    expect(nextTurnClock({ seat: 'u1' }, 'u1', false, now)).toEqual({ seat: 'u1', at: now + TURN_LIMIT_MS })
  })

  it('stops the clock when nobody is on turn', () => {
    expect(nextTurnClock({ seat: 'u1', at: now + 5_000 }, null, false, now)).toEqual({})
  })
})

describe('dueTimeout', () => {
  it('times out a connected seat that still holds the turn as present', () => {
    expect(dueTimeout('u1', 'u1', new Set(['u1', 'u2']))).toEqual({ seat: 'u1', present: true })
  })

  it('times out a seat that dropped across the deadline as absent instead of losing the clock', () => {
    expect(dueTimeout('u1', 'u1', new Set(['u2']))).toEqual({ seat: 'u1', present: false })
  })

  it('does nothing once the turn has moved on', () => {
    expect(dueTimeout('u1', 'u2', new Set(['u1', 'u2']))).toBeNull()
    expect(dueTimeout(undefined, 'u2', new Set())).toBeNull()
  })
})
