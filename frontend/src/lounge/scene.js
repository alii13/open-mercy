// The public table: one lit card table where every player is a standing card.
// The world never acts on local input directly. Input becomes an intent ({ kind, ... }) handed to
// onIntent; PublicTableLounge.vue applies it locally, relays it through the room socket, and applies
// everyone else's the same way, by calling join / leave / move / flick / draw / emote for each player.
// Started from the prototype in docs/lounge-proto, which keeps its own copy for experiments.
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { CSS2DRenderer, CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js'
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js'
import { gsap } from 'gsap'

export const TABLE = { rx: 4.9, rz: 3.05 }
const CARD = { w: 0.5, h: 0.8 }
const TILT = 0.2
const SEAT = { rx: TABLE.rx - 0.55, rz: TABLE.rz - 0.45 }
const KEEP_OUT = 1.05
const DECK_AT = new THREE.Vector3(-0.4, 0, -0.05)
const PILE_AT = new THREE.Vector3(0.42, 0, 0.0)
const LAMP_Y = 3.0
const LITTER_MAX = 28

// The card-back skins from utils/cosmetics.ts; presence already carries each player's skin id.
export const SKINS = {
  ember: { accent: '#ff3333', stripe: '#ffcc00' }, toxic: { accent: '#39ff14', stripe: '#a4ff78' },
  ice: { accent: '#00e5ff', stripe: '#9ff3ff' }, hazard: { accent: '#ffcc00', stripe: '#ff3333' },
  royal: { accent: '#b26bff', stripe: '#e3c7ff' }, gold: { accent: '#ffd700', stripe: '#fff3b0' },
}
const RING = { you: new THREE.Color('#ffcc00').multiplyScalar(3.6), other: new THREE.Color('#00f3ff').multiplyScalar(3.4) }

// The tier art from frontend/src/assets/badges, in tier order (utils/badges.ts).
const BADGE_FILES = ['01-recruit', '02-scrapper', '03-enforcer', '04-savage', '05-brute', '06-warlord', '07-overlord', '08-executioner',
  '09-merciless', '10-no-mercy-king', '11-tyrant', '12-butcher', '13-dreadlord', '14-harbinger', '15-annihilator', '16-wraith',
  '17-reaper', '18-doombringer', '19-apocalypse', '20-god-of-no-mercy']

export const FACES = {
  'wild-ten-draw': '+10', 'wild-draw-six': '+6', 'wild-reverse-four-draw': 'Reverse +4', 'wild-roulette': 'Color Roulette',
  'skip-everyone-red': 'Skip Everyone', 'discard-all-blue': 'Discard All', 'four-draw-green': '+4', 'two-draw-yellow': '+2',
  'seven-swap-red': '7 Swap', 'zero-blue': 'a 0', 'reverse-yellow': 'a Reverse', 'nine-green': 'a 9', 'skip-blue': 'a Skip', 'five-red': 'a 5',
}

const lerp = (a, b, t) => a + (b - a) * t
const clamp = (x, a, b) => Math.min(b, Math.max(a, x))
const rand = (a, b) => a + Math.random() * (b - a)
// Positions, angles and speeds arrive from other players once the room relays them; one NaN would spread to every card.
const finite = (...v) => v.every(Number.isFinite)

// A host that can unmount during load keeps the promise and disposes through it: ready.then((l) => l.dispose()).
// Each lounge needs its own canvas, sized by CSS: dispose() and a failed load leave the old canvas's context lost for good.
export async function createLounge({ canvas, overlay, artUrl, badgeUrl, reducedMotion = false }) {
  await Promise.all([document.fonts.load('64px "Black Ops One"'), document.fonts.load('600 16px "Chakra Petch"')])

  // Phones and small screens get a lighter frame: fewer pixels, smaller shadow and felt maps, half the dust, no MSAA.
  const lite = matchMedia('(pointer: coarse)').matches || Math.min(innerWidth, innerHeight) < 720
  // antialias stays off: the composer renders into its own target, which carries the MSAA instead.
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  renderer.setPixelRatio(Math.min(devicePixelRatio, lite ? 1.5 : 1.75))
  // One signal removes every listener this module adds; dispose() aborts it.
  const off = new AbortController(), { signal } = off
  renderer.outputColorSpace = THREE.SRGBColorSpace
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.0
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFShadowMap

  const BG = 0x040405
  const scene = new THREE.Scene()
  scene.background = new THREE.Color(BG)
  scene.fog = new THREE.FogExp2(BG, 0.055)
  const pmrem = new THREE.PMREMGenerator(renderer)
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture
  scene.environmentIntensity = 0.22
  pmrem.dispose()

  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 80)
  const labels = new CSS2DRenderer({ element: overlay })

  // ------------------------------------------------------------ textures
  const maxAniso = Math.min(renderer.capabilities.getMaxAnisotropy(), lite ? 4 : 8)
  function canvasTex(w, h, draw) {
    const c = document.createElement('canvas')
    c.width = w; c.height = h
    draw(c.getContext('2d'), w, h)
    const t = new THREE.CanvasTexture(c)
    t.colorSpace = THREE.SRGBColorSpace
    t.anisotropy = maxAniso
    return t
  }

  // The card back from CardBack.vue, redrawn at the art's 500:800 proportion, in any skin.
  function drawBack(g, w, h, { accent, stripe }, wordmark) {
    const s = w / 250, H = h / s
    g.save()
    g.scale(s, s)
    g.beginPath(); g.roundRect(0, 0, 250, H, 16); g.fillStyle = '#111'; g.fill()
    const grad = g.createLinearGradient(0, 0, 250, H)
    grad.addColorStop(0, '#2a2a2a'); grad.addColorStop(1, '#1a1a1a')
    g.beginPath(); g.roundRect(6, 6, 238, H - 12, 12); g.fillStyle = grad; g.fill()
    g.lineWidth = 2; g.strokeStyle = '#333'; g.stroke()
    for (const y of [40, H - 40]) {
      g.save(); g.beginPath(); g.rect(6, y - 6, 238, 12); g.clip()
      g.fillStyle = '#000'; g.fillRect(6, y - 6, 238, 12)
      g.fillStyle = stripe
      for (let x = -24; x < 260; x += 20) {
        g.beginPath(); g.moveTo(x, y + 6); g.lineTo(x + 10, y + 6); g.lineTo(x + 22, y - 6); g.lineTo(x + 12, y - 6); g.fill()
      }
      g.restore()
    }
    g.setLineDash([10, 5]); g.strokeStyle = 'rgba(255,255,255,0.1)'; g.lineWidth = 2
    g.beginPath(); g.arc(125, H / 2, 90, 0, Math.PI * 2); g.stroke(); g.setLineDash([])
    g.beginPath(); g.arc(125, H / 2, 75, 0, Math.PI * 2); g.fillStyle = '#000'; g.fill()
    g.lineWidth = 4; g.strokeStyle = accent; g.stroke()
    g.textAlign = 'center'; g.textBaseline = 'middle'
    if (wordmark) {
      g.font = '42px "Black Ops One"'; g.fillStyle = accent; g.fillText('OPEN', 125, H / 2 - 10)
      g.font = '32px "Black Ops One"'; g.fillStyle = '#e6e6e6'; g.fillText('MERCY', 125, H / 2 + 30)
    }
    g.restore()
    return H
  }
  const backTex = canvasTex(512, 820, (g, w, h) => drawBack(g, w, h, SKINS.ember, true))

  // A player's card is a card from the deck: the back in their skin, their rank badge in the seal, their global rank under it.
  const badgeImgs = await Promise.all(BADGE_FILES.map((f) => new Promise((res) => {
    const im = new Image()
    im.onload = () => res(im)
    im.onerror = () => res(null)
    im.src = badgeUrl(f)
  })))
  // rank: undefined while it loads (the player's own card back, wordmark and all), null for a player with
  // no games (UNRANKED), or { tier, global }.
  function playerFaceTex(skin, rank) {
    return canvasTex(512, 820, (g, w, h) => {
      const H = drawBack(g, w, h, skin, rank === undefined), s = w / 250
      if (rank === undefined) return
      g.scale(s, s)
      const img = rank && badgeImgs[rank.tier - 1]
      if (img) g.drawImage(img, 125 - 62, H / 2 - 62, 124, 124)
      g.textAlign = 'center'; g.textBaseline = 'middle'
      g.font = '30px "Black Ops One"'; g.fillStyle = '#f2f2f2'
      g.fillText(rank ? `#${rank.global.toLocaleString('en-US')}` : 'UNRANKED', 125, H - 92)
      g.font = '600 11px "Chakra Petch"'; g.letterSpacing = '3px'; g.fillStyle = skin.accent
      g.fillText(rank ? 'GLOBAL RANK' : 'NO GAMES YET', 125, H - 64)
    })
  }

  const S = lite ? 1024 : 2048
  const feltTex = canvasTex(S, S, (g) => {
    g.fillStyle = '#3a3b45'; g.fillRect(0, 0, S, S)
    const img = g.getImageData(0, 0, S, S), d = img.data
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 14
      d[i] += n; d[i + 1] += n; d[i + 2] += n
    }
    g.putImageData(img, 0, 0)
    const edge = g.createRadialGradient(S / 2, S / 2, S * 0.2, S / 2, S / 2, S * 0.5)
    edge.addColorStop(0, 'rgba(0,0,0,0)'); edge.addColorStop(1, 'rgba(0,0,0,0.45)')
    g.fillStyle = edge; g.fillRect(0, 0, S, S)
    // Draw in world centimetres from here on: the felt is a unit circle stretched to the ellipse.
    g.setTransform(S / (2 * TABLE.rx) / 100, 0, 0, S / (2 * TABLE.rz) / 100, S / 2, S / 2)
    g.lineWidth = 2.2; g.strokeStyle = 'rgba(255,204,0,0.32)'
    g.beginPath(); g.ellipse(0, 0, TABLE.rx * 86, TABLE.rz * 82, 0, 0, Math.PI * 2); g.stroke()
    g.lineWidth = 7; g.strokeStyle = 'rgba(0,0,0,0.55)'
    g.beginPath(); g.arc(0, 0, KEEP_OUT * 100 - 8, 0, Math.PI * 2); g.stroke()
    g.setLineDash([11, 11]); g.strokeStyle = 'rgba(255,204,0,0.5)'
    g.beginPath(); g.arc(0, 0, KEEP_OUT * 100 - 8, 0, Math.PI * 2); g.stroke(); g.setLineDash([])
    g.textAlign = 'center'; g.textBaseline = 'middle'
    g.font = '44px "Black Ops One"'; g.fillStyle = 'rgba(255,204,0,0.26)'
    g.letterSpacing = '6px'; g.fillText('OPEN MERCY', 0, -200)
    g.font = '600 13px "Chakra Petch"'; g.fillStyle = 'rgba(255,255,255,0.22)'
    g.letterSpacing = '4px'; g.fillText('PUBLIC TABLE  ·  IT DEALS ITSELF', 0, 205)
  })

  const dotTex = canvasTex(64, 64, (g) => {
    const r = g.createRadialGradient(32, 32, 0, 32, 32, 32)
    r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.35, 'rgba(255,255,255,0.45)'); r.addColorStop(1, 'rgba(255,255,255,0)')
    g.fillStyle = r; g.fillRect(0, 0, 64, 64)
  })

  const loader = new THREE.TextureLoader()
  const faceMats = {}
  try {
    await Promise.all(Object.keys(FACES).map(async (name) => {
      const t = await loader.loadAsync(artUrl(name))
      t.colorSpace = THREE.SRGBColorSpace
      t.anisotropy = maxAniso
      // Upload now: left to the first draw of each face, the decode and upload stalled that draw.
      renderer.initTexture(t)
      faceMats[name] = new THREE.MeshStandardMaterial({ map: t, color: 0xd2d2d2, roughness: 0.48, alphaTest: 0.5 })
    }))
  } catch (err) {
    // A missing asset must not strand a live WebGL context: each retry would add another until the browser evicts them.
    renderer.dispose()
    renderer.forceContextLoss()
    throw err
  }

  // ------------------------------------------------------------ table, lamp, room
  const backMat = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.55 })

  // Phones skip the sheen and clearcoat: the felt fills most of the screen, so its shader cost is paid on almost every pixel.
  const felt = new THREE.Mesh(
    new THREE.CircleGeometry(1, 160).rotateX(-Math.PI / 2),
    lite ? new THREE.MeshStandardMaterial({ map: feltTex, roughness: 0.92 })
      : new THREE.MeshPhysicalMaterial({ map: feltTex, roughness: 0.92, sheen: 0.7, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x6b5a46) }),
  )
  felt.scale.set(TABLE.rx, 1, TABLE.rz)
  felt.receiveShadow = true
  scene.add(felt)

  const ellipseTube = (rx, rz, y, radius, mat) => {
    const pts = []
    for (let i = 0; i < 128; i++) { const a = (i / 128) * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(a) * rx, y, Math.sin(a) * rz)) }
    const m = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), lite ? 160 : 320, radius, lite ? 10 : 20, true), mat)
    // The rails' shadows fall outward onto the dark floor, where nobody can see them, so they stay out of the shadow map.
    m.receiveShadow = true
    scene.add(m)
    return m
  }
  ellipseTube(TABLE.rx + 0.12, TABLE.rz + 0.12, 0.07, 0.21, lite
    ? new THREE.MeshStandardMaterial({ color: 0x1e0a0d, roughness: 0.42 })
    : new THREE.MeshPhysicalMaterial({ color: 0x1e0a0d, roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.32 }))
  ellipseTube(TABLE.rx - 0.07, TABLE.rz - 0.07, 0.012, 0.022,
    new THREE.MeshStandardMaterial({ color: 0xdedee4, metalness: 1, roughness: 0.16 }))

  const body = new THREE.Mesh(new THREE.CylinderGeometry(1, 0.9, 0.75, 96, 1, true),
    new THREE.MeshStandardMaterial({ color: 0x120d0c, roughness: 0.6 }))
  body.scale.set(TABLE.rx + 0.2, 1, TABLE.rz + 0.2)
  body.position.y = -0.38
  scene.add(body)

  const floor = new THREE.Mesh(new THREE.PlaneGeometry(80, 80).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.82 }))
  floor.position.y = -1.1
  floor.receiveShadow = true
  scene.add(floor)

  scene.add(new THREE.HemisphereLight(0x8a9cff, 0x1a0c08, 0.35))
  const fill = new THREE.DirectionalLight(0xffe4c4, 0.55)
  fill.position.set(0, 3.5, 10)
  scene.add(fill)

  const pivot = new THREE.Group()
  pivot.position.y = 10
  scene.add(pivot)
  const lamp = new THREE.Group()
  lamp.position.y = LAMP_Y - 10
  pivot.add(lamp)
  const shapeGeo = new THREE.LatheGeometry(
    [[0.07, 0.66], [0.16, 0.6], [0.36, 0.44], [0.58, 0.22], [0.8, 0.03], [0.82, 0]].map(([r, y]) => new THREE.Vector2(r, y)), 64)
  lamp.add(new THREE.Mesh(shapeGeo, new THREE.MeshStandardMaterial({ color: 0x141416, metalness: 0.6, roughness: 0.5, envMapIntensity: 0.08 })))
  lamp.add(new THREE.Mesh(shapeGeo, new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffc978).multiplyScalar(1.4), side: THREE.BackSide, toneMapped: false })))
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.82, 0.014, 10, 96).rotateX(Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.8, 0.45).multiplyScalar(4), toneMapped: false }))
  lamp.add(rim)
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.12, 32, 16),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(1, 0.86, 0.62).multiplyScalar(9), toneMapped: false }))
  bulb.position.y = 0.12
  lamp.add(bulb)
  const cord = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 8, 6), new THREE.MeshBasicMaterial({ color: 0x111113 }))
  cord.position.y = 4.6
  lamp.add(cord)

  const spot = new THREE.SpotLight(0xffd6a0, 95, 0, 1.02, 0.7, 2)
  spot.position.y = 0.08
  spot.castShadow = true
  spot.shadow.mapSize.setScalar(lite ? 1024 : 2048)
  spot.shadow.camera.near = 0.5
  spot.shadow.camera.far = 8
  spot.shadow.bias = -0.0004
  spot.shadow.normalBias = 0.02
  spot.shadow.radius = 4
  lamp.add(spot)
  spot.target.position.y = -3
  lamp.add(spot.target)

  // The light you can see: an additive cone from the bulb to the felt, brighter through its middle.
  const CONE_H = LAMP_Y + 0.05
  const cone = new THREE.Mesh(new THREE.ConeGeometry(3.9, CONE_H, 96, 1, true), new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(1, 0.8, 0.5) }, uStrength: { value: 0.16 } },
    vertexShader: /* glsl */`
      varying vec3 vN; varying vec3 vView; varying vec3 vP;
      void main() {
        vP = position;
        vN = normalize(normalMatrix * normal);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform vec3 uColor; uniform float uStrength;
      varying vec3 vN; varying vec3 vView; varying vec3 vP;
      void main() {
        float h = vP.y / ${CONE_H.toFixed(3)} + 0.5;
        float through = pow(abs(dot(normalize(vN), normalize(vView))), 1.6);
        float fade = smoothstep(0.0, 0.45, h) * (0.3 + 0.7 * h);
        float a = atan(vP.z, vP.x);
        float shafts = 0.72 + 0.28 * sin(a * 7.0 + uTime * 0.25) * sin(a * 3.0 - uTime * 0.17);
        gl_FragColor = vec4(uColor, through * fade * shafts * uStrength);
      }`,
    // Additive with no depth writes, so one pass of both faces looks the same as three's default back-then-front pair.
    transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, blending: THREE.AdditiveBlending,
  }))
  cone.position.y = CONE_H / 2
  scene.add(cone)

  const DUST = lite ? 260 : 520
  const dust = { theta: new Float32Array(DUST), frac: new Float32Array(DUST), y: new Float32Array(DUST), phase: new Float32Array(DUST) }
  const dustPos = new Float32Array(DUST * 3)
  for (let i = 0; i < DUST; i++) {
    dust.theta[i] = rand(0, Math.PI * 2); dust.frac[i] = Math.sqrt(Math.random()); dust.y[i] = rand(0.1, LAMP_Y - 0.2); dust.phase[i] = rand(0, 10)
  }
  const dustGeo = new THREE.BufferGeometry()
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3))
  const dustPts = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    size: 0.032, map: dotTex, color: 0xffcf8a, transparent: true, opacity: 0.75, depthWrite: false, blending: THREE.AdditiveBlending,
  }))
  dustPts.frustumCulled = false
  scene.add(dustPts)

  // ------------------------------------------------------------ cards
  const cardShape = new THREE.Shape()
  {
    const w = CARD.w, h = CARD.h, r = 0.035
    cardShape.moveTo(-w / 2 + r, -h / 2)
    cardShape.lineTo(w / 2 - r, -h / 2); cardShape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r)
    cardShape.lineTo(w / 2, h / 2 - r); cardShape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2)
    cardShape.lineTo(-w / 2 + r, h / 2); cardShape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r)
    cardShape.lineTo(-w / 2, -h / 2 + r); cardShape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2)
  }
  const cardGeo = new THREE.ShapeGeometry(cardShape, 6)
  {
    const p = cardGeo.attributes.position, uv = cardGeo.attributes.uv
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / CARD.w + 0.5, p.getY(i) / CARD.h + 0.5)
  }

  function makeCard(faceMat) {
    const g = new THREE.Group()
    g.rotation.order = 'YXZ'
    const front = new THREE.Mesh(cardGeo, faceMat)
    const back = new THREE.Mesh(cardGeo, backMat)
    front.position.z = 0.003
    back.position.z = -0.003
    back.rotation.y = Math.PI
    // Only the front casts: the back would cast the same shadow again.
    front.castShadow = true
    for (const m of [front, back]) m.receiveShadow = true
    g.add(front, back)
    return g
  }
  // A card lying flat sits a few millimetres up; its shadow is invisible, so stop drawing it into the shadow map.
  const settle = (c) => { c.children[0].castShadow = false }
  const randomFace = () => { const k = Object.keys(FACES); return k[(Math.random() * k.length) | 0] }

  const DECK_H = 0.17
  const edgeTex = canvasTex(64, 128, (g, w, h) => { for (let y = 0; y < h; y += 2) { g.fillStyle = (y / 2) % 2 ? '#d6d6d2' : '#6c6c6c'; g.fillRect(0, y, w, 2) } })
  const edgeMat = new THREE.MeshStandardMaterial({ map: edgeTex, roughness: 0.8 })
  const deck = new THREE.Mesh(new THREE.BoxGeometry(CARD.w, DECK_H, CARD.h).translate(0, DECK_H / 2, 0),
    [edgeMat, edgeMat, backMat, edgeMat, edgeMat, edgeMat])
  deck.position.copy(DECK_AT)
  deck.rotation.y = 0.08
  deck.castShadow = true; deck.receiveShadow = true
  scene.add(deck)
  const deckTop = () => DECK_AT.y + DECK_H * deck.scale.y

  // ------------------------------------------------------------ players
  const players = new Map()
  let youP = null
  // An invisible box a little wider than the card: what a tap aims at, so a small card on a phone is still easy to hit.
  const hitGeo = new THREE.BoxGeometry(CARD.w * (lite ? 1.6 : 1.25), CARD.h * 1.25, 0.5).translate(0, CARD.h / 2, 0)
  const hitMat = new THREE.MeshBasicMaterial()
  const listeners = { intent: [], event: [] }
  // Some events fire inside the frame; a listener that throws there would stop the render loop.
  const emit = (type, payload) => listeners[type].forEach((fn) => { try { fn(payload) } catch (err) { console.error(err) } })

  function shockwave(x, z, color, size = 3.2) {
    const m = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.36, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    m.position.set(x, 0.006, z)
    scene.add(m)
    gsap.to(m.scale, { x: size, z: size, duration: 0.9, ease: 'power2.out' })
    gsap.to(m.material, { opacity: 0, duration: 0.9, ease: 'power1.in', onComplete: () => { scene.remove(m); m.geometry.dispose(); m.material.dispose() } })
  }

  // quiet: someone already at the table when you arrive, so no 'joined' toast or shockwave for them.
  function join({ id, name, skin = 'ember', rank, you = false, x, z, quiet = false }) {
    if (players.has(id)) return
    const g = new THREE.Group()
    const sk = Object.hasOwn(SKINS, skin) ? SKINS[skin] : SKINS.ember
    const faceTex = playerFaceTex(sk, rank)
    const card = makeCard(new THREE.MeshStandardMaterial({ map: faceTex, roughness: 0.5, emissive: 0xffffff, emissiveMap: faceTex, emissiveIntensity: 0.2 }))
    card.rotation.x = -TILT
    g.add(card)

    const ring = new THREE.Mesh(new THREE.RingGeometry(0.3, 0.335, 64).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: you ? RING.you : RING.other, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
    ring.position.y = 0.005
    const glow = new THREE.Mesh(new THREE.CircleGeometry(0.62, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ map: dotTex, color: you ? 0xffcc00 : 0x00f3ff, transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false }))
    glow.position.y = 0.004
    const hit = new THREE.Mesh(hitGeo, hitMat)
    hit.visible = false
    g.add(ring, glow, hit)

    const tagEl = document.createElement('div')
    tagEl.innerHTML = `<div class="tag${you ? ' you' : ''}" style="--c:${sk.accent}">${you ? '<b>YOU</b>' : '<i></i>'}<span></span></div>`
    tagEl.querySelector('span').textContent = name
    const tag = new CSS2DObject(tagEl)
    tag.center.set(0.5, 1)
    const bubbleEl = document.createElement('div')
    bubbleEl.innerHTML = '<div class="bubble"></div>'
    const bubble = new CSS2DObject(bubbleEl)
    bubble.center.set(0.5, 1)
    g.add(tag, bubble)
    for (const el of [tagEl, bubbleEl]) el.style.pointerEvents = 'none'

    const spot0 = finite(x, z) ? clampToSeats(x, z) : freeSpot(you)
    g.position.set(spot0.x, 0, spot0.z)
    scene.add(g)
    const p = { id, name, you, skin: sk, rank, g, card, ring, glow, hit, tagEl, bubbleEl, tag, bubble, baseY: 0, tx: spot0.x, tz: spot0.z, k: 3.2,
      speed: 0, phase: rand(0, 10), w: 0, wv: 0, lift: -1.1, bubbleTimer: null }
    sizeSeat(p)
    players.set(id, p)
    if (you) youP = p

    ring.scale.setScalar(0.01)
    gsap.to(p, { lift: 0, duration: 0.9, ease: 'back.out(1.5)' })
    gsap.to(ring.scale, { x: 1, y: 1, z: 1, duration: 0.7, delay: 0.2, ease: 'back.out(2)' })
    if (!quiet) {
      shockwave(spot0.x, spot0.z, you ? RING.you : RING.other)
      emit('event', { text: you ? 'You joined' : `${name} joined` })
    }
    return p
  }

  // Portrait phones see the table from far back, so seated cards stand larger there; frame() re-runs this on rotation.
  function sizeSeat(p) {
    const sc = portrait ? 1.3 : 1
    p.baseY = (CARD.h / 2) * Math.cos(TILT) * sc + 0.01
    p.card.scale.setScalar(sc)
    p.hit.scale.setScalar(sc)
    p.tag.position.y = CARD.h * sc + 0.14
    p.bubble.position.y = CARD.h * sc + 0.42
  }

  function leave(id) {
    const p = players.get(id)
    if (!p) return
    players.delete(id)
    if (p === youP) youP = null
    emit('event', { text: `${p.name} left the table` })
    p.tagEl.style.transition = 'opacity .3s'; p.tagEl.style.opacity = '0'
    gsap.to(p.ring.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.4 })
    gsap.to(p, { lift: -1.2, duration: 0.6, ease: 'back.in(1.6)', onComplete: () => {
      p.tagEl.remove(); p.bubbleEl.remove(); scene.remove(p.g)
      // Each seat owns its face texture and ring meshes; the table loops forever, so free them or GPU memory climbs.
      const face = p.card.children[0].material
      face.map.dispose(); face.dispose()
      for (const m of [p.ring, p.glow]) { m.geometry.dispose(); m.material.dispose() }
    } })
  }

  function clampToSeats(x, z) {
    const e = (x / SEAT.rx) ** 2 + (z / SEAT.rz) ** 2
    if (e > 1) { const k = 1 / Math.sqrt(e); x *= k; z *= k }
    const r = Math.hypot(x, z)
    if (r < KEEP_OUT) { const a = r > 0.001 ? Math.atan2(z, x) : Math.PI / 2; x = Math.cos(a) * KEEP_OUT; z = Math.sin(a) * KEEP_OUT }
    return { x, z }
  }

  function freeSpot(you) {
    if (you) return portrait ? clampToSeats(SEAT.rx * 0.92, rand(-0.4, 0.4)) : clampToSeats(rand(0.9, 1.3), SEAT.rz * 0.92)
    let best = null, bestD = -1
    for (let i = 0; i < 40; i++) {
      const a = rand(0, Math.PI * 2), f = rand(0.55, 1)
      const c = clampToSeats(Math.cos(a) * SEAT.rx * f, Math.sin(a) * SEAT.rz * f)
      let d = Infinity
      for (const p of players.values()) d = Math.min(d, Math.hypot(p.tx - c.x, p.tz - c.z))
      if (d > bestD) { bestD = d; best = c }
    }
    return best
  }

  function move(id, x, z, drag = false) {
    const p = players.get(id)
    if (!p || !finite(x, z)) return
    const c = clampToSeats(x, z)
    p.tx = c.x; p.tz = c.z
    p.k = drag ? 12 : 3.2
  }

  function emote(id, text) {
    const p = players.get(id)
    if (!p) return
    const b = p.bubbleEl.firstChild
    b.textContent = text
    b.classList.toggle('mercy', text === 'Mercy!')
    b.classList.remove('on'); void b.offsetWidth; b.classList.add('on')
    clearTimeout(p.bubbleTimer)
    p.bubbleTimer = setTimeout(() => b.classList.remove('on'), 2200)
    gsap.fromTo(p, { lift: 0 }, { lift: 0.22, duration: 0.16, yoyo: true, repeat: 1, ease: 'power2.out' })
    if (text === 'Mercy!') shockwave(p.g.position.x, p.g.position.z, new THREE.Color('#ff2a2a').multiplyScalar(2.2), 5)
    else gsap.fromTo(p.ring.scale, { x: 1.5, z: 1.5 }, { x: 1, z: 1, duration: 0.5, ease: 'power2.out' })
  }

  // ------------------------------------------------------------ flicked cards
  // A flick is played from a path, never simulated where it arrives: the
  // sender's client runs the skid once (simulateFlick) and every client, the
  // sender's included, replays the same points. So one flick hits the same card
  // on every screen. The room relays the path; see shared/lounge.ts.
  const litter = []
  let litterLayer = 0
  const faceKeys = Object.keys(FACES)

  function simulateFlick(id, angle, speed) {
    const p = players.get(id)
    if (!p || !finite(angle, speed)) return null
    speed = clamp(speed, 0, 18)
    let x = p.g.position.x + Math.cos(angle) * 0.36, z = p.g.position.z + Math.sin(angle) * 0.36
    let vx = Math.cos(angle) * speed, vz = Math.sin(angle) * speed
    const path = [[x, z]]
    let hit = null, hitAt = 0
    const dt = 1 / 60, fr = Math.exp(-dt * 1.6), ex = TABLE.rx - 0.28, ez = TABLE.rz - 0.28
    // ponytail: 22 turns is far more than a skid makes; the cap keeps the frame under LOUNGE_PATH_MAX
    for (let step = 0, age = 0; step < 600 && Math.hypot(vx, vz) >= 0.04 && path.length < 22; step++, age += dt) {
      x += vx * dt; z += vz * dt; vx *= fr; vz *= fr
      let turned = false
      if ((x / ex) ** 2 + (z / ez) ** 2 > 1) {
        const nl = Math.hypot(x / (ex * ex), z / (ez * ez)), nx = x / (ex * ex) / nl, nz = z / (ez * ez) / nl
        const vn = vx * nx + vz * nz
        if (vn > 0) { vx = (vx - 2 * vn * nx) * 0.55; vz = (vz - 2 * vn * nz) * 0.55; turned = true }
        const k = 1 / Math.sqrt((x / ex) ** 2 + (z / ez) ** 2); x *= k; z *= k
      }
      for (const q of players.values()) {
        if (q === p && age < 0.4) continue
        const dx = q.g.position.x - x, dz = q.g.position.z - z, d = Math.hypot(dx, dz)
        if (!(d >= 1e-4 && d <= 0.34)) continue
        const nx = dx / d, nz = dz / d, vn = vx * nx + vz * nz
        if (vn <= 0) continue
        vx = (vx - 2 * vn * nx) * 0.45; vz = (vz - 2 * vn * nz) * 0.45; turned = true
        if (!hit) { hit = q.id; hitAt = path.length }
      }
      if (turned) path.push([x, z])
    }
    path.push([x, z])
    return hit ? { kind: 'flick', path, hit, hitAt } : { kind: 'flick', path }
  }

  function flick(id, path, hit, hitAt) {
    const p = players.get(id)
    if (!p || !Array.isArray(path) || path.length < 2) return
    // Derived from the path, so the flicked card shows the same face everywhere.
    const c = makeCard(faceMats[faceKeys[Math.floor(Math.abs(path[0][0] * 997 + path[0][1] * 131)) % faceKeys.length]])
    c.rotation.x = -Math.PI / 2
    c.rotation.y = (path[0][0] * 7) % (Math.PI * 2)
    c.position.set(path[0][0], 0.006 + (litterLayer++ % 40) * 0.0007, path[0][1])
    scene.add(c)
    const cum = [0]
    for (let i = 1; i < path.length; i++) cum.push(cum[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]))
    const total = Math.max(1e-6, cum[cum.length - 1])
    const hitDist = hit && cum[hitAt] !== undefined ? cum[hitAt] : Infinity
    const spin = path.length % 2 ? 8 : -8
    const s = { d: 0 }
    let landed = false
    const entry = { c, tween: null }
    entry.tween = gsap.to(s, {
      d: total, duration: clamp(total / 3.2, 0.4, 2.6), ease: 'power2.out',
      onUpdate() {
        let i = 1
        while (i < cum.length - 1 && cum[i] < s.d) i++
        const t = (s.d - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
        c.position.x = lerp(path[i - 1][0], path[i][0], t)
        c.position.z = lerp(path[i - 1][1], path[i][1], t)
        c.rotation.y += spin * 0.016 * (1 - s.d / total)
        if (!landed && s.d >= hitDist) {
          landed = true
          const q = players.get(hit)
          if (q) {
            q.wv += path.length % 2 ? 6 : -6
            emit('event', { text: `${p.name} hit ${q.you ? 'you' : q.name}`, kind: 'hit' })
          }
        }
      },
      onComplete: () => settle(c),
    })
    litter.push(entry)
    if (litter.length > LITTER_MAX) {
      const old = litter.shift()
      old.tween?.kill()
      gsap.to(old.c.scale, { x: 0.01, y: 0.01, z: 0.01, duration: 0.4, onComplete: () => scene.remove(old.c) })
    }
    gsap.fromTo(p.card.rotation, { y: 0 }, { y: Math.PI * 2, duration: 0.5, ease: 'power2.out' })
  }

  // ------------------------------------------------------------ drawing from the deck
  // Every draw flies the moment it arrives, so a player can tap tap tap and watch the cards stream to the pile, and
  // none is dropped, so every screen shows the same draws. Past MAX_FLYING cards in the air (a burst from the whole
  // table, a tab back from the background where nothing animates) the rest land straight on the pile. A draw keeps
  // its player's name from when it arrived, so it still shows if they leave first. The deal takes the deck, so a
  // draw that arrives while it runs is dropped.
  const pile = []
  const flights = new Set()
  const MAX_FLYING = 6
  // Each card takes the next step up as it comes down, and when the oldest leaves the rest drop a step:
  // two cards at the same height flicker through each other.
  const PILE_STEP = 0.0012
  let landing = 0
  const pileSpot = () => ({ x: PILE_AT.x + rand(-0.06, 0.06), y: 0.004 + (pile.length + landing) * PILE_STEP, z: PILE_AT.z + rand(-0.06, 0.06) })
  function draw(id, face) {
    const p = players.get(id)
    if (dealing || !p || !Object.hasOwn(FACES, face)) return
    const who = p.you ? 'You' : p.name
    if (flights.size >= MAX_FLYING) { land({ who, face }); return }
    const c = makeCard(faceMats[face])
    c.position.set(DECK_AT.x, deckTop() + 0.004, DECK_AT.z)
    c.rotation.set(Math.PI / 2, deck.rotation.y, 0)
    scene.add(c)
    emit('event', { text: `${who} drew ${FACES[face]}`, kind: 'draw' })
    const camYaw = Math.atan2(camera.position.x - DECK_AT.x, camera.position.z - DECK_AT.z)
    // Cards in the air together fan out, so a stream reads as several cards and not one.
    const lane = flights.size
    const lift = 1.45 + lane * 0.08
    const side = DECK_AT.x + 0.1 + (lane % 2 ? -1 : 1) * Math.ceil(lane / 2) * 0.22
    let rest = null
    const tl = gsap.timeline({ onComplete: () => flights.delete(tl) })
      .to(c.position, { y: lift, x: side, duration: 0.45, ease: 'power3.out' })
      .to(c.rotation, { x: 0, y: camYaw + Math.PI * 2, duration: 0.45, ease: 'power2.out' }, '<')
      .to(c.position, { y: lift + 0.08, duration: 0.7, ease: 'sine.inOut' })
      .to(c.rotation, { z: 0.08, duration: 0.7, ease: 'sine.inOut' }, '<')
      // The pile spot is taken as the card starts down, so cards landing together never share a height.
      .call(() => { rest = pileSpot(); landing++ })
      .to(c.position, { x: () => rest.x, y: () => rest.y, z: () => rest.z, duration: 0.38, ease: 'power2.in' })
      .to(c.rotation, { x: -Math.PI / 2, y: rand(-0.5, 0.5), z: 0, duration: 0.38, ease: 'power2.in' }, '<')
      .call(() => {
        landing--
        toPile(c)
        shockwave(c.position.x, c.position.z, new THREE.Color('#ffcc00').multiplyScalar(1.6), 2.2)
      })
    flights.add(tl)
  }
  function toPile(c) {
    pile.push(c)
    settle(c)
    if (pile.length > 14) {
      scene.remove(pile.shift())
      for (const p of pile) p.position.y -= PILE_STEP
    }
  }
  function land({ who, face }) {
    const c = makeCard(faceMats[face])
    c.position.copy(pileSpot())
    c.rotation.set(-Math.PI / 2, rand(-0.5, 0.5), 0)
    scene.add(c)
    toPile(c)
    emit('event', { text: `${who} drew ${FACES[face]}` })
  }
  // ------------------------------------------------------------ the deal
  let dealing = false, dealTl = null, dealDone = null, dealRun = null
  const dealt = []
  const view = { k: 0 }
  function deal() {
    // A second call while dealing gets the running deal's promise, never an early answer.
    if (dealing) return dealRun
    dealing = true
    const seats = [...players.values()]
    // Module scope, so reset() and dispose() can stop a deal halfway; a killed timeline's then() would never settle.
    const tl = dealTl = gsap.timeline({ onComplete: () => dealDone?.(true) })
    pulse(1.8)
    tl.to(deck.position, { y: 0.42, duration: 0.2, ease: 'power2.out', yoyo: true, repeat: 1 }, 0)
    tl.to(deck.rotation, { y: deck.rotation.y + Math.PI * 2, duration: 0.55, ease: 'power3.out' }, 0)
    const STAGGER = 0.035, START = 0.3
    let i = 0
    for (let r = 0; r < 7; r++) {
      for (const p of seats) {
        const c = makeCard(backMat)
        c.position.set(DECK_AT.x, -1, DECK_AT.z)
        c.rotation.set(Math.PI / 2, 0, 0)
        scene.add(c)
        dealt.push(c)
        const px = p.g.position.x, pz = p.g.position.z, d = Math.hypot(px, pz)
        const ux = -px / d, uz = -pz / d
        const tx = px + ux * 0.62 + -uz * (r - 3) * 0.075, tz = pz + uz * 0.62 + ux * (r - 3) * 0.075
        const ty = 0.006 + r * 0.0016
        const heading = Math.atan2(px, pz) + (r - 3) * 0.06
        const last = r === 6
        tl.to({ t: 0 }, {
          t: 1, duration: 0.5, ease: 'power2.out',
          onUpdate() {
            // Read the deck height on the first update, not in onStart: a slow frame can update a tween that never started.
            const t = this.targets()[0].t, f = (this.from ??= { x: DECK_AT.x, y: deckTop(), z: DECK_AT.z })
            c.position.set(lerp(f.x, tx, t), lerp(f.y, ty, t) + Math.sin(Math.PI * t) * 0.9, lerp(f.z, tz, t))
            c.rotation.x = Math.PI / 2 + Math.PI * 2 * t
            c.rotation.y = lerp(0, heading + Math.PI * 2, t)
          },
          onComplete() {
            gsap.fromTo(p.ring.scale, { x: 1.45, z: 1.45 }, { x: 1, z: 1, duration: 0.35, ease: 'power2.out' })
            settle(c)
            if (last) shockwave(px, pz, p.you ? RING.you : RING.other, 2.6)
          },
        }, START + i * STAGGER)
        i++
      }
    }
    tl.to(deck.scale, { y: 0.3, duration: i * STAGGER, ease: 'none' }, START)
    tl.to(view, { k: 1, duration: 1.4, ease: 'power3.inOut' }, '-=0.35')
    emit('event', { text: 'Dealing seven to everyone' })
    // Resolves true when the deal finishes, false when reset() or dispose() cuts it short.
    return (dealRun = new Promise((res) => { dealDone = res }))
  }

  // A beat of the countdown: a shockwave from the deck, the lamp flares, the camera jolts.
  let shake = 0
  function pulse(strength = 1) {
    shockwave(DECK_AT.x, DECK_AT.z, new THREE.Color('#ff2a2a').multiplyScalar(1.3), 2.4 + strength * 1.6)
    gsap.fromTo(spot, { intensity: 95 * (1 + 0.9 * strength) }, { intensity: 95, duration: 0.7, ease: 'power2.out' })
    gsap.fromTo(cone.material.uniforms.uStrength, { value: 0.16 * (1 + strength) }, { value: 0.16, duration: 0.7, ease: 'power2.out' })
    if (!reducedMotion) shake = Math.max(shake, 0.05 * strength)
  }

  function reset() {
    dealTl?.kill()
    dealDone?.(false)
    dealTl = dealDone = null
    deck.position.y = DECK_AT.y
    deck.rotation.y = 0.08
    for (const c of dealt) scene.remove(c)
    dealt.length = 0
    gsap.to(deck.scale, { y: 1, duration: 0.6, ease: 'power2.out' })
    gsap.to(view, { k: 0, duration: 1.2, ease: 'power2.inOut' })
    dealing = false
  }

  // ------------------------------------------------------------ camera framing
  const base = { pos: new THREE.Vector3(), look: new THREE.Vector3() }
  let baseFov = 40, portrait = false
  // Sized from the canvas, not the window: a host can mount the lounge in any box, as long as CSS sizes the canvas.
  // Without a CSS size the canvas lays out at its own buffer size, which grows by the pixel ratio on every resize.
  function frame() {
    const w = canvas.clientWidth, h = canvas.clientHeight, a = w / h
    if (!w || !h) return
    renderer.setSize(w, h, false)
    composer.setSize(w, h)
    labels.setSize(w, h)
    portrait = a < 0.9
    camera.fov = baseFov = portrait ? 58 : 40
    camera.aspect = a
    camera.updateProjectionMatrix()
    const halfH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))
    const hf = Math.atan(halfH * a)
    // ponytail: a portrait screen looks down the table's long axis with the lamp hidden; the real phone pass is iteration 4
    const dir = portrait ? new THREE.Vector3(1, 1.6, 0).normalize() : new THREE.Vector3(0, 0.52, 1).normalize()
    // Portrait stands back and looks past the deck so every seat lands between the host's heading and its controls.
    const d = portrait ? (1.18 * (TABLE.rz + 0.35)) / Math.tan(hf) : Math.max(7.6, (TABLE.rx + 0.05) / Math.tan(hf))
    base.look.set(portrait ? -0.3 : 0, portrait ? 0 : 0.2, portrait ? 0 : 0.1)
    base.pos.copy(base.look).addScaledVector(dir, d)
    // Hide the lamp's meshes, never the group: an invisible parent also switches off the spot light and every shadow.
    for (const m of lamp.children) if (m !== spot && m !== spot.target) m.visible = !portrait
    for (const p of players.values()) sizeSeat(p)
  }

  const pointer = new THREE.Vector2()
  const camPos = new THREE.Vector3(), camLook = new THREE.Vector3(), seatPos = new THREE.Vector3(), seatLook = new THREE.Vector3()
  function placeCamera(t) {
    const drift = reducedMotion ? 0 : 1
    camPos.copy(base.pos)
    camPos.x += (Math.sin(t * 0.07) * 0.35 + pointer.x * 0.3) * drift
    camPos.y += (Math.sin(t * 0.05) * 0.12 + pointer.y * 0.15) * drift
    camLook.copy(base.look)
    const you = youP
    if (view.k > 0 && you) {
      const yx = you.g.position.x, yz = you.g.position.z
      seatPos.set(yx * 1.6, 2.5, yz * 1.6 + 0.4)
      seatLook.set(0, 0, 0)
      const k = view.k
      camPos.lerp(seatPos, k); camLook.lerp(seatLook, k)
    }
    camPos.x += (Math.random() - 0.5) * shake
    camPos.y += (Math.random() - 0.5) * shake
    camera.position.copy(camPos)
    camera.lookAt(camLook)
    const fov = baseFov - view.k * 5
    if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix() }
  }

  // ------------------------------------------------------------ input
  const raycaster = new THREE.Raycaster()
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0)
  const hitPoint = new THREE.Vector3()
  const ndc = new THREE.Vector2()
  function pick(e) {
    const r = canvas.getBoundingClientRect()
    ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    raycaster.setFromCamera(ndc, camera)
    const targets = [deck]
    for (const p of players.values()) targets.push(p.hit)
    const hits = raycaster.intersectObjects(targets, false)
    const felt = raycaster.ray.intersectPlane(ground, hitPoint) ? { x: hitPoint.x, z: hitPoint.z } : null
    const onFelt = felt && (felt.x / (TABLE.rx - 0.15)) ** 2 + (felt.z / (TABLE.rz - 0.15)) ** 2 <= 1
    if (hits.length) {
      if (hits[0].object === deck) return { what: 'deck', felt }
      const p = [...players.values()].find((q) => q.hit === hits[0].object)
      return { what: p.you ? 'you' : 'player', p, felt }
    }
    return { what: onFelt ? 'felt' : 'none', felt }
  }
  const me = () => youP

  // Drag your card to move it, tap the felt to walk there, tap someone to flick a card at them,
  // tap the deck to draw, tap yourself to wave.
  let drag = null
  // One finger steers: while it drags, other fingers are ignored. Not isPrimary: a finger resting on the screen
  // would make every later touch non-primary and block all input.
  canvas.addEventListener('pointerdown', (e) => {
    if (dealing || e.button !== 0) return
    // A drag whose pointer capture is gone (the canvas moved mid-touch, a context menu took the pointerup) is stale.
    if (drag && !canvas.hasPointerCapture(drag.id)) drag = null
    if (drag) return
    const h = pick(e)
    if (h.what === 'you') { drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, sent: 0 }; canvas.setPointerCapture(e.pointerId) }
    else if (h.what === 'player' && me()) {
      const a = me().g.position, b = h.p.g.position, dx = b.x - a.x, dz = b.z - a.z
      const f = simulateFlick(me().id, Math.atan2(dz, dx), (Math.hypot(dx, dz) + 0.5) * 1.6)
      if (f) emit('intent', f)
    }
    else if (h.what === 'deck') emit('intent', { kind: 'draw', face: randomFace() })
    else if (h.what === 'felt') emit('intent', { kind: 'move', x: h.felt.x, z: h.felt.z, drag: false })
  }, { signal })
  canvas.addEventListener('pointermove', (e) => {
    if (drag ? e.pointerId !== drag.id : !e.isPrimary) return
    const r = canvas.getBoundingClientRect()
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1)
    const h = pick(e)
    if (!drag) {
      canvas.style.cursor = { you: 'grab', player: 'pointer', deck: 'pointer', felt: 'crosshair' }[h.what] ?? 'default'
      return
    }
    canvas.style.cursor = 'grabbing'
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true
    // 150 ms between drag moves leaves room under the socket's 10 a second for taps on the deck and flicks mid-drag.
    if (!drag.moved || !h.felt || performance.now() - drag.sent < 150) return
    drag.sent = performance.now()
    emit('intent', { kind: 'move', x: h.felt.x, z: h.felt.z, drag: true })
  }, { signal })
  const endDrag = (e) => {
    if (!drag || e.pointerId !== drag.id) return
    if (!drag.moved) emit('intent', { kind: 'wave' })
    else {
      const h = pick(e)
      if (h.felt) emit('intent', { kind: 'move', x: h.felt.x, z: h.felt.z, drag: true })
    }
    drag = null
  }
  canvas.addEventListener('pointerup', endDrag, { signal })
  // A drag that loses its pointer without a pointerup must not block every later tap.
  const dropDrag = (e) => { if (drag && e.pointerId === drag.id) drag = null }
  canvas.addEventListener('pointercancel', dropDrag, { signal })
  canvas.addEventListener('lostpointercapture', dropDrag, { signal })

  // ------------------------------------------------------------ loop
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: lite ? 0 : 4 }))
  composer.setPixelRatio(renderer.getPixelRatio())
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.6, 0.55, 1.6)
  composer.addPass(bloom)
  composer.addPass(new OutputPass())
  frame()
  // ResizeObserver runs after the frame is drawn and resizing clears the canvas, so draw again or it blinks.
  const sizer = new ResizeObserver(() => { frame(); composer.render(); labels.render(scene, camera) })
  sizer.observe(canvas)

  // Phones drop the GL context when a backgrounded tab is short of memory. three rebuilds its state on restore,
  // but not render-target contents, so the environment map is rendered again or chrome and the lamp come back black.
  canvas.addEventListener('webglcontextlost', (e) => {
    e.preventDefault()
    emit('event', { text: 'The browser paused the table graphics' })
  }, { signal })
  canvas.addEventListener('webglcontextrestored', () => {
    const g = new THREE.PMREMGenerator(renderer)
    scene.environment.dispose()
    scene.environment = g.fromScene(new RoomEnvironment(), 0.04).texture
    g.dispose()
  }, { signal })

  let t = 0, last = performance.now()
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    t += dt
    const motion = reducedMotion ? 0 : 1

    pivot.rotation.z = Math.sin(t * 0.5) * 0.012 * motion
    pivot.rotation.x = Math.sin(t * 0.37) * 0.008 * motion
    cone.material.uniforms.uTime.value = t

    for (let i = 0; i < DUST; i++) {
      dust.y[i] += dt * 0.035 * motion
      dust.theta[i] += dt * 0.025 * motion
      if (dust.y[i] > LAMP_Y - 0.2) dust.y[i] = 0.08
      const r = dust.frac[i] * (3.6 * (1 - dust.y[i] / CONE_H) + 0.08)
      const wob = Math.sin(t * 0.6 + dust.phase[i]) * 0.05
      dustPos[i * 3] = Math.cos(dust.theta[i]) * r + wob
      dustPos[i * 3 + 1] = dust.y[i]
      dustPos[i * 3 + 2] = Math.sin(dust.theta[i]) * r - wob
    }
    dustGeo.attributes.position.needsUpdate = true

    const all = [...players.values()]
    // ponytail: O(n²) separation, fine for a 20-seat table
    for (let a = 0; a < all.length; a++) for (let b = a + 1; b < all.length; b++) {
      const A = all[a].g.position, B = all[b].g.position, dx = B.x - A.x, dz = B.z - A.z, d = Math.hypot(dx, dz)
      if (!(d >= 1e-4 && d <= 0.58)) continue
      const push = (0.58 - d) * 0.5, nx = dx / d, nz = dz / d
      A.x -= nx * push; A.z -= nz * push; B.x += nx * push; B.z += nz * push
    }
    for (const p of all) {
      const pos = p.g.position, px = pos.x, pz = pos.z, k = 1 - Math.exp(-dt * p.k)
      pos.x += (p.tx - pos.x) * k; pos.z += (p.tz - pos.z) * k
      const vx = (pos.x - px) / Math.max(dt, 1e-3), vz = (pos.z - pz) / Math.max(dt, 1e-3)
      p.speed = lerp(p.speed, Math.hypot(vx, vz), 0.2)
      p.wv += (-p.w * 85 - p.wv * 5.5) * dt
      p.w += p.wv * dt
      p.g.rotation.y = Math.atan2(camera.position.x - pos.x, camera.position.z - pos.z)
      p.card.position.y = p.baseY + p.lift + Math.abs(Math.sin(t * 13 + p.phase)) * Math.min(0.08, p.speed * 0.05)
      p.card.rotation.z = Math.sin(t * 1.3 + p.phase) * 0.03 * motion - clamp(vx * 0.06, -0.22, 0.22) + p.w
      p.glow.material.opacity = 0.18 + Math.sin(t * 2 + p.phase) * 0.04
    }
    shake *= Math.exp(-dt * 7)
    placeCamera(t)
    composer.render()
    labels.render(scene, camera)
  }
  renderer.setAnimationLoop(tick)
  document.addEventListener('visibilitychange', () => {
    last = performance.now()
    renderer.setAnimationLoop(document.hidden ? null : tick)
  }, { signal })

  // A rank arrives after its player sits down: redraw that card's face in place.
  function setRank(id, rank) {
    const p = players.get(id)
    if (!p || JSON.stringify(p.rank) === JSON.stringify(rank)) return
    p.rank = rank
    const face = p.card.children[0].material
    const old = face.map
    face.map = face.emissiveMap = playerFaceTex(p.skin, rank)
    old.dispose()
  }

  return {
    join, leave, move, flick, simulateFlick, draw, emote, deal, reset, pulse, players, setRank,
    onIntent: (fn) => listeners.intent.push(fn),
    onEvent: (fn) => listeners.event.push(fn),
    get busy() { return flights.size > 0 || dealing },
    stats: () => ({ ...renderer.info.memory }),
    // For a host that unmounts the lounge (the Vue port): stop the loop, drop listeners, free the GPU.
    // ponytail: the deal and draw timelines are killed; the short join, leave and shockwave tweens finish on detached objects.
    dispose() {
      off.abort()
      sizer.disconnect()
      dealTl?.kill()
      dealDone?.(false)
      for (const t of flights) t.kill()
      for (const l of litter) l.tween?.kill()
      renderer.setAnimationLoop(null)
      overlay.replaceChildren()
      scene.traverse((o) => {
        o.geometry?.dispose()
        for (const m of [].concat(o.material ?? [])) { m.map?.dispose(); m.emissiveMap?.dispose(); m.dispose() }
      })
      for (const m of Object.values(faceMats)) { m.map.dispose(); m.dispose() }
      for (const x of [backMat, edgeMat, hitMat, cardGeo, hitGeo, backTex, feltTex, dotTex, edgeTex, scene.environment]) x.dispose()
      bloom.dispose()
      composer.dispose()
      renderer.dispose()
      renderer.forceContextLoss()
    },
  }
}
