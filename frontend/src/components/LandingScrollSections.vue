<template>
  <div class="scrolly" :class="{ 'is-static': reduced }" ref="rootEl">
    <div class="stage" ref="stageEl">
      <div class="stage-vignette" aria-hidden="true"></div>

      <!-- Chapter copy — one slot, crossfaded by the master timeline -->
      <div class="chap" ref="chap1">
        <div class="chap-label">01</div>
        <h2 class="chap-heading">STACK <span class="accent-red">OR SUFFER</span></h2>
        <p class="chap-desc">Draw cards stack. The pile grows until someone breaks.</p>
      </div>
      <div class="chap" ref="chap2">
        <div class="chap-label">02</div>
        <h2 class="chap-heading">SKIP <span class="accent-blue">EVERYONE</span></h2>
        <p class="chap-desc">One card. Every opponent skipped. You play again.</p>
      </div>
      <div class="chap" ref="chap3">
        <div class="chap-label">03</div>
        <h2 class="chap-heading">COLOR <span class="accent-yellow">ROULETTE</span></h2>
        <p class="chap-desc">Draw until you hit the chosen color. Could be 1 card. Could be 15.</p>
      </div>
      <div class="chap" ref="chap4">
        <div class="chap-label">04</div>
        <h2 class="chap-heading">25 CARDS? <span class="accent-red">ELIMINATED</span></h2>
        <p class="chap-desc">Hold 25 cards and you're out. The Ruin Rule seals your fate.</p>
      </div>
      <div class="chap" ref="chap5">
        <div class="chap-label">05</div>
        <h2 class="chap-heading">NOT JUST FOR <span class="accent-green">HUMANS</span></h2>
        <p class="chap-desc">This table speaks WebMCP. An AI agent discovers the game the moment it visits and plays a real seat - same rules, same hand, no plugin.</p>
      </div>

      <!-- The deck — the same cards travel through every chapter -->
      <div class="deck" ref="deckEl" aria-hidden="true">
        <div class="fx-flash" ref="flashEl"></div>
        <div class="fx-ring" ref="ringEl"></div>

        <div
          v-for="(c, i) in protagonists"
          :key="c.id"
          class="pcard"
          :ref="el => setRef('p', i, el)"
        >
          <Card :card="c" :size="heroCardSize" />
        </div>

        <!-- Skip chapter: victims ringed around the table -->
        <div v-for="i in 4" :key="'v' + i" class="victim" :ref="el => setRef('victim', i, el)">
          <div class="victim-avatar">{{ ['A', 'B', 'C', 'D'][i - 1] }}</div>
          <div class="victim-name">PLAYER {{ i }}</div>
          <div class="victim-stamp" :ref="el => setRef('stamp', i, el)">SKIPPED</div>
        </div>

        <!-- Roulette chapter: one spot, four faces -->
        <div class="flipper" ref="flipperEl">
          <div
            v-for="(f, i) in rouletteFaces"
            :key="f.id"
            class="face"
            :ref="el => setRef('face', i, el)"
          >
            <Card :card="f" :size="heroCardSize" />
            <div v-if="f.color !== 'green'" class="face-tag tag-miss">MISS</div>
            <div v-else class="face-tag tag-hit">HIT</div>
          </div>
        </div>
        <div class="seek-label" ref="seekEl">SEEKING: <span class="accent-green">GREEN</span></div>

        <!-- Mercy chapter: the hand that grows to 25 -->
        <div v-for="i in 25" :key="'f' + i" class="fcard" :ref="el => setRef('fan', i, el)">
          <CardBack :size="tinyCardSize" />
        </div>
        <div class="boom" ref="boomEl">ELIMINATED</div>

        <!-- Agent chapter: the pile the agent plays onto -->
        <div class="apile" ref="apileEl">
          <Card :card="{ id: 'apile', color: 'blue', type: 'number', value: 4 }" :size="medCardSize" />
          <div class="fx-pulse" ref="pulseEl"></div>
        </div>
        <div class="afly" ref="aflyEl">
          <Card :card="{ id: 'afly', color: 'red', type: 'number', value: 7 }" :size="medCardSize" />
        </div>
        <div class="agent-turn" ref="agentTurnEl">TURN &rarr; <span class="accent-green">AGENT</span></div>

        <!-- The big number: +N stack counter, then the 25-card mercy count -->
        <div class="counter" ref="counterEl">
          <span class="counter-plus" ref="plusEl">+</span><span ref="numEl">0</span>
        </div>
      </div>

      <!-- Agent HUD -->
      <div class="hud" ref="hudEl">
        <div class="hud-bar">
          <span class="hud-dot"></span><span class="hud-dot"></span><span class="hud-dot"></span>
          <span class="hud-title">WEBMCP // AGENT</span>
        </div>
        <div class="hud-body">
          <div class="hud-line" :ref="el => setRef('hud', 1, el)"><span class="hud-prompt">&gt;</span> wait_for_turn()</div>
          <div class="hud-line" :ref="el => setRef('hud', 2, el)"><span class="hud-prompt">&gt;</span> get_state()</div>
          <div class="hud-line hud-dim" :ref="el => setRef('hud', 3, el)">hand 6 &middot; top <span class="accent-red">RED 7</span></div>
          <div class="hud-line hud-dim" :ref="el => setRef('hud', 4, el)">legal_moves:</div>
          <div class="hud-moves" :ref="el => setRef('hud', 5, el)">
            <span class="move-chip" :ref="el => setRef('chip', 1, el)">R7</span>
            <span class="move-chip" :ref="el => setRef('chip', 2, el)">+2</span>
            <span class="move-chip" :ref="el => setRef('chip', 3, el)">WILD</span>
            <span class="hud-scan" ref="hudScanEl"></span>
          </div>
          <div class="hud-line" :ref="el => setRef('hud', 6, el)"><span class="hud-prompt accent-green">&gt;</span> play_card(<span class="accent-red">"red-7"</span>)<span class="hud-ok" ref="hudOkEl"> OK</span></div>
        </div>
        <a class="agent-cta" ref="agentCtaEl" href="https://github.com/Craine92/Rune-Riot" target="_blank" rel="noopener">
          <Code :size="16" :stroke-width="2" aria-hidden="true" />
          HOW AGENTS PLAY
        </a>
      </div>
      <div class="agent-beam" ref="beamEl" aria-hidden="true"></div>

      <!-- Finale: feedback -->
      <div class="finale" ref="finaleEl">
        <div class="bubbles">
          <div class="bubble bubble-1" :ref="el => setRef('bubble', 1, el)">
            <MessageSquare :size="20" :stroke-width="2" aria-hidden="true" />
            <span>Found a bug?</span>
          </div>
          <div class="bubble bubble-2" :ref="el => setRef('bubble', 2, el)">
            <HelpCircle :size="20" :stroke-width="2" aria-hidden="true" />
            <span>Got an idea?</span>
          </div>
          <div class="bubble bubble-3" :ref="el => setRef('bubble', 3, el)">
            <Heart :size="20" :stroke-width="2" aria-hidden="true" />
            <span>Want to say hi?</span>
          </div>
        </div>
        <h2 class="chap-heading">WE'RE <span class="accent-green">LISTENING</span></h2>
        <p class="chap-desc">Every message goes straight to my inbox. We read everything.</p>
        <button class="feedback-cta" @click="$emit('openFeedback')">
          <MessageSquare :size="16" :stroke-width="2" aria-hidden="true" />
          SEND FEEDBACK
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Code, Heart, HelpCircle, MessageSquare } from 'lucide-vue-next'
/**
 * Pinned scrollytelling — the whole story is ONE timeline on ONE stage.
 * Five protagonist cards persist across chapters: they stack (+penalties),
 * get skipped, play roulette (recoloring the page), multiply to the ruin
 * limit and detonate, watch an agent take a seat, then hand over to the
 * feedback finale. Scrubbing backwards rewinds the story — every beat is a
 * tween (no callbacks mutating state), so reverse is always coherent.
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import type { ScrollTrigger } from 'gsap/ScrollTrigger'
import { onFirstScroll } from '../composables/onFirstScroll'
import Card from './game/Card.vue'
import CardBack from './game/CardBack.vue'
import type { Card as CardType } from '../types/card'


defineEmits<{
  (e: 'openFeedback'): void
}>()

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

const isMobile = ref(window.innerWidth <= 768)
function onResize() { isMobile.value = window.innerWidth <= 768 }

const heroCardSize = computed(() => isMobile.value ? { width: 110, height: 154 } : { width: 170, height: 238 })
const medCardSize = computed(() => isMobile.value ? { width: 90, height: 126 } : { width: 130, height: 182 })
const tinyCardSize = computed(() => isMobile.value ? { width: 30, height: 42 } : { width: 48, height: 67 })

// The recurring cast. The four draw cards stack in chapter 1; the Skip
// Everyone card crowns the pile in chapter 2.
const protagonists: CardType[] = [
  { id: 'p1', color: 'red', type: 'draw2' },
  { id: 'p2', color: 'wild', type: 'draw4' },
  { id: 'p3', color: 'wild', type: 'draw6' },
  { id: 'p4', color: 'wild', type: 'draw10' },
  { id: 'p5', color: 'red', type: 'skipEveryone' },
]

const rouletteFaces: CardType[] = [
  { id: 'rf1', color: 'red', type: 'number', value: 3 },
  { id: 'rf2', color: 'blue', type: 'number', value: 7 },
  { id: 'rf3', color: 'yellow', type: 'number', value: 5 },
  { id: 'rf4', color: 'green', type: 'number', value: 4 },
]

const ACCENT = { red: '#ff2a2a', blue: '#00bfff', yellow: '#ffcc00', green: '#00ff66' } as const

const rootEl = ref<HTMLElement>()
const stageEl = ref<HTMLElement>()
const deckEl = ref<HTMLElement>()
const flashEl = ref<HTMLElement>()
const ringEl = ref<HTMLElement>()
const flipperEl = ref<HTMLElement>()
const seekEl = ref<HTMLElement>()
const boomEl = ref<HTMLElement>()
const counterEl = ref<HTMLElement>()
const plusEl = ref<HTMLElement>()
const numEl = ref<HTMLElement>()
const apileEl = ref<HTMLElement>()
const aflyEl = ref<HTMLElement>()
const agentTurnEl = ref<HTMLElement>()
const hudEl = ref<HTMLElement>()
const hudScanEl = ref<HTMLElement>()
const hudOkEl = ref<HTMLElement>()
const agentCtaEl = ref<HTMLElement>()
const beamEl = ref<HTMLElement>()
const finaleEl = ref<HTMLElement>()
const chap1 = ref<HTMLElement>()
const chap2 = ref<HTMLElement>()
const chap3 = ref<HTMLElement>()
const chap4 = ref<HTMLElement>()
const chap5 = ref<HTMLElement>()

const dynamicRefs: Record<string, Record<number, HTMLElement>> = {}
function setRef(group: string, i: number, el: any) {
  if (!dynamicRefs[group]) dynamicRefs[group] = {}
  if (el) dynamicRefs[group][i] = el as HTMLElement
}
function getRef(group: string, i: number) { return dynamicRefs[group]?.[i] }
function getRefs(group: string, from: number, to: number): HTMLElement[] {
  const out: HTMLElement[] = []
  for (let i = from; i <= to; i++) {
    const el = getRef(group, i)
    if (el) out.push(el)
  }
  return out
}

// Deterministic per-card randomness — computed once so scrubbing back and
// forth replays the exact same explosion every time.
const fanScatter = Array.from({ length: 25 }, () => ({
  x: gsap.utils.random(-420, 420),
  y: gsap.utils.random(-300, 140),
  r: gsap.utils.random(-140, 140),
}))
const stackRot = [-6, 4, -3, 7]
const victimDirs = [
  { x: -1, y: -0.62 }, { x: 1, y: -0.62 }, { x: -1, y: 0.62 }, { x: 1, y: 0.62 },
]

let master: gsap.core.Timeline | null = null
let velocityST: ScrollTrigger | null = null
let ST: typeof ScrollTrigger | null = null
let alive = true
let cancelWait = () => {}

onMounted(() => {
  if (reduced) return
  window.addEventListener('resize', onResize)
  // The story sits below the fold: its plugin and pinned timeline load on the
  // first scroll instead of during startup, where PageSpeed counted them.
  cancelWait = onFirstScroll(async () => {
    ST = (await import('gsap/ScrollTrigger')).ScrollTrigger
    gsap.registerPlugin(ST)
    if (alive) requestAnimationFrame(() => requestAnimationFrame(init))
  })
})

onUnmounted(() => {
  alive = false
  cancelWait()
  window.removeEventListener('resize', onResize)
  velocityST?.kill()
  master?.scrollTrigger?.kill()
  master?.kill()
  ST?.getAll().forEach(t => t.kill())
})

const mob = () => window.innerWidth <= 768
const vw = () => window.innerWidth
const ringX = () => (mob() ? 120 : 260)
const ringY = () => (mob() ? 150 : 170)
const fanSpacing = () => (mob() ? 11 : 22)

const pulseEl = ref<HTMLElement>()

// Static centering lives on the CSS `translate` property, which composes
// with the `transform` GSAP writes — so these sets only carry motion state.
function initState() {
  gsap.set(getRefs('p', 0, 4), { autoAlpha: 0 })
  gsap.set(flashEl.value!, { autoAlpha: 0, scale: 0.5 })
  gsap.set(ringEl.value!, { autoAlpha: 0, scale: 0.4 })
  gsap.set(counterEl.value!, { autoAlpha: 0, scale: 0.6 })
  for (let i = 1; i <= 4; i++) {
    const v = getRef('victim', i)
    const s = getRef('stamp', i)
    if (v) gsap.set(v, { x: () => victimDirs[i - 1]!.x * ringX(), y: () => victimDirs[i - 1]!.y * ringY(), autoAlpha: 0, scale: 0.7 })
    if (s) gsap.set(s, { scale: 0, rotation: -14 })
  }
  gsap.set(flipperEl.value!, { autoAlpha: 0 })
  rouletteFaces.forEach((_, i) => {
    const f = getRef('face', i)
    if (f) gsap.set(f, { autoAlpha: i === 0 ? 1 : 0, rotationY: i === 0 ? 0 : -100 })
  })
  gsap.set(seekEl.value!, { autoAlpha: 0, y: () => (mob() ? -119 : -154) })
  for (let i = 1; i <= 25; i++) {
    const f = getRef('fan', i)
    if (f) gsap.set(f, { autoAlpha: 0, x: 0, y: 0, rotation: 0 })
  }
  gsap.set(boomEl.value!, { scale: 0, autoAlpha: 0, rotation: -14 })
  // The mobile HUD sits above the deck center, so the pile cluster drops
  // below it instead of hiding behind the terminal.
  gsap.set(apileEl.value!, { autoAlpha: 0, scale: 0.8, y: () => (mob() ? 150 : 0) })
  gsap.set(aflyEl.value!, { autoAlpha: 0, scale: 0.7, rotation: -12 })
  gsap.set(agentTurnEl.value!, { autoAlpha: 0, y: () => (mob() ? 220 : 86), scale: 0.85 })
  gsap.set(hudEl.value!, { autoAlpha: 0, y: 26 })
  gsap.set(getRefs('hud', 1, 6), { autoAlpha: 0, x: -14 })
  gsap.set(hudScanEl.value!, { autoAlpha: 0, x: 0 })
  gsap.set(hudOkEl.value!, { autoAlpha: 0 })
  gsap.set(agentCtaEl.value!, { autoAlpha: 0 })
  gsap.set(beamEl.value!, { autoAlpha: 0, scaleX: 0 })
  gsap.set(finaleEl.value!, { autoAlpha: 0 })
  for (let i = 1; i <= 3; i++) {
    const b = getRef('bubble', i)
    if (b) gsap.set(b, { autoAlpha: 0, x: i % 2 ? -110 : 110, rotation: i % 2 ? -7 : 7, scale: 0.7 })
  }
  gsap.set([chap1.value, chap2.value, chap3.value, chap4.value, chap5.value], { autoAlpha: 0, y: 30 })
  gsap.set(stageEl.value!, { '--acc': ACCENT.red })
}

function copyIn(tl: gsap.core.Timeline, el: HTMLElement | undefined, at: number) {
  if (el) tl.to(el, { autoAlpha: 1, y: 0, duration: 1.1, ease: 'power3.out' }, at)
}
function copyOut(tl: gsap.core.Timeline, el: HTMLElement | undefined, at: number) {
  if (el) tl.to(el, { autoAlpha: 0, y: -26, duration: 0.9, ease: 'power2.in' }, at)
}

// The big number is driven by a proxy tween so scrubbing backwards counts
// back down — callbacks would only ever fire their own value.
const counterProxy = { n: 0 }
function counterTo(tl: gsap.core.Timeline, target: number, at: number, duration: number) {
  tl.to(counterProxy, {
    n: target,
    duration,
    ease: 'none',
    snap: { n: 1 },
    onUpdate: () => { if (numEl.value) numEl.value.textContent = String(Math.round(counterProxy.n)) },
  }, at)
}

function init() {
  initState()

  master = gsap.timeline({
    defaults: { ease: 'power2.out' },
    scrollTrigger: {
      trigger: rootEl.value,
      start: 'top top',
      end: () => '+=' + Math.round(window.innerHeight * (mob() ? 5.4 : 6.2)),
      pin: true,
      // The landing container is display: flex, where ScrollTrigger defaults
      // pinSpacing to false — without this the page can't scroll through the
      // pinned story at all.
      pinSpacing: true,
      scrub: 1,
      anticipatePin: 1,
      invalidateOnRefresh: true,
    },
  })
  const tl = master

  // ============ CHAPTER 1 — STACK OR SUFFER (0–10) ============
  copyIn(tl, chap1.value, 0.2)
  tl.to(counterEl.value!, { autoAlpha: 1, scale: 1, duration: 0.8 }, 0.8)

  const counterValues = [2, 6, 12, 22]
  for (let i = 0; i < 4; i++) {
    const card = getRef('p', i)
    if (!card) continue
    const at = 1 + i * 1.8
    // Fly in from offscreen — alternating corners, as if the exploded hero
    // cards are coming back to the table.
    tl.fromTo(card,
      {
        x: () => (i % 2 ? 1 : -1) * vw() * 0.7,
        y: () => -window.innerHeight * 0.55,
        rotation: (i % 2 ? 1 : -1) * 70,
        scale: 1.6,
        autoAlpha: 0,
      },
      {
        x: i * 5 - 8,
        y: i * -7,
        rotation: stackRot[i],
        scale: 1,
        autoAlpha: 1,
        duration: 1.1,
        ease: 'power3.in',
        immediateRender: false,
      }, at)
    // Impact: flash + counter punch right as the card lands.
    tl.fromTo(flashEl.value!, { autoAlpha: 0.55, scale: 0.6 }, { autoAlpha: 0, scale: 1.6, duration: 0.5, immediateRender: false }, at + 1.1)
    counterTo(tl, counterValues[i]!, at + 0.9, 0.35)
    tl.fromTo(counterEl.value!, { scale: 1.28 }, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.5)', immediateRender: false }, at + 1.1)
  }
  copyOut(tl, chap1.value, 8.8)
  tl.to(counterEl.value!, { autoAlpha: 0, scale: 0.7, duration: 0.7 }, 9.0)

  // ============ CHAPTER 2 — SKIP EVERYONE (10–20) ============
  copyIn(tl, chap2.value, 10.2)
  for (let i = 1; i <= 4; i++) {
    const v = getRef('victim', i)
    if (v) tl.to(v, { autoAlpha: 1, scale: 1, duration: 0.7 }, 10.4 + i * 0.18)
  }
  // The Skip Everyone card storms in spinning and crowns the pile.
  const skipCard = getRef('p', 4)
  if (skipCard) {
    tl.fromTo(skipCard,
      { x: 0, y: () => -window.innerHeight * 0.6, rotation: -720, scale: 1.5, autoAlpha: 0 },
      { x: 0, y: -14, rotation: 6, scale: 1.06, autoAlpha: 1, duration: 1.6, ease: 'power3.in', immediateRender: false }, 11.2)
    tl.to(skipCard, { scale: 1, duration: 0.5, ease: 'elastic.out(1, 0.4)' }, 12.8)
  }
  // The pile recoils under it, the shockwave rolls the table.
  for (let i = 0; i < 4; i++) {
    const card = getRef('p', i)
    if (card) tl.to(card, { y: `+=${6 + i * 2}`, duration: 0.3, ease: 'power2.out' }, 12.8)
  }
  tl.fromTo(ringEl.value!, { autoAlpha: 0.9, scale: 0.4 }, { autoAlpha: 0, scale: 4.5, duration: 1.4, ease: 'expo.out', immediateRender: false }, 12.9)
  for (let i = 1; i <= 4; i++) {
    const stamp = getRef('stamp', i)
    const v = getRef('victim', i)
    const at = 13.2 + i * 0.5
    if (stamp) tl.to(stamp, { scale: 1, rotation: [-4, 5, -6, 3][i - 1], duration: 0.4, ease: 'back.out(3)' }, at)
    if (v) tl.to(v, { opacity: 0.3, duration: 0.4 }, at)
  }
  copyOut(tl, chap2.value, 18.6)
  for (let i = 1; i <= 4; i++) {
    const v = getRef('victim', i)
    if (v) tl.to(v, { autoAlpha: 0, scale: 0.8, duration: 0.7 }, 18.8 + i * 0.08)
  }

  // ============ CHAPTER 3 — COLOR ROULETTE (20–31) ============
  copyIn(tl, chap3.value, 20.2)
  // The pile condenses into the roulette spot — the deck IS the wheel now.
  getRefs('p', 0, 4).forEach((card, i) => {
    tl.to(card, { x: 0, y: 0, rotation: 0, scale: 0.92, autoAlpha: 0, duration: 0.9, ease: 'power2.in' }, 20.4 + i * 0.08)
  })
  tl.to(flipperEl.value!, { autoAlpha: 1, duration: 0.5 }, 21.1)
  tl.to(seekEl.value!, { autoAlpha: 1, y: () => (mob() ? -135 : -170), duration: 0.7 }, 21.2)

  const faceBeats = [21.8, 24.0, 26.2, 28.4]
  rouletteFaces.forEach((face, i) => {
    const el = getRef('face', i)
    if (!el) return
    const at = faceBeats[i]!
    if (i > 0) tl.to(el, { autoAlpha: 1, rotationY: 0, duration: 0.7, ease: 'power3.out' }, at)
    // The whole page takes the color of the revealed card.
    tl.to(stageEl.value!, { '--acc': ACCENT[face.color as keyof typeof ACCENT], duration: 0.8, ease: 'power1.inOut' }, at)
    if (face.color !== 'green') {
      // Miss: a frustrated shake, then flip away.
      tl.to(el, { keyframes: [{ x: -9 }, { x: 9 }, { x: -6 }, { x: 0 }], duration: 0.5, ease: 'power1.inOut' }, at + 0.8)
      tl.to(el, { autoAlpha: 0, rotationY: 100, duration: 0.7, ease: 'power3.in' }, at + 1.5)
    } else {
      // Hit: the green card lands and the table floods green.
      tl.to(el, { scale: 1.14, duration: 0.4, ease: 'power2.out' }, at + 0.8)
      tl.to(el, { scale: 1.04, duration: 0.7, ease: 'elastic.out(1, 0.35)' }, at + 1.2)
    }
  })
  copyOut(tl, chap3.value, 29.8)
  tl.to([flipperEl.value, seekEl.value], { autoAlpha: 0, duration: 0.7 }, 30.2)

  // ============ CHAPTER 4 — MERCY RULE (31–42) ============
  copyIn(tl, chap4.value, 31.2)
  tl.to(stageEl.value!, { '--acc': ACCENT.red, duration: 1.2 }, 31.2)
  tl.to(counterEl.value!, { autoAlpha: 1, scale: 1, duration: 0.6 }, 31.6)
  tl.to(plusEl.value!, { width: 0, opacity: 0, duration: 0.01 }, 31.0)
  counterTo(tl, 1, 31.0, 0.01)

  // The hand fans out card by card, crowding toward the limit.
  for (let i = 1; i <= 25; i++) {
    const f = getRef('fan', i)
    if (!f) continue
    const k = i - 13
    const at = 32 + (i - 1) * 0.22
    tl.to(f, {
      autoAlpha: 1,
      x: () => k * fanSpacing(),
      y: Math.abs(k) * 3.4 + 96,
      rotation: k * 3.6,
      duration: 0.3,
      ease: 'power2.out',
    }, at)
  }
  counterTo(tl, 25, 32, 25 * 0.22)
  tl.to(numEl.value!, { color: '#ff2a2a', scale: 1.18, duration: 0.5 }, 36.4)
  // Freeze beat... then the table detonates.
  tl.to(boomEl.value!, { scale: 1, autoAlpha: 1, rotation: -3, duration: 0.5, ease: 'back.out(2.5)' }, 38.2)
  for (let i = 1; i <= 25; i++) {
    const f = getRef('fan', i)
    const s = fanScatter[i - 1]!
    if (f) tl.to(f, { x: s.x, y: s.y, rotation: s.r, scale: 0, autoAlpha: 0, duration: 0.9, ease: 'power3.out' }, 38.7 + (i % 5) * 0.05)
  }
  tl.to(counterEl.value!, { autoAlpha: 0, duration: 0.5 }, 38.8)
  copyOut(tl, chap4.value, 40.6)
  tl.to(boomEl.value!, { autoAlpha: 0, scale: 0.9, duration: 0.7 }, 40.8)

  // ============ CHAPTER 5 — AGENT AT THE TABLE (42–54) ============
  copyIn(tl, chap5.value, 42.2)
  tl.to(stageEl.value!, { '--acc': '#39ff14', duration: 1.2 }, 42.2)
  tl.to(hudEl.value!, { autoAlpha: 1, y: 0, duration: 0.9 }, 42.6)
  tl.to(apileEl.value!, { autoAlpha: 1, scale: 1, duration: 0.7 }, 42.8)

  getRefs('hud', 1, 6).forEach((line, i) => {
    const dim = line.classList.contains('hud-dim')
    tl.to(line, { autoAlpha: dim ? 0.6 : 1, x: 0, duration: 0.45, ease: 'power2.out' }, 43.2 + i * 0.55)
  })
  // Scan-line sweeps the legal moves (transform, not `left`).
  tl.fromTo(hudScanEl.value!, { autoAlpha: 0.95, x: -40 }, { x: () => (getRef('hud', 5)?.offsetWidth ?? 280) + 40, duration: 1.4, ease: 'power1.inOut', immediateRender: false }, 46.4)
  tl.to(hudScanEl.value!, { autoAlpha: 0, duration: 0.3 }, 47.8)
  // Chips light as the scan passes — style tweens, so reverse un-lights them.
  const lit = { color: '#39ff14', borderColor: '#39ff14', boxShadow: '0 0 14px rgba(57, 255, 20, 0.5)', y: -2, duration: 0.3 }
  const unlit = { color: '#8a8a8a', borderColor: '#3a3a3a', boxShadow: '0 0 0 rgba(0,0,0,0)', y: 0, duration: 0.3 }
  for (let i = 1; i <= 3; i++) {
    const chip = getRef('chip', i)
    if (!chip) continue
    tl.to(chip, lit, 46.5 + (i - 1) * 0.4)
    if (i !== 1) tl.to(chip, unlit, 46.5 + (i - 1) * 0.4 + 0.5)
  }
  tl.to(hudOkEl.value!, { autoAlpha: 1, duration: 0.4, ease: 'back.out(3)' }, 48.6)
  // Beam fires; the agent's card crosses the table onto the pile.
  tl.fromTo(beamEl.value!, { autoAlpha: 0, scaleX: 0 }, { autoAlpha: 0.9, scaleX: 1, duration: 0.5, immediateRender: false }, 48.9)
  tl.to(beamEl.value!, { autoAlpha: 0, duration: 0.6 }, 49.6)
  tl.fromTo(aflyEl.value!,
    {
      x: () => (mob() ? 0 : -vw() * 0.26),
      y: () => (mob() ? -window.innerHeight * 0.25 : -30),
      autoAlpha: 0, scale: 0.7, rotation: -12,
    },
    { x: 0, y: () => (mob() ? 150 : 0), autoAlpha: 1, scale: 1, rotation: 4, duration: 1.1, ease: 'power3.in', immediateRender: false }, 49.2)
  tl.fromTo(pulseEl.value!, { autoAlpha: 0.8, scale: 0.4 }, { autoAlpha: 0, scale: 1.8, duration: 1.0, immediateRender: false }, 50.3)
  tl.to(agentTurnEl.value!, { autoAlpha: 1, y: () => (mob() ? 230 : 96), scale: 1, duration: 0.6, ease: 'back.out(2.2)' }, 50.6)
  tl.to(agentCtaEl.value!, { autoAlpha: 1, duration: 0.6 }, 51.2)

  copyOut(tl, chap5.value, 52.8)
  tl.to([hudEl.value, beamEl.value, agentCtaEl.value], { autoAlpha: 0, y: -18, duration: 0.8 }, 53.0)
  tl.to([apileEl.value, aflyEl.value, agentTurnEl.value], { autoAlpha: 0, scale: 0.85, duration: 0.8 }, 53.2)

  // ============ CHAPTER 6 — FINALE (54–62) ============
  tl.to(stageEl.value!, { '--acc': '#00ff66', duration: 1.0 }, 54.0)
  tl.to(finaleEl.value!, { autoAlpha: 1, duration: 0.6 }, 54.4)
  for (let i = 1; i <= 3; i++) {
    const b = getRef('bubble', i)
    if (b) {
      tl.to(b, { autoAlpha: 1, x: 0, rotation: i % 2 ? -2 : 2, scale: 1, duration: 0.8, ease: 'back.out(1.8)' }, 54.6 + i * 0.35)
    }
  }
  // Idle beat so the finale holds before the pin releases.
  tl.to({}, { duration: 4 }, 58)

  // Scroll-velocity physicality — the deck skews with scroll speed and
  // settles elastically when you stop.
  const skewSetter = gsap.quickSetter(deckEl.value!, 'skewY', 'deg')
  const skewProxy = { v: 0 }
  velocityST = ST!.create({
    trigger: rootEl.value,
    start: 'top bottom',
    end: 'bottom top',
    onUpdate(self) {
      const v = gsap.utils.clamp(-6, 6, self.getVelocity() / -400)
      if (Math.abs(v) > Math.abs(skewProxy.v)) {
        skewProxy.v = v
        gsap.to(skewProxy, {
          v: 0,
          duration: 0.9,
          ease: 'power3.out',
          overwrite: true,
          onUpdate: () => skewSetter(skewProxy.v),
        })
      }
    },
  })
}
</script>

<style scoped>
.scrolly {
  position: relative;
  z-index: 5;
}

.stage {
  position: relative;
  height: 100vh;
  overflow: hidden;
  --acc: #ff2a2a;
}

.stage-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at 50% 42%, var(--acc) 0%, transparent 62%);
  opacity: 0.1;
  transition: none;
}

/* Everything the timeline reveals starts hidden in CSS, not JS — initState
   runs two rAFs after mount, and without this every chapter's copy paints
   stacked in the shared slot for a frame on page load. GSAP's autoAlpha
   writes inline visibility, which takes over from here. */
