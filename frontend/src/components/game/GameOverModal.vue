<template>
  <Teleport to="body">
    <div class="game-over-overlay" :class="{ 'is-win': isWinner, 'is-loss': !isWinner }" @click.self="$emit('back-to-lobby')">
      <!-- Confetti only on win, rendered as CSS particles -->
      <div v-if="isWinner" class="confetti-layer" aria-hidden="true">
        <span v-for="i in 30" :key="i" class="confetti-piece" :style="confettiStyle(i)"></span>
      </div>

      <div class="modal-card" ref="modalRef">
        <!-- Stamp title -->
        <div class="stamp" :class="{ 'stamp-win': isWinner, 'stamp-loss': !isWinner }">
          <h1>{{ isWinner ? 'VICTORY' : isSpectator ? 'ELIMINATED' : 'DEFEATED' }}</h1>
          <div class="stamp-sub">{{ stampSub }}</div>
        </div>

        <p class="tagline">
          <template v-if="isWinner">The runes answer to you.</template>
          <template v-else-if="isSpectator">{{ winnerName }} took the table.</template>
          <template v-else>{{ villainQuote }}</template>
        </p>

        <!-- Stats grid -->
        <div class="stats-grid" v-if="hasStats">
          <div class="stat-cell">
            <div class="stat-value">{{ animated.cardsPlayed }}</div>
            <div class="stat-label">CARDS PLAYED</div>
          </div>
          <div class="stat-cell">
            <div class="stat-value">{{ animated.biggestStack }}</div>
            <div class="stat-label">BIGGEST STACK</div>
          </div>
          <div class="stat-cell">
            <div class="stat-value">{{ animated.unosCalled }}</div>
            <div class="stat-label">RIOT CALLS</div>
          </div>
          <div class="stat-cell">
            <div class="stat-value">{{ animated.peakHand }}</div>
            <div class="stat-label">PEAK HAND</div>
          </div>
        </div>

        <!-- Primary CTA: dominant, color-matched to state -->
        <button class="cta-primary" :class="isWinner ? 'cta-win' : 'cta-loss'" @click="$emit('rematch')">
          {{ mode === 'sp' || canRematch ? 'REMATCH' : 'BACK TO LOBBY' }}
        </button>
        <p v-if="notice" class="rematch-hint rematch-notice">{{ notice }}</p>
        <p v-else-if="mode === 'mp' && !canRematch" class="rematch-hint">The host can start a rematch — stay put.</p>

        <!-- The highest-intent moment in the app: you have just played these
             people, so the ask needs no search and no share code. -->
        <div v-if="addableOpponents.length" class="add-row">
          <span class="add-label">ADD</span>
          <button
            v-for="o in addableOpponents"
            :key="o.userId"
            class="add-chip"
            :disabled="social.pendingIds.has(o.userId) || FINAL_ADD_STATES.has(addState[o.userId] ?? '')"
            @click="addOpponent(o.userId)"
          >
            <UserPlus :size="14" :stroke-width="2" aria-hidden="true" />
            {{ addState[o.userId] ?? o.name }}
          </button>
        </div>

        <!-- Share row (win only — sharing a loss is tone-deaf) -->
        <div v-if="isWinner" class="share-row">
          <button
            class="share-btn share-x"
            type="button"
            aria-label="Share on X"
            title="Share on X"
            :disabled="sharingX"
            @click="onShareX"
          >
            <svg class="share-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path :d="siX.path" />
            </svg>
          </button>
          <button
            class="share-btn share-wa"
            type="button"
            :disabled="sharingWhatsapp"
            @click="onShareWhatsApp"
          >
            <svg class="share-icon-svg" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path :d="siWhatsapp.path" />
            </svg>
            WhatsApp
          </button>
          <button
            class="share-btn share-image"
            type="button"
            :disabled="generatingImage"
            @click="onShareImage"
          >
            <ImageDown class="share-icon-svg" :stroke-width="2" aria-hidden="true" />
            {{ generatingImage ? '…' : 'Image' }}
          </button>
        </div>


        <!-- Daily nudge — the game-over screen is the one surface every
             player reads, so today's deal earns its comeback pitch here.
             The parent decides eligibility (solo game, deal not yet played,
             and never after the daily itself); this just renders. -->
        <div v-if="daily && !claimSpotlight" class="daily-nudge">
          <div class="daily-nudge-text">
            <span class="daily-nudge-title">
              <Flame :size="14" :stroke-width="2" aria-hidden="true" />
              TODAY'S DEAL
              <span v-if="daily.streak > 0" class="daily-nudge-streak">{{ daily.streak }}-day streak</span>
            </span>
            <span class="daily-nudge-sub">The same shuffle for the whole world. One scored attempt.</span>
          </div>
          <button class="daily-nudge-btn" type="button" @click="$emit('play-daily')">PLAY</button>
        </div>

        <!-- First win on this device: the claim pitch earns one prominent
             moment - stats, streak and share card die with the guest session,
             and right after a first win is when that costs something. Every
             later game-over falls back to the quiet footer link. -->
        <div v-if="claimSpotlight" class="claim-nudge">
          <div class="claim-nudge-text">
            <span class="claim-nudge-title">
              <UserPlus :size="14" :stroke-width="2" aria-hidden="true" />
              FIRST WIN LOGGED
            </span>
            <span class="claim-nudge-sub">It lives on this guest session only. Sign in to keep your stats, streak and share card.</span>
          </div>
          <button class="claim-nudge-btn" type="button" @click="$emit('upgrade-account')">SAVE MY STATS</button>
        </div>

        <!-- Footer: small dismissible links, not heavy CTAs -->
        <div class="footer-links">
          <button v-if="mode === 'sp' || canRematch" class="link-btn" @click="$emit('back-to-lobby')">Back to menu</button>
          <button v-if="isAnonymous && !claimSpotlight" class="link-btn upgrade-link" @click="$emit('upgrade-account')">Save your stats <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" /></button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import gsap from 'gsap'
