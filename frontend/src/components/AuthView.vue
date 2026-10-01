<template>
  <div class="auth-container">
    <div class="auth-card">
      <button class="back-link" @click="$emit('back')">
        <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
        BACK
      </button>

      <header class="auth-header">
        <h1 class="auth-brand">
          <span class="auth-brand-uno">OPEN</span>
          <span class="auth-brand-nomercy">MERCY</span>
        </h1>
        <p class="auth-tagline">
          {{ mode === 'claim' ? 'Keep your stats forever'
            : mode === 'forgot' ? 'Reset your password'
            : mode === 'signup' ? 'Track every brutal stat'
            : 'Pick up where you left off' }}
        </p>
      </header>

      <!-- Claim mode: convert the guest in place. No tabs — the signup tab
           would mint a fresh user and orphan this guest's stats. -->
      <template v-if="mode === 'claim'">
        <!-- Already converted (confirmation clicked, possibly in another tab) -->
        <div v-if="!authStore.isAnonymous" class="claim-panel">
          <h2 class="claim-title">ACCOUNT CLAIMED</h2>
          <p class="claim-copy">Your stats, badges and profile link are safe. Go deal some damage.</p>
          <Button variant="primary" size="lg" block @click="$emit('back')">BACK TO THE GAME</Button>
        </div>

        <!-- Confirmation email sent, waiting on the click -->
        <div v-else-if="authStore.claimPending && !editingClaimEmail" class="claim-panel">
          <h2 class="claim-title">CHECK YOUR INBOX</h2>
          <p class="claim-copy">
            We sent a confirmation link to <strong>{{ authStore.user?.new_email }}</strong>.
            Click it and this guest account becomes permanent — stats, badges and profile link included.
          </p>
          <p v-if="successMsg" class="msg msg-success">{{ successMsg }}</p>
          <p v-if="error" class="msg msg-error">{{ error }}</p>
          <Button variant="secondary" size="md" block :disabled="loading" @click="handleResend">
            {{ loading ? 'SENDING…' : 'RESEND EMAIL' }}
          </Button>
          <button class="link" type="button" @click="editingClaimEmail = true; error = ''; successMsg = ''">
            Use a different email
          </button>
        </div>

        <!-- The claim form -->
        <form v-else class="auth-form" @submit.prevent="handleClaim">
          <p class="claim-copy">
            Playing as <strong>{{ authStore.username }}</strong>. Your stats, badges and
            profile link stay exactly where they are.
          </p>

          <div class="google-block">
            <button type="button" class="google-btn" :disabled="loading" @click="handleGoogle">
              <span class="google-mark" aria-hidden="true">
                <svg viewBox="0 0 48 48" width="18" height="18">
                  <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
                  <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
                  <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
                  <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
                </svg>
              </span>
              <span class="google-label">{{ loading ? 'OPENING GOOGLE…' : 'CLAIM WITH GOOGLE' }}</span>
            </button>
            <p class="google-note">One tap. No confirmation email.</p>
          </div>

          <div class="or-rule"><span>OR USE AN EMAIL</span></div>

          <label class="field">
            <span class="field-label">EMAIL</span>
            <input
              v-model="email"
              v-focus-ring
              type="email"
              placeholder="you@example.com"
              required
              autocomplete="email"
              class="field-input"
            />
          </label>

          <label class="field">
            <span class="field-label">PASSWORD</span>
            <input
              v-model="password"
              v-focus-ring
              type="password"
              placeholder="At least 6 characters"
              required
              minlength="6"
              autocomplete="new-password"
              class="field-input"
            />
          </label>

          <p v-if="error" class="msg msg-error">{{ error }}</p>
          <button v-if="emailTaken || googleTaken" class="link" type="button" @click="switchToLoginFromCollision">
            SIGN IN TO THAT ACCOUNT INSTEAD
            <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" />
          </button>

          <Button type="submit" variant="primary" size="lg" block :disabled="loading">
            {{ loading ? 'PROCESSING…' : 'CLAIM MY ACCOUNT' }}
          </Button>
        </form>
      </template>

      <!-- Login / Signup tabs (hidden in forgot + claim modes) -->
      <div v-if="mode !== 'forgot' && mode !== 'claim'" class="tab-row" role="tablist">
        <button
          class="tab"
          :class="{ active: mode === 'login' }"
          role="tab"
          :aria-selected="mode === 'login'"
          @click="setMode('login')"
        >
          SIGN IN
        </button>
        <button
          class="tab"
          :class="{ active: mode === 'signup' }"
          role="tab"
          :aria-selected="mode === 'signup'"
          @click="setMode('signup')"
        >
          SIGN UP
        </button>
      </div>

      <!-- Forgot mode -->
      <form v-if="mode === 'forgot'" class="auth-form" @submit.prevent="handleForgotPassword">
        <label class="field">
          <span class="field-label">EMAIL</span>
          <input
            v-model="email"
            v-focus-ring
            type="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
            class="field-input"
          />
        </label>

        <p v-if="error" class="msg msg-error">{{ error }}</p>
        <p v-if="successMsg" class="msg msg-success">{{ successMsg }}</p>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          :disabled="loading"
        >
          {{ loading ? 'SENDING...' : 'SEND RESET LINK' }}
        </Button>

        <button class="link" type="button" @click="setMode('login')">
          <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
          Back to sign in
        </button>
      </form>

      <!-- Login / Signup forms -->
      <form v-else-if="mode !== 'claim'" class="auth-form" @submit.prevent="handleSubmit">
        <!-- Also on sign-in, not just sign-up: someone who created their account
             with Google has no password to type. -->
        <button type="button" class="google-btn" :disabled="loading" @click="handleGoogle">
          <span class="google-mark" aria-hidden="true">
            <svg viewBox="0 0 48 48" width="18" height="18">
              <path fill="#4285F4" d="M45.12 24.5c0-1.56-.14-3.06-.4-4.5H24v8.51h11.84c-.51 2.75-2.06 5.08-4.39 6.64v5.52h7.11c4.16-3.83 6.56-9.47 6.56-16.17z" />
              <path fill="#34A853" d="M24 46c5.94 0 10.92-1.97 14.56-5.33l-7.11-5.52c-1.97 1.32-4.49 2.1-7.45 2.1-5.73 0-10.58-3.87-12.31-9.07H4.34v5.7C7.96 41.07 15.4 46 24 46z" />
              <path fill="#FBBC05" d="M11.69 28.18C11.25 26.86 11 25.45 11 24s.25-2.86.69-4.18v-5.7H4.34C2.85 17.09 2 20.45 2 24s.85 6.91 2.34 9.88l7.35-5.7z" />
              <path fill="#EA4335" d="M24 10.75c3.23 0 6.13 1.11 8.41 3.29l6.31-6.31C34.91 4.18 29.93 2 24 2 15.4 2 7.96 6.93 4.34 14.12l7.35 5.7c1.73-5.2 6.58-9.07 12.31-9.07z" />
            </svg>
          </span>
          <span class="google-label">{{ loading ? 'OPENING GOOGLE…' : 'CONTINUE WITH GOOGLE' }}</span>
        </button>

        <div class="or-rule"><span>OR USE AN EMAIL</span></div>

        <label v-if="mode === 'signup'" class="field">
          <span class="field-label">USERNAME</span>
          <input
            v-model="username"
            v-focus-ring
            type="text"
            placeholder="Pick a battle name"
            required
            minlength="3"
            autocomplete="username"
            class="field-input"
          />
        </label>

        <label class="field">
          <span class="field-label">EMAIL</span>
          <input
            v-model="email"
            v-focus-ring
            type="email"
            placeholder="you@example.com"
            required
            autocomplete="email"
            class="field-input"
          />
        </label>

        <label class="field">
          <span class="field-label">PASSWORD</span>
          <input
            v-model="password"
            v-focus-ring
            type="password"
            :placeholder="mode === 'signup' ? 'At least 6 characters' : 'Your password'"
            required
            minlength="6"
            :autocomplete="mode === 'signup' ? 'new-password' : 'current-password'"
            class="field-input"
          />
        </label>

        <p v-if="error" class="msg msg-error">{{ error }}</p>
        <p v-if="successMsg" class="msg msg-success">{{ successMsg }}</p>

        <Button
          type="submit"
          variant="primary"
          size="lg"
          block
          :disabled="loading"
        >
          {{ loading ? 'PROCESSING...' : mode === 'signup' ? 'CREATE ACCOUNT' : 'SIGN IN' }}
        </Button>

        <button
          v-if="mode === 'login'"
          class="link"
          type="button"
          @click="setMode('forgot')"
        >
          Forgot password?
        </button>
      </form>

      <!-- Trust microcopy at the foot of the card -->
      <ul class="trust-list" aria-label="What you get">
        <li>Free forever</li>
        <li>·</li>
        <li>No download</li>
        <li>·</li>
        <li>Anonymous OK</li>
      </ul>
      <p v-if="mode === 'signup' || (mode === 'claim' && authStore.isAnonymous)" class="legal-note">
        By creating or claiming an account you agree to the
        <a href="/terms/">Terms</a> and <a href="/privacy/">Privacy policy</a>.
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ArrowRight, ChevronLeft } from 'lucide-vue-next'
import { ref, onMounted } from 'vue'
import { useAuthStore } from '../stores/authStore'
import { vFocusRing } from '../directives/focusRing'
import Button from './ui/Button.vue'

