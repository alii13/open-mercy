import { describe, it, expect } from 'vitest'
import { nextTurnClock } from './turnClock'
import { TURN_LIMIT_MS } from './protocol'

describe('nextTurnClock', () => {
  const now = 1_000_000

  it('starts a fresh clock when a new seat is on turn', () => {
    expect(nextTurnClock({ seat: 'u1', at: now + 5_000 }, 'u2', undefined, now)).toEqual({ seat: 'u2', at: now + TURN_LIMIT_MS })
  })

  it('restarts the clock when the seat on turn acts and keeps the turn', () => {
    expect(nextTurnClock({ seat: 'u1', at: now + 5_000 }, 'u1', 'u1', now)).toEqual({ seat: 'u1', at: now + TURN_LIMIT_MS })
  })

  it('leaves a running clock alone when someone else acts off-turn', () => {
    const clock = { seat: 'u1', at: now + 5_000 }
    expect(nextTurnClock(clock, 'u1', 'u2', now)).toBe(clock)
    expect(nextTurnClock(clock, 'u1', undefined, now)).toBe(clock)
  })

  it('restarts a clock that already fired for the same seat', () => {
    expect(nextTurnClock({ seat: 'u1' }, 'u1', undefined, now)).toEqual({ seat: 'u1', at: now + TURN_LIMIT_MS })
  })

  it('stops the clock when nobody is on turn', () => {
    expect(nextTurnClock({ seat: 'u1', at: now + 5_000 }, null, undefined, now)).toEqual({})
  })
})
