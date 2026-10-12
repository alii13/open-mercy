<template>
  <Transition name="friend-toast">
    <div
      v-if="notice"
      :key="key"
      class="ft"
      :class="{ 'ft--paused': paused }"
      role="status"
      @mouseenter="pause"
      @mouseleave="resume"
      @focusin="pause"
      @focusout="resume"
    >
      <div class="ft-head">
        <Badge
          v-if="info"
          :badge="info.badge"
          :points="info.points"
          :progress="info.progress"
          size="mark"
          class="ft-badge"
          :style="{ '--emblem-size': '48px' }"
        />
        <div class="ft-text">
          <span class="ft-name">{{ title }}</span>
          <span class="ft-sub" :class="{ 'ft-sub--live': notice.kind !== 'request' && online }">{{ subtitle }}</span>
        </div>
        <button class="ft-close" aria-label="Dismiss notification" @click="social.dismissNotice()">
          <X :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <div class="ft-actions">
        <Button
          v-if="notice.kind === 'request'"
          variant="hazard"
          size="sm"
          class="ft-primary"
          @click="accept"
        >ACCEPT</Button>
        <Button
          v-else-if="notice.kind === 'ping' && !online"
          variant="primary"
          size="sm"
          class="ft-primary"
          :disabled="pinging || pingFailed === 'LIMIT TODAY'"
          @click="pingBack"
        >{{ pinging ? '…' : (pingFailed ?? 'PING BACK') }}</Button>
        <Button
          v-else
          variant="primary"
          size="sm"
          class="ft-primary"
          :disabled="busy !== null"
          @click="play"
        >{{ busy ? '…' : (asked[notice.row.user_id] === 'TRY AGAIN' ? 'TRY AGAIN' : 'PLAY NOW') }}</Button>
        <button class="ft-later" @click="later">
          {{ notice.kind === 'request' ? 'Not now' : 'Later' }}
        </button>
      </div>
      <div class="ft-timer" aria-hidden="true"><span :style="{ animationDuration: `${HIDE_MS}ms` }" /></div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { X } from 'lucide-vue-next'
import Badge from './Badge.vue'
import Button from './ui/Button.vue'
import { useSocialStore } from '../stores/socialStore'
import { useBadges } from '../composables/useBadges'
import { usePlayWithFriend } from '../composables/usePlayWithFriend'
import { isOnline, relativeTime } from '../utils/relativeTime'

const social = useSocialStore()
const { badges, fetchBadges } = useBadges()
const { busy, asked, playWith } = usePlayWithFriend()

/** Long enough to read and reach for, short enough not to camp on the
 *  screen. The username chip count keeps it after this. */
const HIDE_MS = 8000

const notice = computed(() => social.notice)
const key = computed(() => notice.value ? `${notice.value.kind}:${notice.value.row.user_id}` : '')
const info = computed(() => notice.value ? badges.value[notice.value.row.user_id] : undefined)
const online = computed(() => notice.value ? isOnline(notice.value.row.last_seen_at, Date.now()) : false)

const title = computed(() => {
  const n = notice.value
  if (!n) return ''
  return n.kind === 'accepted' ? `${n.row.username} accepted` : n.row.username
})

const subtitle = computed(() => {
  const n = notice.value
  if (!n) return ''
  if (n.kind === 'accepted') return online.value ? "You're friends · online now" : "You're friends"
  // A ping from hours ago to someone now offline: PLAY would invite them to
  // a room they will not see, so the toast says when, and offers a ping back.
  if (n.kind === 'ping') return online.value ? 'wants to play · online now' : `wanted to play · ${relativeTime(n.ping.created_at)}`
  // Under a few seconds - or a server clock a moment ahead - reads as
  // "in 0 seconds" from relativeTime, so call it what it is.
  const age = Date.now() - Date.parse(n.row.created_at)
  const when = age < 5000 ? 'just now' : relativeTime(n.row.created_at)
  return when ? `wants to be friends · ${when}` : 'wants to be friends'
})

// The clock stops while a pointer or keyboard focus is on the toast, so
// nobody loses ACCEPT on the way to it, and it never runs out mid-PLAY.
let hideTimer: ReturnType<typeof setTimeout> | null = null
let remaining = HIDE_MS
let startedAt = 0
const paused = ref(false)
const pinging = ref(false)
/** Why PING BACK did not go out, as its label. */
const pingFailed = ref<string | null>(null)

function clearHide(): void {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
}

function runHide(): void {
  clearHide()
  startedAt = Date.now()
  hideTimer = setTimeout(() => {
    if (busy.value || pinging.value) return
    social.dismissNotice()
  }, remaining)
}

