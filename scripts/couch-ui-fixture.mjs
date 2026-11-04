import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('../frontend/node_modules/@supabase/supabase-js')

const toml = readFileSync(new URL('../game-server/wrangler.toml', import.meta.url), 'utf8')
const setting = name => toml.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]
const supabaseUrl = setting('SUPABASE_URL')
const supabaseKey = setting('SUPABASE_ANON_KEY')
const serverUrl = process.argv[2] || 'http://127.0.0.1:8787'
const lifetimeMs = Number(process.argv[3] || 120_000)

if (!supabaseUrl || !supabaseKey) throw new Error('Missing public Supabase settings in game-server/wrangler.toml')

async function anonymous(name) {
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { username: name } } })
  if (error || !data.session) throw error || new Error('Anonymous session missing')
  return data.session.access_token
}

function socketUrl(code) {
  return serverUrl.replace(/^http/, 'ws') + `/room/${code}/ws`
}

function openSocket(code, firstMessage) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(socketUrl(code))
    const timer = setTimeout(() => reject(new Error('Socket snapshot timeout')), 12_000)
    ws.onopen = () => ws.send(JSON.stringify(firstMessage))
    ws.onmessage = event => {
      const message = JSON.parse(String(event.data))
      if (message.t !== 'snapshot') return
      clearTimeout(timer)
      resolve({ ws, snapshot: message.game })
    }
    ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket transport error')) }
  })
}

function waitForMessage(connection, predicate, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out`)), 30_000)
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

const hostToken = await anonymous(`UI-TV-${crypto.randomUUID().slice(0, 8)}`)
const created = await fetch(`${serverUrl}/rooms`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${hostToken}`, 'content-type': 'application/json', Origin: 'http://127.0.0.1:5173' },
  body: JSON.stringify({ couch: true, public: false, stackingMode: 'official' }),
})
if (!created.ok) throw new Error(`Room create failed: ${created.status}`)
const { code } = await created.json()
const display = await openSocket(code, { t: 'couch-auth', token: hostToken })

console.log(`FIXTURE_ROOM=${code}`)
console.log('Waiting for the browser controller to join and become ready...')

await waitForMessage(
  display,
  message => message.t === 'presence'
    && message.players.some(player => player.connected && player.ready),
  'Browser player readiness',
)

const botTokens = await Promise.all([anonymous('Runenwache'), anonymous('Runenmagier')])
const bots = await Promise.all(botTokens.map((token, index) => openSocket(code, {
  t: 'auth',
  token,
  name: index === 0 ? 'Runenwache' : 'Runenmagier',
})))
bots.forEach(bot => bot.ws.send(JSON.stringify({ t: 'ready', ready: true })))
await new Promise(resolve => setTimeout(resolve, 600))

const started = waitForMessage(display, message => message.t === 'snapshot' && message.game.status === 'playing', 'Game start')
display.ws.send(JSON.stringify({ t: 'start', stackingMode: 'official' }))
const game = (await started).game

if (game.players[0]?.name === 'Runenwache' || game.players[0]?.name === 'Runenmagier') {
  throw new Error('Browser player did not receive the first seat')
}
console.log(`FIXTURE_PLAYING=${code}`)

await new Promise(resolve => setTimeout(resolve, lifetimeMs))
display.ws.close()
bots.forEach(bot => bot.ws.close())
