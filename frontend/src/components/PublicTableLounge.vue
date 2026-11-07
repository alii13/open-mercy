<script setup lang="ts">
/**
 * The public room's waiting room as the 3D table. Everyone connected stands at
 * the table as their own card; moves, flicks and draws go through the room
 * (`lounge` frames, see shared/lounge.ts) and quick chat shows as bubbles over
 * the cards. The room owns the clock: it runs only once all seven seats are
 * taken. At zero the table plays the 3-2-1, the deal and SHOW NO MERCY, then
 * the game view takes over. Loaded on demand, so three.js never weighs on the
 * lobby bundle.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import gsap from 'gsap'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useAuthStore } from '../stores/authStore'
import { PUBLIC_SEATS, seatSpot, type LoungeAct } from '@lounge'
import { createLounge, type Lounge } from '../lounge/scene'
import { music } from '../composables/useMusic'
import { soundEffects } from '../composables/useSoundEffects'
import { useBadges } from '../composables/useBadges'
import { supabase } from '../lib/supabase'
import QuickChat from './QuickChat.vue'
import { Volume2, VolumeX } from 'lucide-vue-next'

const emit = defineEmits<{ fallback: []; leave: [] }>()
const mp = useMultiplayerStore()
const auth = useAuthStore()

const arts = import.meta.glob('../assets/cards-webp/*.webp', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
const badges = import.meta.glob('../assets/badges/*.svg', { eager: true, query: '?url', import: 'default' }) as Record<string, string>

const canvasEl = ref<HTMLCanvasElement | null>(null)
const overlayEl = ref<HTMLElement | null>(null)
const toasts = ref<{ id: number; text: string }[]>([])
const coaching = ref(true)
let lounge: Lounge | null = null
let unmounted = false
let toastN = 0
const offs: (() => void)[] = []

const here = computed(() => mp.presence.filter((p) => p.connected))
const rules = computed(() => `${mp.stackingMode.toUpperCase()} RULES`)

// ---- Sound. The table's own track is fetched when you sit down, never with
// the app, and gives way to the game when the deck deals. Its level is baked
// into the file: iOS ignores audio.volume. Mute is the app's own music and
// effects setting, so it carries into the game.
const track = Object.assign(new Audio('/audio/music/division.mp3'), { loop: true })
const soundOn = ref(!music.isMuted.value)
const playing = ref(false)
const asking = ref(false)
const audible = computed(() => soundOn.value && playing.value)
let ac: AudioContext | null = null
let dealing = false

function startTrack() {
    if (!soundOn.value || dealing || document.hidden || unmounted) return
    gsap.killTweensOf(track)
    track.volume = 1
    track.play().catch(() => { asking.value = true })
}
track.addEventListener('play', () => { playing.value = true; asking.value = false })
track.addEventListener('pause', () => { playing.value = false })

function setSound(on: boolean) {
    soundOn.value = on
    music.isMuted.value = !on
    soundEffects.isMuted.value = !on
    if (on) startTrack()
    else { gsap.killTweensOf(track); track.pause() }
}

function notNow() {
    soundOn.value = false
    asking.value = false
}

// iOS starts audio only inside a tap, and Safari does not count pointerdown;
// click and touchend do. 'interrupted' (after a lock or a call) also resumes.
function unlock(ev: Event) {
    if (!soundOn.value) return
    ac ??= new AudioContext()
    if (ac.state !== 'running') void ac.resume()
    // Only a tap on the table itself starts the track: not the sound button,
    // the prompt, LEAVE, or the leave confirm that opens over the table.
    const el = ev.target as Element | null
    if (track.paused && el?.closest?.('.ptl') && !el.closest('.ptl-sound, .ptl-ask, .ptl-leave')) startTrack()
}
const GESTURES = ['pointerdown', 'click', 'touchend', 'keydown'] as const

// The loop stops with the tab: phones would otherwise keep it playing after a switch of apps.
function onVisibility() {
    if (document.hidden) track.pause()
    else startTrack()
}

// ponytail: synthesised chimes and thuds; recorded stings can replace tone() later.
// Only on a running context: a suspended one keeps currentTime at 0 and would
// fire every queued tone on the first tap.
function tone(freq: number, to: number, dur: number, gain: number, type: OscillatorType = 'sine', at = 0) {
    if (!soundOn.value || ac?.state !== 'running') return
    const t = ac.currentTime + at
    const o = ac.createOscillator()
    const g = ac.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(to, t + dur)
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.001, t + dur)
    o.connect(g).connect(ac.destination)
    o.start(t)
    o.stop(t + dur)
}

const sounds = {
    // A card off the deck, then a rising two-note sparkle.
    draw: () => { soundEffects.playCardPick(); tone(1319, 1319, 0.18, 0.12, 'sine', 0.06); tone(1976, 1976, 0.24, 0.1, 'sine', 0.13) },
    // A flick landing: the card's thud, a pop up an octave and a bright ding.
    hit: () => { soundEffects.playCardLand(); tone(523, 1047, 0.12, 0.18, 'triangle'); tone(1568, 1568, 0.28, 0.1, 'sine', 0.09) },
}
const sfx = (play: () => void) => { if (soundOn.value) play() }

function apply(id: string, act: LoungeAct) {
    if (!lounge) return
    if (act.kind === 'move') lounge.move(id, act.x, act.z, act.drag)
    else if (act.kind === 'flick') { lounge.flick(id, act.path, act.hit, act.hitAt); sfx(soundEffects.playCardThrow) }
    else if (act.kind === 'draw') lounge.draw(id, act.face)
}

// A late joiner places everyone where the room last saw them; anyone who has
// not moved stands at the seat every client computes from the room's order.
// Your own card sends its first spot, so the room's record of it, not a seat
// index that shifts as people come and go, is what every later joiner reads.
let synced = false
function syncPlayers() {
    if (!lounge) return
    const list = here.value
    const ids = new Set(list.map((p) => p.userId))
    const me = auth.user?.id
    list.forEach((p, i) => {
        if (lounge!.players.has(p.userId)) return
        const known = mp.loungeSpots[p.userId]
        const [x, z] = known ?? seatSpot(i, Math.max(PUBLIC_SEATS, list.length))
        const you = p.userId === me
        const seat = lounge!.join({ id: p.userId, name: p.name, skin: p.skin, you, x, z, quiet: !synced && !you }) as { tx: number; tz: number } | undefined
        if (you && !known && seat) mp.sendLounge({ kind: 'move', x: seat.tx, z: seat.tz, drag: false })
    })
    synced = true
    for (const id of [...lounge.players.keys()]) if (!ids.has(id)) lounge.leave(id)
    queueRanks()
}

// ---- Ranks. Every card shows its player's badge tier and all-time global
// rank, read once per player. Your own comes from alltime_my_rank, which the
// leaderboard already uses; everyone else's from alltime_ranks
// (supabase/alltime-ranks.sql), and until that is installed their cards stay
// plain card backs. A player with no games yet is a Recruit in last place:
// any game scores at least 25, so on the leaderboard's own order they sit
// below everyone who has played.
const { badges: tiers, fetchBadges } = useBadges()
const globalRanks = new Map<string, number | null>()
// One lookup per burst of arrivals, not one per presence change: each scans
// every game played.
let rankTimer: ReturnType<typeof setTimeout> | undefined
function queueRanks() {
    clearTimeout(rankTimer)
    rankTimer = setTimeout(() => void loadRanks(here.value.map((p) => p.userId)), 800)
}
let lastPlace: number | null = null
let ranksMissing = false

async function loadRanks(ids: string[]) {
    const me = auth.user?.id
    const others = ids.filter((id) => id !== me && !globalRanks.has(id))
    const mine = !!me && ids.includes(me) && !globalRanks.has(me)
    await Promise.all([
        fetchBadges(ids),
        mine && supabase.rpc('alltime_my_rank', { p_country: null }).then(({ data, error }) => {
            if (error) return
            const row = (data as { my_rank: number | null; total_players: number }[] | null)?.[0]
            if (row) lastPlace = Number(row.total_players) + 1
            globalRanks.set(me, row?.my_rank == null ? null : Number(row.my_rank))
        }),
        others.length > 0 && !ranksMissing && supabase.rpc('alltime_ranks', { ids: others }).then(({ data, error }) => {
            if (error) { ranksMissing = true; return }
            const byId = new Map(((data ?? []) as { user_id: string; rank: number }[]).map((r) => [r.user_id, Number(r.rank)]))
            for (const id of others) globalRanks.set(id, byId.get(id) ?? null)
        }),
    ])
    for (const id of ids) {
        if (!globalRanks.has(id)) continue
        const global = globalRanks.get(id) ?? lastPlace
        lounge?.setRank(id, global == null ? null : { tier: tiers.value[id]?.badge.tier ?? 1, global })
    }
}

function toast(text: string) {
    const id = ++toastN
    toasts.value = [{ id, text }, ...toasts.value].slice(0, 3)
    setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, 3300)
}

// ---- The start. Seconds left once the table is full, null while it fills.
const secs = ref<number | null>(null)
const slam = ref(0)
const show = ref<'' | 'on' | 'out'>('')
const curtain = ref(false)
const shaking = ref(false)
const tapeNames = ref('')
const tapeTable = ref('')
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

let beat = 0
let showing = false
let lastClockAt = 0
let preloaded = false
const clock = setInterval(() => {
    if (!lounge || showing) return
    const a = mp.autoStart
    if (a && !preloaded) {
        // The game view is its own chunk: fetch it while the clock runs, so
        // nothing loads behind the curtain after the start.
        preloaded = true
        void import('./game/MultiplayerGameView.vue')
    }
    if (!a) {
        // The room dealt: the start plays here while the game view waits.
        if (mp.loungeShow && mp.gameStatus !== 'waiting') { void showtime(); return }
        // The room says "started" a moment before it sends the game, so a held
        // start waits for it. A clock that ends with no game (fewer than two
        // stayed) lets go once the game has had time to arrive.
        if (mp.loungeShow && Date.now() - lastClockAt < 2500) return
        beat = 0
        secs.value = null
        mp.loungeShow = false
        return
    }
    lastClockAt = Date.now()
    const left = a.deadline - Date.now()
    secs.value = Math.max(0, Math.ceil(left / 1000))
    const n = secs.value
    // From the last few seconds the start is committed and the game view waits
    // for it. Set on every tick, not on one beat: a busy page can skip a tick.
    if (left <= 3500) mp.loungeShow = true
    if (n >= 1 && n <= 3 && n !== beat) {
        beat = n
        slam.value = n
        lounge.pulse(0.7 + (3 - n) * 0.35)
        tone(240 + (3 - n) * 80, 60, 0.3, 0.4, 'triangle')
    }
}, 100)

// At zero: the deal, the hazard tapes with every name at the table, a flash,
// then black while the game view mounts behind it.
async function showtime() {
    if (!lounge || showing) return
    showing = true
    dealing = true
    slam.value = 0
    tone(150, 30, 1.0, 0.6)
    tone(900, 200, 0.4, 0.1, 'square')
    gsap.to(track, { volume: 0, duration: 1.2, ease: 'sine.inOut', overwrite: true, onComplete: () => track.pause() })
    const names = here.value.map((p) => p.name.toUpperCase())
    tapeNames.value = names.map((n) => `${n}  ·  `).join('').repeat(4)
    tapeTable.value = `PUBLIC TABLE  ·  ${names.length} PLAYERS  ·  7 CARDS EACH  ·  `.repeat(4)
    // The game view must never wait on a stuck animation.
    const cap = setTimeout(() => { mp.loungeShow = false }, 9000)
    try {
        await lounge.deal()
        show.value = 'on'
        setTimeout(() => { shaking.value = true; tone(110, 35, 0.7, 0.55) }, 360)
        setTimeout(() => { shaking.value = false }, 820)
        await wait(2400)
        show.value = 'out'
        await wait(260)
        curtain.value = true
        await wait(700)
    } finally {
        clearTimeout(cap)
        mp.loungeShow = false
        // Someone left on the last second and the room did not deal: back to the table.
        if (!unmounted && mp.gameStatus === 'waiting') {
            lounge?.reset()
            show.value = ''
            curtain.value = false
            showing = false
            dealing = false
            beat = 0
            startTrack()
        }
    }
}

function leave() {
    gsap.killTweensOf(track)
    track.pause()
    emit('leave')
}

onMounted(async () => {
    try {
        const l = await createLounge({
            canvas: canvasEl.value!,
            overlay: overlayEl.value!,
            artUrl: (name) => arts[`../assets/cards-webp/${name}.webp`] ?? '',
            badgeUrl: (file) => badges[`../assets/badges/${file}.svg`] ?? '',
            reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
        })
        // Left the room while the table was still loading: free it straight away.
        if (unmounted) { l.dispose(); return }
        lounge = l
        // Dev builds only: lets a multi-browser test read each player's table.
        if (import.meta.env.DEV) (window as unknown as { __lounge?: Lounge }).__lounge = l
    } catch (err) {
        console.error(err)
        emit('fallback')
        return
    }
    const me = () => auth.user?.id ?? ''
    lounge.onIntent((i) => {
        if (i.kind === 'wave') { mp.sendChat('hi'); return }
        coaching.value = false
        apply(me(), i)
        mp.sendLounge(i)
    })
    lounge.onEvent(({ text, kind }) => {
        toast(text)
        if (kind) sfx(sounds[kind])
    })
    for (const e of GESTURES) addEventListener(e, unlock, { passive: true })
    document.addEventListener('visibilitychange', onVisibility)
    offs.push(() => {
        for (const e of GESTURES) removeEventListener(e, unlock)
        document.removeEventListener('visibilitychange', onVisibility)
    })
    startTrack()
    offs.push(mp.onLounge(apply))
    offs.push(watch(here, syncPlayers, { deep: true }))
    offs.push(watch(() => mp.lastChat, (c) => { if (c) lounge?.emote(c.userId, c.text) }))
    syncPlayers()
    setTimeout(() => { coaching.value = false }, 10000)
})

onUnmounted(() => {
    unmounted = true
    clearInterval(clock)
    clearTimeout(rankTimer)
    mp.loungeShow = false
    for (const off of offs) off()
    gsap.killTweensOf(track)
    track.pause()
    // Drops the buffered track instead of leaving it to the garbage collector.
    track.removeAttribute('src')
    track.load()
    void ac?.close()
    if (import.meta.env.DEV) {
        const w = window as unknown as { __lounge?: Lounge }
        if (w.__lounge === lounge) delete w.__lounge
    }
    lounge?.dispose()
    lounge = null
})
</script>

<template>
  <div class="ptl" :class="{ coaching, shake: shaking }">
    <canvas ref="canvasEl" class="ptl-world" />
    <div ref="overlayEl" class="ptl-labels" />
    <div class="ptl-vignette" aria-hidden="true" />

    <header class="ptl-hud ptl-top">
      <div>
        <p class="ptl-eyebrow">PUBLIC TABLE<span class="ptl-rules"> · {{ rules }}</span></p>
        <p class="ptl-count"><b>{{ here.length }}</b> AT THE TABLE <small>/ {{ PUBLIC_SEATS }}</small></p>
      </div>
      <div class="ptl-clock" role="timer" aria-live="polite">
        <p class="ptl-clock-label">{{ secs === null ? 'TABLE FILLING' : 'TABLE FULL · DEALING IN' }}</p>
        <p v-if="secs === null" class="ptl-time ptl-time--wait">WAITING FOR {{ Math.max(0, PUBLIC_SEATS - here.length) }} MORE</p>
        <p v-else class="ptl-time" :class="{ 'ptl-time--urgent': secs < 10 }">0:{{ String(secs).padStart(2, '0') }}</p>
      </div>
    </header>

    <ol class="ptl-feed" aria-live="polite">
      <li v-for="t in toasts" :key="t.id" class="ptl-toast">{{ t.text }}</li>
    </ol>

    <footer class="ptl-hud ptl-bottom">
      <p class="ptl-hint"><em>Drag your card</em> move · <em>Tap a player</em> flick · <em>Tap the deck</em> draw</p>
      <div class="ptl-actions">
        <!-- Shows what you actually hear: muted until the browser lets the track play. -->
        <button
          class="ptl-sound"
          type="button"
          :aria-label="audible ? 'Mute sound' : 'Turn sound on'"
          :aria-pressed="!audible"
          @click="setSound(!audible)"
        >
          <Volume2 v-if="audible" :size="20" :stroke-width="2" aria-hidden="true" />
          <VolumeX v-else :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
        <button class="ptl-leave" type="button" @click="leave">LEAVE</button>
      </div>
    </footer>

    <div v-if="slam" :key="slam" class="ptl-slam" aria-hidden="true">{{ slam }}</div>
    <div v-if="show" class="ptl-show" :class="show" aria-hidden="true">
      <div class="ptl-tape ptl-tape-a"><div class="ptl-tape-run"><span>{{ tapeNames }}</span><span>{{ tapeNames }}</span></div></div>
      <div class="ptl-tape ptl-tape-b"><div class="ptl-tape-run"><span>{{ tapeTable }}</span><span>{{ tapeTable }}</span></div></div>
      <div class="ptl-title">
        <span class="ptl-t1">SHOW NO</span>
        <span class="ptl-t2">MERCY</span>
        <span class="ptl-t3">{{ here.length }} PLAYERS · 7 CARDS EACH</span>
      </div>
      <div class="ptl-flash" />
    </div>
    <div class="ptl-curtain" :class="{ on: curtain }" aria-hidden="true" />

    <div v-if="asking" class="ptl-ask" role="dialog" aria-labelledby="ptl-ask-title">
      <p id="ptl-ask-title" class="ptl-ask-title">Turn on the table music?</p>
      <p class="ptl-ask-sub">Your browser needs one tap before it plays sound.</p>
      <div class="ptl-ask-row">
        <button class="ptl-ask-yes" type="button" @click="setSound(true)">SOUND ON</button>
        <button class="ptl-leave" type="button" @click="notNow">NOT NOW</button>
      </div>
    </div>
    <QuickChat />
  </div>
</template>

<style scoped>
/* Over the page and its footer, under the release card (60). The lobby
   hides its top bar while the table is up. */
