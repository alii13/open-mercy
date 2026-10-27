import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

const [url, output, widthArg = '1440', heightArg = '1000', waitArg = '12000', actionExpression = '', afterWaitArg = '0'] = process.argv.slice(2)
if (!url || !output) throw new Error('Usage: node scripts/capture-local-page.mjs <url> <png> [width] [height] [wait-ms]')
const browser = process.env.RUNE_RIOT_BROWSER || 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
const profile = resolve('.local', `capture-${Date.now()}`)
const child = spawn(browser, [
  '--headless=new', '--no-first-run', '--disable-gpu', '--disable-extensions',
  '--remote-debugging-port=0', `--window-size=${widthArg},${heightArg}`,
  `--user-data-dir=${profile}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] })

const browserWs = await new Promise((resolveWs, reject) => {
  const timer = setTimeout(() => reject(new Error('Browser DevTools endpoint timeout')), 10_000)
  child.stderr.setEncoding('utf8')
  child.stderr.on('data', chunk => {
    const match = String(chunk).match(/DevTools listening on (ws:\/\/[^\s]+)/)
    if (match) { clearTimeout(timer); resolveWs(match[1]) }
  })
  child.once('exit', code => { clearTimeout(timer); reject(new Error(`Browser exited early (${code})`)) })
})

const ws = new WebSocket(browserWs)
await new Promise((resolveOpen, reject) => {
  ws.onopen = resolveOpen
  ws.onerror = () => reject(new Error('Could not connect to DevTools'))
})
let nextId = 0
const pending = new Map()
const browserErrors = []
ws.onmessage = event => {
  const message = JSON.parse(String(event.data))
  if (message.method === 'Runtime.exceptionThrown') browserErrors.push(message.params?.exceptionDetails?.text || 'Uncaught exception')
  if (message.method === 'Runtime.consoleAPICalled' && message.params?.type === 'error') {
    browserErrors.push(message.params.args?.map(arg => arg.value ?? arg.description).join(' ') || 'console.error')
  }
  if (!message.id) return
  const entry = pending.get(message.id)
  if (!entry) return
  pending.delete(message.id)
  if (message.error) entry.reject(new Error(message.error.message))
  else entry.resolve(message.result)
}
function command(method, params = {}, sessionId) {
  const id = ++nextId
  return new Promise((resolveCommand, reject) => {
    pending.set(id, { resolve: resolveCommand, reject })
    ws.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }))
  })
}

try {
  const { targetId } = await command('Target.createTarget', { url: 'about:blank' })
  const { sessionId } = await command('Target.attachToTarget', { targetId, flatten: true })
  await command('Page.enable', {}, sessionId)
  await command('Runtime.enable', {}, sessionId)
  await command('Emulation.setDeviceMetricsOverride', {
    width: Number(widthArg),
    height: Number(heightArg),
    deviceScaleFactor: 1,
    mobile: true,
  }, sessionId)
  await command('Page.navigate', { url }, sessionId)
  await new Promise(resolveWait => setTimeout(resolveWait, Number(waitArg)))
  let actionResult = null
  if (actionExpression) {
    actionResult = await command('Runtime.evaluate', { expression: actionExpression, awaitPromise: true, returnByValue: true }, sessionId)
    if (actionResult.exceptionDetails) {
      throw new Error(actionResult.exceptionDetails.exception?.description || actionResult.exceptionDetails.text || 'Browser action failed')
    }
    await new Promise(resolveWait => setTimeout(resolveWait, Number(afterWaitArg)))
  }
  const page = await command('Runtime.evaluate', {
    expression: `({
      url: location.href,
      text: document.body.innerText.slice(0, 600),
      viewport: { width: innerWidth, height: innerHeight },
      overflow: {
        bodyWidth: document.body.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        bodyHeight: document.body.scrollHeight,
        clientHeight: document.documentElement.clientHeight,
      },
    })`,
    returnByValue: true,
  }, sessionId)
  const shot = await command('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false }, sessionId)
  const path = resolve(output)
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, Buffer.from(shot.data, 'base64'))
  if (actionResult) console.log(`Action result: ${JSON.stringify(actionResult.result.value)}`)
  console.log(JSON.stringify(page.result.value))
  console.log(`Browser errors: ${browserErrors.length ? browserErrors.join(' | ') : 'none'}`)
  console.log(`Screenshot: ${path}`)
} finally {
  ws.close()
  child.kill()
}
