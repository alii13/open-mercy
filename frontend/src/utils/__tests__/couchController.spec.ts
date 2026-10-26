import { describe, expect, it } from 'vitest'
import { couchStatusText, drawButtonLabel, nextCardSelection, rememberCouchName, savedCouchName, showHandScrollHint } from '../couchController'

describe('Couch controller interaction helpers', () => {
  it('selects, changes and deselects playable cards without selecting blocked cards', () => {
    expect(nextCardSelection(null, 'a', true)).toBe('a')
    expect(nextCardSelection('a', 'b', true)).toBe('b')
    expect(nextCardSelection('b', 'b', true)).toBeNull()
    expect(nextCardSelection('a', 'blocked', false)).toBe('a')
  })

  it('describes reconnects and all forced decision states in plain language', () => {
    expect(couchStatusText({ realtimeStatus: 'CONNECTING', turnState: null, isMyTurn: false, drawStack: 0 })).toBe('Verbinde erneut …')
    expect(couchStatusText({ realtimeStatus: 'CLOSED', turnState: null, isMyTurn: false, drawStack: 0 })).toBe('Verbindung unterbrochen')
    expect(couchStatusText({ realtimeStatus: 'SUBSCRIBED', turnState: 'CHOOSING_ROULETTE_COLOR', isMyTurn: true, drawStack: 0 })).toBe('Wähle eine Farbe')
    expect(couchStatusText({ realtimeStatus: 'SUBSCRIBED', turnState: 'CHOOSING_PLAYER_TO_SWAP', isMyTurn: true, drawStack: 0 })).toBe('Wähle einen Spieler')
    expect(couchStatusText({ realtimeStatus: 'SUBSCRIBED', turnState: 'WAITING_FOR_ACTION', isMyTurn: false, activePlayerName: 'Justine', drawStack: 0 })).toBe('Justine ist dran')
  })

  it('makes draw penalties and dense hands explicit', () => {
    expect(drawButtonLabel(0)).toBe('Karte ziehen')
    expect(drawButtonLabel(10)).toBe('10 Karten ziehen')
    for (const count of [3, 10, 15, 20, 25]) {
      expect(showHandScrollHint(count)).toBe(count >= 10)
    }
  })

  it('remembers a display name across rooms without using it as identity', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    }
    rememberCouchName(storage, 'ABC234', 'Runenfreund')
    expect(savedCouchName(storage, 'ABC234')).toBe('Runenfreund')
    expect(savedCouchName(storage, 'NEU567')).toBe('Runenfreund')
  })
})