.chap,
.deck > *,
.hud,
.agent-beam,
.finale {
  visibility: hidden;
}

/* ---------- Chapter copy ---------- */
.chap {
  position: absolute;
  top: 7%;
  left: 50%;
  translate: -50% 0;
  width: min(900px, 92vw);
  text-align: center;
  will-change: transform, opacity;
}

.chap-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: #444;
  letter-spacing: 6px;
  margin-bottom: 1.1rem;
}

.chap-heading {
  font-family: var(--font-display);
  font-size: 3.6rem;
  margin: 0 0 0.9rem;
  color: var(--text-primary);
  line-height: 1;
}

.accent-red { color: var(--color-alert); }
.accent-blue { color: var(--color-neon-blue); }
.accent-yellow { color: var(--color-hazard); }
.accent-green { color: var(--color-neon-green); }

.chap-desc {
  color: var(--text-muted);
  font-size: 1.1rem;
  margin: 0 auto;
  max-width: 460px;
  line-height: 1.6;
}

/* ---------- The deck (center stage) ---------- */
.deck {
  position: absolute;
  left: 50%;
  top: 58%;
  width: 0;
  height: 0;
  will-change: transform;
}

.pcard,
.fcard,
.flipper,
.apile,
.afly {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  filter: drop-shadow(0 12px 32px rgba(0, 0, 0, 0.5));
  will-change: transform, opacity;
}

