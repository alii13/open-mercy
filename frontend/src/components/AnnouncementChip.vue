<template>
  <span v-if="live" class="ann-chip" :title="`${label} points until the clock runs out`">
    <span class="ann-chip-x">{{ label }}</span>
    <span class="ann-chip-time">{{ countdownText(msLeft) }}</span>
    <span class="ann-chip-sr">left on {{ label }} points</span>
  </span>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useAnnouncement } from '../composables/useAnnouncement'
import { countdownText, pointsBoost } from '../utils/announcement'

// Shown to players who joined a points announcement, until it ends.
const { current } = useAnnouncement()
const now = ref(Date.now())
let tick: ReturnType<typeof setInterval> | null = null

const live = computed(() => pointsBoost(current.value, now.value) > 1)
const label = computed(() => `${current.value?.pointsMultiplier ?? 1}X`)
const msLeft = computed(() => (current.value?.endsAt ?? 0) - now.value)

onMounted(() => { tick = setInterval(() => { now.value = Date.now() }, 1000) })
onUnmounted(() => { if (tick) clearInterval(tick) })
</script>

<style scoped>
.ann-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  height: 32px;
  padding: 0 var(--spacing-3);
  border-radius: var(--radius-pill);
  border: 1px solid color-mix(in srgb, var(--color-alert) 35%, var(--bg-concrete));
  background: color-mix(in srgb, var(--color-alert) 14%, var(--bg-concrete));
  white-space: nowrap;
}

.ann-chip-x {
  font-family: var(--font-display);
  font-size: var(--text-base);
  color: var(--color-alert);
}

.ann-chip-time {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
  font-variant-numeric: tabular-nums;
  color: color-mix(in srgb, var(--color-alert) 55%, white);
}

.ann-chip-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
</style>
