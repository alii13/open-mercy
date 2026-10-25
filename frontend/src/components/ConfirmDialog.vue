<template>
  <Teleport to="body">
    <Transition name="confirm-modal">
      <div
        v-if="open"
        class="confirm-overlay"
        role="dialog"
        aria-modal="true"
        @click.self="$emit('cancel')"
        @keydown.esc="$emit('cancel')"
      >
        <div class="confirm-card">
          <h2 class="confirm-title">{{ title }}</h2>
          <p class="confirm-message">{{ message }}</p>
          <div class="confirm-actions">
            <button
              type="button"
              class="confirm-btn confirm-cancel"
              @click="$emit('cancel')"
              autofocus
            >
              {{ cancelLabel }}
            </button>
            <button
              type="button"
              class="confirm-btn confirm-danger"
              @click="$emit('confirm')"
            >
              {{ confirmLabel }}
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
withDefaults(
  defineProps<{
    open: boolean
    title: string
    message: string
    confirmLabel?: string
    cancelLabel?: string
  }>(),
  {
    confirmLabel: 'CONFIRM',
    cancelLabel: 'CANCEL',
  },
)

defineEmits<{
  confirm: []
  cancel: []
}>()
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: var(--spacing-4);
}

.confirm-card {
  background: linear-gradient(180deg, #18191b 0%, #0a0a0b 100%);
  border: 1px solid rgba(255, 42, 42, 0.35);
  border-radius: var(--radius-md);
  padding: var(--spacing-8) var(--spacing-6);
  width: 100%;
  max-width: 380px;
  text-align: center;
  box-shadow: 0 0 40px rgba(255, 42, 42, 0.18);
  font-family: var(--font-body);
}

.confirm-title {
  margin: 0 0 var(--spacing-3);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  letter-spacing: 0.12em;
  color: var(--text-primary);
  text-transform: uppercase;
}

.confirm-message {
  margin: 0 0 var(--spacing-6);
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.5;
}

.confirm-actions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-3);
}

.confirm-btn {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  letter-spacing: 0.15em;
  padding: var(--spacing-3);
  border: 1px solid;
  background: transparent;
  cursor: pointer;
  min-height: 44px;
  text-transform: uppercase;
  border-radius: var(--radius-sm);
  transition:
    background var(--duration-snap) var(--ease-snap),
    border-color var(--duration-snap) var(--ease-snap),
    color var(--duration-snap) var(--ease-snap);
}

.confirm-cancel {
  border-color: rgba(255, 255, 255, 0.18);
  color: var(--text-secondary);
}
.confirm-cancel:hover,
.confirm-cancel:focus-visible {
  border-color: rgba(255, 255, 255, 0.45);
  color: var(--text-primary);
  outline: none;
}

.confirm-danger {
  border-color: var(--color-alert);
  color: var(--color-alert);
  background: rgba(255, 42, 42, 0.06);
}
.confirm-danger:hover,
.confirm-danger:focus-visible {
  background: rgba(255, 42, 42, 0.15);
  color: #ffffff;
  outline: none;
}

.confirm-modal-enter-active,
.confirm-modal-leave-active {
  transition: opacity var(--duration-soft) var(--ease-soft);
}
.confirm-modal-enter-from,
.confirm-modal-leave-to {
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .confirm-modal-enter-active,
  .confirm-modal-leave-active {
    transition: none;
  }
}
</style>
