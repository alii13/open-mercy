<template>
  <div class="ai" :class="{ 'ai--wide': wide }">
    <div v-if="!hideAvatar" class="ai-avatar">
      <Avatar :uid="authStore.user?.id" :name="authStore.username" :size="wide ? 128 : 96" />
      <button
        v-if="avatarsAvailable"
        type="button"
        class="ai-photo"
        aria-label="Change profile photo"
        @click="$emit('photo')"
      >
        <Camera :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>

    <div class="ai-name">
      <input
        v-if="editing"
        ref="inputEl"
        v-model="draft"
        class="ai-name-input"
        :class="{ 'has-error': error }"
        maxlength="20"
        aria-label="Your name"
        :aria-invalid="!!error"
        aria-describedby="ai-name-error"
        @input="error = ''; suggestions = []"
        @keyup.enter="save"
        @keyup.esc="cancel"
        @blur="onBlur"
      />
      <button v-else type="button" class="ai-name-btn" aria-label="Edit your name" @click="startEdit">
        <span class="ai-name-text">{{ authStore.username }}</span>
        <Pencil :size="16" :stroke-width="2" aria-hidden="true" />
      </button>
      <p v-if="error" id="ai-name-error" class="ai-error" role="alert">{{ error }}</p>
      <div v-if="suggestions.length" class="ai-suggest">
        <span class="ai-suggest-label">Free:</span>
        <button
          v-for="s in suggestions"
          :key="s"
          type="button"
          class="ai-suggestion"
          @mousedown.prevent
          @click="applySuggestion(s)"
        >{{ s }}</button>
      </div>
    </div>

    <p class="ai-status">{{ status }}</p>

    <template v-if="authStore.isAnonymous && !hideClaim">
      <button type="button" class="ai-claim" @click="$emit('claim')">
        {{ authStore.claimPending ? 'CONFIRM YOUR EMAIL' : 'CLAIM ACCOUNT' }}
      </button>
      <p class="ai-claim-note">Keep your stats on any device</p>
    </template>
    <button
      v-else-if="wide && !authStore.isAnonymous && authStore.profile?.share_code"
      type="button"
      class="ai-link"
      @click="$emit('viewProfile')"
    >
      View public profile
      <ArrowUpRight :size="14" :stroke-width="2" aria-hidden="true" />
    </button>
  </div>
</template>

<script setup lang="ts">
import { ArrowUpRight, Camera, Pencil } from 'lucide-vue-next'
import { computed, nextTick, ref } from 'vue'
import Avatar from '../Avatar.vue'
import { useAuthStore } from '../../stores/authStore'
import { useMultiplayerStore } from '../../stores/multiplayerStore'
import { avatarsAvailable } from '../../composables/useAvatars'
import { track } from '../../utils/analytics'

defineProps<{
  wide?: boolean
  hideClaim?: boolean
  /** The desktop Profile tab shows the photo editor instead. */
  hideAvatar?: boolean
}>()
defineEmits<{ claim: []; viewProfile: []; photo: [] }>()

const authStore = useAuthStore()
const mpStore = useMultiplayerStore()

const PROVIDERS: Record<string, string> = { google: 'Google', apple: 'Apple', email: 'email' }
const status = computed(() => {
  if (authStore.isAnonymous) return 'Guest · saved on this device only'
  const provider = String(authStore.user?.app_metadata?.provider ?? '')
  return PROVIDERS[provider] ? `Signed in with ${PROVIDERS[provider]}` : 'Signed in'
})

const editing = ref(false)
const draft = ref('')
const error = ref('')
const suggestions = ref<string[]>([])
const inputEl = ref<HTMLInputElement | null>(null)

function startEdit() {
  error.value = ''
  draft.value = authStore.username && authStore.username !== 'Player' ? authStore.username : ''
  editing.value = true
  void nextTick(() => inputEl.value?.focus())
}

function cancel() {
  editing.value = false
  error.value = ''
  suggestions.value = []
}

// A blur after a rejection means the player is walking away from the name,
// not asking again with the same one.
function onBlur() {
  if (error.value) { cancel(); return }
  void save()
}

function applySuggestion(name: string) {
  track('rename_suggestion_taken')
  draft.value = name
  error.value = ''
  suggestions.value = []
  void save()
}

async function save() {
  if (!editing.value) return
  const name = draft.value.trim()
  if (!name || name === authStore.username) { cancel(); return }

  const res = await authStore.updateUsername(name)
  if (!res.success) {
    error.value = res.error || 'Could not save that name'
    suggestions.value = await authStore.suggestUsernames(name)
    if (suggestions.value.length) track('rename_suggestions_shown', { count: suggestions.value.length })
    return
  }
  cancel()
  // Only once the profile took the name, or the seat and the profile disagree.
  if (mpStore.currentGame) await mpStore.updateMyName(name)
}
</script>

<style scoped>
.ai {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-3);
  text-align: center;
}

.ai-avatar {
  position: relative;
}

.ai-photo {
  position: absolute;
  right: -2px;
  bottom: -2px;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  border: none;
  background: var(--text-primary);
  color: var(--bg-concrete);
  box-shadow: 0 0 0 3px var(--bg-concrete-light);
  cursor: pointer;
}

.ai-photo::before {
  content: '';
  position: absolute;
  inset: -4px;
}

.ai-name {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-2);
  width: 100%;
}

.ai-name-btn,
.ai-name-input {
  min-height: 44px;
  max-width: 100%;
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  color: var(--text-primary);
}

.ai-name-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: 0 var(--spacing-3);
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
}

.ai--wide .ai-name-btn {
  border-color: var(--surface-metal);
  background: var(--bg-concrete);
  font-size: var(--text-xl);
}

.ai-name-btn svg {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.ai-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ai-name-input {
  width: 100%;
  padding: 0 var(--spacing-3);
  border: 1px solid var(--surface-metal);
  background: var(--bg-concrete);
  text-align: center;
}

.ai-name-input.has-error {
  border-color: var(--color-alert);
}

.ai-error {
  margin: 0;
  font-size: var(--text-sm);
  color: color-mix(in srgb, var(--color-alert) 75%, white);
}

.ai-suggest {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  align-items: center;
  gap: var(--spacing-2);
}

.ai-suggest-label {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.ai-suggestion {
  min-height: 32px;
  padding: 0 var(--spacing-3);
  border-radius: var(--radius-pill);
  border: 1px solid var(--surface-metal);
  background: var(--surface-metal-dark);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  cursor: pointer;
}

.ai-status {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.ai-claim {
  min-height: 48px;
  margin-top: var(--spacing-2);
  padding: 0 var(--spacing-6);
  border: none;
  border-radius: var(--radius-lg);
  background: var(--color-hazard);
  color: var(--bg-concrete);
  font-family: var(--font-display);
  font-size: var(--text-base);
  letter-spacing: 0.06em;
  cursor: pointer;
}

.ai-claim-note {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.ai-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  min-height: 44px;
  padding: 0 var(--spacing-3);
  border: none;
  background: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.04em;
  cursor: pointer;
}

@media (hover: hover) {
  .ai-name-btn:hover { border-color: var(--surface-metal); }
  .ai-link:hover { color: var(--color-neon-blue); }
}

@media (prefers-reduced-motion: no-preference) {
  .ai-claim,
  .ai-photo {
    transition: scale var(--duration-snap) var(--ease-snap);
  }
  .ai-claim:active,
  .ai-photo:active {
    scale: 0.96;
  }
}
</style>