const props = defineProps<{
  initialMode?: 'login' | 'signup' | 'claim'
}>()

const emit = defineEmits<{
  (e: 'back'): void
}>()

const authStore = useAuthStore()

const mode = ref<'login' | 'signup' | 'forgot' | 'claim'>('login')
const email = ref('')
const password = ref('')
const username = ref('')
const loading = ref(false)
const error = ref('')
const successMsg = ref('')
const emailTaken = ref(false)
const googleTaken = ref(false)
const editingClaimEmail = ref(false)

onMounted(() => {
  if (props.initialMode) {
    mode.value = props.initialMode
  }

  // A Google failure can only be reported after the round-trip, so the store
  // parked it on the URL's behalf and this is where it becomes visible.
  const failed = authStore.oauthError
  if (failed) {
    if (failed.code === 'identity_already_exists') {
      googleTaken.value = true
      error.value = 'That Google account already belongs to another player.'
    } else {
      error.value = failed.message
    }
    authStore.clearOAuthError()
  }
})

function setMode(next: 'login' | 'signup' | 'forgot' | 'claim') {
  mode.value = next
  error.value = ''
  successMsg.value = ''
  emailTaken.value = false
  googleTaken.value = false
}

// Success never returns here — the browser is already on its way to Google.
async function handleGoogle() {
  loading.value = true
  error.value = ''
  googleTaken.value = false

  try {
    const result = mode.value === 'claim'
      ? await authStore.linkGoogleIdentity()
      : await authStore.signInWithGoogle()
    if (!result.success) fail(result.error)
  } catch (err: any) {
    fail(err?.message)
  }
}

