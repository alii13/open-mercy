<template>
  <!-- One-button voice cluster: JOIN VOICE → spinner → mic (tap = mute).
       Hidden entirely when the server has no voice support. Failures show
       RETRY with the reason as a tooltip — never a modal, never blocks play.
       A once-ever nudge points at the button so nobody misses that voice
       exists (on phones the button is icon-only). -->
  <span v-if="voice.available" class="voice-wrap">
  <template v-if="!(nudgeInline && showNudge)">
  <button
    class="hud-voice"
    :class="{
      live: voice.state === 'live',
      muted: voice.state === 'live' && voice.muted,
      speaking: selfSpeaking,
      error: voice.state === 'error',
    }"
    :disabled="busy"
    :title="title"
    :aria-label="title"
    @click="handleClick"
  >
    <span v-if="busy" class="hud-voice-spinner" aria-hidden="true"></span>
    <svg v-else class="hud-voice-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1" />
      <line x1="12" y1="18" x2="12" y2="22" />
      <line v-if="voice.state === 'live' && voice.muted" x1="3" y1="3" x2="21" y2="21" class="hud-voice-slash" />
    </svg>
    <!-- Live activity: bars dance while anyone's voice is flowing — the
         direct "it's working" signal, instead of a static LIVE word. -->
    <span
      v-if="voice.state === 'live' && !voice.muted"
      class="voice-eq"
      :class="{ active: anySpeaking }"
      aria-hidden="true"
    ><i></i><i></i><i></i></span>
    <span v-if="label" class="hud-voice-label">{{ label }}</span>
  </button>
  <!-- Host's nuclear option: cut every mic at once (players may unmute). -->
  <button
    v-if="canModerate && voice.state === 'live' && voice.unmutedUserIds.size > 0"
    class="hud-voice hud-voice-all"
    title="Mute everyone"
    aria-label="Mute everyone"
    @click="voice.muteEveryone()"
  >
    <VolumeX :size="16" :stroke-width="2" aria-hidden="true" />
  </button>
  <span v-if="hint" class="voice-hint">{{ hint }}</span>
  </template>
  <Transition name="nudge">
    <span v-if="showNudge" class="voice-nudge" :class="{ inline: nudgeInline }" role="status">
      <span class="nudge-text">Talk with everyone in this room</span>
      <button class="nudge-join" @click="acceptNudge">JOIN VOICE</button>
      <button class="nudge-x" aria-label="Dismiss voice prompt" @click="dismissNudge">×</button>
    </span>
  </Transition>
  </span>
</template>

<script setup lang="ts">
import { VolumeX } from 'lucide-vue-next'
import { computed, ref, watch } from 'vue'
import { useVoiceStore } from '../../stores/voiceStore'

const props = defineProps<{
  /** Room host: shows the mute-everyone control while mics are open. */
  canModerate?: boolean
  /** The discovery nudge takes the button's place instead of hanging under
   *  it as an overlay - one voice message at a time (the waiting room). */
  nudgeInline?: boolean
  /** Short helper text after the button (hidden while the nudge shows). */
  hint?: string
  /** No discovery nudge: the caller keeps the JOIN VOICE label in view instead. */
  noNudge?: boolean
  /** Once live, say MUTE / UNMUTE instead of the bare mic (the table, where the mic sits among labelled buttons). */
  muteLabel?: boolean
}>()

const voice = useVoiceStore()

const NUDGE_KEY = 'uno_voice_nudge_v1'
const nudgeSeen = ref((() => {
  try { return !!localStorage.getItem(NUDGE_KEY) } catch { return true }
})())
function markNudgeSeen() {
  nudgeSeen.value = true
  try { localStorage.setItem(NUDGE_KEY, '1') } catch { /* private mode */ }
}
const showNudge = computed(() => !props.noNudge && !nudgeSeen.value && voice.state === 'off')
function acceptNudge() {
  markNudgeSeen()
  void voice.joinVoice()
}
function dismissNudge() {
  markNudgeSeen()
}
// Finding the button unaided counts as seen too.
watch(() => voice.state, (s) => {
  if (s !== 'off' && s !== 'error') markNudgeSeen()
})

const busy = computed(() => voice.state === 'requesting-token' || voice.state === 'connecting')
const selfSpeaking = computed(() =>
  voice.state === 'live' && !!voice.selfUserId && voice.speakingUserIds.has(voice.selfUserId))
const anySpeaking = computed(() => voice.speakingUserIds.size > 0)

// Words only where they carry meaning: discovery (JOIN VOICE) and recovery
// (RETRY). Live/muted state reads from the icon color + slash + equalizer.
const label = computed(() => {
  if (voice.state === 'error') return 'RETRY'
  if (voice.state === 'live' && props.muteLabel) return voice.muted ? 'UNMUTE' : 'MUTE'
  if (busy.value || voice.state === 'live') return ''
  return 'JOIN VOICE'
})

