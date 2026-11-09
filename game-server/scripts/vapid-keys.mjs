// Make the VAPID key pair the daily reminders are signed with, and store both
// halves as wrangler secrets without printing the private one. Run once, from
// game-server/:
//
//   node scripts/vapid-keys.mjs
//
// It refuses to replace existing keys unless you pass --rotate. Browsers pick
// up new keys the next time they open the site, so a rotation drops reminders
// for anyone who does not come back.
import { spawnSync } from 'node:child_process'

const wrangler = (args, input) =>
    spawnSync('npx', ['wrangler', ...args], { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'] })

const listed = wrangler(['secret', 'list', '--format', 'json'])
if (listed.status !== 0) process.exit(listed.status ?? 1)
const exists = JSON.parse(listed.stdout).some(s => s.name === 'VAPID_PRIVATE_KEY')
if (exists && !process.argv.includes('--rotate')) {
    console.log('VAPID keys are already set. Pass --rotate to replace them.')
    process.exit(0)
}

const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
const publicKey = Buffer.from(await crypto.subtle.exportKey('raw', pair.publicKey)).toString('base64url')
const { d: privateKey } = await crypto.subtle.exportKey('jwk', pair.privateKey)

for (const [name, value] of [['VAPID_PUBLIC_KEY', publicKey], ['VAPID_PRIVATE_KEY', privateKey]]) {
    const put = wrangler(['secret', 'put', name], value)
    if (put.status !== 0) process.exit(put.status ?? 1)
}
console.log('VAPID keys stored. Public key:', publicKey)