// GoTrue's own wording ("Manual linking is disabled") describes our
// configuration, not anything the player can act on. Keep it in the console and
// point them at the path that still works.
function fail(reason?: string) {
  console.error('Google sign-in failed:', reason)
  error.value = 'Google sign-in is unavailable right now. Use an email instead.'
  loading.value = false
}

async function handleClaim() {
  loading.value = true
  error.value = ''
  emailTaken.value = false

  try {
    const result = await authStore.claimAccount(email.value, password.value)
    if (result.success) {
      // claimPending flips via the store — the pending panel takes over.
      editingClaimEmail.value = false
      successMsg.value = ''
    } else if (result.code === 'email_exists') {
      emailTaken.value = true
      error.value = 'That email already has an account.'
    } else {
      error.value = result.error || 'Could not claim the account'
    }
  } finally {
    loading.value = false
  }
}

async function handleResend() {
  loading.value = true
  error.value = ''
  successMsg.value = ''
  try {
    const result = await authStore.resendClaimEmail()
    if (result.success) successMsg.value = 'Sent. Give it a minute and check spam.'
    else error.value = result.error || 'Could not resend'
  } finally {
    loading.value = false
  }
}

// Collision path: they own that email already. Signing in is the right move,
// but it abandons this guest profile — say so before they do it.
function switchToLoginFromCollision() {
  setMode('login')
  error.value = "Heads up: signing in to a different account won't carry this guest profile's stats."
}

