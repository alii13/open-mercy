<template>
  <Transition name="friend-toast">
    <div v-if="notice" :key="key" class="ft" role="status">
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
          <span class="ft-sub" :class="{ 'ft-sub--live': notice.kind === 'accepted' && online }">{{ subtitle }}</span>
        </div>
        <button class="ft-close" aria-label="Dismiss" @click="social.dismissNotice()">
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
          v-else
          variant="primary"
          size="sm"
          class="ft-primary"
          :disabled="busy !== null"
          @click="play"
        >{{ busy ? '…' : 'PLAY NOW' }}</Button>
        <button class="ft-later" @click="social.dismissNotice()">
          {{ notice.kind === 'request' ? 'Not now' : 'Later' }}
        </button>
      </div>
      <div class="ft-timer" aria-hidden="true"><span :style="{ animationDuration: `${HIDE_MS}ms` }" /></div>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, watch } from 'vue'
import { X } from 'lucide-vue-next'
import Badge from './Badge.vue'
import Button from './ui/Button.vue'
import { useSocialStore } from '../stores/socialStore'
import { useBadges } from '../composables/useBadges'
import { usePlayWithFriend } from '../composables/usePlayWithFriend'
import { isOnline, relativeTime } from '../utils/relativeTime'

const social = useSocialStore()
const { badges, fetchBadges } = useBadges()
const { busy, playWith } = usePlayWithFriend()

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
  return n.kind === 'request' ? n.row.username : `${n.row.username} accepted`
})

const subtitle = computed(() => {
  const n = notice.value
  if (!n) return ''
  if (n.kind === 'accepted') return online.value ? "You're friends · online now" : "You're friends"
  const when = relativeTime(n.row.created_at)
  return when ? `wants to be friends · ${when}` : 'wants to be friends'
})

let hideTimer: ReturnType<typeof setTimeout> | null = null
watch(key, (k) => {
  if (hideTimer) clearTimeout(hideTimer)
  hideTimer = null
  if (!k || !notice.value) return
  void fetchBadges([notice.value.row.user_id])
  hideTimer = setTimeout(() => social.dismissNotice(), HIDE_MS)
}, { immediate: true })
onUnmounted(() => { if (hideTimer) clearTimeout(hideTimer) })

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
  if (await playWith(n.row.user_id)) social.dismissNotice()
}
</script>

<style scoped>
/* Bottom-right on desktop, where it sits beside the lobby rather than over
   CREATE GAME; full width at the top on a phone. Above InviteToast's layer,
   below modals. */
.ft {
  position: fixed;
  right: var(--spacing-6);
  bottom: calc(env(safe-area-inset-bottom, 0px) + var(--spacing-16));
  z-index: 2210;
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

@keyframes ft-drain {
  from { transform: scaleX(1); }
  to { transform: scaleX(0); }
}

/* Top on a phone: the bottom edge already carries the poll card and the
   invite toast, and three things stacked there read as one pile. */
@media (max-width: 640px) {
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
@media (max-width: 640px) {
  .friend-toast-enter-from,
  .friend-toast-leave-to {
    transform: translateY(-12px);
  }
}
</style>