.afly { filter: drop-shadow(0 0 24px rgba(255, 42, 42, 0.4)); }

.fx-flash {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  width: 320px;
  height: 320px;
  border-radius: 50%;
  background: radial-gradient(circle, var(--acc) 0%, transparent 68%);
  opacity: 0;
  pointer-events: none;
  will-change: transform, opacity;
}

.fx-ring {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  width: 120px;
  height: 120px;
  border: 3px solid var(--color-alert);
  border-radius: 50%;
  box-shadow: 0 0 30px rgba(255, 42, 42, 0.5), inset 0 0 18px rgba(255, 42, 42, 0.3);
  pointer-events: none;
  will-change: transform, opacity;
}

.counter {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -205px;
  font-family: var(--font-display);
  font-size: 5rem;
  color: var(--color-alert);
  text-shadow: 0 0 40px rgba(255, 42, 42, 0.6);
  display: flex;
  align-items: baseline;
  white-space: nowrap;
  will-change: transform, opacity;
}

.counter-plus { font-size: 3.4rem; margin-right: 0.15rem; overflow: hidden; display: inline-block; }

/* ---------- Victims (skip chapter) ---------- */
.victim {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  will-change: transform, opacity;
}

.victim-avatar {
  width: 58px;
  height: 58px;
  border-radius: 50%;
  background: #1a1a1a;
  border: 2px solid #444;
  display: flex;
  justify-content: center;
  align-items: center;
  font-weight: bold;
  color: var(--text-secondary);
  font-family: var(--font-display);
  font-size: 1.15rem;
}

