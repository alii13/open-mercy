import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { createClient } = require('../frontend/node_modules/@supabase/supabase-js')

const toml = readFileSync(new URL('../game-server/wrangler.toml', import.meta.url), 'utf8')
const setting = name => toml.match(new RegExp(`^${name}\\s*=\\s*"([^"]+)"`, 'm'))?.[1]
const supabaseUrl = setting('SUPABASE_URL')
const supabaseKey = setting('SUPABASE_ANON_KEY')
const serverUrl = process.argv[2] || 'http://127.0.0.1:8787'
const ruleset = process.argv[3] === 'chaos' ? 'chaos' : 'classic'
if (!supabaseUrl || !supabaseKey) throw new Error('Missing public Supabase settings in game-server/wrangler.toml')

async function anonymous(name) {
  const client = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const { data, error } = await client.auth.signInAnonymously({ options: { data: { username: name } } })
  if (error || !data.session) throw error || new Error('Anonymous session missing')
  return data.session.access_token
}

function openSocket(code, firstMessage) {
  const url = serverUrl.replace(/^http/, 'ws') + `/room/${code}/ws`
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    const messages = []
    const timer = setTimeout(() => reject(new Error(`Socket timeout; received ${messages.map(m => m.t).join(', ')}`)), 12_000)
    ws.onopen = () => ws.send(JSON.stringify(firstMessage))
    ws.onmessage = event => {
      const message = JSON.parse(String(event.data))
      messages.push(message)
      if (message.t === 'snapshot') {
        clearTimeout(timer)
        resolve({ ws, messages, snapshot: message.game })
      }
    }
    ws.onerror = () => { clearTimeout(timer); reject(new Error('WebSocket transport error')) }
  })
}

const hostToken = await anonymous(`TV-${crypto.randomUUID().slice(0, 8)}`)
const created = await fetch(`${serverUrl}/rooms`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${hostToken}`, 'content-type': 'application/json', Origin: 'http://127.0.0.1:5173' },
  body: JSON.stringify({ couch: true, public: false, stackingMode: 'official', ruleset }),
})
if (!created.ok) throw new Error(`Room create failed: ${created.status}`)
const { code } = await created.json()

const display = await openSocket(code, { t: 'couch-auth', token: hostToken })
if (display.snapshot.you !== null || display.snapshot.pendingDrawnWildCard !== null) {
  throw new Error('Display received private state')
}

const playerTokens = await Promise.all([anonymous('Smoke Dragon'), anonymous('Smoke Mage')])
const players = await Promise.all(playerTokens.map((token, index) =>
  openSocket(code, { t: 'auth', token, name: index ? 'Smoke Mage' : 'Smoke Dragon' })))
players.forEach(player => player.ws.send(JSON.stringify({ t: 'ready', ready: true })))

await new Promise(resolve => setTimeout(resolve, 150))
const started = new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(new Error('Game start snapshot timed out')), 12_000)
  display.ws.onmessage = event => {
    const message = JSON.parse(String(event.data))
    if (message.t !== 'snapshot' || message.game.status !== 'playing') return
    clearTimeout(timer)
    resolve(message.game)
  }
})
display.ws.send(JSON.stringify({ t: 'start', stackingMode: 'official' }))
const publicGame = await started
if (publicGame.ruleset !== ruleset) {
  throw new Error(`Expected ${ruleset} ruleset, received ${publicGame.ruleset}`)
}
if (ruleset === 'chaos' && (!publicGame.chaos || publicGame.deckCount + publicGame.discardCount + publicGame.players.reduce((sum, player) => sum + player.handCount, 0) !== 113)) {
  throw new Error('Chaos snapshot is missing its timer state or complete 113-card deck')
}
if (publicGame.you !== null || JSON.stringify(publicGame).includes('"hand":')) {
  throw new Error('TV game snapshot leaked a hand')
}

for (const connection of [display, ...players]) connection.ws.close()
console.log(`Couch ${ruleset} smoke passed: room ${code}, 2 players, TV snapshot contains no private hand.`)
