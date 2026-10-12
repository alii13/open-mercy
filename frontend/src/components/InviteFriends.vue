<template>
  <!-- Nothing to show is the common case at this traffic, and an empty
       "invite your friends" box in a room you are already sitting alone in
       is a reminder that nobody is there. -->
  <section v-if="rows.length" class="inv">
    <div class="inv-head">
      <span>Invite friends</span>
      <span v-if="tracking" class="inv-live">Live</span>
    </div>
    <ul class="inv-card">
      <li v-for="f in rows" :key="f.user_id" class="inv-row">
        <Badge
          v-if="badges[f.user_id]"
          :badge="badges[f.user_id]!.badge"
          :points="badges[f.user_id]!.points"
          :progress="badges[f.user_id]!.progress"
          size="mark"
          class="inv-shield"
          :class="{ 'inv-shield--away': state(f.user_id) === 'missed' || state(f.user_id) === 'declined' }"
          :style="{ '--emblem-size': '36px' }"
        />
        <span v-else class="inv-shield-gap" aria-hidden="true" />
        <div class="inv-who">
          <span class="inv-name">{{ f.username }}</span>
          <span class="inv-hint" :class="{ 'inv-hint--warn': !!errors[f.user_id] }">{{ hint(f) }}</span>
        </div>

        <span v-if="state(f.user_id) === 'waiting'" class="inv-state inv-state--waiting">
          <span class="inv-pulse" aria-hidden="true" />Invited
        </span>
        <button
          v-else-if="(state(f.user_id) === 'missed' || state(f.user_id) === 'declined') && againOk(f.user_id)"
          class="inv-again"
          :disabled="pending.has(f.user_id)"
          @click="invite(f.user_id)"
        >
          <RotateCw :size="14" :stroke-width="2" aria-hidden="true" />
          {{ pending.has(f.user_id) ? '…' : 'Invite again' }}
        </button>
        <Button
          v-else-if="state(f.user_id) === 'none'"
          variant="primary"
          size="sm"
          :disabled="pending.has(f.user_id) || !!errors[f.user_id]"
          @click="invite(f.user_id)"
        >{{ pending.has(f.user_id) ? '…' : 'INVITE' }}</Button>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { RotateCw } from 'lucide-vue-next'
import { supabase } from '../lib/supabase'
import { useSocialStore } from '../stores/socialStore'
import { useInviteStore } from '../stores/inviteStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { byPresence, presenceState } from '../utils/relativeTime'
import { inviteStatus, canInviteAgain, type SentInvite, type InviteStatus } from '../utils/inviteStatus'
import { hasLiveSession } from '../utils/liveSession'
import { isFatalSchemaError } from '../utils/supabaseErrors'
import { useNow, usePoll } from '../composables/useClock'
import { useBadges } from '../composables/useBadges'
import Badge from './Badge.vue'
import Button from './ui/Button.vue'

const social = useSocialStore()
const invitesStore = useInviteStore()
const mpStore = useMultiplayerStore()
const { badges, fetchBadges } = useBadges()
const now = useNow()
const pending = ref<Set<string>>(new Set())
/** Why an invite did not go out, per friend. */
const errors = ref<Record<string, string>>({})

onMounted(() => { void social.refresh() })

// What the host sent from this room, read back from the database: the status
// survives a reload and reflects what the receiver actually did.
const sentInvites = ref<Record<string, SentInvite>>({})
const tracking = ref(true)

async function readSent(): Promise<void> {
  const code = mpStore.roomCode
  if (!tracking.value || !code) return
  try {
    if (!(await hasLiveSession())) return
    const { data, error } = await supabase.rpc('my_sent_invites', { p_code: code })
    if (error) {
      // Until invites-sent.sql runs, the card still invites - it just cannot
      // say what happened next.
      if (isFatalSchemaError(error)) tracking.value = false
      return
    }
    const next: Record<string, SentInvite> = {}
    for (const r of (data ?? []) as (SentInvite & { to_user: string })[]) next[r.to_user] = r
    sentInvites.value = next
  } catch { /* keep the last statuses on screen */ }
}

onMounted(() => { void readSent() })
watch(() => mpStore.roomCode, () => { sentInvites.value = {}; void readSent() })
usePoll(() => { void readSent() }, 15_000)

