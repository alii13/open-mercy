<template>
  <div ref="root" class="mv" :class="{ 'mv--sides': sides }">
    <div class="mv-stage">
      <canvas v-show="!flat" ref="canvas" class="mv-canvas" :tabindex="label ? 0 : undefined" :role="label ? 'button' : undefined" :aria-label="label" @keydown.enter="onTap" @keydown.space.prevent="onTap" />
      <!-- No WebGL: the flat badge art, so the screen still works. -->
      <button v-if="flat" type="button" class="mv-flat" :class="{ 'mv-flat--locked': locked }" :style="{ backgroundImage: artUrl(tier) }" :aria-label="label" @click="onTap" />
      <slot />
    </div>
    <svg v-if="lines.length" class="mv-line" aria-hidden="true">
      <g v-for="(l, i) in lines" :key="`${tier}-${idx}-${i}`">
        <polyline :points="l.points" pathLength="1" />
        <circle :cx="l.ax" :cy="l.ay" r="10" class="mv-ring" />
        <circle :cx="l.ax" :cy="l.ay" r="3.5" class="mv-dot" />
      </g>
    </svg>
    <!-- Wide screens: both facts at once, one each side of the medal. -->
    <template v-if="sides">
      <div v-for="(f, i) in facts.slice(0, 2)" :key="`${tier}-${i}`" :ref="(el) => { sideEls[i] = el as HTMLElement | null }" class="mv-side" :class="i === 0 ? 'mv-side--l' : 'mv-side--r'">
        <div class="mv-fact-title">{{ f.title }}</div>
        <div v-if="f.big" class="mv-fact-big">{{ f.big }}</div>
        <div class="mv-fact-text">{{ f.text }}</div>
      </div>
    </template>
    <template v-else>
      <div v-if="facts.length > 1" class="mv-pips">
        <button v-for="(_, i) in facts" :key="i" type="button" class="mv-pip" :class="{ 'mv-pip--on': i === idx }" :aria-label="`Fact ${i + 1} of ${facts.length}`" :aria-pressed="i === idx" @click="idx = i"><i></i></button>
      </div>
      <div v-if="fact" ref="card" class="mv-fact" aria-live="polite">
        <div class="mv-fact-title">{{ fact.title }}</div>
        <div v-if="fact.big" class="mv-fact-big">{{ fact.big }}</div>
        <div class="mv-fact-text">{{ fact.text }}</div>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MedalStage } from '../../badges3d/medalStage'
import type { BadgeFact } from '../../utils/badgeFacts'
import { artUrl } from '../../utils/badgeArt'

const props = withDefaults(defineProps<{ tier: number; locked?: boolean; mode?: 'hero' | 'showcase'; facts?: BadgeFact[]; label?: string; sides?: boolean }>(), { facts: () => [] })
const emit = defineEmits<{ tap: [] }>()

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const card = ref<HTMLElement | null>(null)
const flat = ref(false)
const idx = ref(0)
const fact = computed(() => props.facts[Math.min(idx.value, props.facts.length - 1)] ?? null)
type Line = { points: string; ax: number; ay: number }
const lines = ref<Line[]>([])
const sideEls: (HTMLElement | null)[] = []
let lastKey = ''
let stage: MedalStage | null = null
let raf = 0
let disposed = false

// A tap turns to the next fact; the page decides anything else.
function onTap() {
  if (!props.sides && props.facts.length > 1) idx.value = (idx.value + 1) % props.facts.length
  emit('tap')
}

onMounted(async () => {
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
  try {
    // three loads here, with the badges screen, never with the app.
    const { createMedalStage } = await import('../../badges3d/medalStage.js')
    if (disposed || !canvas.value) return
    stage = createMedalStage({ canvas: canvas.value, mode: props.mode ?? 'hero', reducedMotion })
    stage.onTap(onTap)
    await stage.show(props.tier, { locked: props.locked })
    if (disposed) return
  } catch {
    stage?.dispose()
    stage = null
    flat.value = true
    return
  }
  // Each fact gets a line from its part of the medal to its text, redrawn as the medal turns.
  const tick = () => {
    raf = requestAnimationFrame(tick)
    const next: Line[] = []
    if (stage && root.value && canvas.value) {
      const r = root.value.getBoundingClientRect()
      const cv = canvas.value.getBoundingClientRect()
      const shown = props.sides ? props.facts.slice(0, 2) : fact.value ? [fact.value] : []
      shown.forEach((f, i) => {
        const el = props.sides ? sideEls[i] : card.value
        const a = f.at && stage!.project(f.at)
        if (!el || !a || a.facing < 0.2) return
        const ax = a.x + cv.left - r.left
        const ay = a.y + cv.top - r.top
        const c = el.getBoundingClientRect()
        if (!props.sides) {
          const tx = Math.min(Math.max(ax, c.left - r.left + 28), c.right - r.left - 28)
          const ty = c.top - r.top
          next.push({ points: `${ax},${ay} ${tx},${ty - 18} ${tx},${ty}`, ax, ay })
          return
        }
        // Left text sits above its line, right text below it; the line bends once to reach the medal.
        const left = i === 0
        const y = left ? c.bottom - r.top + 14 : c.top - r.top - 14
        const edge = left ? c.left - r.left : c.right - r.left
        const knee = left ? ax - 32 : ax + 32
        next.push({ points: `${edge},${y} ${knee},${y} ${ax},${ay}`, ax, ay })
      })
    }
    const key = next.map(l => l.points).join('|')
    if (key !== lastKey) { lastKey = key; lines.value = next }
  }
  tick()
})

