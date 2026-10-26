import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { PersonalView, ServerMsg } from '@protocol'

vi.mock('../../lib/supabase', () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: { access_token: 'host-token' } } }) } },
}))

class FakeWebSocket {
  static OPEN = 1
  static instances: FakeWebSocket[] = []
  readyState = 1
  sent: string[] = []
  onopen: (() => void) | null = null
  onmessage: ((event: { data: string }) => void) | null = null
  onclose: ((event: { reason: string }) => void) | null = null
  url: string
  constructor(url: string) {
    this.url = url
    FakeWebSocket.instances.push(this)
  }
  send(data: string) { this.sent.push(data) }
  close() { this.readyState = 3 }
  open() { this.onopen?.() }
  receive(message: ServerMsg) { this.onmessage?.({ data: JSON.stringify(message) }) }
}

vi.stubGlobal('WebSocket', FakeWebSocket)
const storage = {
  values: {} as Record<string, string>,
  getItem(key: string) { return this.values[key] ?? null },
  setItem(key: string, value: string) { this.values[key] = value },
  removeItem(key: string) { delete this.values[key] },
}
vi.stubGlobal('localStorage', storage)

import { useCouchHostStore } from '../couchHostStore'

function view(status: PersonalView['status']): PersonalView {
  return {
    status,
    gameId: status === 'lobby' ? null : 'round-1',
    hostUserId: 'host',
    players: [],
    you: null,
    currentPlayerId: null,
    turnState: 'WAITING_FOR_ACTION',
    direction: 1,
    drawStack: 0,
    currentColor: 'red',
    discardTop: null,
    deckCount: 0,
    discardCount: 0,
    rouletteTargetColor: null,
    pendingDiscardAllCards: null,
    pendingDrawnWildCard: null,
    stackingMode: 'official',
    winnerId: null,
  }
}

async function connectedStore() {
  storage.values.rune_riot_couch_host_room = 'ABC234'
  const store = useCouchHostStore()
  const initializing = store.initialize()
  for (let i = 0; i < 20 && FakeWebSocket.instances.length === 0; i++) await Promise.resolve()
  const ws = FakeWebSocket.instances[0]!
  ws.open()
  ws.receive({ t: 'hello', roomCode: 'ABC234', userId: 'host', hostUserId: 'host', role: 'display', couch: true })
  ws.receive({ t: 'snapshot', seq: 0, game: view('lobby') })
  await initializing
  return { store, ws }
}

beforeEach(() => {
  setActivePinia(createPinia())
  FakeWebSocket.instances = []
  storage.values = {}
})

describe('couch TV host actions', () => {
  it('guards duplicate starts and preserves the existing stacking mode', async () => {
    const { store, ws } = await connectedStore()
    ws.receive({ t: 'presence', players: [
      { userId: 'one', name: 'One', connected: true, ready: true },
      { userId: 'two', name: 'Two', connected: true, ready: true },
    ] })

    store.startGame()
    store.startGame()

    const starts = ws.sent.map(frame => JSON.parse(frame)).filter(frame => frame.t === 'start')
    expect(starts).toEqual([{ t: 'start', stackingMode: 'official' }])
    expect(store.hostActionPending).toBe(true)
    ws.receive({ t: 'snapshot', seq: 1, game: view('playing') })
    expect(store.hostActionPending).toBe(false)
  })

  it('sends lobby return and clears local room state after authorized closure', async () => {
    const { store, ws } = await connectedStore()
    ws.receive({ t: 'snapshot', seq: 1, game: view('finished') })

    store.returnToLobby()
    expect(JSON.parse(ws.sent[ws.sent.length - 1]!)).toEqual({ t: 'return-lobby' })
    ws.receive({ t: 'snapshot', seq: 2, game: view('lobby') })
    store.closeRoom()
    expect(JSON.parse(ws.sent[ws.sent.length - 1]!)).toEqual({ t: 'close-room' })
    ws.receive({ t: 'error', code: 'room-closed' })

    expect(store.roomCode).toBe('')
    expect(store.status).toBe('idle')
    expect(storage.getItem('rune_riot_couch_host_room')).toBeNull()
  })
})