import { ArrowRight, Flame, ImageDown, UserPlus } from 'lucide-vue-next'
import { siX, siWhatsapp } from 'simple-icons'
import { useSocialStore } from '../../stores/socialStore'
import { generateShareImage, shareOrDownload } from '../../utils/shareImage'
import { shouldSpotlightClaim, markClaimSpotlightShown } from '../../utils/claimSpotlight'
import { track } from '../../utils/analytics'

interface Stats {
  cardsPlayed: number
  biggestStack: number
  unosCalled: number
  peakHand: number
}

const props = defineProps<{
  isWinner: boolean
  winnerName: string
  opponentName: string
  stats?: Stats
  isAnonymous: boolean
  mode: 'sp' | 'mp'
  /** Multiplayer: the host can restart the same room; guests wait. */
  canRematch?: boolean
  /** One-line status under the CTA (e.g. "need 2 players"). */
  notice?: string | null
  /** The viewer was knocked out and watched the round end. */
  isSpectator?: boolean
  /** Knock-out placement, e.g. 3 of totalPlayers = "OUT 3RD OF 5". */
  placement?: number | null
  totalPlayers?: number
  /**
   * Today's-deal nudge. The parent decides eligibility (solo game, deal not
   * yet played today, never after the daily itself); null hides the strip.
   */
  daily?: { streak: number } | null
  /** Multiplayer: the humans you just played, for one-tap friend requests. */
  opponents?: { userId: string; name: string }[]
}>()

defineEmits<{
  (e: 'rematch'): void
  (e: 'play-daily'): void
  (e: 'back-to-lobby'): void
  (e: 'upgrade-account'): void
}>()

// Friend requests straight from the result screen. The store is read once on
// mount so someone you are already connected to never shows an ADD chip.
const social = useSocialStore()
const addState = ref<Record<string, string>>({})
onMounted(() => { if (props.mode === 'mp' && props.opponents?.length && !social.unavailable) void social.refresh() })

// First win on this device: one game-over where the claim CTA is loud.
// Marked shown immediately - seen and ignored means quiet from then on.
const claimSpotlight = ref(false)
onMounted(() => {
    claimSpotlight.value = shouldSpotlightClaim(props.isAnonymous, props.isWinner)
    if (claimSpotlight.value) {
        markClaimSpotlightShown()
        track('claim_spotlight_shown', {})
    }
})

// Guests are included on purpose: an anonymous player has a durable profile
// and can hold friends, and asking them to claim first is how a friends list
// stays empty.
const addableOpponents = computed(() => {
    if (props.mode !== 'mp' || social.unavailable) return []
    // Someone already connected to you gets no chip - but one you just
    // pressed keeps its place, or the chip would vanish on success and the
    // tap would read as nothing happening.
    return (props.opponents ?? []).filter(o => !social.knownIds.has(o.userId) || addState.value[o.userId])
})