async function handleSubmit() {
  loading.value = true
  error.value = ''

  try {
    if (mode.value === 'signup') {
      const result = await authStore.signUp(email.value, password.value, username.value)
      if (!result.success) {
        error.value = result.error || 'Sign up failed'
      } else if (result.needsConfirmation) {
        // No session until the email link is clicked — the app stays on this
        // view, so the instruction has to live here. setMode clears messages,
        // so the message is set after switching to the sign-in tab.
        setMode('login')
        successMsg.value = 'Account created. Check your email to confirm, then sign in.'
      } else {
        // Instant session (confirmations off): close before the parent's
        // signed-out branch dies, or the signed-in fallback AuthView mounts
        // in claim mode and greets a fresh account with "ACCOUNT CLAIMED".
        emit('back')
      }
    } else {
      const result = await authStore.signIn(email.value, password.value)
      if (!result.success) {
        error.value = result.error || 'Login failed'
      } else {
        // Same trap as above: success flips isAuthenticated, the signed-out
        // branch unmounts this view, and a still-true showAuthView would
        // mount the claim-mode fallback over a plain sign-in.
        emit('back')
      }
    }
  } finally {
    loading.value = false
  }
}

async function handleForgotPassword() {
  loading.value = true
  error.value = ''
  successMsg.value = ''

  try {
    const result = await authStore.sendPasswordReset(email.value)
    if (result.success) {
      successMsg.value = 'Reset link sent. Check your email.'
    } else {
      error.value = result.error || 'Failed to send reset link'
    }
  } finally {
    loading.value = false
  }
}
</script>

<style scoped>
.auth-container {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  justify-content: center;
  align-items: center;
  background: var(--bg-concrete);
  padding: var(--spacing-4);
}

.auth-card {
  width: 100%;
  max-width: 440px;
  background: linear-gradient(180deg, #18191b 0%, #0a0a0b 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: var(--spacing-8) var(--spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.2em;
  cursor: pointer;
  padding: var(--spacing-1) 0;
  align-self: flex-start;
  transition: color var(--duration-snap) var(--ease-snap);
}

.back-link:hover {
  color: var(--color-neon-blue);
}

.auth-header {
  text-align: center;
}

.auth-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-1);
  margin: 0;
}

.auth-brand-uno {
  font-family: var(--font-display);
  font-size: clamp(3rem, 10vw, 4rem);
  letter-spacing: 0.05em;
  line-height: 1;
  color: var(--text-primary);
}

.auth-brand-nomercy {
  font-family: var(--font-display);
  font-size: clamp(1rem, 3.5vw, 1.5rem);
  letter-spacing: 0.25em;
  color: var(--color-alert);
  text-shadow: 0 0 14px rgba(255, 42, 42, 0.5);
}

.auth-tagline {
  margin: var(--spacing-3) 0 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  letter-spacing: 0.18em;
  color: var(--text-secondary);
  text-transform: uppercase;
}

.tab-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--spacing-1);
  background: rgba(0, 0, 0, 0.4);
  padding: var(--spacing-1);
  border-radius: var(--radius-sm);
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.tab {
  background: transparent;
  border: none;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.2em;
  padding: var(--spacing-3);
  cursor: pointer;
  border-radius: var(--radius-sm);
  min-height: 44px;
  transition:
    background var(--duration-snap) var(--ease-snap),
    color var(--duration-snap) var(--ease-snap);
}

.tab:hover {
  color: var(--text-primary);
}

