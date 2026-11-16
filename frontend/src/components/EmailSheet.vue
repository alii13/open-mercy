<template>
  <!-- The email change, shown as a step inside the account modal. -->
  <div class="es">
    <header class="es-head">
      <h2 id="es-title" class="es-title">{{ title }}</h2>
    </header>

    <template v-if="waiting">
      <p class="es-copy">
        We sent a link to <strong>{{ auth.user?.email }}</strong> and to <strong>{{ auth.user?.new_email }}</strong>.
        Click both and you're moved.
      </p>
      <p v-if="switchPending" class="es-fine">Until you click both, sign in with <strong>{{ auth.user?.email }}</strong> and your new password.</p>
      <p class="es-fine">Not there? Check spam. Your name, rank and games stay the same.</p>
      <button ref="doneEl" type="button" class="es-btn es-btn--primary" @click="close">DONE</button>
      <button type="button" class="es-link" @click="useAnother">Use another email</button>
    </template>

    <!-- A Google or Apple player who kept the same address is done at once: there is nothing to confirm. -->
    <template v-else-if="switchedTo">
      <p class="es-copy">You can now sign in with <strong>{{ switchedTo }}</strong> and your password.</p>
      <p class="es-fine">{{ provider }} stays linked to this profile, so it still signs you in too.</p>
      <button ref="doneEl" type="button" class="es-btn es-btn--primary" @click="close">DONE</button>
    </template>

    <form v-else-if="switching" class="es-form" @submit.prevent="submitSwitch">
      <p class="es-copy">You sign in with {{ provider }} as <strong>{{ auth.user?.email }}</strong>. Add an email and password to sign in with instead.</p>
      <input
        ref="inputEl"
        v-model="newEmail"
        class="es-input"
        type="email"
        required
        autocomplete="email"
        placeholder="Email"
        aria-label="Email"
        :aria-invalid="!!error"
        :aria-describedby="error ? 'es-error' : undefined"
      />
      <div class="es-field">
        <input
          v-model="password"
          class="es-input"
          type="password"
          required
          minlength="6"
          autocomplete="new-password"
          placeholder="Password"
          aria-label="Password"
          :aria-invalid="!!error"
          :aria-describedby="error ? 'es-pw-hint es-error' : 'es-pw-hint'"
        />
        <p id="es-pw-hint" class="es-hint">At least 6 characters.</p>
      </div>
      <p v-if="error" id="es-error" class="es-error" role="alert">{{ error }}</p>
      <button type="submit" class="es-btn es-btn--primary" :disabled="busy">
        {{ busy ? 'SAVING…' : 'SWITCH TO EMAIL' }}
      </button>
      <p class="es-fine">Your {{ provider }} account stays linked to this profile, so {{ provider }} sign-in keeps working too. A new address gets a link at both addresses first. Setting a password signs you out on your other devices.</p>
    </form>

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

// Google and Apple accounts switch to email sign-in here; email accounts change their address.
const PROVIDERS: Record<string, string> = { google: 'Google', apple: 'Apple' }
const provider = computed(() => PROVIDERS[String(auth.user?.app_metadata?.provider ?? '')] ?? 'your provider')
const switching = computed(() => auth.canSwitchToEmail)
// A switch to a new address waits on both links; until then the password works with the old address.
const switchPending = computed(() => auth.emailChangePending && auth.user?.user_metadata?.email_sign_in === true
  && !(auth.user?.app_metadata?.providers ?? []).includes('email'))
const doneEl = ref<HTMLButtonElement | null>(null)
const password = ref('')
const switchedTo = ref('')
const title = computed(() => {
  if (waiting.value) return 'Check both inboxes'
  if (switchedTo.value) return 'Email sign-in is on'
  return switching.value ? 'Switch to email' : 'Change email'
})

const ERRORS = {
  too_short: 'Use at least 6 characters for the password.',
  weak_password: 'Pick a stronger password: make it longer and mix letters and numbers.',
  reauth: 'For your safety, sign out and sign back in, then try again.',
  same_password: 'That password is already set. Pick a different one.',
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

async function submitSwitch() {
  busy.value = true
  error.value = ''
  const keepsAddress = newEmail.value.trim().toLowerCase() === auth.user?.email?.toLowerCase()
  const res = await auth.switchToEmail(newEmail.value, password.value)
  busy.value = false
  if (!res.success) {
    // Nothing is mailed on the same-address path, so the change form's "send the links" wording doesn't fit.
    error.value = res.error === 'failed' ? 'Could not save. Try again in a moment.' : ERRORS[res.error]
    return
  }
  password.value = ''
  if (keepsAddress) switchedTo.value = newEmail.value.trim().toLowerCase()
  newEmail.value = ''
  editing.value = false
  // The submit button is gone now; keep focus inside the dialog on the next step.
  await nextTick()
  doneEl.value?.focus()
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
.es-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.es-hint {
  margin: 0;
  font-size: var(--text-xs);
  color: var(--text-muted);
}

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
