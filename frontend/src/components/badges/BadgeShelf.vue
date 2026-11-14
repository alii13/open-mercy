<template>
  <div ref="box" class="bs" role="group" aria-label="All badges">
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
          @click="emit('select', b.tier)"
        >
          <span class="bs-float" :style="{ animationDelay: `${(b.tier % 5) * -0.65}s` }">
            <img class="bs-img" :src="RENDERS[b.tier]" alt="" loading="lazy" decoding="async" width="96" height="96" />
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
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { BADGES, type Badge } from '../../utils/badges'
import type { Holders } from '../../utils/badgeFacts'
import { BADGE_RENDERS as RENDERS } from '../../utils/badgeRenders'

const props = defineProps<{ tier: number; sel: number; points: number; holders: Holders; dates: Record<number, string> }>()
const emit = defineEmits<{ select: [tier: number] }>()


const rows = computed(() => Array.from({ length: Math.ceil(BADGES.length / 3) }, (_, i) => BADGES.slice(i * 3, i * 3 + 3)))
const nextFrac = computed(() => {
  const next = BADGES[props.tier]
  return next ? Math.min(1, props.points / next.threshold) : 1
})

function lineOf(b: Badge): string {
  if (b.tier <= props.tier) return props.dates[b.tier] ? `Earned ${props.dates[b.tier]}` : 'Earned'
  if (b.tier === props.tier + 1) return `${(b.threshold - props.points).toLocaleString()} to go`
  const h = props.holders
  if (!h?.total) return ''
  const n = h.byTier[b.tier] ?? 0
  return n === 0 ? 'Nobody yet' : n === 1 ? '1 player' : `1 in ${Math.round(h.total / n).toLocaleString()} players`
}
const labelOf = (b: Badge) => [b.title, b.tier <= props.tier ? 'earned' : 'locked', lineOf(b)].filter(Boolean).join(', ')

// Open on the player's own shelf.
const box = ref<HTMLElement | null>(null)
onMounted(() => {
  const shelf = box.value?.children[Math.floor((props.tier - 1) / 3)] as HTMLElement | undefined
  if (box.value && shelf) box.value.scrollTop = shelf.offsetTop - 8
})
</script>

<style scoped>
.bs {
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
.bs-shelf { display: flex; flex-direction: column; flex-shrink: 0; }
.bs-medals { display: flex; height: 112px; align-items: flex-end; background: radial-gradient(ellipse at 50% 100%, rgba(255, 230, 200, 0.08) 0%, transparent 70%); }
.bs-item { flex: 1; display: flex; justify-content: center; padding: 0 0 var(--spacing-2); background: none; border: 0; cursor: pointer; }
.bs-float { position: relative; display: block; width: 96px; height: 96px; }
.bs-img { width: 96px; height: 96px; object-fit: contain; display: block; }
.bs-item--locked .bs-img { filter: brightness(0.55) saturate(0.85); }
.bs-ring { position: absolute; inset: 0; width: 96px; height: 96px; transform: rotate(-90deg); }
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
.bs-yours { font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.12em; color: var(--color-hazard); }
@media (prefers-reduced-motion: no-preference) {
  .bs-float { animation: bs-float 3.2s ease-in-out infinite; }
}
@keyframes bs-float { 50% { transform: translateY(-4px); } }
</style>