.tab.active {
  background: var(--color-alert);
  color: white;
  font-weight: bold;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.field-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.18em;
}

.field-input {
  width: 100%;
  padding: var(--spacing-3) var(--spacing-4);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-snap) var(--ease-snap);
  min-height: 44px;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-neon-blue);
}

.msg {
  margin: 0;
  padding: var(--spacing-3);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
  border: 1px solid;
  text-align: center;
}

.msg-error {
  background: rgba(255, 42, 42, 0.08);
  border-color: var(--color-alert);
  color: var(--color-alert);
}

.msg-success {
  background: rgba(0, 255, 102, 0.08);
  border-color: var(--color-neon-green);
  color: var(--color-neon-green);
}

.link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  cursor: pointer;
  padding: var(--spacing-2);
  text-align: center;
  transition: color var(--duration-snap) var(--ease-snap);
}

.link:hover {
  color: var(--color-neon-blue);
}

.claim-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  text-align: center;
}

.claim-title {
  font-family: var(--font-display);
  font-size: 1.1rem;
  letter-spacing: 0.14em;
  color: var(--text-primary);
  margin: 0;
}

.claim-copy {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1.6;
  color: var(--text-secondary);
  margin: 0;
}

.claim-copy strong {
  color: var(--text-primary);
}

.legal-note {
  margin: var(--spacing-3) 0 0;
  text-align: center;
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--text-secondary);
}

.legal-note a {
  color: var(--text-primary);
  text-decoration: underline;
}

.trust-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  justify-content: center;
  gap: var(--spacing-2);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.15em;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  padding-top: var(--spacing-3);
}

/* Button and its caption travel together, so they get their own tighter gap
   instead of inheriting the form's spacing-4 between every field. */
.google-block {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

/* Solid white against the card's near-black: this is the faster path and should
   read as the primary one, and light-on-dark is Google's own button treatment. */
.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  width: 100%;
  min-height: 48px;
  padding: var(--spacing-3) var(--spacing-4);
  background: #fff;
  border: 1px solid #fff;
  border-radius: var(--radius-sm);
  color: #1f1f1f;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap),
              transform var(--duration-snap) var(--ease-snap);
}

.google-btn:hover:not(:disabled) {
  background: #ededed;
}

.google-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.google-btn:disabled {
  opacity: 0.55;
  cursor: default;
}

/* The mark keeps its size when a long label wraps. */
.google-mark {
  display: inline-flex;
  flex-shrink: 0;
}

.google-label {
  line-height: 1.2;
}

.google-note {
  margin: 0;
  text-align: center;
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
}

/* Label sitting in a gap in the hairline, so the two paths read as alternatives
   without adding another heavy block to the card. */
.or-rule {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  color: var(--text-muted);
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.2em;
  white-space: nowrap;
}

.or-rule::before,
.or-rule::after {
  content: '';
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.1);
}

@media (max-width: 480px) {
  .auth-card {
    padding: var(--spacing-6) var(--spacing-4);
    gap: var(--spacing-4);
  }

  /* 'CONTINUE WITH GOOGLE' is the longest label and has to survive 320px with
     the mark and gap alongside it, so the tracking comes in rather than wrap. */
  .google-btn {
    gap: var(--spacing-2);
    letter-spacing: 0.06em;
  }

  .or-rule {
    gap: var(--spacing-2);
    letter-spacing: 0.12em;
  }

  .auth-tagline {
    font-size: var(--text-xs);
  }

  /* Footer trio fits on one line at 360px when letter-spacing is dropped. */
  .trust-list {
    gap: var(--spacing-1);
    letter-spacing: 0.05em;
    font-size: 0.65rem;
  }
}

/* 'CONTINUE WITH GOOGLE' wraps to two lines at 320px on the tracking reduction
   alone, which leaves the mark floating beside a stacked label. One more size
   step keeps every label on a single line down to the narrowest phones. */
@media (max-width: 360px) {
  .google-btn {
    font-size: var(--text-xs);
  }
}
</style>
