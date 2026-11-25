<template>
  <!-- An info button that explains a label: hover with a mouse, tap or focus
       anywhere. Drawn like the badge popover: teleported to body and placed
       from the icon's live rect, so no card or footer can clip it. -->
  <span class="it" @mouseenter="hovering = true" @mouseleave="hovering = false">
    <button
      ref="btnEl"
      type="button"
      class="it-btn"
      :aria-label="`What is ${label}?`"
      :aria-expanded="open"
      @click="pinned = !pinned"
      @blur="pinned = false"
      @keydown.esc="pinned = false; hovering = false"
    >
      <Info :size="14" :stroke-width="2" aria-hidden="true" />
    </button>
    <!-- Announced when it opens; the bubble itself is for the eyes. -->
    <span class="it-live" role="status">{{ open ? text : '' }}</span>
    <Teleport to="body">
      <span v-if="open" class="it-tip" :style="tipStyle" aria-hidden="true">{{ text }}</span>
    </Teleport>
  </span>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { Info } from 'lucide-vue-next'

defineProps<{ label: string; text: string }>()

const TIP_WIDTH = 260
const EDGE = 8

const btnEl = ref<HTMLButtonElement | null>(null)
const pinned = ref(false)
const hovering = ref(false)
const open = computed(() => pinned.value || hovering.value)
const tipStyle = ref<Record<string, string>>({})

function place() {
  const r = btnEl.value?.getBoundingClientRect()
  if (!r) return
  const width = Math.min(TIP_WIDTH, window.innerWidth - EDGE * 2)
  const left = Math.min(Math.max(r.left + r.width / 2 - width / 2, EDGE), window.innerWidth - EDGE - width)
  // Above the icon, unless that would run off the top of the screen.
  const below = r.top < 120
  tipStyle.value = {
    width: `${Math.round(width)}px`,
    left: `${Math.round(left)}px`,
    top: `${Math.round(below ? r.bottom + EDGE : r.top - EDGE)}px`,
    transform: below ? 'none' : 'translateY(-100%)',
  }
}

// A fixed bubble would drift away from its icon on scroll, so it closes instead.
function close() {
  pinned.value = false
  hovering.value = false
}

watch(open, (isOpen) => {
  if (isOpen) {
    place()
    window.addEventListener('scroll', close, { passive: true, capture: true })
  } else {
    window.removeEventListener('scroll', close, { capture: true })
  }
})

onBeforeUnmount(() => window.removeEventListener('scroll', close, { capture: true }))
</script>

<style scoped>
.it {
  display: inline-flex;
  vertical-align: middle;
}

/* 14px to look at, 44px to hit. */
.it-btn {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0;
  border: none;
  background: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-snap) var(--ease-snap);
}
.it-btn::before {
  content: '';
  position: absolute;
  inset: -15px;
}
.it-btn[aria-expanded='true'],
.it-btn:focus-visible { color: var(--text-primary); }
@media (hover: hover) {
  .it-btn:hover { color: var(--text-primary); }
}

.it-live {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}

/* The badge popover's surface: near-black, a hairline, a soft drop shadow. */
.it-tip {
  position: fixed;
  z-index: 3200;
  padding: var(--spacing-2) var(--spacing-3);
  background: rgba(11, 11, 13, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-md);
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.6);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 400;
  letter-spacing: normal;
  line-height: 20px;
  text-transform: none;
  color: var(--text-primary);
  pointer-events: none;
}
</style>
