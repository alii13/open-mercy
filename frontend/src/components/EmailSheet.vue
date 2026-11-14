<template>
  <!-- The email change, shown as a step inside the account modal. -->
  <div class="es">
    <header class="es-head">
      <h2 id="es-title" class="es-title">{{ waiting ? 'Check both inboxes' : 'Change email' }}</h2>
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
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { useAuthStore } from '../stores/authStore'

const auth = useAuthStore()
const inputEl = ref<HTMLInputElement | null>(null)
const newEmail = ref('')
const busy = ref(false)
const error = ref('')

// done: back to the account. busy: the account modal holds Back and Close
// while links are sending, or a failure would never be seen.
const emit = defineEmits<{ done: []; busy: [boolean] }>()
watch(busy, (b) => emit('busy', b))

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

function close() {
  if (!busy.value) emit('done')
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
.es {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-4);
  font-family: var(--font-body);
  color: var(--text-primary);
}

/* Phones get a bottom sheet. */
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
  color: var(--text-secondary);
  text-align: center;
}
</style>
