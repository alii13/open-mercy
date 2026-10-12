<template>
  <Transition name="invite-toast">
    <div v-if="showing" class="invite" role="status">
      <Users class="invite-glyph" :size="16" :stroke-width="2" aria-hidden="true" />
      <span class="invite-text">
        <strong class="invite-who">{{ showing.from_username }}</strong>
        wants you at their table
        <span v-if="roomLine" class="invite-room">{{ roomLine }}</span>
      </span>
      <button class="invite-join" :disabled="joining" @click="join()">
        {{ joining ? 'JOINING…' : 'JOIN' }}
      </button>
      <button class="invite-dismiss" aria-label="Ignore invite" @click="invitesStore.dismiss(showing.id)">
        <X :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </div>
  </Transition>

  <!-- Mid-match the invite waits in a chip instead of being dropped: the
       player learns who asked, and the full toast takes over the moment the
       game is left. Only a bot game can be walked out of from here. -->
  <Transition name="invite-chip">
    <div v-if="chip" class="invite-chip" role="status">
      <Users :size="14" :stroke-width="2" aria-hidden="true" />
      <span class="invite-chip-text">
        <strong class="invite-who">{{ chip.from_username }}</strong> invited you
        <span v-if="!inBotGame" class="invite-chip-when">· after this game</span>
      </span>
      <button v-if="inBotGame" class="invite-join" :disabled="joining" @click="joinFromBotGame">
        {{ joining ? 'JOINING…' : 'JOIN' }}
      </button>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { computed, onUnmounted, ref, watch } from 'vue'
import { Users, X } from 'lucide-vue-next'
import { useInviteStore } from '../stores/inviteStore'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useGameStore } from '../stores/gameStore'
import { usePoll } from '../composables/useClock'
import { soundEffects } from '../composables/useSoundEffects'

const invitesStore = useInviteStore()
const mpStore = useMultiplayerStore()
const botGame = useGameStore()
const joining = ref(false)

// Not during a match. JOIN would abandon the game in progress, and a toast
// over the table is noise at the worst moment. The invite keeps for ten
// minutes, so it is still there when the game ends.
const inMatch = computed(() => {
  const s = mpStore.currentGame?.status
  return s === 'playing' || s === 'finished'
})

// The ten-minute window lives in my_invites and nowhere else. Re-reading on a
// minute is what retires a toast on a tab left open all afternoon: the row
// simply stops coming back. One clock, in the place that also matches the
// room's GC window.
usePoll(() => { void invitesStore.refresh() }, 60_000)

const inBotGame = computed(() => botGame.gameState !== 'LOBBY')
const showing = computed(() => (inMatch.value || inBotGame.value ? null : invitesStore.current))
const chip = computed(() => (inMatch.value || inBotGame.value ? invitesStore.current : null))

// A ten-minute invite that arrives silently on a background tab is an invite
// that expires. One cue, and the title carries it while the tab is hidden -
// no new asset, and nothing that fires twice for the same invite.
const TITLE = typeof document !== 'undefined' ? document.title : ''
let announced: string | null = null

watch(showing, (invite) => {
  if (typeof document === 'undefined') return
  if (!invite) { document.title = TITLE; return }
  if (invite.id !== announced) {
    announced = invite.id
    // Reusing the loudest cue the game already ships rather than adding one.
    try { soundEffects.playSpecialCard() } catch { /* audio is a garnish */ }
  }
  document.title = document.visibilityState === 'visible' ? TITLE : `(1) ${invite.from_username} wants to play`
})

onUnmounted(() => { if (typeof document !== 'undefined') document.title = TITLE })

// A bare name makes the receiver guess whether they are joining a full
// table, an empty one, or a rules set they dislike.
const roomLine = computed(() => {
  const invite = showing.value
  if (!invite) return ''
  const people = invite.players && invite.players > 0
    ? `${invite.players} in the room`
    : ''
  const rules = invite.mode ? invite.mode.toUpperCase() : ''
  return [people, rules].filter(Boolean).join(' · ')
})