.victim-name {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  color: var(--text-muted);
  letter-spacing: 1px;
}

.victim-stamp {
  position: absolute;
  top: 38%;
  left: 50%;
  margin-left: -42px;
  font-family: var(--font-display);
  font-size: 0.8rem;
  color: var(--color-alert);
  border: 2px solid var(--color-alert);
  padding: 4px 10px;
  background: rgba(0, 0, 0, 0.9);
  white-space: nowrap;
  z-index: 5;
  text-shadow: 0 0 10px var(--color-alert);
  will-change: transform;
}

/* ---------- Roulette ---------- */
.flipper {
  perspective: 800px;
  transform-style: preserve-3d;
}

.face {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  backface-visibility: hidden;
  will-change: transform, opacity;
}

.face-tag {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: var(--font-display);
  pointer-events: none;
}

.tag-miss { font-size: 0.85rem; color: var(--color-alert); opacity: 0.85; }
.tag-hit {
  font-size: 1.15rem;
  color: var(--color-neon-green);
  text-shadow: 0 0 20px var(--color-neon-green);
}

/* Vertical offset lives in the GSAP y values — a pixel offset here would get
   baked into GSAP's transform and then overwritten by the entrance tween. */
.seek-label {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% 0;
  z-index: 20;
  font-family: var(--font-mono);
  font-size: 1.05rem;
  color: var(--text-muted);
  letter-spacing: 4px;
  white-space: nowrap;
  will-change: transform, opacity;
}

