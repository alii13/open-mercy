import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import type { GameEvent, PersonalView, PresencePlayer, ServerMsg, ClientMsg } from '@protocol'
import { supabase } from '../lib/supabase'

const GAME_SERVER = (import.meta.env.VITE_GAME_SERVER_URL as string | undefined)
  || 'https://uno-game-server.shekhaliul44.workers.dev'
const HOST_ROOM_KEY = 'rune_riot_couch_host_room'

export const useCouchHostStore = defineStore('couchHost', () => {
  const roomCode = ref('')
  const view = ref<PersonalView | null>(null)
  const presence = ref<PresencePlayer[]>([])
  const status = ref<'idle' | 'connecting' | 'connected' | 'closed'>('idle')
  const error = ref<string | null>(null)
  const lastEvent = ref<GameEvent | null>(null)
  const hostActionPending = ref(false)
  const selectedMode = ref<'classic' | 'chaos'>('classic')
  let socket: WebSocket | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let intentionalClose = false
  let lastSeq = 0

  const joinUrl = computed(() => {
    if (!roomCode.value) return ''
    const configured = String(import.meta.env.VITE_COUCH_PUBLIC_URL || '').replace(/\/$/, '')
    const origin = configured || window.location.origin
    return `${origin}/join/${roomCode.value}`
  })
  const readyCount = computed(() => presence.value.filter(p => p.connected && p.ready).length)
  const connectedCount = computed(() => presence.value.filter(p => p.connected).length)
  const canStart = computed(() => connectedCount.value >= 2
    && presence.value.filter(p => p.connected).every(p => p.ready))

  async function token(): Promise<string | null> {
    const { data } = await supabase.auth.getSession()
    return data.session?.access_token ?? null
  }

  function wsUrl(code: string): string {
    return GAME_SERVER.replace(/^http/, 'ws') + `/room/${code}/ws`
  }

  function handle(msg: ServerMsg) {
    if (msg.t === 'hello') {
      roomCode.value = msg.roomCode
      localStorage.setItem(HOST_ROOM_KEY, msg.roomCode)
      status.value = 'connected'
      return
    }
    if (msg.t === 'presence') {
      presence.value = msg.players
      return
    }
    if (msg.t === 'snapshot') {
      if (msg.seq < lastSeq) return
      lastSeq = msg.seq
      view.value = msg.game
      if (msg.game.ruleset === 'classic' || msg.game.ruleset === 'chaos') selectedMode.value = msg.game.ruleset
      hostActionPending.value = false
      return
    }
    if (msg.t === 'event') {
      lastEvent.value = msg.ev
      return
    }
    if (msg.t === 'error') {
      hostActionPending.value = false
      if (msg.code === 'room-closed') {
        forgetRoom()
        return
      }
      const labels: Partial<Record<typeof msg.code, string>> = {
        'room-not-found': 'Der Raum ist nicht mehr verfügbar.',
        unauthorized: 'Die TV-Sitzung konnte nicht authentifiziert werden.',
        'not-host': 'Nur dieser TV-Host darf die Partie starten.',
        'need-players': 'Mindestens zwei verbundene Spieler werden benötigt.',
        'not-ready': 'Alle verbundenen Spieler müssen bereit sein.',
        'not-in-lobby': 'Diese Host-Aktion ist nur vor dem Spiel erlaubt.',
        'already-started': 'Die Runde wurde bereits gestartet.',
      }
      error.value = labels[msg.code] || `Serverfehler: ${msg.code}`
    }
  }

  async function connect(code: string): Promise<boolean> {
    const accessToken = await token()
    if (!accessToken) {
      error.value = 'Für den lokalen TV-Host ist eine anonyme Supabase-Sitzung erforderlich.'
      return false
    }
    intentionalClose = false
    status.value = 'connecting'
    error.value = null
    socket?.close()

    return new Promise(resolve => {
      const candidate = new WebSocket(wsUrl(code))
      socket = candidate
      let settled = false
      const finish = (ok: boolean) => {
        if (!settled) { settled = true; clearTimeout(timeout); resolve(ok) }
      }
      const timeout = setTimeout(() => {
        error.value = 'Der TV konnte die Echtzeitverbindung zum lokalen Spielserver nicht herstellen.'
        try { candidate.close() } catch { /* already closed */ }
        finish(false)
      }, 10_000)
      candidate.onopen = () => candidate.send(JSON.stringify({ t: 'couch-auth', token: accessToken } satisfies ClientMsg))
      candidate.onmessage = event => {
        if (socket !== candidate) return
        const msg = JSON.parse(event.data) as ServerMsg
        handle(msg)
        if (msg.t === 'snapshot') finish(true)
        if (msg.t === 'error' && ['room-not-found', 'unauthorized', 'not-host'].includes(msg.code)) finish(false)
      }
      candidate.onclose = event => {
        if (socket !== candidate) return
        if (event.reason === 'room-closed') {
          forgetRoom()
          finish(false)
          return
        }
        status.value = 'closed'
        if (!settled && !error.value) error.value = 'Die Verbindung zum lokalen Spielserver wurde getrennt.'
        finish(false)
        if (!intentionalClose && roomCode.value) {
          reconnectTimer = setTimeout(() => void connect(roomCode.value), 1500)
        }
      }
    })
  }

  async function createRoom(ruleset: 'classic' | 'chaos' = selectedMode.value): Promise<boolean> {
    const accessToken = await token()
    if (!accessToken) {
      error.value = 'Die anonyme TV-Sitzung konnte nicht erstellt werden.'
      return false
    }
    status.value = 'connecting'
    error.value = null
    try {
      const response = await fetch(`${GAME_SERVER}/rooms`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ couch: true, public: false, stackingMode: 'official', ruleset }),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const created = await response.json() as { code: string }
      roomCode.value = created.code
      localStorage.setItem(HOST_ROOM_KEY, created.code)
      return connect(created.code)
    } catch (cause) {
      error.value = `Der lokale Spielserver ist nicht erreichbar (${cause instanceof Error ? cause.message : 'Netzwerkfehler'}).`
      return false
    }
  }

  async function initialize(): Promise<void> {
    const saved = localStorage.getItem(HOST_ROOM_KEY)
    if (saved && await connect(saved)) return
    localStorage.removeItem(HOST_ROOM_KEY)
    roomCode.value = ''
    view.value = null
    presence.value = []
    error.value = null
    status.value = 'idle'
  }

  function send(message: ClientMsg): boolean {
    if (socket?.readyState !== WebSocket.OPEN) return false
    socket.send(JSON.stringify(message))
    return true
  }

  function startGame() {
    if (hostActionPending.value || view.value?.status === 'playing') return
    hostActionPending.value = send({ t: 'start', stackingMode: view.value?.stackingMode ?? 'official' })
  }
  function setMode(ruleset: 'classic' | 'chaos') {
    if (view.value?.status !== 'lobby' || hostActionPending.value) return
    selectedMode.value = ruleset
    hostActionPending.value = send({ t: 'set-couch-mode', ruleset })
  }
  function returnToLobby() {
    if (hostActionPending.value || view.value?.status === 'lobby') return
    hostActionPending.value = send({ t: 'return-lobby' })
  }
  function closeRoom() {
    if (hostActionPending.value) return
    hostActionPending.value = send({ t: 'close-room' })
  }
  function kickPlayer(userId: string) {
    if (view.value?.status !== 'lobby') return
    send({ t: 'kick', userId })
  }
  function forgetRoom() {
    intentionalClose = true
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    const previous = socket
    socket = null
    try { previous?.close() } catch { /* already closed */ }
    localStorage.removeItem(HOST_ROOM_KEY)
    roomCode.value = ''
    view.value = null
    presence.value = []
    status.value = 'idle'
    error.value = null
    lastEvent.value = null
    hostActionPending.value = false
    lastSeq = 0
  }
  function retry() { return roomCode.value ? connect(roomCode.value) : createRoom() }
  function dispose() {
    intentionalClose = true
    if (reconnectTimer) clearTimeout(reconnectTimer)
    socket?.close()
    socket = null
  }

  return {
    roomCode, view, presence, status, error, lastEvent, hostActionPending, joinUrl, selectedMode,
    readyCount, connectedCount, canStart,
    initialize, createRoom, retry, startGame, setMode, returnToLobby, closeRoom, kickPlayer, dispose,
  }
})