watch(() => [props.tier, props.locked] as const, ([tier, locked], [prevTier]) => {
  idx.value = 0
  void stage?.show(tier, { locked, dir: Math.sign(tier - prevTier) })
})

onBeforeUnmount(() => {
  disposed = true
  cancelAnimationFrame(raf)
  stage?.dispose()
})
</script>

<style scoped>
.mv { position: relative; display: flex; flex-direction: column; width: 100%; height: 100%; }
.mv-stage { position: relative; flex: 1; min-height: 0; }
.mv-canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; touch-action: pan-y; cursor: grab; }
.mv-canvas:active { cursor: grabbing; }
.mv-canvas:focus-visible { outline: 2px solid var(--focus-ring-color, var(--color-neon-blue)); outline-offset: -2px; border-radius: var(--radius-md); }
.mv--sides .mv-canvas, .mv--sides .mv-flat { left: 50%; width: var(--mv-medal, 520px); margin-left: calc(var(--mv-medal, 520px) / -2); }
/* The canvas is only medal-wide here, so a medal sliding out fades at its edge instead of being cut off. */
.mv--sides .mv-canvas { -webkit-mask-image: linear-gradient(to right, transparent, #000 15%, #000 85%, transparent); mask-image: linear-gradient(to right, transparent, #000 15%, #000 85%, transparent); }
.mv-flat { position: absolute; inset: 15%; background: center / contain no-repeat; border: 0; cursor: pointer; }
.mv-flat--locked { filter: brightness(0.55) saturate(0.85); }
.mv-line { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.mv-line polyline { fill: none; stroke: #ffcf99; stroke-width: 1.25; stroke-dasharray: 1; stroke-dashoffset: 0; }
.mv-dot { fill: #ffcf99; }
.mv-ring { fill: none; stroke: #ffcf99; stroke-width: 1; opacity: 0.5; }
.mv-side { position: absolute; width: 280px; display: flex; flex-direction: column; gap: var(--spacing-2); }
.mv-side--l { left: 0; top: 16%; }
.mv-side--r { right: 0; top: 64%; gap: 2px; }
.mv-side .mv-fact-big { margin: 0; font-size: 2.5rem; line-height: 1.2; }
.mv-side .mv-fact-text { margin: 0; font-size: var(--text-base); line-height: 1.5; }
.mv-side--r .mv-fact-text { color: var(--text-secondary); }
.mv-pips { display: flex; justify-content: flex-end; }
.mv-pip { width: 32px; height: 24px; display: flex; align-items: center; justify-content: center; background: none; border: 0; cursor: pointer; }
.mv-pip i { width: 18px; height: 3px; border-radius: var(--radius-pill); background: var(--surface-metal); }
.mv-pip--on i { background: #ffcf99; }
.mv-fact { padding: var(--spacing-3) var(--spacing-4); background: var(--surface-metal-dark); border: 1px solid var(--surface-metal); border-radius: var(--radius-md); }
.mv-fact-title { font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.12em; color: #ffcf99; }
.mv-fact-big { margin-top: var(--spacing-1); font-size: var(--text-2xl); font-weight: 700; color: var(--text-primary); font-variant-numeric: tabular-nums; }
.mv-fact-text { margin-top: var(--spacing-1); font-size: var(--text-sm); line-height: 1.45; color: var(--text-primary); }
@media (prefers-reduced-motion: no-preference) {
  .mv-line polyline { animation: mv-draw var(--duration-soft) var(--ease-snap) both; }
}
@keyframes mv-draw { from { stroke-dashoffset: 1; } }
</style>