/** Outcomes a second press cannot improve. TRY AGAIN is deliberately absent:
 *  it is an instruction, and a disabled instruction is a dead end. */
const FINAL_ADD_STATES = new Set(['REQUEST SENT', 'FRIENDS', 'ALREADY ASKED', 'TOO MANY TODAY', 'ASK LATER'])

async function addOpponent(userId: string) {
    const result = await social.sendRequest(userId)
    addState.value = {
        ...addState.value,
        [userId]: result === 'sent' ? 'REQUEST SENT'
            : result === 'accepted' ? 'FRIENDS'
            : result === 'rate_limited' ? 'TOO MANY TODAY'
            : result === 'already' ? 'ALREADY ASKED'
            : result === 'declined' ? 'ASK LATER'
            : 'TRY AGAIN',
    }
}

const modalRef = ref<HTMLElement | null>(null)
const generatingImage = ref(false)
const sharingWhatsapp = ref(false)
const sharingX = ref(false)

// Rotating villain quotes on loss. Builds character without voice acting and
// stops the "{winner} walks away. You don't." line from grinding through
// every session. Picked once per mount so refreshing the loss screen doesn't
// shuffle the line mid-read.
const LOSS_QUOTES = [
  'Fate favors the bold.',
  'You played. You lost. That’s the entire story.',
  'The bot does not forgive.',
  'Run it back. Or don’t. The deck doesn’t care.',
  'Some hands you fold. This was one of them.',
  'You came for a card game. You got a beatdown.',
  'Defeat tastes like every other day.',
  'The house always wins. Today the house was a bot.',
] as const

const villainQuote = LOSS_QUOTES[Math.floor(Math.random() * LOSS_QUOTES.length)]

function ordinal(n: number): string {
  const rem100 = n % 100
  if (rem100 >= 11 && rem100 <= 13) return `${n}TH`
  const suffix = { 1: 'ST', 2: 'ND', 3: 'RD' }[n % 10] ?? 'TH'
  return `${n}${suffix}`
}

const stampSub = computed(() => {
  if (props.isWinner) return 'THE RUNES ARE YOURS'
  if (props.isSpectator && props.placement && props.totalPlayers) {
    return `OUT ${ordinal(props.placement)} OF ${props.totalPlayers}`
  }
  return 'THE RITUAL IS COMPLETE'
})

function sharePayload() {
  return {
    isWinner: props.isWinner,
    opponentName: props.opponentName,
    cardsPlayed: props.stats?.cardsPlayed ?? 0,
    biggestStack: props.stats?.biggestStack ?? 0,
    unosCalled: props.stats?.unosCalled ?? 0,
    peakHand: props.stats?.peakHand ?? 0,
    siteUrl: 'open-mercy.com',
  }
}

async function onShareImage() {
  if (generatingImage.value) return
  generatingImage.value = true
  try {
    const blob = await generateShareImage(sharePayload())
    if (blob) await shareOrDownload(blob)
  } finally {
    generatingImage.value = false
  }
}

// Touch devices (phones/tablets) are where the native Web Share sheet is the
// good UX — it hands the image straight to WhatsApp / X / iMessage. On
// desktop, navigator.share opens the clunky OS share sheet (e.g. macOS), which
// is NOT what someone clicking the X or WhatsApp button expects — they want
// the web composer. So we only take the native path on touch devices and open
// the platform web intent everywhere else.
function preferNativeShare(): boolean {
  if (typeof navigator === 'undefined') return false
  const coarsePointer = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches
  const hasTouch = (navigator.maxTouchPoints || 0) > 0
  return coarsePointer || hasTouch
}

