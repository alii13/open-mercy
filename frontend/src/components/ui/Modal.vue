<script setup lang="ts">
import { onUnmounted, ref, watch } from 'vue'

/**
 * Modal shell — centered overlay with focus management, Esc-to-close,
 * backdrop-click (opt-in), reduced-motion path. Each consuming modal keeps
 * its own bespoke container styling (color picker neon-yellow border, etc.)
 * and just gets the shared overlay + behavior baseline.
 *
 * Layout: full-viewport flex centre + scrollable container so tall content
 * stays usable on small screens. Teleported to body to escape any ancestor
 * containing-block from transforms/filters/contain — same fix as the
 * sticky CTA in Phase 1.
 */

const props = withDefaults(
  defineProps<{
    open?: boolean
    closeOnBackdrop?: boolean
    closeOnEsc?: boolean
    ariaLabel?: string
    /** Mobile: dock to the bottom edge as a slide-up sheet in the thumb zone.
        Inert on desktop and when false — existing consumers stay centered. */
    sheet?: boolean
  }>(),
  {
    open: true,
    closeOnBackdrop: false,
    closeOnEsc: true,
    sheet: false,
  },
)

const emit = defineEmits<{
  close: []
}>()

const containerRef = ref<HTMLElement | null>(null)
const lastFocused = ref<HTMLElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && props.closeOnEsc && props.open) {
    emit('close')
  }
}

function onBackdropClick(e: MouseEvent) {
  if (!props.closeOnBackdrop) return
  if (e.target === e.currentTarget) emit('close')
}

watch(
  () => props.open,
  (open) => {
    if (open) {
      lastFocused.value = document.activeElement as HTMLElement | null
      document.addEventListener('keydown', onKeydown)
      requestAnimationFrame(() => {
        const focusable = containerRef.value?.querySelector<HTMLElement>(
          'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
        )
        focusable?.focus()
      })
    } else {
      document.removeEventListener('keydown', onKeydown)
      lastFocused.value?.focus?.()
    }
  },
  { immediate: true },
)

onUnmounted(() => {
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <Teleport to="body">
    <Transition name="modal" appear>
      <div
        v-if="open"
        class="modal-overlay"
        :class="{ sheet }"
        :aria-label="ariaLabel"
        role="dialog"
        aria-modal="true"
        @click="onBackdropClick"
      >
        <div ref="containerRef" class="modal-shell" @click.stop>
          <slot />
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-overlay {
  position: fixed;
  inset: 0;
  /* No backdrop blur: blurring the whole page on open cost ~600 ms of
     tap-to-paint on a slowed phone CPU, and at 88% black it barely showed. */
  background: rgba(0, 0, 0, 0.88);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  padding: max(var(--spacing-4), env(safe-area-inset-top)) max(var(--spacing-4), env(safe-area-inset-right)) max(var(--spacing-4), env(safe-area-inset-bottom)) max(var(--spacing-4), env(safe-area-inset-left));
}

@media (max-width: 480px) {
  .modal-overlay {
    padding: var(--spacing-2);
  }
}

.modal-shell {
  max-height: calc(100vh - var(--spacing-8));
  max-height: calc(100dvh - var(--spacing-8));
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.modal-enter-active,
.modal-leave-active {
  transition: opacity var(--duration-soft) var(--ease-soft);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

/* Bottom sheet (mobile only): dock to the bottom edge in the thumb zone and
   slide up. Desktop keeps the centered dialog above. */
@media (max-width: 768px) {
  .modal-overlay.sheet {
    align-items: flex-end;
    padding: 0;
  }
  .modal-overlay.sheet .modal-shell {
    width: 100%;
    max-width: none;
    max-height: 85dvh;
    border-radius: 18px 18px 0 0;
    padding-bottom: max(var(--spacing-4), env(safe-area-inset-bottom));
    transition: transform var(--duration-soft) var(--ease-soft);
  }
  /* Grabber bar. */
  .modal-overlay.sheet .modal-shell::before {
    content: '';
    flex-shrink: 0;
    width: 40px;
    height: 4px;
    margin: 8px auto 4px;
    border-radius: 2px;
    background: rgba(255, 255, 255, 0.3);
  }
  /* Let the slotted card stretch to the full sheet width. */
  .modal-overlay.sheet .modal-shell > :deep(*) {
    max-width: none;
  }
  .modal-overlay.sheet.modal-enter-from .modal-shell,
  .modal-overlay.sheet.modal-leave-to .modal-shell {
    transform: translateY(100%);
  }
}

@media (prefers-reduced-motion: reduce) {
  .modal-enter-active,
  .modal-leave-active {
    transition: none;
  }
  .modal-overlay.sheet .modal-shell {
    transition: none;
  }
}
</style>
