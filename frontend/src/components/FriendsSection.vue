<template>
  <!-- Hidden entirely until friends.sql is run: an empty panel that cannot
       work is worse than no panel. -->
  <section v-if="!social.unavailable" class="fs">
    <!-- No friends yet but a request waiting: the request is the page. -->
    <div v-if="social.friends.length || !social.incoming.length" class="fs-main">
      <div v-if="online.length" class="fs-group">
        <div class="fs-label">
          <span>Online now</span>
          <span class="fs-live"><span class="fs-live-dot" aria-hidden="true" />{{ online.length }} ONLINE</span>
        </div>
        <ul class="fs-card">
          <li v-for="f in online" :key="f.user_id" class="fs-row">
            <Badge v-if="badges[f.user_id]" v-bind="badgeProps(f)" :presence="f.last_seen_at" size="mark" class="fs-shield" :style="{ '--emblem-size': '44px' }" />
            <span v-else class="fs-shield-gap" aria-hidden="true" />
            <div class="fs-who">
              <button class="fs-name" @click="openProfile(f)">{{ f.username }}</button>
              <span class="fs-status">{{ onlineLabel(f) }}</span>
            </div>
            <Button
              variant="primary"
              size="sm"
              :disabled="busy === f.user_id || !!asked[f.user_id]"
              @click="play(f)"
            >{{ asked[f.user_id] ?? (busy === f.user_id ? '…' : 'PLAY') }}</Button>
            <FriendMore :friend="f" :open="menuFor === f.user_id" :confirming="confirming" @toggle="toggleMenu(f.user_id)" @arm="arm" />
          </li>
        </ul>
      </div>

      <div v-if="offline.length" class="fs-group">
        <div class="fs-label"><span>Offline</span></div>
        <ul class="fs-card">
          <li v-for="f in offline" :key="f.user_id" class="fs-row fs-row--away">
            <Badge v-if="badges[f.user_id]" v-bind="badgeProps(f)" size="mark" class="fs-shield fs-shield--away" :style="{ '--emblem-size': '44px' }" />
            <span v-else class="fs-shield-gap" aria-hidden="true" />
            <div class="fs-who">
              <button class="fs-name" @click="openProfile(f)">{{ f.username }}</button>
              <span class="fs-status">{{ seenLabel(f) }}</span>
            </div>
            <button
              class="fs-text-btn"
              :disabled="busy === f.user_id || !!asked[f.user_id]"
              @click="play(f)"
            >
              <Send :size="16" :stroke-width="2" aria-hidden="true" />
              {{ titleCase(asked[f.user_id] ?? 'INVITE') }}
            </button>
            <FriendMore :friend="f" :open="menuFor === f.user_id" :confirming="confirming" @toggle="toggleMenu(f.user_id)" @arm="arm" />
          </li>
        </ul>
      </div>

      <p v-if="!social.friends.length && !social.incoming.length" class="fs-empty">
        No friends yet. The quickest way in is the game-over screen - add whoever you just played.
      </p>
    </div>

    <aside v-if="social.incoming.length || social.outgoing.length || social.blocked.length" class="fs-side">
      <!-- Requests first: they are the only rows that need an answer. -->
      <div v-if="social.incoming.length" class="fs-group">
        <div class="fs-label">
          <span>Wants to be friends</span>
          <span class="fs-count">{{ social.incoming.length }}</span>
        </div>
        <div class="fs-requests">
          <div v-for="r in social.incoming" :key="r.user_id" class="fs-request">
            <div class="fs-request-head">
              <Badge v-if="badges[r.user_id]" v-bind="badgeProps(r)" size="mark" :style="{ '--emblem-size': '56px' }" />
              <div class="fs-who">
                <button class="fs-name fs-name--lg" @click="openProfile(r)">{{ r.username }}</button>
                <span class="fs-status">Asked {{ askedAgo(r) }}</span>
              </div>
            </div>
            <div class="fs-request-actions">
              <Button variant="hazard" size="sm" class="fs-accept" @click="social.respond(r.user_id, true)">ACCEPT</Button>
              <button class="fs-text-btn" @click="social.respond(r.user_id, false)">Decline</button>
            </div>
          </div>
        </div>
      </div>

      <div v-if="social.outgoing.length" class="fs-group">
        <div class="fs-label"><span>Waiting on a reply</span></div>
        <ul class="fs-card">
          <li v-for="o in social.outgoing" :key="o.user_id" class="fs-row fs-row--compact">
            <Badge v-if="badges[o.user_id]" v-bind="badgeProps(o)" size="mark" :style="{ '--emblem-size': '34px' }" />
            <div class="fs-who">
              <button class="fs-name" @click="openProfile(o)">{{ o.username }}</button>
              <span class="fs-status">Asked {{ askedAgo(o) }}</span>
            </div>
            <button class="fs-text-btn fs-text-btn--quiet" @click="social.remove(o.user_id)">Cancel</button>
          </li>
        </ul>
      </div>

      <details v-if="social.blocked.length" class="fs-blocked">
        <summary>Blocked ({{ social.blocked.length }})</summary>
        <p class="fs-blocked-note">A blocked player cannot invite you or send you a request.</p>
        <ul class="fs-card">
          <li v-for="b in social.blocked" :key="b.user_id" class="fs-row fs-row--compact">
            <div class="fs-who"><span class="fs-name">{{ b.username }}</span></div>
            <button class="fs-text-btn" @click="social.unblock(b.user_id)">Unblock</button>
          </li>
        </ul>
      </details>
    </aside>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { Send } from 'lucide-vue-next'
