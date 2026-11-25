<template>
  <!-- Trigger: one thumb, one tap -->
  <button ref="triggerEl" class="qc-trigger" aria-label="Quick chat" @click="toggleSheet">
    <MessageCircle class="qc-trigger-icon" :stroke-width="2" aria-hidden="true" />
    <span v-if="unread" class="qc-dot" aria-hidden="true"></span>
  </button>

  <!-- Bubbles: anchored over the sender's seat when one exists on screen,
       else stacked above the trigger (the waiting room, my own messages). -->
  <Teleport to="body">
    <TransitionGroup name="qc-bubble" tag="div" class="qc-bubble-layer" aria-live="polite">
      <div
        v-for="b in bubbles"
        :key="b.n"
        class="qc-bubble"
        :class="{ mine: b.mine, anchored: b.anchored }"
        :style="b.anchored
          ? { left: `${b.x}px`, top: `${b.y}px` }
          : { bottom: `${152 + b.slot * 46}px` }"
      >
        <span v-if="!b.mine" class="qc-bubble-name">{{ b.name }}</span>
        <span class="qc-bubble-text">{{ b.text }}</span>
      </div>
    </TransitionGroup>
  </Teleport>

  <!-- Sheet: match log on top, phrases below -->
  <Teleport to="body">
    <Transition name="qc-sheet">
      <div v-if="open" class="qc-backdrop" @click.self="open = false">
        <div ref="sheetEl" class="qc-sheet" role="dialog" aria-modal="true" aria-label="Quick chat" tabindex="-1">
          <div ref="logEl" class="qc-log">
            <p v-if="!mpStore.chatLog.length" class="qc-log-empty">
              Say something - the whole table sees it.
            </p>
            <div v-for="m in mpStore.chatLog" :key="m.n" class="qc-log-row">
              <span class="qc-log-name" :class="{ me: m.userId === myId }">
                {{ m.userId === myId ? 'You' : m.name }}
              </span>
              <span class="qc-log-text">{{ m.text }}</span>
              <button
                v-if="m.userId !== myId"
                class="qc-mute"
                :class="{ muted: mpStore.mutedChatIds.has(m.userId) }"
                :aria-label="mpStore.mutedChatIds.has(m.userId) ? `Unmute ${m.name}` : `Mute ${m.name}`"
                :title="mpStore.mutedChatIds.has(m.userId) ? 'Unmute' : 'Mute'"
                @click="mpStore.toggleChatMute(m.userId)"
              >
                <VolumeX class="qc-mute-icon" :stroke-width="2" aria-hidden="true" />
              </button>
            </div>
          </div>
          <div class="qc-phrases">
            <div v-for="group in GROUPS" :key="group" class="qc-group">
              <button
                v-for="p in byGroup(group)"
                :key="p.id"
                class="qc-phrase"
                :class="{ emoji: group === 'emoji' }"
                :disabled="coolingDown"
                @click="send(p.id)"
              >{{ p.text }}</button>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts">
// Module scope: the send window must outlive an instance. QuickChat unmounts
// when the waiting room hands over to the table, but the server's per-user
// rate window keeps running - a remount must not re-offer taps the relay
// would silently drop.
const sendTimes: number[] = []
</script>

<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue'
import { MessageCircle, VolumeX } from 'lucide-vue-next'
import { QUICK_CHAT, type QuickChatGroup } from '@quickChat'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useAuthStore } from '../stores/authStore'
import { useInertApp } from '../composables/useInertApp'

const mpStore = useMultiplayerStore()
const authStore = useAuthStore()
const myId = computed(() => authStore.user?.id ?? null)

const GROUPS: QuickChatGroup[] = ['greet', 'react', 'nudge', 'sorry', 'emoji']
function byGroup(group: QuickChatGroup) {
  return QUICK_CHAT.filter(p => p.group === group)
}

// --- Sheet, unread dot, send cooldown ---

const open = ref(false)
// Before the open watcher, so the table is awake when focus returns.
useInertApp(() => open.value)
const logEl = ref<HTMLElement | null>(null)
const sheetEl = ref<HTMLElement | null>(null)
const triggerEl = ref<HTMLElement | null>(null)
let seenN = 0
const unread = ref(false)

function toggleSheet() {
  open.value = !open.value
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false
}

watch(open, (o) => {
  if (!o) {
    document.removeEventListener('keydown', onKeydown)
    // aria-modal promised a modal; give focus back where it came from.
    triggerEl.value?.focus()
    return
  }
  document.addEventListener('keydown', onKeydown)
  unread.value = false
  seenN = mpStore.lastChat?.n ?? seenN
  // Focus moves into the dialog; newest message in view when it opens.
  void nextTick(() => {
    sheetEl.value?.focus()
    logEl.value?.scrollTo({ top: logEl.value.scrollHeight })
  })
})

// Mirror the server's limits (1s gap, 3 per 5s window) so taps the relay
// would silently drop are never offered. The window itself is module-scoped
// above so it survives the lobby-to-table remount.
const coolingDown = ref(false)
let coolTimer: ReturnType<typeof setTimeout> | null = null

function send(phraseId: string) {
  if (coolingDown.value) return
  const now = Date.now()
  while (sendTimes.length && now - sendTimes[0]! >= 5_000) sendTimes.shift()
  mpStore.sendChat(phraseId)
  sendTimes.push(now)
  coolingDown.value = true
  const wait = sendTimes.length >= 3 ? sendTimes[0]! + 5_000 - now : 1_000
  coolTimer = setTimeout(() => { coolingDown.value = false }, Math.max(1_000, wait))
  open.value = false
}

// --- Bubbles ---

