<template>
  <span
    class="pdot"
    :class="`pdot--${state}`"
    role="img"
    :aria-label="label"
    :title="mute ? undefined : label"
  />
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { presenceLabel, presenceState } from '../utils/relativeTime'
import { useNow } from '../composables/useClock'

const props = defineProps<{
  /** ISO timestamp from players_presence / my_friends. Null renders grey. */
  lastSeenAt?: string | null
  /** Drop the hover tooltip when a parent already shows the words - two
   *  tooltips on the same 10px target is one too many. */
  mute?: boolean
}>()

// The dot ages on the app's one clock. A page left open for an hour must stop
// claiming the player is here, which is the one thing presence must not do -
// but fifty dots do not need fifty timers to notice it.
const now = useNow()

const state = computed(() => presenceState(props.lastSeenAt, now.value))
const label = computed(() => presenceLabel(props.lastSeenAt, now.value))
</script>

<style scoped>
.pdot {
  display: inline-block;
  flex: none;
  /* Parents set --pdot-size; the shield scales it with the emblem. */
  width: var(--pdot-size, 10px);
  height: var(--pdot-size, 10px);
  border-radius: 50%;
  /* A ring keeps the dot legible on both the dark chrome and the card art. */
  box-shadow: 0 0 0 2px rgba(6, 8, 10, 0.9);
}

.pdot--online {
  background: var(--color-neon-green);
  animation: pdot-pulse 2.4s ease-in-out infinite;
}

/* Amber, not green: they were here a moment ago and may still answer. */
.pdot--recent {
  background: #ffab2e;
}

/* Solid, not translucent: a see-through gray picks up whatever it sits on,
   like the tier ring on the profile crest. */
.pdot--offline {
  background: color-mix(in srgb, var(--text-muted) 70%, var(--bg-concrete));
}

@keyframes pdot-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}

@media (prefers-reduced-motion: reduce) {
  .pdot--online { animation: none; }
}
</style>