/* ---------- Mercy ---------- */
.boom {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  font-family: var(--font-display);
  font-size: 3.4rem;
  color: var(--color-alert);
  border: 4px solid var(--color-alert);
  padding: 0.5rem 2.4rem;
  background: rgba(0, 0, 0, 0.95);
  white-space: nowrap;
  z-index: 10;
  text-shadow: 0 0 30px var(--color-alert);
  box-shadow: 0 0 60px rgba(255, 42, 42, 0.4);
  will-change: transform, opacity;
}

/* ---------- Agent ---------- */
.hud {
  position: absolute;
  left: 7%;
  top: 50%;
  translate: 0 -50%;
  width: 340px;
  text-align: left;
  background: rgba(8, 12, 10, 0.92);
  border: 1px solid rgba(57, 255, 20, 0.35);
  border-radius: 10px;
  box-shadow: 0 0 50px rgba(57, 255, 20, 0.12), inset 0 0 30px rgba(0, 0, 0, 0.6);
  will-change: transform, opacity;
}

.hud-bar {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.6rem 0.9rem;
  background: rgba(57, 255, 20, 0.06);
  border-bottom: 1px solid rgba(57, 255, 20, 0.18);
}

.hud-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #2a2a2a;
  border: 1px solid #444;
}
.hud-dot:nth-child(1) { background: var(--color-alert); border-color: var(--color-alert); }
.hud-dot:nth-child(2) { background: var(--color-hazard); border-color: var(--color-hazard); }
.hud-dot:nth-child(3) { background: var(--color-neon-green); border-color: var(--color-neon-green); }