interface Bubble {
  n: number
  name: string
  text: string
  mine: boolean
  anchored: boolean
  x: number
  y: number
  /** Stack position for unanchored bubbles, so they never overlap. */
  slot: number
}

const bubbles = ref<Bubble[]>([])
const timers: ReturnType<typeof setTimeout>[] = []

watch(() => mpStore.lastChat, (m) => {
  if (!m) return
  if (open.value) {
    seenN = m.n
    void nextTick(() => { logEl.value?.scrollTo({ top: logEl.value.scrollHeight }) })
  } else if (m.userId !== myId.value) {
    unread.value = true
  }
  // The seat contract: OpponentChip's root carries .opponent-card[data-uid].
  const seat = document.querySelector(`.opponent-card[data-uid="${CSS.escape(m.userId)}"]`)
  const rect = seat?.getBoundingClientRect()
  const anchored = !!rect && rect.width > 0
  const kept = bubbles.value.slice(-3)
  // Lowest unused slot: bubbles expire out of the middle on their own
  // timers, so counting survivors would stack two bubbles on one spot.
  const used = new Set(kept.filter(b => !b.anchored).map(b => b.slot))
  let slot = 0
  while (used.has(slot)) slot++
  bubbles.value = [...kept, {
    n: m.n,
    name: m.name,
    text: m.text,
    mine: m.userId === myId.value,
    anchored,
    x: anchored ? rect.left + rect.width / 2 : 0,
    y: anchored ? rect.bottom + 6 : 0,
    slot: anchored ? 0 : slot,
  }]
  const handle = setTimeout(() => {
    bubbles.value = bubbles.value.filter(b => b.n !== m.n)
    timers.splice(timers.indexOf(handle), 1)
  }, 2600)
  timers.push(handle)
})

onUnmounted(() => {
  timers.forEach(clearTimeout)
  if (coolTimer) clearTimeout(coolTimer)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<style scoped>
.qc-trigger {
  position: fixed;
  left: var(--spacing-3);
  bottom: 96px;
  z-index: 2150;
  width: 44px;
  height: 44px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(10, 10, 11, 0.85);
  color: var(--text-secondary);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  backdrop-filter: blur(4px);
}
.qc-trigger:hover { color: var(--text-primary); border-color: rgba(255, 255, 255, 0.3); }
.qc-trigger-icon { width: 20px; height: 20px; }

.qc-dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-hazard, #ffcc00);
}

/* --- Bubbles --- */

.qc-bubble-layer {
  position: fixed;
  inset: 0;
  z-index: 2350;
  pointer-events: none;
}

.qc-bubble {
  position: fixed;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  padding: var(--spacing-1) var(--spacing-3);
  /* The table is near-black: the bubble needs its own light to read. */
  background: rgba(44, 44, 50, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.38);
  border-radius: 14px;
  max-width: 200px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.75);
}

/* Anchored: centered under the seat. */
.qc-bubble.anchored { transform: translateX(-50%); }

/* Unanchored: stacked above the trigger; the slot sets `bottom` inline. */
.qc-bubble:not(.anchored) {
  left: var(--spacing-3);
}

.qc-bubble.mine { border-color: rgba(0, 243, 255, 0.55); }

.qc-bubble-name {
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  text-transform: uppercase;
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.qc-bubble-text {
  font-size: var(--text-sm);
  font-weight: 600;
  color: #ffffff;
  white-space: nowrap;
}

.qc-bubble-enter-active { transition: opacity 0.18s ease, scale 0.18s ease; }
.qc-bubble-leave-active { transition: opacity 0.35s ease; }
.qc-bubble-enter-from { opacity: 0; scale: 0.7; }
.qc-bubble-leave-to { opacity: 0; }

/* --- Sheet --- */

.qc-backdrop {
  position: fixed;
  inset: 0;
  z-index: 2500;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: flex-end;
  justify-content: center;
}

.qc-sheet {
  width: 100%;
  max-width: 480px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  background: #121214;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-bottom: none;
  border-radius: 16px 16px 0 0;
  padding: var(--spacing-3);
  gap: var(--spacing-3);
}

.qc-log {
  overflow-y: auto;
  max-height: 30vh;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  min-height: 48px;
}

.qc-log-empty {
  margin: auto;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.qc-log-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--text-sm);
}

.qc-log-name {
  font-family: var(--font-mono);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
  text-transform: uppercase;
  max-width: 12ch;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex-shrink: 0;
}
.qc-log-name.me { color: var(--color-neon-blue); }

.qc-log-text { color: var(--text-primary); flex: 1; }

.qc-mute {
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 2px;
  display: flex;
}
.qc-mute:hover { color: var(--text-primary); }
.qc-mute.muted { color: #ff6666; }
.qc-mute-icon { width: 14px; height: 14px; }

.qc-phrases {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.qc-group {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
}

.qc-phrase {
  padding: var(--spacing-2) var(--spacing-3);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: var(--text-primary);
  font-size: var(--text-sm);
  cursor: pointer;
}
.qc-phrase:hover:not(:disabled) { border-color: var(--color-neon-blue); }
.qc-phrase:disabled { opacity: 0.4; cursor: default; }
.qc-phrase.emoji { font-size: 1.1rem; padding: var(--spacing-1) var(--spacing-2); }

.qc-sheet-enter-active,
.qc-sheet-leave-active { transition: opacity 0.2s ease; }
.qc-sheet-enter-active .qc-sheet,
.qc-sheet-leave-active .qc-sheet { transition: transform 0.25s ease; }
.qc-sheet-enter-from,
.qc-sheet-leave-to { opacity: 0; }
.qc-sheet-enter-from .qc-sheet,
.qc-sheet-leave-to .qc-sheet { transform: translateY(40px); }
</style>
