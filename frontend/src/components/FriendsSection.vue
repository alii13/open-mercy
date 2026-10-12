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
            <!-- A ten-minute room invite is lost on someone who is not here;
                 a ping waits a day. The invite stays as the fallback until
                 friends-ping.sql runs. -->
            <button
              v-if="!social.pingsUnavailable"
              class="fs-text-btn"
              :disabled="pingBusy === f.user_id || social.pinged.has(f.user_id)"
              @click="ping(f.user_id)"
            >
              <Check v-if="social.pinged.has(f.user_id)" :size="16" :stroke-width="2" aria-hidden="true" />
              <BellRing v-else :size="16" :stroke-width="2" aria-hidden="true" />
              {{ social.pinged.has(f.user_id) ? 'Pinged' : (pingErrors[f.user_id] ?? 'Ping') }}
            </button>
            <button
              v-else
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
        No friends yet. Add someone you just played, or send your link to someone you know.
      </p>
    </div>

    <aside class="fs-side">
      <!-- Requests first: they are the only rows that need an answer. -->
      <div v-if="social.incoming.length" class="fs-group fs-lead">
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

      <div v-if="social.outgoing.length" class="fs-group fs-lead">
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

      <div v-if="social.recent.length" class="fs-group">
        <div class="fs-label"><span>Played recently</span></div>
        <ul class="fs-card">
          <li v-for="o in social.recent" :key="o.user_id" class="fs-row fs-row--compact">
            <Badge v-if="badges[o.user_id]" v-bind="badgeProps(o)" size="mark" :style="{ '--emblem-size': '34px' }" />
            <div class="fs-who">
              <button class="fs-name" @click="openProfile(o)">{{ o.username }}</button>
              <span class="fs-status" :class="{ 'fs-status--warn': addFailed[o.user_id] }">{{ addFailed[o.user_id] ?? headToHead(o) }}</span>
            </div>
            <button
              class="fs-add"
              :aria-label="`Add ${o.username} as a friend`"
              :disabled="social.pendingIds.has(o.user_id) || !!addFailed[o.user_id]"
              @click="addRecent(o.user_id)"
            >
              <Plus :size="16" :stroke-width="2.4" aria-hidden="true" />
            </button>
          </li>
        </ul>
      </div>

      <div v-if="myLink" class="fs-group">
        <div class="fs-label"><span>Bring someone in</span></div>
        <ul class="fs-card">
          <li class="fs-row fs-row--compact fs-row--link">
            <button class="fs-link" @click="copyLink">
              <Link2 :size="18" :stroke-width="2" class="fs-link-glyph fs-link-glyph--cyan" aria-hidden="true" />
              <span class="fs-who">
                <span class="fs-name">{{ copied ? 'Link copied' : canNativeShare ? 'Share your friend link' : 'Copy your friend link' }}</span>
                <span class="fs-status">{{ myLinkLabel }}</span>
              </span>
              <ChevronRight :size="16" class="fs-chev" aria-hidden="true" />
            </button>
          </li>
          <li class="fs-row fs-row--compact fs-row--link">
            <a class="fs-link" :href="whatsappHref" target="_blank" rel="noopener">
              <MessageCircle :size="18" :stroke-width="2" class="fs-link-glyph fs-link-glyph--green" aria-hidden="true" />
              <span class="fs-who">
                <span class="fs-name">Invite on WhatsApp</span>
                <span class="fs-status">They land on your profile, ready to add</span>
              </span>
              <ChevronRight :size="16" class="fs-chev" aria-hidden="true" />
            </a>
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
import { BellRing, Check, ChevronRight, Link2, MessageCircle, Plus, Send } from 'lucide-vue-next'
import { useSocialStore, type FriendRow, type RecentOpponent } from '../stores/socialStore'
import { useAuthStore } from '../stores/authStore'
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

const pingBusy = ref<string | null>(null)
const pingErrors = ref<Record<string, string>>({})

async function ping(userId: string): Promise<void> {
  if (pingBusy.value) return
  pingBusy.value = userId
  const result = await social.sendPing(userId)
  pingBusy.value = null
  if (result === 'sent' || result === 'too_soon') return
  pingErrors.value = { ...pingErrors.value, [userId]: result === 'rate_limited' ? 'Limit today' : 'Try again' }
  setTimeout(() => {
    const next = { ...pingErrors.value }
    delete next[userId]
    pingErrors.value = next
  }, 2500)
}

async function play(f: FriendRow) {
  // The room is open behind this screen; take them to it.
  if (await playWith(f.user_id)) emit('opened-room')
}

// Labels age on the shared clock; the list itself re-reads while it is on
// screen, because a friend coming online is the whole point of this panel and
// the clock alone can only ever grey someone out.
const now = useNow()
// Opening this page is seeing the request: no toast for it on the way out.
onMounted(() => { if (social.notice?.kind !== 'ping') social.dismissNotice(); void social.refresh(); void social.fetchRecent(); void social.fetchPings() })
usePoll(() => { void social.refresh() }, 60_000)