.ptl {
  position: fixed;
  inset: 0;
  z-index: 40;
  background: #040405;
  overflow: hidden;
}

.ptl-world {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  display: block;
  touch-action: none;
}

/* Its own stacking context: the label renderer z-indexes every tag for depth,
   which would otherwise lift them over the HUD. */
.ptl-labels {
  position: absolute;
  inset: 0;
  z-index: 0;
  pointer-events: none;
}

.ptl-vignette {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: radial-gradient(ellipse at center, transparent 55%, rgba(0, 0, 0, 0.55) 100%);
}

.ptl-hud {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  pointer-events: none;
}

.ptl-hud > * {
  pointer-events: auto;
}

.ptl-top {
  top: env(safe-area-inset-top);
}

.ptl-bottom {
  bottom: 0;
  align-items: flex-end;
  padding-bottom: max(var(--spacing-4), env(safe-area-inset-bottom));
}

.ptl-eyebrow {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--color-hazard);
}

.ptl-rules {
  color: var(--text-muted);
}

.ptl-count {
  margin: var(--spacing-1) 0 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.ptl-count b {
  color: var(--color-hazard);
  font-weight: 400;
}

.ptl-count small {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

.ptl-clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  text-align: right;
}

.ptl-clock-label {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.26em;
  color: var(--text-secondary);
}

.ptl-time {
  margin: 0;
  font-family: var(--font-display);
  font-size: 52px;
  line-height: 56px;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  color: var(--color-hazard);
  text-shadow: 0 0 28px rgba(255, 204, 0, 0.35);
}

.ptl-time--wait {
  font-size: 20px;
  line-height: 28px;
  letter-spacing: 0.08em;
  color: var(--text-primary);
  text-shadow: none;
}

.ptl-time--urgent {
  color: var(--color-alert);
  text-shadow: 0 0 28px rgba(255, 42, 42, 0.45);
}

/* The start: 3-2-1 slams, then the hazard tapes and SHOW NO MERCY, a flash,
   and black while the game view mounts. */
.ptl-slam,
.ptl-show,
.ptl-curtain {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.ptl-slam {
  display: grid;
  place-items: center;
  opacity: 0;
  font-family: var(--font-display);
  font-size: 240px;
  line-height: 1;
  color: var(--color-alert);
  text-shadow: 0 0 70px rgba(255, 42, 42, 0.6), 0 10px 0 #2a0000;
  animation: ptl-slam 0.95s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}

@keyframes ptl-slam {
  0% { opacity: 0; transform: scale(2.8) rotate(-8deg); }
  16% { opacity: 1; transform: scale(0.92) rotate(0); }
  26% { transform: scale(1.05); }
  38% { transform: scale(1); }
  70% { opacity: 0.95; }
  100% { opacity: 0; transform: scale(0.85); }
}

.ptl-show {
  display: grid;
  place-items: center;
  overflow: hidden;
  background: radial-gradient(ellipse at 50% 50%, rgba(0, 0, 0, 0.35), rgba(0, 0, 0, 0.82));
  animation: ptl-fade 0.35s ease forwards;
}

@keyframes ptl-fade { from { opacity: 0; } }

.ptl-tape {
  position: absolute;
  left: -10%;
  width: 120%;
  height: 62px;
  display: flex;
  align-items: center;
  overflow: hidden;
  background: repeating-linear-gradient(-45deg, var(--color-hazard) 0 18px, #0a0a0b 18px 36px);
  box-shadow: 0 14px 40px rgba(0, 0, 0, 0.7);
}

.ptl-tape-a {
  top: calc(50% - 210px);
  transform: rotate(-6deg) translateX(-110%);
  animation: ptl-tape-a 0.42s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}

.ptl-tape-b {
  top: calc(50% + 150px);
  transform: rotate(4deg) translateX(110%);
  animation: ptl-tape-b 0.42s 0.1s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}

@keyframes ptl-tape-a { to { transform: rotate(-6deg) translateX(0); } }
@keyframes ptl-tape-b { to { transform: rotate(4deg) translateX(0); } }

.ptl-tape-run {
  display: flex;
  width: max-content;
  padding: 7px 0;
  background: var(--color-hazard);
  animation: ptl-run 16s linear infinite;
}

.ptl-tape-b .ptl-tape-run {
  animation-direction: reverse;
}

.ptl-tape-run span {
  font-family: var(--font-display);
  font-size: 24px;
  line-height: 1;
  letter-spacing: 0.14em;
  color: #0a0a0b;
  white-space: pre;
}

@keyframes ptl-run { to { transform: translateX(-50%); } }

.ptl-title {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  opacity: 0;
  animation: ptl-title 0.7s 0.3s cubic-bezier(0.2, 0.9, 0.3, 1) forwards;
}

@keyframes ptl-title {
  0% { opacity: 0; transform: scale(2.6) rotate(-5deg); }
  30% { opacity: 1; transform: scale(0.94) rotate(0); }
  45% { transform: scale(1.04); }
  100% { opacity: 1; transform: scale(1); }
}

.ptl-t1 {
  font-family: var(--font-display);
  font-size: 54px;
  line-height: 1;
  letter-spacing: 0.16em;
  color: #fff;
}

.ptl-t2 {
  font-family: var(--font-display);
  font-size: 156px;
  line-height: 0.95;
  letter-spacing: 0.04em;
  color: var(--color-alert);
  -webkit-text-stroke: 2px #ff7a7a;
  text-shadow: 0 0 60px rgba(255, 42, 42, 0.7), 0 10px 0 #2a0000;
}

.ptl-t3 {
  margin-top: var(--spacing-4);
  font-family: var(--font-body);
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.32em;
  color: var(--text-primary);
}

.ptl-flash {
  position: absolute;
  inset: 0;
  background: #fff;
  opacity: 0;
}

.ptl-show.out .ptl-flash {
  animation: ptl-flash 0.5s ease-out forwards;
}

@keyframes ptl-flash { 30% { opacity: 0.92; } 100% { opacity: 1; } }

.ptl-curtain {
  background: #000;
  opacity: 0;
  transition: opacity 0.6s ease;
}

.ptl-curtain.on {
  opacity: 1;
}

.shake .ptl-world,
.shake .ptl-labels {
  animation: ptl-shake 0.45s cubic-bezier(0.36, 0.07, 0.19, 0.97);
}

@keyframes ptl-shake {
  10%, 90% { transform: translate(-2px, 1px); }
  20%, 80% { transform: translate(4px, -2px); }
  30%, 50%, 70% { transform: translate(-7px, 3px); }
  40%, 60% { transform: translate(7px, -3px); }
}

@media (prefers-reduced-motion: reduce) {
  .shake .ptl-world,
  .shake .ptl-labels {
    animation: none;
  }
}

.ptl-leave,
.ptl-sound,
.ptl-ask-yes {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  padding: 0 var(--spacing-4);
  border-radius: var(--radius-pill);
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: rgba(10, 10, 11, 0.72);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--text-primary);
  cursor: pointer;
}

.ptl-actions {
  display: flex;
  gap: var(--spacing-2);
}

.ptl-sound {
  width: 44px;
  padding: 0;
  justify-content: center;
}

.ptl-sound[aria-pressed='true'] {
  color: var(--text-muted);
}

.ptl-ask {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  width: min(320px, calc(100% - 2 * var(--spacing-4)));
  padding: var(--spacing-4);
  border-radius: var(--radius-md);
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 10, 11, 0.92);
  text-align: center;
}

.ptl-ask-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.ptl-ask-sub {
  margin: var(--spacing-1) 0 var(--spacing-4);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.ptl-ask-row {
  display: flex;
  justify-content: center;
  gap: var(--spacing-2);
}

.ptl-ask-yes {
  border-color: var(--color-hazard);
  background: var(--color-hazard);
  color: #0a0a0b;
}

.ptl-feed {
  position: absolute;
  top: calc(env(safe-area-inset-top) + var(--spacing-4));
  left: 50%;
  transform: translateX(-50%);
  margin: 0;
  padding: 0;
  list-style: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  pointer-events: none;
}

.ptl-toast {
  padding: var(--spacing-1) var(--spacing-3);
  border-radius: var(--radius-sm);
  background: rgba(10, 10, 11, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-family: var(--font-body);
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-primary);
  white-space: nowrap;
}

.ptl-hint {
  margin: 0;
  align-self: center;
  font-family: var(--font-body);
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--text-muted);
}

.ptl-hint em {
  font-style: normal;
  color: var(--text-primary);
}

/* The name tags and chat bubbles the scene draws over the cards. Not scoped:
   the scene creates these elements itself. */
.ptl-labels :deep(.tag) {
  position: relative;
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 9px 3px 6px;
  border-radius: var(--radius-pill);
  background: rgba(10, 10, 11, 0.78);
  border: 1px solid rgba(255, 255, 255, 0.14);
  font-family: var(--font-body);
  font-size: 12px;
  line-height: 16px;
  color: var(--text-primary);
  white-space: nowrap;
}

.ptl-labels :deep(.tag i) {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--c);
}