// Shared share-with-image flow for X and WhatsApp. On touch devices, bundle the
// generated image with the text via the Web Share API so the target app picks
// it up natively. On desktop, X's twitter.com/intent and WhatsApp's wa.me don't
// accept image uploads via URL, so we open the platform-specific web composer
// (text + link). The image stays available via the dedicated IMAGE button.
async function shareWithImage(opts: { text: string; url: string; fallbackUrl: string }) {
  const navAny = navigator as Navigator & {
    canShare?: (data: { files?: File[] }) => boolean
    share?: (data: ShareData & { files?: File[] }) => Promise<void>
  }
  if (preferNativeShare() && navAny.canShare && navAny.share) {
    const blob = await generateShareImage(sharePayload())
    if (blob) {
      const file = new File([blob], 'open-mercy-win.png', { type: 'image/png' })
      if (navAny.canShare({ files: [file] })) {
        try {
          await navAny.share({
            files: [file],
            title: 'RUNE RIOT',
            text: `${opts.text}\n\n${opts.url}`,
          })
          return
        } catch {
          // User cancelled the share sheet — deliberate dismiss, don't
          // fall back to the URL or they'd get a second window.
          return
        }
      }
    }
  }
  // Desktop or unsupported browsers: open platform-specific web composer.
  window.open(opts.fallbackUrl, '_blank')
}

const SITE_URL = 'https://open-mercy.com'
const shareText = () => props.mode === 'mp'
  ? 'I mastered the runes in RUNE RIOT. Enter the circle if you dare.'
  : 'I defeated the arcane rival in RUNE RIOT. Enter the circle if you dare.'

async function onShareWhatsApp() {
  if (sharingWhatsapp.value) return
  sharingWhatsapp.value = true
  track('share', { method: 'whatsapp', content_type: props.mode === 'mp' ? 'mp_win' : 'sp_win' })
  try {
    await shareWithImage({
      text: shareText(),
      url: SITE_URL,
      fallbackUrl: `https://wa.me/?text=${encodeURIComponent(`${shareText()}\n\n${SITE_URL}`)}`,
    })
  } finally {
    sharingWhatsapp.value = false
  }
}

async function onShareX() {
  if (sharingX.value) return
  sharingX.value = true
  track('share', { method: 'x', content_type: props.mode === 'mp' ? 'mp_win' : 'sp_win' })
  try {
    await shareWithImage({
      text: shareText(),
      url: SITE_URL,
      fallbackUrl: `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText())}&url=${encodeURIComponent(SITE_URL)}`,
    })
  } finally {
    sharingX.value = false
  }
}

// Animated stat values — tick up from 0 to target over ~900ms.
const animated = ref<Stats>({ cardsPlayed: 0, biggestStack: 0, unosCalled: 0, peakHand: 0 })
const hasStats = computed(() => !!props.stats)

function tickUpStats() {
  if (!props.stats) return
  const target = props.stats
  gsap.to(animated.value, {
    cardsPlayed: target.cardsPlayed,
    biggestStack: target.biggestStack,
    unosCalled: target.unosCalled,
    peakHand: target.peakHand,
    duration: 0.9,
    delay: 0.3,
    ease: 'power2.out',
    snap: { cardsPlayed: 1, biggestStack: 1, unosCalled: 1, peakHand: 1 }
  })
}

onMounted(() => {
  // Entrance animation — stamp scales/rotates in, modal fades.
  if (modalRef.value) {
    gsap.from(modalRef.value, { opacity: 0, y: 30, duration: 0.35, ease: 'power3.out' })
  }
  tickUpStats()
})

watch(() => props.stats, tickUpStats, { deep: true })

// Deterministic confetti positioning so it doesn't reshuffle on re-render.
function confettiStyle(i: number) {
  const colors = ['#ffcc00', '#ff2a2a', '#00f3ff', '#00ff66', '#ffffff']
  const seed = i * 37
  return {
    left: `${(seed % 100)}%`,
    background: colors[i % colors.length],
    animationDelay: `${(seed % 1000) / 1000}s`,
    animationDuration: `${2.2 + ((seed % 800) / 1000)}s`,
  }
}
</script>

<style scoped>
.game-over-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4);
  background: rgba(4, 2, 7, 0.82);
  animation: overlay-in 0.25s ease-out;
}

.game-over-overlay.is-win {
  background: radial-gradient(ellipse at center, rgba(212, 175, 55, 0.2) 0%, rgba(4, 2, 7, 0.9) 62%);
}
.game-over-overlay.is-loss {
  background: radial-gradient(ellipse at center, rgba(123, 74, 226, 0.2) 0%, rgba(4, 2, 7, 0.92) 62%);
}

@keyframes overlay-in { from { opacity: 0 } to { opacity: 1 } }

