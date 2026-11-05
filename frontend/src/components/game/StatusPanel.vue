<template>
  <!-- Status ticker: persistent turn pill with the current event/action text
       on a line below it. Lives in its own arena row so it never overlaps the pit. -->
  <div class="status-ticker">
    <div
      v-if="turnLabel"
      class="turn-indicator"
      :class="{ mine: turnIsMine }"
      role="status"
      aria-live="polite"
    >
      <span class="turn-dot"></span>
      {{ turnLabel }}
    </div>
    <!-- Fixed-height line under the pill, kept even when empty so the pill
         does not jump as messages come and go. -->
    <div class="ticker-line">
      <Transition name="ticker-text" mode="out-in">
        <div
          v-if="tickerText"
          :key="tickerText"
          class="ticker-text"
          :class="{ alert: !!message }"
          :style="message ? messageStyle : undefined"
          role="status"
          aria-live="polite"
        >
          {{ tickerText }}
        </div>
      </Transition>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type CSSProperties } from 'vue'

const props = defineProps<{
  currentPlayerName: string
  direction: number
  drawStack: number
  currentColor?: string
  message?: string
  messageStyle?: CSSProperties
  stackingMode?: string
  turnLabel?: string
  turnIsMine?: boolean
  actionText?: string
}>()

// Alerts (roulette / swap / must-draw) outrank the ambient "who played what"
// action feed when both are present.
const tickerText = computed(() => props.message || props.actionText || '')
</script>

<style scoped>
.status-ticker {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-1);
  height: 100%;
  padding: 0 var(--spacing-3);
  overflow: hidden;
}

.ticker-line {
  display: flex;
  justify-content: center;
  max-width: 100%;
  height: 1rem;
}

/* Persistent, calm turn-ownership pill. Green when it's you, muted with a
   "thinking" pulse when waiting on someone else. */
.turn-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  flex-shrink: 0;
  padding: 0.2rem 0.7rem;
  border-radius: var(--radius-pill);
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  white-space: nowrap;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--text-secondary);
}

.turn-indicator.mine {
  background: rgba(0, 255, 102, 0.12);
  border-color: rgba(0, 255, 102, 0.4);
  color: #00ff66;
}

.turn-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
}

.turn-indicator:not(.mine) .turn-dot {
  animation: turn-thinking 1.2s ease-in-out infinite;
}

@keyframes turn-thinking {
  0%, 100% { opacity: 0.35; transform: scale(0.7); }
  50% { opacity: 1; transform: scale(1); }
}

/* Event / action text. Neutral for the ambient action feed; alert-styled
   (red) for urgent messages (roulette, swap, must-draw). */
.ticker-text {
  min-width: 0;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.ticker-text.alert {
  color: var(--color-alert);
  text-shadow: 0 0 10px rgba(255, 42, 42, 0.4);
}

.ticker-text-enter-active, .ticker-text-leave-active {
  transition: opacity 0.2s var(--ease-soft), transform 0.2s var(--ease-soft);
}
.ticker-text-enter-from, .ticker-text-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (prefers-reduced-motion: reduce) {
  .turn-indicator:not(.mine) .turn-dot { animation: none; }
  .ticker-text-enter-active, .ticker-text-leave-active { transition: none; }
}
</style>
