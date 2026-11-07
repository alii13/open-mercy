<script setup lang="ts">
/**
 * The public room's waiting room as the 3D table. Everyone connected stands at
 * the table as their own card; moves, flicks and draws go through the room
 * (`lounge` frames, see shared/lounge.ts) and quick chat shows as bubbles over
 * the cards. The room still owns the clock; at zero the game view takes over.
 * Loaded on demand, so three.js never weighs on the lobby bundle.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useAuthStore } from '../stores/authStore'
import { seatSpot, type LoungeAct } from '@lounge'
import { createLounge, type Lounge } from '../lounge/scene'
import AutoStartRing from './AutoStartRing.vue'
import QuickChat from './QuickChat.vue'
import { Clock } from 'lucide-vue-next'

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

function apply(id: string, act: LoungeAct) {
    if (!lounge) return
    if (act.kind === 'move') lounge.move(id, act.x, act.z, act.drag)
    else if (act.kind === 'flick') lounge.flick(id, act.path, act.hit, act.hitAt)
    else if (act.kind === 'draw') lounge.draw(id, act.face)
}

// A late joiner places everyone where the room last saw them; anyone who has
// not moved stands at the seat every client computes from the room's order.
function syncPlayers() {
    if (!lounge) return
    const list = here.value
    const ids = new Set(list.map((p) => p.userId))
    list.forEach((p, i) => {
        if (lounge!.players.has(p.userId)) return
        const [x, z] = mp.loungeSpots[p.userId] ?? seatSpot(i, Math.max(7, list.length))
        lounge!.join({ id: p.userId, name: p.name, skin: p.skin, you: p.userId === auth.user?.id, x, z })
    })
    for (const id of [...lounge.players.keys()]) if (!ids.has(id)) lounge.leave(id)
}

function toast(text: string) {
    const id = ++toastN
    toasts.value = [{ id, text }, ...toasts.value].slice(0, 3)
    setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id) }, 3300)
}

// The room deals at zero. A beat each second from three, and the deal itself
// just before, so the game view opens onto cards already landing.
let beat = 0
let dealt = false
const clock = setInterval(() => {
    const a = mp.autoStart
    if (!lounge || !a || a.paused) { beat = 0; return }
    const left = a.deadline - Date.now()
    const n = Math.ceil(left / 1000)
    if (n >= 1 && n <= 3 && n !== beat) { beat = n; lounge.pulse(0.7 + (3 - n) * 0.35) }
    if (left <= 600 && !dealt) { dealt = true; void lounge.deal() }
}, 200)

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
    lounge.onEvent(({ text }) => toast(text))
    offs.push(mp.onLounge(apply))
    offs.push(watch(here, syncPlayers, { deep: true }))
    offs.push(watch(() => mp.lastChat, (c) => { if (c) lounge?.emote(c.userId, c.text) }))
    syncPlayers()
    setTimeout(() => { coaching.value = false }, 10000)
})

onUnmounted(() => {
    unmounted = true
    clearInterval(clock)
    for (const off of offs) off()
    lounge?.dispose()
    lounge = null
})
</script>

<template>
  <div class="ptl" :class="{ coaching }">
    <canvas ref="canvasEl" class="ptl-world" />
    <div ref="overlayEl" class="ptl-labels" />
    <div class="ptl-vignette" aria-hidden="true" />

    <header class="ptl-hud ptl-top">
      <div>
        <p class="ptl-eyebrow">PUBLIC TABLE<span class="ptl-rules"> · {{ rules }}</span></p>
        <p class="ptl-count"><b>{{ here.length }}</b> AT THE TABLE</p>
      </div>
      <div class="ptl-clock">
        <AutoStartRing v-if="mp.autoStart" class="ptl-ring" :deadline="mp.autoStart.deadline" :paused="mp.autoStart.paused" />
        <p v-else class="ptl-wait">WAITING FOR A SECOND PLAYER</p>
        <button
          v-if="mp.autoStart && !mp.autoStart.paused && mp.autoStart.bumpsLeft > 0"
          class="ptl-hold"
          type="button"
          @click="mp.extendAutoStart()"
        >
          <Clock :size="14" :stroke-width="2" aria-hidden="true" />
          WAIT LONGER
        </button>
      </div>
    </header>

    <ol class="ptl-feed" aria-live="polite">
      <li v-for="t in toasts" :key="t.id" class="ptl-toast">{{ t.text }}</li>
    </ol>

    <footer class="ptl-hud ptl-bottom">
      <p class="ptl-hint"><em>Drag your card</em> move · <em>Tap a player</em> flick · <em>Tap the deck</em> draw</p>
      <button class="ptl-leave" type="button" @click="emit('leave')">LEAVE</button>
    </footer>
    <QuickChat />
  </div>
</template>

<style scoped>
/* Over the page and its footer, under the lobby top bar (50) and the
   release card (60). */
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

/* Below the lobby's top bar, which stays over the table. */
.ptl-top {
  top: calc(64px + env(safe-area-inset-top));
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
  color: var(--color-lamp);
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
  color: var(--color-lamp);
  font-weight: 400;
}

.ptl-clock {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: var(--spacing-2);
}

.ptl-wait {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text-secondary);
  text-align: right;
}

.ptl-hold,
.ptl-leave {
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

.ptl-feed {
  position: absolute;
  top: calc(64px + env(safe-area-inset-top) + var(--spacing-4));
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

  .ptl-ring {
    zoom: 0.6;
  }

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