import { useSocialStore, type FriendRow } from '../stores/socialStore'
import { isOnline, relativeTime, byPresence } from '../utils/relativeTime'
import { useNow, usePoll } from '../composables/useClock'
import { useBadges } from '../composables/useBadges'
import { usePlayWithFriend } from '../composables/usePlayWithFriend'
import Badge from './Badge.vue'
import Button from './ui/Button.vue'
import FriendMore from './FriendMore.vue'
import { navigate } from '../utils/routes'

const social = useSocialStore()
const emit = defineEmits<{ (e: 'opened-room'): void }>()
const { busy, asked, playWith } = usePlayWithFriend()
const { badges, fetchBadges } = useBadges()

async function play(f: FriendRow) {
  // The room is open behind this screen; take them to it.
  if (await playWith(f.user_id)) emit('opened-room')
}

// Labels age on the shared clock; the list itself re-reads while it is on
// screen, because a friend coming online is the whole point of this panel and
// the clock alone can only ever grey someone out.
const now = useNow()
onMounted(() => { void social.refresh() })
usePoll(() => { void social.refresh() }, 60_000)

// Ordered when the data changes, not when the clock moves: these rows carry
// ACCEPT, DECLINE and BLOCK, and a list that reshuffles on a timer is how
// someone declines the request they meant to accept.
const sortedFriends = ref<FriendRow[]>([])
watch(() => social.friends, (rows) => { sortedFriends.value = byPresence(rows) }, { immediate: true })

const online = computed(() => sortedFriends.value.filter(f => isOnline(f.last_seen_at, now.value)))
const offline = computed(() => sortedFriends.value.filter(f => !isOnline(f.last_seen_at, now.value)))

watch(() => social.rows.map(r => r.user_id).join(','), () => {
  void fetchBadges(social.rows.map(r => r.user_id))
}, { immediate: true })

/** Only called under a v-if on the same lookup. */
function badgeProps(r: FriendRow) {
  const info = badges.value[r.user_id]!
  return { badge: info.badge, points: info.points, progress: info.progress }
}

function onlineLabel(f: FriendRow): string {
  const title = badges.value[f.user_id]?.badge.title
  return title ? `Online · ${title}` : 'Online'
}

/** Under a few seconds - or a server clock a moment ahead - relativeTime
 *  says "in 0 seconds". */
function askedAgo(r: FriendRow): string {
  if (now.value - Date.parse(r.created_at) < 5000) return 'just now'
  return relativeTime(r.created_at, now.value) || 'just now'
}

function seenLabel(f: FriendRow): string {
  const rel = relativeTime(f.last_seen_at, now.value)
  return rel ? `Last seen ${rel}` : 'Offline'
}

function titleCase(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase()
}

function openProfile(f: FriendRow): void {
  if (f.share_code) navigate({ name: 'profile', code: f.share_code })
}

// Both exits ask once. The armed state clears itself, so a stray tap does not
// leave a loaded button sitting there for the next visit to this screen.
const confirming = ref<string | null>(null)
const menuFor = ref<string | null>(null)

function toggleMenu(userId: string): void {
  menuFor.value = menuFor.value === userId ? null : userId
  confirming.value = null
}
let armedTimer: ReturnType<typeof setTimeout> | null = null