// A bot game has no one else at the table, so leaving it for a friend costs
// nothing. Leaving a live match does, which is why that chip has no button.
async function joinFromBotGame() {
  if (joining.value) return
  botGame.returnToLobby()
  await join(chip.value)
}

async function join(invite = showing.value) {
  if (!invite || joining.value) return
  joining.value = true
  try {
    // Dismiss first: whether the room is still alive or not, this invite has
    // been answered, and a dead code must not leave the toast on screen.
    await invitesStore.dismiss(invite.id)
    await mpStore.joinGame(invite.room_code, 'link')
  } finally {
    joining.value = false
  }
}
</script>

<style scoped>
/* Bottom edge, unlike the sign-in toast at the top. The note on that one -
   "the landing page owns the bottom edge with its sticky mobile CTA" - does
   not reach here, because an invite needs an account and never renders on the
   landing page. Measured on a 390x667 waiting room: it clears LEAVE ROOM and
   PLAY VS BOT INSTEAD, and covers only the site footer. Bottom wins because
   JOIN is an action for a thumb, where a sign-in failure is a message to
   read. */
.invite {
  position: fixed;
  left: 50%;
  bottom: calc(env(safe-area-inset-bottom, 0px) + var(--spacing-4));
  transform: translateX(-50%);
  z-index: 2200;
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: min(26rem, calc(100vw - var(--spacing-6)));
  padding: var(--spacing-3);
  background: rgba(10, 12, 14, 0.96);
  border: 1px solid rgba(0, 243, 255, 0.4);
  border-radius: var(--radius-md);
  box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55);
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.85rem;
  color: var(--text-secondary);
}

.invite-glyph {
  flex: none;
  color: var(--color-neon-blue);
}

.invite-text {
  flex: 1;
  min-width: 0;
}

.invite-who {
  color: var(--text-primary);
  font-weight: 600;
}

.invite-room {
  display: block;
  font-family: var(--font-mono);
  font-size: 0.58rem;
  letter-spacing: 0.12em;
  color: var(--text-muted);
}

.invite-join {
  flex: none;
  padding: var(--spacing-1) var(--spacing-3);
  background: rgba(0, 243, 255, 0.12);
  border: 1px solid rgba(0, 243, 255, 0.5);
  border-radius: var(--radius-sm);
  color: var(--color-neon-blue);
  font-family: var(--font-mono);
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  cursor: pointer;
}

.invite-join:hover:not(:disabled) {
  background: rgba(0, 243, 255, 0.2);
}

.invite-join:disabled {
  opacity: 0.6;
  cursor: default;
}

.invite-dismiss {
  flex: none;
  display: inline-flex;
  padding: var(--spacing-1);
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
}

.invite-dismiss:hover {
  color: var(--text-primary);
}

.invite-toast-enter-active,
.invite-toast-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.invite-toast-enter-from,
.invite-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, 12px);
}

/* Top centre, under the game's own top bar: the hand and the draw pile own
   the bottom of the table. */
.invite-chip {
  position: fixed;
  top: calc(env(safe-area-inset-top, 0px) + 64px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 2200;
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  max-width: calc(100vw - var(--spacing-6));
  padding: var(--spacing-1) var(--spacing-1) var(--spacing-1) var(--spacing-3);
  min-height: 36px;
  background: rgba(10, 12, 14, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
  font-family: var(--font-body);
  font-size: 0.8rem;
  color: var(--text-secondary);
  white-space: nowrap;
}

.invite-chip > svg {
  flex: none;
  color: var(--color-neon-blue);
}

.invite-chip-text {
  overflow: hidden;
  text-overflow: ellipsis;
  padding-right: var(--spacing-2);
}

.invite-chip-when {
  color: var(--text-muted);
}

.invite-chip .invite-join {
  border-radius: 999px;
}

.invite-chip-enter-active,
.invite-chip-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.invite-chip-enter-from,
.invite-chip-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

@media (prefers-reduced-motion: reduce) {
  .invite-toast-enter-active,
  .invite-toast-leave-active,
  .invite-chip-enter-active,
  .invite-chip-leave-active { transition: none; }
}
</style>
