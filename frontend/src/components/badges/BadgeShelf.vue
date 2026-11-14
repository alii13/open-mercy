<template>
  <div ref="box" class="bs" :class="{ 'bs--wall': cols > 3 }" role="group" aria-label="All badges">
    <div v-for="(row, r) in rows" :key="r" class="bs-shelf">
      <div class="bs-medals">
        <button
          v-for="b in row"
          :key="b.tier"
          type="button"
          class="bs-item"
          :class="{ 'bs-item--locked': b.tier > tier }"
          :aria-label="labelOf(b)"
          :aria-pressed="b.tier === sel"
          :aria-describedby="tip?.b.tier === b.tier ? 'bs-tip' : undefined"
          @click="onClick(b)"
          @pointerenter="(e) => e.pointerType === 'mouse' && showTip(b, e.currentTarget as HTMLElement)"
          @pointerleave="(e) => e.pointerType === 'mouse' && hideTip()"
          @pointerdown="(e) => e.pointerType !== 'mouse' && holdStart(b, e.currentTarget as HTMLElement)"
          @pointerup="holdEnd"
          @pointercancel="holdEnd"
          @contextmenu.prevent
          @focus="(e) => (e.currentTarget as HTMLElement).matches(':focus-visible') && showTip(b, e.currentTarget as HTMLElement)"
          @blur="hideTip"
          @keydown.esc="hideTip"
        >
          <span class="bs-float" :style="{ animationDelay: `${(b.tier % 5) * -0.65}s` }">
            <img class="bs-img" :src="RENDERS[b.tier]" alt="" loading="lazy" decoding="async" draggable="false" width="96" height="96" />
            <svg v-if="b.tier === tier + 1" class="bs-ring" viewBox="0 0 100 100" aria-hidden="true">
              <defs>
                <linearGradient id="bs-ring-metal" x1="14" y1="14" x2="86" y2="86" gradientUnits="userSpaceOnUse">
                  <stop offset="0" stop-color="#998f6e" /><stop offset="0.3" stop-color="#8b6b23" /><stop offset="0.55" stop-color="#54360b" /><stop offset="0.8" stop-color="#94792f" /><stop offset="1" stop-color="#65410c" />
                </linearGradient>
              </defs>
              <circle cx="50" cy="50" r="34" class="bs-ring-groove" />
              <circle cx="50" cy="50" r="34" class="bs-ring-fill" :stroke-dasharray="`${213.6 * nextFrac} 213.6`" />
            </svg>
          </span>
        </button>
      </div>
      <div class="bs-ledge"></div>
      <div class="bs-plaques">
        <div v-for="b in row" :key="b.tier" class="bs-plaque">
          <div class="bs-name" :class="{ 'bs-name--sel': b.tier === sel, 'bs-name--locked': b.tier > tier }">{{ b.title }}</div>
          <div v-if="lineOf(b)" class="bs-line" :class="{ 'bs-line--next': b.tier === tier + 1 }">{{ lineOf(b) }}</div>
          <div v-if="b.tier === tier" class="bs-yours">YOURS</div>
          <div v-else class="bs-pts">{{ b.threshold.toLocaleString() }} pts</div>
        </div>
      </div>
    </div>
    <!-- What a badge means: hover on desktop, press and hold on a phone. -->
    <Teleport to="body">
      <div v-if="tip" id="bs-tip" role="tooltip" class="bs-tip" :class="tip.below ? 'bs-tip--below' : 'bs-tip--above'" :style="{ left: `${tip.left}px`, top: `${tip.y}px`, width: `${tip.width}px` }">
        <div class="bs-tip-head">
          <span class="bs-tip-name">{{ tip.b.title }}</span>
          <span class="bs-tip-tag">{{ tagOf(tip.b) }}</span>
        </div>
        <p class="bs-tip-text">{{ BADGE_MEANING[tip.b.tier] }}</p>
        <span class="bs-tip-arrow" :style="{ left: `${tip.arrow}px` }"></span>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { BADGES, progressToNext, type Badge } from '../../utils/badges'
import { BADGE_MEANING, type Holders } from '../../utils/badgeFacts'
import { BADGE_RENDERS as RENDERS } from '../../utils/badgeRenders'

