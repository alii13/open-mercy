<template>
  <!-- Two taps, no dialog. Blocking deletes the friendship, and the button
       sits in reach of every thumb on a touch device. -->
  <button
    class="fm-toggle"
    :aria-expanded="open"
    :aria-label="`More for ${friend.username}`"
    @click="$emit('toggle')"
  >
    <MoreHorizontal :size="16" :stroke-width="2" aria-hidden="true" />
  </button>
  <!-- The destructive pair lives behind the toggle: hover cannot carry them on
       a phone, and keeping them in the row squeezed the name to an ellipsis on
       a 390px screen. -->
  <div v-if="open" class="fm-row">
    <button
      class="fm-btn"
      :class="{ 'fm-btn--danger': confirming === `remove:${friend.user_id}` }"
      @click="$emit('arm', `remove:${friend.user_id}`, () => social.remove(friend.user_id))"
    >{{ confirming === `remove:${friend.user_id}` ? 'Confirm?' : 'Remove friend' }}</button>
    <button
      class="fm-btn"
      :class="{ 'fm-btn--danger': confirming === `block:${friend.user_id}` }"
      @click="$emit('arm', `block:${friend.user_id}`, () => social.block(friend.user_id))"
    >{{ confirming === `block:${friend.user_id}` ? 'Confirm?' : 'Block' }}</button>
  </div>
</template>

<script setup lang="ts">
import { MoreHorizontal } from 'lucide-vue-next'
import { useSocialStore, type FriendRow } from '../stores/socialStore'

defineProps<{ friend: FriendRow, open: boolean, confirming: string | null }>()
defineEmits<{
  (e: 'toggle'): void
  (e: 'arm', key: string, action: () => void): void
}>()

const social = useSocialStore()
</script>

<style scoped>
.fm-toggle {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--text-muted);
  cursor: pointer;
}

.fm-toggle:hover,
.fm-toggle[aria-expanded='true'] {
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-primary);
}

/* Drops to its own line inside the row (the row wraps). */
.fm-row {
  flex-basis: 100%;
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-2);
}

.fm-btn {
  min-height: 36px;
  padding: 0 var(--spacing-3);
  background: rgba(255, 255, 255, 0.04);
  border: none;
  border-radius: var(--radius-sm);
  font-family: var(--font-body);
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.fm-btn:hover {
  color: var(--text-primary);
}

.fm-btn--danger,
.fm-btn--danger:hover {
  background: rgba(255, 42, 42, 0.12);
  color: #ff6666;
}
</style>
