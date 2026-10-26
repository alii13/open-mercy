import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('../frontend/node_modules/@supabase/supabase-js')

const toml = readFileSync(new URL('../game-server/wrangler.toml', import.meta.url), 'utf8')
const setting = name => toml.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]
const supabaseUrl = setting('SUPABASE_URL')
const supabaseKey = setting('SUPABASE_ANON_KEY')
const serverUrl = process.argv[2] || 'http://127.0.0.1:8787'

if (!supabaseUrl || !supabaseKey) throw new Error('Missing public Supabase settings in game-server/wrangler.toml')

async function anonymous(name) {
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { username: name } } })
  if (error || !data.session) throw error || new Error('Anonymous session missing')
  return data.session.access_token
}

function waitFor(connection, predicate, label, timeoutMs = 12_000) {
  const existing = connection.messages.find(predicate)
  if (existing) return Promise.resolve(existing)
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out; frames: ${connection.messages.map(message => message.t).join(', ')}`)), timeoutMs)
    const onMessage = event => {
      const message = JSON.parse(String(event.data))
      if (!predicate(message)) return
      clearTimeout(timer)
      connection.ws.removeEventListener('message', onMessage)
      resolve(message)
    }
    connection.ws.addEventListener('message', onMessage)
  })
}

function openSocket(code, firstMessage) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(serverUrl.replace(/^http/, 'ws') + `/room/${code}/ws`)
    const connection = { ws, messages: [] }
    const timer = setTimeout(() => reject(new Error('Socket snapshot timeout')), 12_000)
    ws.addEventListener('open', () => ws.send(JSON.stringify(firstMessage)))
    ws.addEventListener('message', event => {
      const message = JSON.parse(String(event.data))
      connection.messages.push(message)
      if (message.t !== 'snapshot') return
      clearTimeout(timer)
      resolve(connection)
    })
    ws.addEventListener('error', () => { clearTimeout(timer); reject(new Error('WebSocket transport error')) })
  })
}

const hostToken = await anonymous(`Host-${crypto.randomUUID().slice(0, 8)}`)
const created = await fetch(`${serverUrl}/rooms`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${hostToken}`, 'content-type': 'application/json', Origin: 'http://127.0.0.1:5173' },
  body: JSON.stringify({ couch: true, public: false, stackingMode: 'official' }),
})
if (!created.ok) throw new Error(`Room create failed: ${created.status}`)
const { code } = await created.json()

const display = await openSocket(code, { t: 'couch-auth', token: hostToken })
const tokens = await Promise.all([anonymous('Host Smoke One'), anonymous('Host Smoke Two')])
const players = await Promise.all(tokens.map((token, index) => openSocket(code, {
  t: 'auth', token, name: index ? 'Host Smoke Two' : 'Host Smoke One',
})))

players[0].ws.send(JSON.stringify({ t: 'return-lobby' }))
await waitFor(players[0], message => message.t === 'error' && message.code === 'not-host', 'Unauthorized lobby return')

players.forEach(player => player.ws.send(JSON.stringify({ t: 'ready', ready: true })))
await new Promise(resolve => setTimeout(resolve, 200))
display.ws.send(JSON.stringify({ t: 'start', stackingMode: 'official' }))
const firstRound = await Promise.all(players.map((player, index) => waitFor(
  player,
  message => message.t === 'snapshot' && message.game.status === 'playing' && message.game.you?.hand.length === 7,
  `First round player ${index + 1}`,
)))
const originalIds = firstRound.map(frame => frame.game.you.userId)

display.ws.send(JSON.stringify({ t: 'start', stackingMode: 'official' }))
await waitFor(display, message => message.t === 'error' && message.code === 'already-started', 'Duplicate start rejection')

;[display, ...players].forEach(connection => { connection.messages.length = 0 })
display.ws.send(JSON.stringify({ t: 'return-lobby' }))
await Promise.all([display, ...players].map((connection, index) => waitFor(
  connection,
  message => message.t === 'snapshot' && message.game.status === 'lobby',
  `Lobby return connection ${index + 1}`,
)))
if (players.some(player => player.ws.readyState !== WebSocket.OPEN)) throw new Error('A phone disconnected during lobby return')

;[display, ...players].forEach(connection => { connection.messages.length = 0 })
players.forEach(player => player.ws.send(JSON.stringify({ t: 'ready', ready: true })))
await new Promise(resolve => setTimeout(resolve, 200))
display.ws.send(JSON.stringify({ t: 'start', stackingMode: 'official' }))
const nextRound = await Promise.all(players.map((player, index) => waitFor(
  player,
  message => message.t === 'snapshot'
    && message.game.status === 'playing'
    && message.game.you?.hand.length === 7
    && message.game.you.userId === originalIds[index],
  `Next round player ${index + 1}`,
)))
if (nextRound.some(frame => frame.game.stackingMode !== 'official' || frame.game.drawStack !== 0)) {
  throw new Error('New round did not preserve/reset its rule state')
}

;[display, ...players].forEach(connection => { connection.messages.length = 0 })
display.ws.send(JSON.stringify({ t: 'close-room' }))
await Promise.all([display, ...players].map((connection, index) => waitFor(
  connection,
  message => message.t === 'error' && message.code === 'room-closed',
  `Room close connection ${index + 1}`,
)))

console.log(`Couch host actions passed: room ${code}; unauthorized action rejected; duplicate start rejected; same two phone identities received fresh 7-card rounds; lobby return and room close succeeded.`)