const props = withDefaults(defineProps<{ tier: number; sel: number; points: number; holders: Holders; dates: Record<number, string>; cols?: number }>(), { cols: 3 })
const emit = defineEmits<{ select: [tier: number] }>()

const rows = computed(() => Array.from({ length: Math.ceil(BADGES.length / props.cols) }, (_, i) => BADGES.slice(i * props.cols, (i + 1) * props.cols)))
const nextFrac = computed(() => Math.min(1, Math.max(0, progressToNext(props.points).pct)))

function lineOf(b: Badge): string {
  if (b.tier <= props.tier) return props.dates[b.tier] ? `Earned ${props.dates[b.tier]}` : 'Earned'
  if (b.tier === props.tier + 1) return `${(b.threshold - props.points).toLocaleString()} to go`
  const h = props.holders
  if (!h?.total) return ''
  const n = h.byTier[b.tier] ?? 0
  return n === 0 ? 'Nobody yet' : n === 1 ? 'Just 1 player' : `1 in ${Math.round(h.total / n).toLocaleString()} have it`
}
const labelOf = (b: Badge) => [b.title, b.tier <= props.tier ? 'earned' : 'locked', lineOf(b)].filter(Boolean).join(', ')

// Open on the player's own shelf (the phone cabinet scrolls; the desktop wall shows them all).
const box = ref<HTMLElement | null>(null)
// The player's points usually land after mount, so follow the tier until they scroll the cabinet themselves.
let scrolledByHand = false
function toOwnShelf() {
  const shelf = box.value?.children[Math.floor((props.tier - 1) / props.cols)] as HTMLElement | undefined
  if (box.value && shelf && !scrolledByHand) box.value.scrollTop = shelf.offsetTop - 8
}
watch(() => props.tier, () => nextTick(toOwnShelf))
onMounted(() => {
  toOwnShelf()
  box.value?.addEventListener('wheel', () => { scrolledByHand = true }, { once: true, passive: true })
  box.value?.addEventListener('touchmove', () => { scrolledByHand = true }, { once: true, passive: true })
  addEventListener('scroll', hideTip, { capture: true, passive: true })
})
onBeforeUnmount(() => {
  clearTimeout(holdTimer)
  removeEventListener('scroll', hideTip, { capture: true })
})

const tagOf = (b: Badge) => `TIER ${b.tier}${b.tier === props.tier ? ' · YOURS' : b.tier === props.tier + 1 ? ' · NEXT UP' : b.tier === 20 ? ' · THE TOP' : ''}`
const tip = ref<{ b: Badge; left: number; y: number; width: number; arrow: number; below: boolean } | null>(null)
function showTip(b: Badge, el: HTMLElement) {
  const r = (el.querySelector('.bs-img') ?? el).getBoundingClientRect()
  const x = r.left + r.width / 2
  const width = Math.min(320, innerWidth - 32)
  const left = Math.min(Math.max(x - width / 2, 16), innerWidth - 16 - width)
  // Above the medal unless that would run off the top of the screen.
  const below = r.top < 160
  tip.value = { b, left, width, arrow: x - left - 6, below, y: below ? r.bottom + 12 : r.top - 12 }
}
const hideTip = () => { tip.value = null }

// A press and hold shows the meaning instead of picking the badge; letting go hides it.
let holdTimer: ReturnType<typeof setTimeout> | undefined
let held = false
function holdStart(b: Badge, el: HTMLElement) {
  held = false
  holdTimer = setTimeout(() => { held = true; showTip(b, el) }, 450)
}
function holdEnd() {
  clearTimeout(holdTimer)
  if (held) hideTip()
}
function onClick(b: Badge) {
  if (held) { held = false; return }
  emit('select', b.tier)
}
</script>