function pause(): void {
  if (paused.value || !hideTimer) return
  paused.value = true
  remaining = Math.max(0, remaining - (Date.now() - startedAt))
  clearHide()
}

function resume(): void {
  if (!paused.value) return
  paused.value = false
  runHide()
}

watch(key, (k) => {
  pingFailed.value = null
  clearHide()
  paused.value = false
  remaining = HIDE_MS
  if (!k || !notice.value) return
  void fetchBadges([notice.value.row.user_id])
  runHide()
}, { immediate: true })
onUnmounted(clearHide)

async function accept() {
  const n = notice.value
  if (!n) return
  social.dismissNotice()
  await social.respond(n.row.user_id, true)
}

async function play() {
  const n = notice.value
  if (!n) return
  // The waiting room takes over the screen on its own once the room exists.
  if (!(await playWith(n.row.user_id))) return
  if (n.kind === 'ping') await social.answerPing(n.ping.id)
  else social.dismissNotice()
}

async function pingBack() {
  const n = notice.value
  if (n?.kind !== 'ping' || pinging.value) return
  pinging.value = true
  try {
    const result = await social.sendPing(n.row.user_id)
    if (result === 'failed') pingFailed.value = 'TRY AGAIN'
    else if (result === 'rate_limited') pingFailed.value = 'LIMIT TODAY'
    // Sent, already sent, or no longer friends: nothing left to answer.
    else await social.answerPing(n.ping.id)
  } finally {
    pinging.value = false
  }
}

/** "Later" on a ping retires it: it keeps for a day, and would otherwise
 *  come back on every visit. The close button only hides it for now. */
function later() {
  const n = notice.value
  if (n?.kind === 'ping') void social.answerPing(n.ping.id)
  else social.dismissNotice()
}
</script>

<style scoped>
/* Bottom-right on desktop, where it sits beside the lobby rather than over
   CREATE GAME; full width at the top on a phone. On the toast layer, under
   modals - a confirmation dialog always wins. */
.ft {
  position: fixed;
  right: var(--spacing-6);
  bottom: calc(env(safe-area-inset-bottom, 0px) + var(--spacing-16));
  z-index: var(--z-toast);
  width: 26rem;
  display: flex;
  flex-direction: column;
  background: var(--surface-metal);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 10px;
  box-shadow: 0 24px 60px rgba(0, 0, 0, 0.8);
  overflow: hidden;
  font-family: var(--font-body);
}

.ft-head {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-4) var(--spacing-3);
}

.ft-badge {
  flex: none;
}

.ft-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.ft-name {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--text-primary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ft-sub {
  font-size: 0.82rem;
  color: var(--text-secondary);
}

.ft-sub--live {
  color: var(--color-neon-green);
}

.ft-close {
  align-self: flex-start;
  flex: none;
  display: inline-flex;
  padding: var(--spacing-1);
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.ft-close:hover {
  color: var(--text-primary);
}

.ft-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  /* Under the text, not under the shield. */
  padding: 0 var(--spacing-4) var(--spacing-4) calc(var(--spacing-4) + 48px + var(--spacing-3));
}

.ft-later {
  padding: var(--spacing-2);
  background: none;
  border: none;
  font-family: var(--font-body);
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.ft-later:hover {
  color: var(--text-primary);
}

.ft-timer {
  height: 2px;
  background: rgba(255, 255, 255, 0.06);
}

.ft-timer span {
  display: block;
  height: 100%;
  background: var(--color-hazard);
  transform-origin: left;
  animation: ft-drain linear forwards;
}

.ft--paused .ft-timer span {
  animation-play-state: paused;
}

@keyframes ft-drain {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* Top on a phone: the bottom edge already carries the poll card and the
   invite toast, and three things stacked there read as one pile. */
@media (max-width: 900px) {
  .ft {
    left: var(--spacing-3);
    right: var(--spacing-3);
    top: calc(env(safe-area-inset-top, 0px) + var(--spacing-3));
    bottom: auto;
    width: auto;
  }

  .ft-actions {
    padding-left: var(--spacing-4);
  }

  .ft-primary {
    flex: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ft-timer span {
    animation: none;
  }
}

.friend-toast-enter-active,
.friend-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.friend-toast-enter-from,
.friend-toast-leave-to {
  opacity: 0;
  transform: translateY(12px);
}

/* After the base rule, so the phone version slides down from the top. */
@media (max-width: 900px) {
  .friend-toast-enter-from,
  .friend-toast-leave-to {
    transform: translateY(-12px);
  }
}
</style>
