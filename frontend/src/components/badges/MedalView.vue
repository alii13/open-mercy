<template>
  <div ref="root" class="mv">
    <div class="mv-stage">
      <canvas v-show="!flat" ref="canvas" class="mv-canvas" :tabindex="label ? 0 : undefined" :role="label ? 'button' : undefined" :aria-label="label" @keydown.enter="onTap" @keydown.space.prevent="onTap" />
      <!-- No WebGL: the flat badge art, so the screen still works. -->
      <button v-if="flat" type="button" class="mv-flat" :class="{ 'mv-flat--locked': locked }" :style="{ backgroundImage: artUrl(tier) }" :aria-label="label" @click="onTap" />
      <slot />
    </div>
    <svg v-if="fact && line" class="mv-line" aria-hidden="true">
      <polyline :key="`${tier}-${idx}`" :points="line.points" pathLength="1" />
      <circle :cx="line.ax" :cy="line.ay" r="10" class="mv-ring" />
      <circle :cx="line.ax" :cy="line.ay" r="3.5" class="mv-dot" />
    </svg>
    <div v-if="facts.length > 1" class="mv-pips">
      <button v-for="(_, i) in facts" :key="i" type="button" class="mv-pip" :class="{ 'mv-pip--on': i === idx }" :aria-label="`Fact ${i + 1} of ${facts.length}`" :aria-pressed="i === idx" @click="idx = i"><i></i></button>
    </div>
    <div v-if="fact" ref="card" class="mv-fact" aria-live="polite">
      <div class="mv-fact-title">{{ fact.title }}</div>
      <div v-if="fact.big" class="mv-fact-big">{{ fact.big }}</div>
      <div class="mv-fact-text">{{ fact.text }}</div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { MedalStage } from '../../badges3d/medalStage'
import type { BadgeFact } from '../../utils/badgeFacts'
import { artUrl } from '../../utils/badgeArt'

const props = withDefaults(defineProps<{ tier: number; locked?: boolean; mode?: 'hero' | 'showcase'; facts?: BadgeFact[]; label?: string }>(), { facts: () => [] })
const emit = defineEmits<{ tap: [] }>()

const root = ref<HTMLElement | null>(null)
const canvas = ref<HTMLCanvasElement | null>(null)
const card = ref<HTMLElement | null>(null)
const flat = ref(false)
const idx = ref(0)
const fact = computed(() => props.facts[Math.min(idx.value, props.facts.length - 1)] ?? null)
const line = ref<{ points: string; ax: number; ay: number } | null>(null)
let stage: MedalStage | null = null
let raf = 0
let disposed = false

// A tap turns to the next fact; the page decides anything else.
function onTap() {
  if (props.facts.length > 1) idx.value = (idx.value + 1) % props.facts.length
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
  const tick = () => {
    raf = requestAnimationFrame(tick)
    const at = fact.value?.at
    if (!at || !stage || !root.value || !card.value) { line.value = null; return }
    const a = stage.project(at)
    if (!a || a.facing < 0.2) { line.value = null; return }
    const r = root.value.getBoundingClientRect()
    const c = card.value.getBoundingClientRect()
    const tx = Math.min(Math.max(a.x, c.left - r.left + 28), c.right - r.left - 28)
    const ty = c.top - r.top
    const points = `${a.x},${a.y} ${tx},${ty - 18} ${tx},${ty}`
    if (points !== line.value?.points) line.value = { points, ax: a.x, ay: a.y }
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
.mv-flat { position: absolute; inset: 15%; background: center / contain no-repeat; border: 0; cursor: pointer; }
.mv-flat--locked { filter: brightness(0.55) saturate(0.85); }
.mv-line { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; overflow: visible; }
.mv-line polyline { fill: none; stroke: #ffcf99; stroke-width: 1.25; stroke-dasharray: 1; stroke-dashoffset: 0; }
.mv-dot { fill: #ffcf99; }
.mv-ring { fill: none; stroke: #ffcf99; stroke-width: 1; opacity: 0.5; }
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