// Ordered when the data changes, not when the clock moves: these rows carry
// ACCEPT, DECLINE and BLOCK, and a list that reshuffles on a timer is how
// someone declines the request they meant to accept.
const sortedFriends = ref<FriendRow[]>([])
watch(() => social.friends, (rows) => { sortedFriends.value = byPresence(rows) }, { immediate: true })

const online = computed(() => sortedFriends.value.filter(f => isOnline(f.last_seen_at, now.value)))
const offline = computed(() => sortedFriends.value.filter(f => !isOnline(f.last_seen_at, now.value)))

const shownIds = computed(() => [...social.rows, ...social.recent].map(r => r.user_id))
watch(() => shownIds.value.join(','), () => {
  void fetchBadges(shownIds.value)
}, { immediate: true })

/** Only called under a v-if on the same lookup. */
function badgeProps(r: { user_id: string }) {
  const info = badges.value[r.user_id]!
  return { badge: info.badge, points: info.points, progress: info.progress }
}

// A request that did not go out says why, in the row, rather than the row
// quietly staying put with a + that does nothing.
const addFailed = ref<Record<string, string>>({})
async function addRecent(userId: string): Promise<void> {
  const result = await social.sendRequest(userId)
  const why = result === 'rate_limited' ? 'Too many requests today'
    : result === 'declined' ? 'Try again in a few days'
    : result === 'blocked' ? "Can't add this player"
    : result === 'failed' || result === 'unauthorized' || result === 'not_found' ? 'Could not send - try again later'
    : null
  if (why) addFailed.value = { ...addFailed.value, [userId]: why }
}

/** "3 games · you lead 2-1", or just the count when nobody has won yet. */
function headToHead(o: RecentOpponent): string {
  const games = `${o.games} ${o.games === 1 ? 'game' : 'games'}`
  if (!o.my_wins && !o.their_wins) return `${games} together`
  const score = `${Math.max(o.my_wins, o.their_wins)}–${Math.min(o.my_wins, o.their_wins)}`
  if (o.my_wins === o.their_wins) return `${games} · level ${score}`
  return `${games} · ${o.my_wins > o.their_wins ? 'you lead' : 'they lead'} ${score}`
}

// Your own profile is the landing page for anyone you send this to: it
// carries ADD and PLAY, so the link converts without a code to type.
const authStore = useAuthStore()
const myLink = computed(() => {
  const code = authStore.profile?.share_code
  return code ? `${window.location.origin}/p/${code}` : ''
})
const myLinkLabel = computed(() => myLink.value.replace(/^https?:\/\//, ''))
const whatsappHref = computed(() =>
  `https://wa.me/?text=${encodeURIComponent(`Add me on Open Mercy and let's play: ${myLink.value}`)}`)

// Same split as the lobby's room link: the share sheet on phones, the
// clipboard elsewhere. A refused clipboard leaves the row unconfirmed rather
// than claiming a copy that did not happen.
const canNativeShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'
const copied = ref(false)
let copiedTimer: ReturnType<typeof setTimeout> | null = null
async function copyLink(): Promise<void> {
  try {
    if (canNativeShare) {
      await navigator.share({ title: 'Open Mercy', text: 'Add me on Open Mercy', url: myLink.value })
      return
    }
    await navigator.clipboard.writeText(myLink.value)
  } catch {
    return
  }
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 2000)
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

function openProfile(f: { share_code: string | null }): void {
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

onUnmounted(() => {
  if (armedTimer) clearTimeout(armedTimer)
  if (copiedTimer) clearTimeout(copiedTimer)
})
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

.fs-status--warn {
  color: var(--color-hazard);
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

.fs-add {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: none;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-primary);
  cursor: pointer;
}

.fs-add:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.14);
}

.fs-add:disabled {
  opacity: 0.5;
  cursor: default;
}

/* The lobby's "Or jump in" rows: glyph, two lines, chevron. */
.fs-row--link {
  padding: 0;
}

.fs-link {
  flex: 1;
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 60px;
  padding: var(--spacing-3);
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  text-align: left;
  text-decoration: none;
  cursor: pointer;
}

.fs-link:hover {
  background: rgba(255, 255, 255, 0.045);
}

.fs-link .fs-name {
  cursor: inherit;
}

.fs-link-glyph {
  flex: none;
  width: 28px;
}

.fs-link-glyph--cyan {
  color: var(--color-neon-blue);
}

.fs-link-glyph--green {
  color: #25d366;
}

.fs-chev {
  flex: none;
  color: var(--text-muted);
  transition: transform var(--duration-snap) var(--ease-snap);
}

.fs-link:hover .fs-chev {
  transform: translateX(3px);
  color: var(--text-secondary);
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

  /* On a phone the side column dissolves into the one column: the rows that
     need an answer lead, the friends follow, and finding new people comes
     last - not a wall of suggestions above the people you already have. */
  .fs-side {
    display: contents;
  }

  .fs-side > * {
    order: 1;
    width: 100%;
  }

  .fs-side > .fs-lead {
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