.hud-title {
  margin-left: auto;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 2px;
  color: var(--color-neon-green);
  opacity: 0.85;
}

.hud-body {
  padding: 1.1rem 1.1rem 1.3rem;
  font-family: var(--font-mono);
  font-size: 0.92rem;
  line-height: 1.85;
  color: var(--text-secondary);
}

.hud-prompt { color: var(--color-neon-green); margin-right: 0.35rem; }
.hud-dim { color: var(--text-muted); }
.hud-ok {
  color: var(--color-neon-green);
  font-weight: bold;
  text-shadow: 0 0 10px rgba(57, 255, 20, 0.7);
}

.hud-moves {
  position: relative;
  display: flex;
  gap: 0.5rem;
  padding: 0.3rem 0 0.4rem;
  overflow: hidden;
}

.move-chip {
  font-family: var(--font-mono);
  font-size: 0.78rem;
  padding: 0.18rem 0.6rem;
  border: 1px solid #3a3a3a;
  border-radius: 4px;
  color: #8a8a8a;
  will-change: transform;
}

.hud-scan {
  position: absolute;
  top: 0;
  bottom: 0;
  left: -40px;
  width: 36px;
  pointer-events: none;
  background: linear-gradient(90deg, transparent, rgba(57, 255, 20, 0.55), transparent);
  filter: blur(2px);
  will-change: transform, opacity;
}

