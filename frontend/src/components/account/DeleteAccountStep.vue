<template>
  <div class="del" :class="{ 'del--wide': wide }">
    <h2 class="del-title">Delete your account?</h2>
    <p class="del-sub">This can't be undone. These go for good:</p>
    <ul class="del-list">
      <li v-for="item in LOSES" :key="item" class="del-item">
        <span class="del-x" aria-hidden="true"><X :size="14" :stroke-width="2" /></span>
        {{ item }}
      </li>
    </ul>

    <label class="del-label" for="del-confirm">Type <strong>{{ name }}</strong> to confirm</label>
    <input
      id="del-confirm"
      v-model="typed"
      class="del-input"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      @keyup.enter="confirm"
    />
    <p v-if="failed" class="del-error" role="alert">We couldn't delete your account. Try again in a minute.</p>

    <div class="del-actions">
      <template v-if="wide">
        <button type="button" class="del-keep" @click="$emit('keep')">Keep my account</button>
        <button type="button" class="del-go" :disabled="!matches || busy" @click="confirm">{{ busy ? 'DELETING…' : 'DELETE FOREVER' }}</button>
      </template>
      <template v-else>
        <button type="button" class="del-go" :disabled="!matches || busy" @click="confirm">{{ busy ? 'DELETING…' : 'DELETE FOREVER' }}</button>
        <button type="button" class="del-keep" @click="$emit('keep')">Keep my account</button>
      </template>
    </div>
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { computed, ref } from 'vue'
import { useAuthStore } from '../../stores/authStore'

defineProps<{ wide?: boolean }>()
defineEmits<{ keep: [] }>()

// What supabase/delete-account.sql and the photo cleanup actually remove.
const LOSES = ['Your name, profile and photo', 'Every game, stat and badge', 'Your friends list']

const authStore = useAuthStore()
const name = computed(() => authStore.username)
const typed = ref('')
const busy = ref(false)
const failed = ref(false)

// Case and stray spaces don't count: the point is a deliberate act, not a typing test.
const matches = computed(() => typed.value.trim().toLowerCase() === name.value.toLowerCase())

async function confirm() {
  if (!matches.value || busy.value) return
  busy.value = true
  failed.value = false
  const res = await authStore.deleteAccount()
  busy.value = false
  // Success signs the player out, which closes the modal. A closed Apple sheet
  // also returns false but sets no notice: that player changed their mind.
  if (!res.success && authStore.authNotice) failed.value = true
}
</script>

<style scoped>
.del {
  display: flex;
  flex-direction: column;
  text-align: left;
}

.del-title {
  margin: 0 0 var(--spacing-2);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1.2;
  color: var(--text-primary);
}

.del-sub {
  margin: 0 0 var(--spacing-4);
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.del-list {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  margin: 0 0 var(--spacing-6);
  padding: 0;
  list-style: none;
}

.del-item {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  font-size: var(--text-base);
  color: var(--text-primary);
}

.del-x {
  flex-shrink: 0;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-alert) 14%, transparent);
  color: color-mix(in srgb, var(--color-alert) 75%, white);
}

.del-label {
  margin-bottom: var(--spacing-2);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.del-label strong {
  color: var(--text-primary);
}

.del-input {
  min-height: 48px;
  padding: 0 var(--spacing-4);
  border-radius: var(--radius-lg);
  border: 1px solid var(--surface-metal);
  background: var(--bg-concrete);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
}

.del-error {
  margin: var(--spacing-2) 0 0;
  font-size: var(--text-sm);
  color: color-mix(in srgb, var(--color-alert) 75%, white);
}

.del-actions {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  margin-top: var(--spacing-6);
}

.del--wide .del-actions {
  flex-direction: row;
  justify-content: flex-end;
  align-items: center;
  gap: var(--spacing-3);
}

.del-go {
  min-height: 48px;
  padding: 0 var(--spacing-6);
  border: none;
  border-radius: var(--radius-lg);
  background: var(--color-alert);
  color: #fff;
  font-family: var(--font-display);
  font-size: var(--text-base);
  letter-spacing: 0.06em;
  cursor: pointer;
}

.del-go:disabled {
  opacity: 0.4;
  cursor: default;
}

.del-keep {
  min-height: 48px;
  padding: 0 var(--spacing-3);
  border: none;
  background: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 600;
  cursor: pointer;
}

@media (prefers-reduced-motion: no-preference) {
  .del-go {
    transition: scale var(--duration-snap) var(--ease-snap), opacity var(--duration-snap) var(--ease-snap);
  }
  .del-go:not(:disabled):active {
    scale: 0.96;
  }
}
</style>
