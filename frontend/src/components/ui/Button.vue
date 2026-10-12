<script setup lang="ts">
import { vFocusRing } from '@/directives/focusRing'

withDefaults(
  defineProps<{
    variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'hazard'
    size?: 'sm' | 'md' | 'lg'
    type?: 'button' | 'submit' | 'reset'
    disabled?: boolean
    block?: boolean
  }>(),
  {
    variant: 'primary',
    size: 'md',
    type: 'button',
    disabled: false,
    block: false,
  },
)
</script>

<template>
  <button
    v-focus-ring
    :type="type"
    :disabled="disabled"
    :class="[
      'btn',
      `btn--${variant}`,
      `btn--${size}`,
      { 'btn--block': block },
    ]"
  >
    <slot />
  </button>
</template>

<style scoped>
.btn {
  font-family: var(--font-display);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  cursor: pointer;
  border: 2px solid transparent;
  border-radius: var(--radius-sm);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  min-height: 44px;
  transition:
    background var(--duration-snap) var(--ease-snap),
    color var(--duration-snap) var(--ease-snap),
    transform var(--duration-snap) var(--ease-snap),
    box-shadow var(--duration-snap) var(--ease-snap);
  white-space: nowrap;
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn--block {
  width: 100%;
}

.btn--sm {
  padding: var(--spacing-2) var(--spacing-4);
  font-size: var(--text-sm);
  min-height: 44px;
}

.btn--md {
  padding: var(--spacing-3) var(--spacing-6);
  font-size: var(--text-base);
}

.btn--lg {
  padding: var(--spacing-4) var(--spacing-8);
  font-size: var(--text-lg);
  min-height: 56px;
}

/* primary — red glow, gradient fill */
.btn--primary {
  background: linear-gradient(
    145deg,
    var(--color-alert) 0%,
    var(--color-alert-dim) 100%
  );
  border-color: var(--color-alert);
  color: white;
}
.btn--primary:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow-red);
}
.btn--primary:active:not(:disabled) {
  transform: translateY(0);
}

/* secondary — cyan outline */
.btn--secondary {
  background: transparent;
  border-color: var(--color-neon-blue);
  color: var(--color-neon-blue);
}
.btn--secondary:hover:not(:disabled) {
  background: var(--color-neon-blue);
  color: var(--bg-concrete);
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow-cyan);
}

/* ghost — muted, low-attention */
.btn--ghost {
  background: transparent;
  border-color: var(--text-muted);
  color: var(--text-secondary);
}
.btn--ghost:hover:not(:disabled) {
  border-color: var(--text-secondary);
  color: var(--text-primary);
  transform: translateY(-2px);
}

/* danger — solid red, no gradient, used for destructive confirms */
.btn--danger {
  background: var(--color-alert);
  border-color: var(--color-alert);
  color: white;
}
.btn--danger:hover:not(:disabled) {
  background: var(--color-alert-dim);
  box-shadow: var(--shadow-glow-red);
}

/* hazard — solid yellow, for answering someone (accept) rather than playing */
.btn--hazard {
  background: var(--color-hazard);
  border-color: var(--color-hazard);
  color: var(--bg-concrete);
}
.btn--hazard:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: var(--shadow-glow-yellow);
}
</style>
