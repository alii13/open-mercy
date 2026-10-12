<template>
  <!-- Nothing to show is the common case at this traffic, and an empty
       "invite your friends" box in a room you are already sitting alone in
       is a reminder that nobody is there. -->
  <section v-if="online.length" class="inv">
    <span class="inv-label">FRIENDS AROUND</span>
    <ul class="inv-list">
      <li v-for="f in online" :key="f.user_id" class="inv-row">
        <PresenceDot :last-seen-at="f.last_seen_at" />
        <span class="inv-name">{{ f.username }}</span>
        <button
          class="inv-btn"
          :disabled="pending.has(f.user_id) || !!sent[f.user_id]"
          @click="invite(f.user_id)"
        >{{ sent[f.user_id] ?? 'INVITE' }}</button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useSocialStore } from '../stores/socialStore'
import { useInviteStore } from '../stores/inviteStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { byPresence, presenceState } from '../utils/relativeTime'
import PresenceDot from './PresenceDot.vue'

const social = useSocialStore()
const invitesStore = useInviteStore()
const mpStore = useMultiplayerStore()
const sent = ref<Record<string, string>>({})
const pending = ref<Set<string>>(new Set())

onMounted(() => { void social.refresh() })

// Green and amber, not green alone. An invite lives ten minutes, so someone
// who stepped away six minutes ago is exactly who it is for - filtering on
// "online" threw away half the point of having a middle state. Someone last
// seen an hour ago still gets nothing: that is a notification they would read
// tomorrow, in a room that died ten minutes after it was sent.
// Someone already sitting at this table is not someone to invite to it.
const online = computed(() => {
  if (social.unavailable || invitesStore.unavailable) return []
  const seated = new Set(mpStore.presentUserIds)
  return byPresence(social.friends)
    .filter(f => !seated.has(f.user_id) && presenceState(f.last_seen_at) !== 'offline')
    .slice(0, 6)
})

async function invite(userId: string) {
  if (pending.value.has(userId)) return
  pending.value = new Set(pending.value).add(userId)
  // Through the room, not through Supabase: the socket is what proves this
  // player is actually sitting in the room they are inviting to.
  let result: string
  try {
    result = await mpStore.sendInvite(userId)
  } finally {
    const next = new Set(pending.value)
    next.delete(userId)
    pending.value = next
  }
  sent.value = {
    ...sent.value,
    [userId]: result === 'sent' ? 'INVITED'
      : result === 'too_soon' ? 'ALREADY ASKED'
      : result === 'rate_limited' ? 'TOO MANY'
      : result === 'blocked' ? 'BLOCKED'
      : 'TRY AGAIN',
  }
  // TRY AGAIN has to stay pressable, so it clears itself.
  if (!['INVITED', 'ALREADY ASKED', 'TOO MANY', 'BLOCKED'].includes(sent.value[userId]!)) {
    setTimeout(() => {
      const next = { ...sent.value }
      delete next[userId]
      sent.value = next
    }, 2000)
  }
}
</script>

<style scoped>
.inv {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  width: 100%;
  margin-top: var(--spacing-2);
}

.inv-label {
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.22em;
  color: var(--text-muted);
}

.inv-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.inv-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-2);
  background: rgba(0, 243, 255, 0.04);
  border: 1px solid rgba(0, 243, 255, 0.16);
  border-radius: var(--radius-sm);
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.8rem;
}

.inv-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
}

.inv-btn {
  flex: none;
  padding: 2px 8px;
  background: transparent;
  border: 1px solid rgba(0, 243, 255, 0.4);
  border-radius: var(--radius-sm);
  color: var(--color-neon-blue);
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.12em;
  cursor: pointer;
}

.inv-btn:hover:not(:disabled) {
  background: rgba(0, 243, 255, 0.1);
}

.inv-btn:disabled {
  opacity: 0.6;
  cursor: default;
}
</style>