.modal-card {
  width: 100%;
  max-width: 440px;
  background:
    radial-gradient(circle at 50% 0, rgba(123, 74, 226, 0.12), transparent 42%),
    linear-gradient(180deg, #1a1125 0%, #09070d 100%);
  border: 1px solid rgba(212, 175, 55, 0.28);
  border-radius: var(--radius-md);
  padding: 2rem 1.75rem 1.5rem;
  text-align: center;
  position: relative;
  font-family: var(--font-body);
}

.is-win .modal-card {
  box-shadow: 0 0 50px rgba(255, 204, 0, 0.18), inset 0 0 1px rgba(255, 204, 0, 0.25);
}
.is-loss .modal-card {
  box-shadow: 0 0 50px rgba(255, 42, 42, 0.18), inset 0 0 1px rgba(255, 42, 42, 0.25);
}

/* Stamp title — the emotional anchor of the screen */
.stamp {
  position: relative;
  margin: 0.5rem 0 0.75rem;
  display: inline-block;
  padding: 0.5rem 1.5rem;
  animation: stamp-in 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}
@keyframes stamp-in {
  0%   { opacity: 0; transform: scale(2.5) rotate(-8deg); }
  60%  { opacity: 1; transform: scale(0.92) rotate(-3deg); }
  100% { opacity: 1; transform: scale(1) rotate(-4deg); }
}

.stamp h1 {
  font-family: var(--font-display);
  font-size: clamp(2.4rem, 8vw, 3.6rem);
  letter-spacing: 0.06em;
  line-height: 0.95;
  margin: 0;
}
.stamp-win h1 {
  color: #d4af37;
  text-shadow: 0 0 25px rgba(212, 175, 55, 0.55), 0 0 4px rgba(212, 175, 55, 0.8);
}
.stamp-loss h1 {
  color: #9b7be8;
  text-shadow: 0 0 25px rgba(123, 74, 226, 0.6), 0 0 4px rgba(155, 123, 232, 0.85);
}

.stamp-sub {
  font-size: 0.72rem;
  letter-spacing: 0.4em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 0.25rem;
}

.tagline {
  color: #a1a1aa;
  margin: 0.75rem 0 1.5rem;
  font-size: 0.95rem;
}
.tagline strong { color: #e6e6e6; }

/* Stats grid — 4 cells, 2x2 on mobile and a single row on wider modals */
.stats-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.25rem;
  margin: 0 -0.25rem 1.5rem;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
  padding: 0.85rem 0;
}
.stat-cell {
  padding: 0.25rem 0.4rem;
}
.stat-value {
  font-family: var(--font-display);
  font-size: 1.6rem;
  color: #e6e6e6;
  line-height: 1;
}
.is-win .stat-value { color: #d4af37; }
.stat-label {
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #52525b;
  margin-top: 0.35rem;
}

/* Primary CTA — the obvious next action, dominant and glowing */
.cta-primary {
  width: 100%;
  font-family: var(--font-display);
  font-size: 1.1rem;
  letter-spacing: 0.15em;
  padding: 1rem 1rem;
  border: 2px solid;
  background: transparent;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s, background 0.2s;
}
.cta-primary:hover { transform: translateY(-1px); }
.cta-primary:active { transform: translateY(0); }

.cta-win {
  color: #0a0a0b;
  background: #ffcc00;
  border-color: #ffcc00;
  box-shadow: 0 0 30px rgba(255, 204, 0, 0.45);
}
.cta-win:hover {
  box-shadow: 0 0 40px rgba(255, 204, 0, 0.7);
}

.cta-loss {
  color: #ffffff;
  background: #ff2a2a;
  border-color: #ff2a2a;
  box-shadow: 0 0 30px rgba(255, 42, 42, 0.45);
}
.cta-loss:hover {
  box-shadow: 0 0 40px rgba(255, 42, 42, 0.7);
}

/* Share row — win only */
.share-row {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.85rem;
}
.share-btn {
  flex: 1;
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 500;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 0.65rem 0.5rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.12);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.share-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
}
.share-btn:hover { border-color: rgba(255, 255, 255, 0.3); color: #ffffff; }
.share-icon-svg {
  width: 18px;
  height: 18px;
  flex-shrink: 0;
}
.share-x:hover { border-color: #ffffff; color: #ffffff; }
.share-wa:hover { border-color: #25d366; color: #25d366; }
.share-image:hover { border-color: #ffcc00; color: #ffcc00; }
.share-image:disabled { opacity: 0.5; cursor: wait; }

/* Footer links — minimal, doesn't compete with the primary */
/* Daily nudge — hazard yellow, the daily/streak color zone */
.daily-nudge {
  margin-top: 0.85rem;
  padding: 0.65rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: linear-gradient(180deg, rgba(255, 204, 0, 0.05), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 204, 0, 0.14);
  border-radius: var(--radius-md);
  text-align: left;
}
.daily-nudge-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.daily-nudge-title {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: #ffcc00;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.daily-nudge-streak {
  font-family: var(--font-body);
  font-size: 0.65rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 204, 0, 0.75);
  border: 1px solid rgba(255, 204, 0, 0.25);
  border-radius: 999px;
  padding: 0.05rem 0.45rem;
}
.daily-nudge-sub {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}
.daily-nudge-btn {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  padding: 0.55rem 1rem;
  background: transparent;
  color: #ffcc00;
  border: 1px solid rgba(255, 204, 0, 0.4);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  flex-shrink: 0;
}
.daily-nudge-btn:hover {
  border-color: rgba(255, 204, 0, 0.8);
  color: #ffe066;
}

.claim-nudge {
  margin-top: 0.85rem;
  padding: 0.65rem 0.75rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: linear-gradient(180deg, rgba(255, 255, 255, 0.07), rgba(255, 255, 255, 0.02));
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-md);
  text-align: left;
}
.claim-nudge-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}
.claim-nudge-title {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.12em;
  color: #ffffff;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
}
.claim-nudge-sub {
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}
.claim-nudge-btn {
  font-family: var(--font-body);
  font-size: 0.8rem;
  font-weight: 600;
  letter-spacing: 0.12em;
  padding: 0.55rem 1rem;
  background: transparent;
  color: #ffffff;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: var(--radius-sm);
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
  flex-shrink: 0;
}
.claim-nudge-btn:hover {
  border-color: rgba(255, 255, 255, 0.85);
}

.footer-links {
  margin-top: 1.5rem;
  padding-top: 0.85rem;
  border-top: 1px solid rgba(255, 255, 255, 0.05);
  display: flex;
  justify-content: center;
  gap: 1.5rem;
  flex-wrap: wrap;
}
.rematch-hint {
  margin: 0.6rem 0 0;
  font-family: var(--font-body);
  font-size: 0.72rem;
  letter-spacing: 0.06em;
  color: rgba(255, 255, 255, 0.45);
  text-align: center;
}

.add-row {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  margin-top: 0.75rem;
}

.add-label {
  font-family: var(--font-body);
  font-size: 0.58rem;
  letter-spacing: 0.22em;
  color: rgba(255, 255, 255, 0.35);
}

.add-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  max-width: 12rem;
  padding: 0.25rem 0.6rem;
  background: transparent;
  border: 1px solid rgba(0, 243, 255, 0.3);
  border-radius: 999px;
  color: rgba(0, 243, 255, 0.9);
  font-family: var(--font-body);
  font-size: 0.68rem;
  letter-spacing: 0.04em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}

.add-chip:hover:not(:disabled) {
  background: rgba(0, 243, 255, 0.1);
  border-color: rgba(0, 243, 255, 0.55);
}

.add-chip:disabled {
  opacity: 0.55;
  cursor: default;
}

.rematch-notice {
  color: var(--color-alert, #ff4d4d);
}

.link-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  color: #52525b;
  text-transform: uppercase;
  padding: 0.25rem 0;
  transition: color 0.15s;
}
.link-btn:hover { color: #a1a1aa; }
.upgrade-link:hover { color: #00f3ff; }

/* Confetti — pure CSS particles, no library */
.confetti-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}
.confetti-piece {
  position: absolute;
  top: -10px;
  width: 8px;
  height: 14px;
  opacity: 0;
  animation: confetti-fall linear forwards;
}
@keyframes confetti-fall {
  0%   { opacity: 0; transform: translateY(0) rotate(0deg); }
  10%  { opacity: 1; }
  100% { opacity: 0; transform: translateY(110vh) rotate(720deg); }
}

@media (prefers-reduced-motion: reduce) {
  .game-over-overlay { animation: none; }
  .stamp { animation: none; }
  .confetti-piece { animation: none; opacity: 0; }
}
</style>
