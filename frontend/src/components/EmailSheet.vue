<template>
  <Teleport to="body">
    <div
      ref="overlayEl"
      class="es-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="es-title"
      tabindex="-1"
      @click.self="close"
    >
      <div class="es-sheet">
        <span class="es-grabber" aria-hidden="true"></span>

        <header class="es-head">
          <h2 id="es-title" class="es-title">{{ waiting ? 'Check both inboxes' : 'Change email' }}</h2>
          <button type="button" class="es-close" aria-label="Close" @click="close">
            <X :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>

        <template v-if="waiting">
          <p class="es-copy">
            We sent a link to <strong>{{ auth.user?.email }}</strong> and to <strong>{{ auth.user?.new_email }}</strong>.
            Click both and you're moved.
          </p>
          <p class="es-fine">Not there? Check spam. Your name, rank and games stay the same.</p>
          <button type="button" class="es-btn es-btn--primary" @click="close">DONE</button>
          <button type="button" class="es-link" @click="useAnother">Use another email</button>
        </template>

        <form v-else class="es-form" @submit.prevent="submit">
          <p class="es-copy">Signed in as <strong>{{ auth.user?.email }}</strong></p>
          <input
            ref="inputEl"
            v-model="newEmail"
            class="es-input"
            type="email"
            required
            autocomplete="email"
            placeholder="New email"
            aria-label="New email"
          />
          <p v-if="error" class="es-error" role="alert">{{ error }}</p>
          <button type="submit" class="es-btn es-btn--primary" :disabled="busy">
            {{ busy ? 'SENDING…' : 'SEND LINKS' }}
          </button>
          <p class="es-fine">We email a link to both addresses. The change happens once you click both.</p>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { closeEmailSheet } from '../composables/useEmailSheet'

const auth = useAuthStore()
const overlayEl = ref<HTMLElement | null>(null)
const inputEl = ref<HTMLInputElement | null>(null)
const newEmail = ref('')
const busy = ref(false)
const error = ref('')

// A pending change is on the user (new_email), so after a reload the sheet
// opens on it. "Use another email" goes back to the form.
const editing = ref(false)
const waiting = computed(() => auth.emailChangePending && !editing.value)

const ERRORS = {
  same_email: 'That is already your email.',
  email_exists: 'Another account already uses that email.',
  rate_limited: 'Too many emails went out just now. Try again in an hour.',
  failed: 'Could not send the links. Try again in a moment.',
} as const

// Same contract as the photo sheet: Escape closes, focus goes back to the opener.
const opener = document.activeElement as HTMLElement | null

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  overlayEl.value?.focus()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  opener?.focus?.()
})

function close() {
  if (!busy.value) closeEmailSheet()
}

async function useAnother() {
  editing.value = true
  error.value = ''
  await nextTick()
  inputEl.value?.focus()
}

async function submit() {
  busy.value = true
  error.value = ''
  const res = await auth.changeEmail(newEmail.value)
  busy.value = false
  if (!res.success) {
    error.value = ERRORS[res.error]
    return
  }
  newEmail.value = ''
  editing.value = false
}
</script>

<style scoped>
/* Shell copied from PhotoSheet so the two account sheets look the same. */
.es-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4);
  background: rgba(0, 0, 0, 0.82);
  outline: none;
}

.es-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-4);
  width: 100%;
  max-width: 400px;
  max-height: 100%;
  overflow-y: auto;
  padding: var(--spacing-3) var(--spacing-6) var(--spacing-6);
  background: #121416;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  font-family: var(--font-body);
  color: var(--text-primary);
}

.es-grabber {
  display: none;
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.18);
}

/* Phones get a bottom sheet. */
@media (max-width: 480px) {
  .es-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .es-sheet {
    max-width: none;
    border-radius: 20px 20px 0 0;
    border-bottom: none;
    padding-bottom: calc(var(--spacing-8) + env(safe-area-inset-bottom));
  }
  .es-grabber {
    display: block;
  }
}

.es-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.es-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 400;
  color: var(--text-primary);
}

.es-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  cursor: pointer;
}
.es-close:hover,
.es-close:focus-visible {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.12);
}

.es-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  width: 100%;
}

.es-copy {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.45;
  color: var(--text-secondary);
  text-align: center;
  overflow-wrap: anywhere;
}
.es-copy strong {
  color: var(--text-primary);
  font-weight: 600;
}

/* 16px text keeps iPhone Safari from zooming the page on focus. */
.es-input {
  width: 100%;
  min-height: 52px;
  padding: 0 var(--spacing-4);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-sm);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
}
.es-input:focus-visible {
  outline: 2px solid var(--color-neon-blue);
  outline-offset: 1px;
}

.es-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  width: 100%;
  min-height: 52px;
  border-radius: var(--radius-sm);
  font-family: var(--font-display);
  font-size: var(--text-base);
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap), opacity var(--duration-snap) var(--ease-snap);
}
.es-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.es-btn--primary {
  border: none;
  background: var(--text-primary);
  color: var(--bg-concrete);
}
.es-btn--primary:hover:not(:disabled),
.es-btn--primary:focus-visible {
  background: #fff;
}

.es-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--spacing-3);
  border: none;
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
}
.es-link:hover,
.es-link:focus-visible {
  text-decoration: underline;
}

.es-error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-alert);
  text-align: center;
}

.es-fine {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-muted);
  text-align: center;
}
</style>