.agent-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.55rem;
  margin: 0 1.1rem 1.1rem;
  padding: 0.7rem 1.3rem;
  background: transparent;
  border: 2px solid var(--color-neon-green);
  color: var(--color-neon-green);
  font-family: var(--font-display);
  font-size: 0.85rem;
  letter-spacing: 2px;
  text-decoration: none;
  cursor: pointer;
  transition: background 0.25s, color 0.25s, box-shadow 0.25s;
  pointer-events: auto;
}
.agent-cta:hover {
  background: var(--color-neon-green);
  color: #000;
  box-shadow: 0 0 30px rgba(57, 255, 20, 0.5);
}

.agent-beam {
  position: absolute;
  left: calc(7% + 340px);
  top: 50%;
  width: calc(43% - 340px);
  height: 3px;
  transform-origin: left center;
  background: linear-gradient(90deg, var(--color-neon-green), var(--color-neon-blue));
  box-shadow: 0 0 16px rgba(57, 255, 20, 0.7);
  border-radius: 2px;
  pointer-events: none;
  will-change: transform, opacity;
}

.fx-pulse {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 220px;
  height: 220px;
  margin: -110px 0 0 -110px;
  border-radius: 50%;
  pointer-events: none;
  background: radial-gradient(circle, rgba(57, 255, 20, 0.45), transparent 65%);
  will-change: transform, opacity;
}

