import { describe, expect, it } from 'vitest'
import { couchHostActionError } from './couchHostActions'

const base = {
  couch: true,
  hostUserId: 'host',
  socketUserId: 'host',
  role: 'display' as const,
  phase: 'lobby' as const,
}

describe('couch host action authorization', () => {
  it('allows the verified display host to manage its room', () => {
    expect(couchHostActionError('return-lobby', base)).toBeNull()
    expect(couchHostActionError('close-room', base)).toBeNull()
    expect(couchHostActionError('kick', base)).toBeNull()
  })

  it('rejects normal players, foreign users and non-couch rooms', () => {
    expect(couchHostActionError('close-room', { ...base, role: 'player' })).toBe('not-host')
    expect(couchHostActionError('return-lobby', { ...base, socketUserId: 'other' })).toBe('not-host')
    expect(couchHostActionError('return-lobby', { ...base, couch: false })).toBe('not-host')
  })

  it('allows removal only before a couch game starts', () => {
    expect(couchHostActionError('kick', { ...base, phase: 'playing' })).toBe('not-in-lobby')
    expect(couchHostActionError('kick', { ...base, phase: 'finished' })).toBe('not-in-lobby')
  })
})
