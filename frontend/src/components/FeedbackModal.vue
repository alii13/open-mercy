<template>
  <Modal aria-label="Send feedback" @close="$emit('close')">
    <div class="feedback-card">
      <header class="feedback-header">
        <h3 class="feedback-title">SEND FEEDBACK</h3>
        <button class="close-btn" @click="$emit('close')" aria-label="Close"><X :size="16" :stroke-width="2" aria-hidden="true" /></button>
      </header>

      <template v-if="!submitted">
        <p class="feedback-desc">
          Found a bug? Got an idea? Want to say hi? Drop a message — we read everything.
        </p>

        <form class="feedback-form" @submit.prevent="submit">
          <label class="field">
            <span class="field-label">MESSAGE</span>
            <textarea
              v-model="message"
              v-focus-ring
              class="field-input field-textarea"
              placeholder="Tell us anything…"
              required
              :disabled="submitting"
              maxlength="2000"
              rows="5"
            ></textarea>
          </label>

          <label class="field">
            <span class="field-label">EMAIL (OPTIONAL)</span>
            <input
              v-model="email"
              v-focus-ring
              type="email"
              class="field-input"
              placeholder="So we can reply"
              :disabled="submitting"
            />
          </label>
          <p class="field-note">
            Optional, and only used to reply to you. See the
            <a href="/privacy/">Privacy policy</a>.
          </p>

          <p v-if="error" class="msg msg-error">{{ error }}</p>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            block
            :disabled="submitting || !message.trim()"
          >
            {{ submitting ? 'SENDING...' : 'SEND' }}
          </Button>
        </form>
      </template>

      <template v-else>
        <div class="success-state">
          <CircleCheck :size="40" :stroke-width="2" aria-hidden="true" />
          <h4 class="success-title">FEEDBACK SENT</h4>
          <p class="success-desc">Thanks for taking the time. We appreciate it.</p>
          <Button variant="primary" size="md" @click="$emit('close')">CLOSE</Button>
        </div>
      </template>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { CircleCheck, X } from 'lucide-vue-next'
import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { vFocusRing } from '../directives/focusRing'
import Modal from './ui/Modal.vue'
import Button from './ui/Button.vue'

defineEmits<{
  (e: 'close'): void
}>()

const authStore = useAuthStore()

const message = ref('')
const email = ref('')
const submitting = ref(false)
const submitted = ref(false)
const error = ref('')

async function submit() {
  if (!message.value.trim()) return
  submitting.value = true
  error.value = ''

  const payload = {
    message: message.value.trim(),
    email: email.value.trim() || null,
    user_id: authStore.user?.id || null,
    page: window.location.pathname + window.location.hash,
    user_agent: navigator.userAgent,
  }

  try {
    const { error: dbError } = await supabase.from('feedback').insert(payload)
    if (dbError) throw dbError

    fetch('https://formsubmit.co/ajax/shekhaliul44@gmail.com', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        _subject: 'Open Mercy - New feedback',
        _template: 'box',
        message: payload.message,
        reply_to: payload.email || 'no-reply@open-mercy.com',
        user_id: payload.user_id || 'guest',
        page: payload.page,
        user_agent: payload.user_agent,
      }),
    }).catch(() => { /* email is best-effort; supabase is source of truth */ })

    submitted.value = true
  } catch (e: any) {
    error.value = e?.message || 'Could not send feedback. Try again?'
  } finally {
    submitting.value = false
  }
}
</script>

<style scoped>
.feedback-card {
  background: linear-gradient(180deg, #18191b 0%, #0a0a0b 100%);
  border: 1px solid rgba(255, 204, 0, 0.18);
  border-radius: var(--radius-md);
  padding: var(--spacing-6);
  width: 100%;
  max-width: 480px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  box-shadow: 0 0 40px rgba(255, 204, 0, 0.08);
}

.feedback-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px dashed rgba(255, 255, 255, 0.08);
  padding-bottom: var(--spacing-3);
}

.feedback-title {
  font-family: var(--font-display);
  color: var(--color-hazard);
  margin: 0;
  font-size: var(--text-lg);
  letter-spacing: 0.15em;
}

.close-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-muted);
  font-size: var(--text-xl);
  line-height: 1;
  cursor: pointer;
  padding: 0;
  width: 32px;
  height: 32px;
  border-radius: var(--radius-sm);
  transition:
    border-color var(--duration-snap) var(--ease-snap),
    color var(--duration-snap) var(--ease-snap);
}

.close-btn:hover {
  border-color: var(--color-alert);
  color: var(--color-alert);
}

.feedback-desc {
  font-size: var(--text-sm);
  color: var(--text-secondary);
  margin: 0;
  line-height: 1.5;
}

.feedback-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.field-note {
  margin: calc(-1 * var(--spacing-2)) 0 0;
  font-size: var(--text-xs);
  line-height: 1.5;
  color: var(--text-secondary);
}

.field-note a {
  color: var(--text-primary);
  text-decoration: underline;
}

.field-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.18em;
}

.field-input {
  width: 100%;
  padding: var(--spacing-3);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-snap) var(--ease-snap);
  min-height: 44px;
}

.field-textarea {
  resize: vertical;
  min-height: 100px;
  font-family: var(--font-body);
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

.success-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: var(--spacing-3);
  padding: var(--spacing-6) 0;
  color: var(--color-neon-green);
}

.success-title {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  margin: 0;
  letter-spacing: 0.15em;
}

.success-desc {
  color: var(--text-secondary);
  font-size: var(--text-sm);
  margin: 0;
}

@media (max-width: 480px) {
  .feedback-card {
    padding: var(--spacing-4);
  }

  .feedback-title {
    font-size: var(--text-base);
  }
}
</style>