const title = computed(() => {
  if (voice.state === 'error') return voice.errorText ?? 'Voice failed — retry'
  if (voice.state === 'live') return voice.muted ? 'Unmute microphone' : 'Mute microphone'
  return 'Talk with everyone in this room'
})

function handleClick() {
  if (voice.state === 'live') void voice.toggleMute()
  else void voice.joinVoice()
}
</script>

<style scoped>
.voice-wrap {
  position: relative;
  display: inline-flex;
  gap: var(--spacing-2);
}

.hud-voice-all:hover {
  border-color: var(--color-alert);
  color: var(--color-alert);
}

.voice-hint {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  color: var(--text-secondary);
  align-self: center;
}

/* Once-ever discovery nudge anchored under the mic button. */
.voice-nudge {
  position: absolute;
  top: calc(100% + 10px);
  right: 0;
  z-index: 60;
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  width: max-content;
  max-width: min(300px, 82vw);
  padding: var(--spacing-2) var(--spacing-3);
  background: rgba(8, 12, 9, 0.96);
  border: 1px solid var(--color-neon-green);
  border-radius: var(--radius-sm);
  box-shadow: 0 6px 24px rgba(0, 255, 102, 0.25);
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.05em;
  text-align: left;
}

.nudge-join {
  background: var(--color-neon-green);
  color: #000;
  border: none;
  padding: 0.35rem 0.55rem;
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.08em;
  white-space: nowrap;
  cursor: pointer;
}

.nudge-x {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-size: 1.05rem;
  line-height: 1;
  padding: 0 0.15rem;
  cursor: pointer;
}

/* Inline mode: the nudge IS the row, not an overlay hung beneath it. */
.voice-nudge.inline {
  position: static;
}

.nudge-enter-active,
.nudge-leave-active { transition: opacity 0.2s, transform 0.2s; }
.nudge-enter-from,
.nudge-leave-to { opacity: 0; transform: translateY(-4px); }

/* Same tactical pill as .hud-audio, self-contained so the cluster renders
   right in the lobby too (game-shared.css only loads with the game views).
   LIVE = green, muted = red, a glow while your own mic is picking you up. */
.hud-voice {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  padding: var(--spacing-2) var(--spacing-3);
  cursor: pointer;
  min-height: 44px;
  border-radius: var(--radius-sm);
  transition:
    border-color var(--duration-snap) var(--ease-snap),
    color var(--duration-snap) var(--ease-snap),
    box-shadow var(--duration-snap) var(--ease-snap);
}

.hud-voice:hover {
  border-color: var(--color-neon-green);
  color: var(--color-neon-green);
}

.hud-voice:disabled {
  cursor: wait;
}

.hud-voice.live {
  border-color: var(--color-neon-green);
  color: var(--color-neon-green);
}

.hud-voice.live.speaking {
  box-shadow: 0 0 10px rgba(0, 255, 102, 0.55);
}

.hud-voice.muted {
  border-color: var(--color-alert);
  color: var(--color-alert);
  box-shadow: none;
}

.hud-voice.error {
  border-color: var(--color-alert);
  color: var(--color-alert);
}

.hud-voice-slash {
  stroke: var(--color-alert);
}

.hud-voice-spinner {
  width: 14px;
  height: 14px;
  border: 2px solid #333;
  border-top-color: var(--color-neon-green);
  border-radius: 50%;
  animation: voice-spin 0.8s linear infinite;
}

.voice-eq {
  display: inline-flex;
  align-items: flex-end;
  gap: 2px;
  height: 12px;
}

.voice-eq i {
  width: 2.5px;
  border-radius: 1px;
  background: var(--color-neon-green);
  opacity: 0.45;
  transition: opacity 0.2s;
}

.voice-eq i:nth-child(1) { height: 5px; }
.voice-eq i:nth-child(2) { height: 9px; }
.voice-eq i:nth-child(3) { height: 6px; }

.voice-eq.active i {
  opacity: 1;
  animation: voice-eq-bounce 0.55s ease-in-out infinite;
}

.voice-eq.active i:nth-child(2) { animation-delay: 0.12s; }
.voice-eq.active i:nth-child(3) { animation-delay: 0.24s; }

@keyframes voice-eq-bounce {
  0%, 100% { transform: scaleY(0.6); }
  50% { transform: scaleY(1.5); }
}

@keyframes voice-spin {
  to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
  .hud-voice-spinner { animation-duration: 1.6s; }
  .voice-eq.active i { animation: none; }
}

/* Phone widths: the label is the overflow source (same treatment as the
   AUDIO button) — the mic icon + color carry the state. RETRY keeps its
   word: a bare red mic reads as "muted", not "tap to retry". */
@media (max-width: 640px) {
  .hud-voice:not(.error) {
    padding: var(--spacing-2);
    min-width: 44px;
    justify-content: center;
  }

  .hud-voice:not(.error) .hud-voice-label {
    display: none;
  }
}
</style>