.ptl-labels :deep(.tag.you) {
  border-color: var(--color-hazard);
}

.ptl-labels :deep(.tag b) {
  padding: 0 5px;
  border-radius: 3px;
  background: var(--color-hazard);
  color: #0a0a0b;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: 10px;
  letter-spacing: 0.1em;
}

.ptl-labels :deep(.bubble) {
  padding: 5px 11px;
  border-radius: 10px;
  background: #f2f2f2;
  color: #0a0a0b;
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 600;
  white-space: nowrap;
  opacity: 0;
  transform: translateY(6px) scale(0.9);
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.ptl-labels :deep(.bubble.on) {
  opacity: 1;
  transform: none;
}

.ptl-labels :deep(.bubble.mercy) {
  background: var(--color-alert);
  color: #fff;
}

.coaching .ptl-labels :deep(.tag.you)::after {
  content: 'DRAG ME';
  position: absolute;
  left: 50%;
  top: -28px;
  transform: translateX(-50%);
  padding: 3px 8px;
  border-radius: 4px;
  background: var(--color-hazard);
  color: #0a0a0b;
  font-family: var(--font-display);
  font-size: 10px;
  letter-spacing: 0.12em;
}

/* Phones keep the instructions, smaller and above LEAVE. The waiting line
   wraps instead of the count, and toasts sit above the hint, clear of the
   eyebrow. */
@media (max-width: 640px) {
  .ptl-top > :first-child {
    flex-shrink: 0;
  }

  .ptl-count {
    font-size: 22px;
  }

  .ptl-time {
    font-size: 34px;
    line-height: 38px;
  }

  .ptl-time--wait {
    font-size: 14px;
    line-height: 20px;
  }

  .ptl-clock-label {
    letter-spacing: 0.16em;
  }

  .ptl-slam {
    font-size: 160px;
  }

  .ptl-t1 { font-size: 30px; }
  .ptl-t2 { font-size: 84px; }
  .ptl-t3 { font-size: 12px; letter-spacing: 0.24em; }
  .ptl-tape { height: 46px; }
  .ptl-tape-run span { font-size: 17px; }
  .ptl-tape-a { top: calc(50% - 150px); }
  .ptl-tape-b { top: calc(50% + 105px); }

  .ptl-feed {
    top: auto;
    bottom: calc(150px + env(safe-area-inset-bottom));
  }

  .ptl-bottom {
    flex-direction: column;
    align-items: flex-end;
    gap: var(--spacing-2);
  }

  .ptl-hint {
    align-self: stretch;
    font-size: 0.6rem;
    letter-spacing: 0.1em;
    text-align: center;
  }
}
</style>