function arm(key: string, action: () => void): void {
  if (armedTimer) { clearTimeout(armedTimer); armedTimer = null }
  if (confirming.value === key) {
    confirming.value = null
    action()
    return
  }
  confirming.value = key
  armedTimer = setTimeout(() => { confirming.value = null }, 4000)
}

onUnmounted(() => { if (armedTimer) clearTimeout(armedTimer) })
</script>

<style scoped>
/* Two columns on a desktop - the people on the left, the things that need an
   answer on the right - and one column on a phone, requests first. */
.fs {
  display: flex;
  align-items: flex-start;
  justify-content: center;
  gap: var(--spacing-8);
}

/* Capped at its two-column width, so a page with nothing in the side column
   does not stretch one row across the whole screen. */
.fs-main {
  flex: 1.6;
  min-width: 0;
  max-width: 40rem;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.fs-side {
  flex: 1;
  min-width: 0;
  max-width: 24rem;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.fs-group {
  display: flex;
  flex-direction: column;
}

.fs-label {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 var(--spacing-1) var(--spacing-2);
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.fs-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.12em;
  color: var(--color-neon-green);
}

.fs-live-dot {
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: var(--color-neon-green);
}

.fs-count {
  min-width: 20px;
  height: 20px;
  padding: 0 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  background: var(--color-hazard);
  color: var(--bg-concrete);
  font-size: 0.75rem;
  font-weight: 700;
}

/* The lobby's "Or jump in" card: one surface, hairline dividers. */
.fs-card {
  list-style: none;
  margin: 0;
  padding: var(--spacing-2);
  display: flex;
  flex-direction: column;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
}

.fs-row {
  position: relative;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--spacing-3);
  min-height: 72px;
  padding: var(--spacing-3);
}

.fs-row + .fs-row {
  box-shadow: 0 -1px 0 rgba(255, 255, 255, 0.055);
}

.fs-row--compact {
  min-height: 60px;
}

.fs-shield {
  flex: none;
}

.fs-shield--away {
  opacity: 0.5;
}

.fs-shield-gap {
  width: 44px;
  height: 44px;
  flex: none;
}

.fs-who {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 3px;
}

.fs-name {
  padding: 0;
  background: none;
  border: none;
  text-align: left;
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  cursor: pointer;
}

.fs-name:hover {
  color: var(--color-neon-blue);
}

.fs-name--lg {
  font-size: 1.125rem;
}

.fs-row--away .fs-name {
  color: var(--text-secondary);
}

.fs-status {
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.fs-row--away .fs-status {
  color: var(--text-muted);
}

.fs-text-btn {
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

.fs-text-btn svg {
  color: var(--text-secondary);
}

.fs-text-btn:hover:not(:disabled) {
  color: var(--color-neon-blue);
}

.fs-text-btn:disabled {
  color: var(--text-muted);
  cursor: default;
}

.fs-text-btn--quiet {
  color: var(--text-secondary);
}

/* The one place with emphasis: a faint hazard wash, no coloured border. */
.fs-requests {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.fs-request {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding: var(--spacing-4) var(--spacing-4) var(--spacing-3);
  background: linear-gradient(180deg, rgba(255, 204, 0, 0.08) 0%, rgba(255, 204, 0, 0.015) 100%);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
}

.fs-request-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.fs-request-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
}

.fs-accept {
  flex: 1;
}

.fs-empty {
  margin: 0;
  padding: var(--spacing-6) var(--spacing-4);
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: 0.9rem;
  color: var(--text-secondary);
}

.fs-blocked summary {
  padding: 0 var(--spacing-1) var(--spacing-2);
  font-family: var(--font-body);
  font-size: 0.82rem;
  color: var(--text-muted);
  cursor: pointer;
}

.fs-blocked-note {
  margin: 0 0 var(--spacing-2);
  padding: 0 var(--spacing-1);
  font-family: var(--font-body);
  font-size: 0.75rem;
  color: var(--text-muted);
}

@media (max-width: 900px) {
  .fs {
    flex-direction: column;
    gap: var(--spacing-6);
  }

  .fs-main,
  .fs-side {
    width: 100%;
    max-width: none;
  }

  /* Requests are the rows that need an answer, so on a phone they lead. */
  .fs-side {
    order: -1;
  }

  .fs-row {
    min-height: 68px;
    gap: var(--spacing-2);
    padding: var(--spacing-2) var(--spacing-2);
  }

  /* A typical 15-character name has to fit beside PLAY at 390px. */
  .fs-row .btn {
    padding-inline: var(--spacing-3);
  }

  .fs-name {
    font-size: 0.95rem;
  }
}
</style>
