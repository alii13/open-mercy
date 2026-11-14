<template>
  <Teleport to="body">
    <div ref="overlayEl" class="pts-overlay" role="dialog" aria-modal="true" aria-labelledby="pts-title" tabindex="-1" @click.self="emit('close')">
      <div class="pts-sheet">
        <span class="pts-grabber" aria-hidden="true"></span>
        <div class="pts-head">
          <h2 id="pts-title" class="pts-title">How you climb</h2>
          <button type="button" class="pts-close" aria-label="Close" @click="emit('close')"><X :size="20" :stroke-width="2" aria-hidden="true" /></button>
        </div>

        <div class="pts-hero">
          <span class="pts-hero-num">+{{ POINT_WEIGHTS.win }}</span>
          <span class="pts-hero-label">for every<br />win</span>
        </div>

        <ul class="pts-rows">
          <li class="pts-row">
            <span class="pts-icon"><CalendarCheck :size="20" :stroke-width="2" aria-hidden="true" /></span>
            <span class="pts-label">Show up and play<small>once a day</small></span>
            <span class="pts-num">+{{ POINT_WEIGHTS.dayPlayed }}</span>
          </li>
          <li class="pts-row">
            <span class="pts-icon"><Flag :size="20" :stroke-width="2" aria-hidden="true" /></span>
            <span class="pts-label">Stick out a game you're losing</span>
            <span class="pts-num">+{{ POINT_WEIGHTS.completedLoss }}</span>
          </li>
          <li class="pts-row">
            <span class="pts-icon"><Megaphone :size="20" :stroke-width="2" aria-hidden="true" /></span>
            <span class="pts-label">Call "Mercy!"</span>
            <span class="pts-num">+{{ POINT_WEIGHTS.unoCall }}</span>
          </li>
          <li class="pts-row">
            <span class="pts-card"><img :src="stackCard" alt="" width="32" height="49" class="pts-card-img pts-card-img--left" /></span>
            <span class="pts-label">Every card in the biggest stack you survive</span>
            <span class="pts-num">+{{ POINT_WEIGHTS.stackSurvived }}</span>
          </li>
          <li class="pts-row">
            <span class="pts-card"><img :src="drawCard" alt="" width="32" height="49" class="pts-card-img pts-card-img--right" /></span>
            <span class="pts-label">Every draw card you throw down</span>
            <span class="pts-num">+{{ POINT_WEIGHTS.drawCard }}</span>
          </li>
        </ul>
        <p class="pts-fine">Quitting early or winning because everyone left scores nothing.</p>

        <div class="pts-kept">
          <img :src="BADGE_RENDERS[tier]" alt="" width="64" height="64" class="pts-kept-img" />
          <div>
            <p class="pts-kept-title">Your badge is yours for good.</p>
            <p class="pts-kept-text">Take a break and nothing you've earned goes away. After a week off, progress toward your next badge drops {{ dailyLoss }}% a day, and one game brings it all back.</p>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { CalendarCheck, Flag, Megaphone, X } from 'lucide-vue-next'
import { onBeforeUnmount, onMounted, ref } from 'vue'
import { DECAY, POINT_WEIGHTS } from '../../utils/badges'
import { BADGE_RENDERS } from '../../utils/badgeRenders'
import stackCard from '../../assets/cards-hero/wild-ten-draw-130.webp'
import drawCard from '../../assets/cards-hero/two-draw-red-130.webp'

defineProps<{ tier: number }>()
const emit = defineEmits<{ close: [] }>()

const dailyLoss = Math.round((1 - DECAY.dailyRetention) * 100)

// Same contract as PhotoSheet: Escape works wherever focus is, and focus goes back to the opener.
const overlayEl = ref<HTMLElement | null>(null)
const opener = document.activeElement as HTMLElement | null
const onKeydown = (e: KeyboardEvent) => { if (e.key === 'Escape') emit('close') }
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  overlayEl.value?.focus()
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  opener?.focus?.()
})
</script>

<style scoped>
.pts-overlay { position: fixed; inset: 0; z-index: var(--z-modal); display: flex; align-items: center; justify-content: center; padding: var(--spacing-4); background: rgba(0, 0, 0, 0.72); outline: none; }
.pts-sheet { width: 100%; max-width: 420px; max-height: 100%; overflow-y: auto; overscroll-behavior: contain; padding: var(--spacing-3) var(--spacing-4) var(--spacing-6); background: var(--bg-concrete-light); border-radius: var(--radius-lg); color: var(--text-primary); }
.pts-grabber { display: none; width: 36px; height: 4px; margin: 0 auto var(--spacing-2); border-radius: var(--radius-pill); background: var(--surface-metal); }
.pts-head { display: flex; align-items: center; justify-content: space-between; }
.pts-title { margin: 0; font-size: var(--text-lg); font-weight: 700; }
.pts-close { width: 44px; height: 44px; display: flex; align-items: center; justify-content: flex-end; background: none; border: 0; color: var(--text-secondary); cursor: pointer; }
.pts-hero { display: flex; align-items: flex-end; gap: var(--spacing-3); padding: var(--spacing-2) 0 var(--spacing-4); }
.pts-hero-num { font-family: var(--font-display); font-size: var(--text-hero); line-height: 1; color: var(--color-hazard); }
.pts-hero-label { padding-bottom: var(--spacing-2); font-size: var(--text-lg); line-height: 1.35; color: var(--text-secondary); }
.pts-rows { list-style: none; margin: 0; padding: 0; }
.pts-row { display: flex; align-items: center; gap: var(--spacing-3); min-height: 60px; }
.pts-icon { width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-pill); background: var(--surface-metal); color: var(--text-primary); }
.pts-card { width: 40px; height: 52px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; }
.pts-card-img { width: 32px; height: 49px; }
.pts-card-img--left { rotate: -6deg; }
.pts-card-img--right { rotate: 6deg; }
.pts-label { flex: 1; display: flex; flex-direction: column; font-size: var(--text-base); line-height: 1.35; }
.pts-label small { font-size: var(--text-sm); color: var(--text-muted); }
.pts-num { font-size: var(--text-xl); font-weight: 700; font-variant-numeric: tabular-nums; }
.pts-fine { margin: var(--spacing-2) 0 0; font-size: var(--text-sm); color: var(--text-muted); }
.pts-kept { display: flex; align-items: flex-start; gap: var(--spacing-4); padding-top: var(--spacing-6); }
.pts-kept-img { width: 64px; height: 64px; flex-shrink: 0; object-fit: contain; }
.pts-kept-title { margin: 0; font-size: var(--text-base); font-weight: 700; }
.pts-kept-text { margin: var(--spacing-1) 0 0; font-size: var(--text-sm); line-height: 1.45; color: var(--text-secondary); }

/* Phones get a bottom sheet. */
@media (max-width: 480px) {
  .pts-overlay { align-items: flex-end; padding: 0; }
  .pts-sheet { max-width: none; border-radius: var(--radius-lg) var(--radius-lg) 0 0; padding-bottom: calc(var(--spacing-8) + env(safe-area-inset-bottom)); }
  .pts-grabber { display: block; }
}
</style>