.agent-turn {
  position: absolute;
  left: 0;
  top: 0;
  translate: -50% -50%;
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 3px;
  color: var(--text-secondary);
  border: 1px solid rgba(57, 255, 20, 0.4);
  padding: 0.35rem 0.9rem;
  border-radius: 4px;
  background: rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  will-change: transform, opacity;
}

/* ---------- Finale ---------- */
.finale {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  width: min(900px, 92vw);
  text-align: center;
  will-change: opacity;
}

.bubbles {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 2.4rem;
}

.bubble {
  display: inline-flex;
  align-items: center;
  gap: 0.6rem;
  padding: 0.85rem 1.4rem;
  background: rgba(0, 0, 0, 0.6);
  border: 1px solid #333;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: 0.95rem;
  border-radius: 999px;
  white-space: nowrap;
  will-change: transform, opacity;
}

.bubble-1 { border-color: rgba(0, 243, 255, 0.4); }
.bubble-1 svg { color: var(--color-neon-blue); }
.bubble-2 { border-color: rgba(255, 204, 0, 0.4); }
.bubble-2 svg { color: var(--color-hazard); }
.bubble-3 { border-color: rgba(0, 255, 100, 0.4); }
.bubble-3 svg { color: var(--color-neon-green); }

.feedback-cta {
  display: inline-flex;
  align-items: center;
  gap: 0.65rem;
  padding: 1.1rem 2.5rem;
  background: transparent;
  border: 2px solid var(--color-neon-green);
  color: var(--color-neon-green);
  font-family: var(--font-display);
  font-size: 1.05rem;
  letter-spacing: 2px;
  cursor: pointer;
  transition: background 0.25s, color 0.25s, transform 0.25s, box-shadow 0.25s;
  margin-top: 1.5rem;
  pointer-events: auto;
}

.feedback-cta:hover {
  background: var(--color-neon-green);
  color: black;
  transform: translateY(-2px);
  box-shadow: 0 0 40px rgba(0, 255, 100, 0.35);
}

/* ---------- Mobile ---------- */
@media (max-width: 768px) {
  .chap { top: 5%; }
  .chap-heading { font-size: 2.4rem; }
  .chap-desc { font-size: 0.95rem; max-width: 88vw; }
  .deck { top: 60%; }
  .counter { font-size: 3.4rem; translate: -50% -140px; }
  .counter-plus { font-size: 2.2rem; }
  .victim-avatar { width: 44px; height: 44px; font-size: 0.95rem; }
  .victim-stamp { font-size: 0.65rem; margin-left: -34px; }
  .seek-label { font-size: 0.85rem; translate: -50% -190px; }
  .boom { font-size: 1.8rem; padding: 0.3rem 1.2rem; border-width: 3px; }
  .hud {
    left: 50%;
    top: 31%;
    translate: -50% 0;
    width: min(340px, 92vw);
  }
  .agent-beam {
    left: 50%;
    top: 31%;
    width: 3px;
    height: 14vh;
    transform-origin: top center;
    background: linear-gradient(180deg, var(--color-neon-green), var(--color-neon-blue));
  }
  .agent-turn { font-size: 0.8rem; }
  .bubble { font-size: 0.8rem; padding: 0.6rem 1rem; }
  .feedback-cta { padding: 0.9rem 1.6rem; font-size: 0.9rem; }
}

/* ---------- Reduced motion: a calm, static read ---------- */
.is-static .stage {
  height: auto;
  overflow: visible;
  padding: 4rem 0;
}

.is-static .chap {
  position: static;
  transform: none;
  margin: 0 auto 5rem;
  opacity: 1;
  visibility: visible;
}

.is-static .stage-vignette,
.is-static .deck,
.is-static .hud,
.is-static .agent-beam {
  display: none;
}

.is-static .finale {
  position: static;
  transform: none;
  margin: 0 auto;
  opacity: 1;
  visibility: visible;
}
</style>
