<template>
  <Teleport to="body">
    <div
      ref="overlayEl"
      class="ss-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ss-title"
      tabindex="-1"
      @click.self="close"
    >
      <form class="ss-sheet" @submit.prevent="save">
        <span class="ss-grabber" aria-hidden="true"></span>
        <header class="ss-head">
          <h2 id="ss-title" class="ss-title">Your socials</h2>
          <button type="button" class="ss-close" aria-label="Close" @click="close">
            <X :size="20" :stroke-width="2" aria-hidden="true" />
          </button>
        </header>
        <p class="ss-copy">Players can tap these on your profile.</p>

        <div v-for="f in FIELDS" :key="f.network" class="ss-field">
          <label :for="`ss-${f.network}`" class="ss-label">
            <svg class="ss-brand" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path :d="f.icon" /></svg>
            {{ f.label }}
          </label>
          <div class="ss-input" :class="{ 'has-error': errors[f.network] }">
            <span class="ss-at" aria-hidden="true">@</span>
            <input
              :id="`ss-${f.network}`"
              v-model="values[f.network]"
              type="text"
              placeholder="yourname"
              autocomplete="off"
              autocapitalize="off"
              autocorrect="off"
              spellcheck="false"
              enterkeyhint="done"
              :aria-invalid="!!errors[f.network]"
              :aria-describedby="errors[f.network] ? `ss-${f.network}-error` : undefined"
              :readonly="busy"
              @input="errors[f.network] = ''"
            />
          </div>
          <p v-if="errors[f.network]" :id="`ss-${f.network}-error`" class="ss-error">{{ errors[f.network] }}</p>
        </div>

        <p v-if="saveError" class="ss-error" role="alert">{{ saveError }}</p>
        <button type="submit" class="ss-save" :disabled="busy">{{ busy ? 'SAVING…' : 'SAVE' }}</button>
      </form>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { siInstagram, siX } from 'simple-icons'
import { nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from '../stores/authStore'
import { parseHandle, type SocialNetwork } from '../utils/socialHandles'
import type { ProfileSocials } from '../composables/useProfile'
import { track } from '../utils/analytics'
import { useInertApp } from '../composables/useInertApp'

const props = defineProps<{ socials: ProfileSocials }>()
const emit = defineEmits<{ close: []; saved: [ProfileSocials] }>()

// Before the unmount hook below, so the page is awake when focus returns.
useInertApp()

const FIELDS: { network: SocialNetwork; label: string; icon: string }[] = [
  { network: 'x', label: 'X', icon: siX.path },
  { network: 'instagram', label: 'Instagram', icon: siInstagram.path },
]

const authStore = useAuthStore()
const values = reactive<Record<SocialNetwork, string>>({
  x: props.socials.x_handle ?? '',
  instagram: props.socials.instagram_handle ?? '',
})
const errors = reactive<Record<SocialNetwork, string>>({ x: '', instagram: '' })
const saveError = ref('')
const busy = ref(false)
const overlayEl = ref<HTMLElement | null>(null)

// Same contract as PhotoSheet: Escape works wherever focus is, and focus goes
// back to whatever opened the sheet.
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
  if (!busy.value) emit('close')
}

async function save() {
  if (busy.value) return
  const x = parseHandle('x', values.x)
  const instagram = parseHandle('instagram', values.instagram)
  if ('error' in x) errors.x = x.error
  if ('error' in instagram) errors.instagram = instagram.error
  if ('error' in x || 'error' in instagram) {
    await nextTick()
    document.getElementById('error' in x ? 'ss-x' : 'ss-instagram')?.focus()
    return
  }
  const uid = authStore.user?.id
  if (!uid) return
  const next: ProfileSocials = { x_handle: x.handle, instagram_handle: instagram.handle }
  busy.value = true
  saveError.value = ''
  const { error } = await supabase.from('profiles').update(next).eq('id', uid)
  busy.value = false
  if (error) {
    saveError.value = "Couldn't save. Check your connection and try again."
    return
  }
  track('profile_socials_saved', { x: !!next.x_handle, instagram: !!next.instagram_handle })
  emit('saved', next)
}
</script>

<style scoped>
.ss-overlay {
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

.ss-sheet {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  width: 100%;
  max-width: 400px;
  max-height: 100%;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--spacing-6);
  background: var(--surface-metal-dark);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  font-family: var(--font-body);
  color: var(--text-primary);
}

.ss-grabber {
  display: none;
  align-self: center;
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.18);
}

/* Phones get a bottom sheet, like the photo sheet. */
@media (max-width: 480px) {
  .ss-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .ss-sheet {
    max-width: none;
    padding-top: var(--spacing-3);
    padding-bottom: calc(var(--spacing-8) + env(safe-area-inset-bottom));
    border-radius: 20px 20px 0 0;
    border-bottom: none;
  }
  .ss-grabber {
    display: block;
  }
}

.ss-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.ss-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 400;
}

.ss-close {
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
.ss-close:hover,
.ss-close:focus-visible {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.12);
}

.ss-copy {
  margin: calc(-1 * var(--spacing-2)) 0 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.ss-field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.ss-label {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-secondary);
}

.ss-brand {
  width: 14px;
  height: 14px;
}

.ss-input {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  height: 52px;
  padding: 0 var(--spacing-4);
  border: 1px solid #2a2d31;
  border-radius: var(--radius-md);
  background: var(--bg-concrete);
  transition: border-color var(--duration-snap) var(--ease-snap);
}
.ss-input:focus-within {
  border-color: var(--focus-ring-color);
}
.ss-input.has-error {
  border-color: var(--color-alert);
}

.ss-at {
  font-size: var(--text-base);
  color: var(--text-muted);
}

.ss-input input {
  flex: 1;
  min-width: 0;
  height: 100%;
  border: none;
  outline: none;
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-base);
  color: var(--text-primary);
}
.ss-input input::placeholder {
  color: var(--text-muted);
}

.ss-error {
  margin: 0;
  font-size: var(--text-sm);
  color: color-mix(in srgb, var(--color-alert) 70%, white);
}

.ss-save {
  min-height: 52px;
  margin-top: var(--spacing-2);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--text-primary);
  color: var(--bg-concrete);
  font-family: var(--font-display);
  font-size: var(--text-base);
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap), opacity var(--duration-snap) var(--ease-snap);
}
.ss-save:hover:not(:disabled),
.ss-save:focus-visible {
  background: #fff;
}
.ss-save:disabled {
  opacity: 0.6;
  cursor: wait;
}
</style>