<style scoped>
.bs {
  --bs-medal: 96px;
  position: relative;
  height: 452px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: var(--surface-metal) transparent;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
  padding: var(--spacing-2) 0 var(--spacing-16);
  -webkit-mask-image: linear-gradient(to bottom, transparent 0, #000 var(--spacing-6), #000 calc(100% - var(--spacing-16)), transparent 100%);
  mask-image: linear-gradient(to bottom, transparent 0, #000 var(--spacing-6), #000 calc(100% - var(--spacing-16)), transparent 100%);
}
.bs--wall { --bs-medal: 148px; height: auto; overflow: visible; gap: var(--spacing-12); padding: 0; -webkit-mask-image: none; mask-image: none; }
.bs-shelf { display: flex; flex-direction: column; flex-shrink: 0; }
.bs-medals { display: flex; height: calc(var(--bs-medal) + 16px); align-items: flex-end; background: radial-gradient(ellipse at 50% 100%, rgba(255, 230, 200, 0.08) 0%, transparent 70%); }
.bs-item { flex: 1; display: flex; justify-content: center; padding: 0 0 var(--spacing-2); background: none; border: 0; cursor: pointer; -webkit-touch-callout: none; user-select: none; }
.bs-float { position: relative; display: block; width: var(--bs-medal); height: var(--bs-medal); }
.bs-img { width: 100%; height: 100%; object-fit: contain; display: block; transition: filter 150ms ease-out; }
.bs-item--locked .bs-img { filter: brightness(0.55) saturate(0.85); }
@media (hover: hover) {
  .bs-item:hover .bs-img { filter: brightness(1.12); }
  .bs-item--locked:hover .bs-img { filter: brightness(0.75) saturate(0.95); }
}
.bs-ring { position: absolute; inset: 0; width: 100%; height: 100%; transform: rotate(-90deg); }
.bs-ring-groove { fill: none; stroke: #23262b; stroke-width: 5; }
.bs-ring-fill { fill: none; stroke: url(#bs-ring-metal); stroke-width: 5; stroke-linecap: round; }
.bs-ledge { height: 6px; background: linear-gradient(180deg, #3a3f46 0%, #1f2226 40%, #121416 100%); }
.bs-plaques { display: flex; padding-top: var(--spacing-2); background: linear-gradient(180deg, rgba(0, 0, 0, 0.45) 0%, transparent 30%); }
.bs-plaque { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; text-align: center; }
.bs-name { font-size: var(--text-sm); font-weight: 700; color: var(--text-primary); border-bottom: 2px solid transparent; }
.bs-name--locked { color: var(--text-secondary); }
.bs-name--sel { border-bottom-color: #ffcf99; }
.bs-line { font-size: var(--text-xs); color: var(--text-secondary); }
.bs-line--next { color: var(--color-hazard); }
.bs-pts { font-size: var(--text-xs); color: var(--text-muted); font-variant-numeric: tabular-nums; }
.bs--wall .bs-plaques { padding-top: var(--spacing-3); }
.bs--wall .bs-name { font-size: var(--text-base); }
.bs--wall .bs-line { font-size: var(--text-sm); }
.bs-tip { position: fixed; z-index: var(--z-toast); display: flex; flex-direction: column; gap: 6px; padding: 14px var(--spacing-4); border-radius: var(--radius-md); background: #1a1c1f; border: 1px solid #2e3237; box-shadow: 0 16px 40px rgba(0, 0, 0, 0.6); pointer-events: none; }
.bs-tip--above { transform: translateY(-100%); }
.bs-tip-head { display: flex; justify-content: space-between; align-items: baseline; gap: var(--spacing-3); }
.bs-tip-name { font-size: var(--text-base); font-weight: 700; color: #fff; }
.bs-tip-tag { flex-shrink: 0; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.12em; color: #ffcf99; }
.bs-tip-text { margin: 0; font-size: var(--text-sm); line-height: 1.45; color: var(--text-primary); }
.bs-tip-arrow { position: absolute; width: 12px; height: 12px; background: #1a1c1f; rotate: 45deg; }
.bs-tip--above .bs-tip-arrow { bottom: -7px; border-right: 1px solid #2e3237; border-bottom: 1px solid #2e3237; }
.bs-tip--below .bs-tip-arrow { top: -7px; border-left: 1px solid #2e3237; border-top: 1px solid #2e3237; }
@media (prefers-reduced-motion: no-preference) {
  .bs-tip { animation: bs-tip-in 150ms ease-out both; }
}
@keyframes bs-tip-in { from { opacity: 0; } }
.bs-yours { font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.12em; color: var(--color-hazard); }
@media (prefers-reduced-motion: no-preference) {
  .bs-float { animation: bs-float 3.2s ease-in-out infinite; }
}
@keyframes bs-float { 50% { transform: translateY(-4px); } }
</style>