const seated = computed(() => new Set(mpStore.presentUserIds))

// Green and amber, not green alone. An invite lives ten minutes, so someone
// who stepped away six minutes ago is exactly who it is for - filtering on
// "online" threw away half the point of having a middle state. Someone last
// seen an hour ago still gets nothing: that is a notification they would read
// tomorrow, in a room that died ten minutes after it was sent.
// Anyone already invited stays on the list whatever their presence, so the
// host can see how it went. Someone sitting at the table is not someone to
// invite to it.
const rows = computed(() => {
  if (social.unavailable || invitesStore.unavailable) return []
  return byPresence(social.friends)
    .filter(f => !seated.value.has(f.user_id)
      && (sentInvites.value[f.user_id] || presenceState(f.last_seen_at) !== 'offline'))
    .slice(0, 6)
})

watch(() => rows.value.map(r => r.user_id).join(','), () => {
  void fetchBadges(rows.value.map(r => r.user_id))
}, { immediate: true })

function state(userId: string): InviteStatus {
  return inviteStatus(sentInvites.value[userId], now.value, seated.value.has(userId))
}

function againOk(userId: string): boolean {
  return canInviteAgain(sentInvites.value[userId], now.value)
}

function hint(f: { user_id: string, last_seen_at: string | null }): string {
  const err = errors.value[f.user_id]
  if (err) return err
  switch (state(f.user_id)) {
    case 'waiting': return 'Waiting for them to join'
    case 'declined': return againOk(f.user_id) ? 'Said not now' : 'Said not now · ask again in a few minutes'
    case 'missed': return 'Missed it'
    default: return presenceState(f.last_seen_at) === 'online' ? 'Online' : 'Just stepped away'
  }
}

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
  if (result === 'sent') {
    // Shown at once; the read that follows replaces it with the real row.
    sentInvites.value = { ...sentInvites.value, [userId]: { created_at: new Date().toISOString(), seen_at: null } }
    void readSent()
    return
  }
  const why = result === 'too_soon' ? 'Already asked - try again in a few minutes'
    : result === 'rate_limited' ? 'Too many invites this hour'
    : result === 'blocked' ? "Can't invite this player"
    : 'Could not send - try again'
  errors.value = { ...errors.value, [userId]: why }
  // A plain failure has to stay retryable, so it clears itself.
  if (why === 'Could not send - try again') {
    setTimeout(() => {
      const next = { ...errors.value }
      delete next[userId]
      errors.value = next
    }, 2500)
  }
}
</script>

<style scoped>
/* The lobby's "Or jump in" card: one surface, hairline dividers. */
.inv {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-top: var(--spacing-2);
}

.inv-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-1) var(--spacing-2);
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.inv-live {
  font-size: 0.75rem;
  color: var(--text-muted);
}

.inv-card {
  list-style: none;
  margin: 0;
  padding: var(--spacing-2);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
}

.inv-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 60px;
  padding: var(--spacing-2) var(--spacing-3);
}

.inv-row + .inv-row {
  box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.055);
}

.inv-shield {
  flex: none;
}

.inv-shield--away {
  opacity: 0.5;
}

.inv-shield-gap {
  flex: none;
  width: 36px;
  height: 36px;
}

.inv-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
  text-align: left;
}

.inv-name {
  font-family: var(--font-body);
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.inv-hint {
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.inv-hint--warn {
  color: var(--color-hazard);
}

.inv-state {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
}

.inv-state--waiting {
  color: var(--color-neon-green);
}

.inv-pulse {
  width: 7px;
  height: 7px;
  border-radius: 999px;
  background: var(--color-neon-green);
  box-shadow: 0 0 10px var(--color-neon-green);
  animation: inv-pulse 1.6s ease-in-out infinite;
}

@keyframes inv-pulse {
  50% { opacity: 0.35; }
}

@media (prefers-reduced-motion: reduce) {
  .inv-pulse { animation: none; }
}

.inv-again {
  flex: none;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  padding: 0 var(--spacing-2);
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
}

.inv-again svg {
  color: var(--text-secondary);
}

.inv-again:hover:not(:disabled) {
  color: var(--color-neon-blue);
}
</style>
