<template>
  <Teleport to="body">
    <div v-if="a" class="ann-overlay" @click.self="dismiss">
      <div
        class="ann"
        :class="[wide ? 'ann--wide' : 'ann--sheet', { 'ann--media': a.imagePath }]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ann-title"
        aria-describedby="ann-body"
      >
        <span v-if="!wide" class="ann-grabber" aria-hidden="true" />

        <figure v-if="a.imagePath" class="ann-media">
          <div class="ann-photo">
            <img :src="a.imagePath" :alt="a.imageCaption ?? ''" width="1598" height="814" decoding="async" />
            <figcaption v-if="a.imageCaption" class="ann-caption">{{ a.imageCaption }}</figcaption>
          </div>
        </figure>

        <div class="ann-copy">
          <p v-if="a.eyebrow" class="ann-eyebrow">{{ a.eyebrow }}</p>
          <h2 id="ann-title" class="ann-headline">
            <span v-if="a.hero" class="ann-hero">{{ a.hero }}</span>
            <span v-if="a.heroTitle || a.heroNote" class="ann-hero-side">
              <span v-if="a.heroTitle" class="ann-hero-title">{{ a.heroTitle }}</span>
              <span v-if="a.heroNote" class="ann-hero-note">{{ a.heroNote }}</span>
            </span>
          </h2>
          <p id="ann-body" class="ann-body">{{ a.body }}</p>

          <p v-if="a.pointsMultiplier" class="ann-clock">
            <Timer :size="14" :stroke-width="2" aria-hidden="true" />
            {{ started ? 'ENDS IN' : 'STARTS IN' }} <span class="ann-clock-time">{{ countdown }}</span>
          </p>

          <div class="ann-actions">
            <button
              ref="joinEl"
              type="button"
              class="ann-join"
              :class="{ 'is-in': justJoined }"
              :disabled="busy || justJoined || ended"
              @click="join"
            >
              <template v-if="justJoined">
                <Check :size="16" :stroke-width="2" aria-hidden="true" />
                YOU'RE IN
              </template>
              <template v-else>{{ a.buttonLabel }}</template>
            </button>
            <p v-if="failed" class="ann-error" role="alert">Couldn't reach the server. Check your connection and try again.</p>
            <p v-if="ended" class="ann-error" role="alert">This one has ended.</p>

            <!-- Joined: one optional next step, then the player closes it. -->
            <div v-if="justJoined" class="ann-next">
              <p class="ann-next-title">Want people to play with?</p>
              <a
                ref="discordEl"
                class="ann-discord"
                :href="DISCORD_INVITE"
                target="_blank"
                rel="noopener noreferrer"
                @click="openDiscord"
              >
                <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path :d="siDiscord.path" /></svg>
                JOIN OUR DISCORD
              </a>
              <button type="button" class="ann-skip" @click="close">Done</button>
            </div>

            <template v-else-if="a.pointsMultiplier && !ended">
              <p class="ann-fine">Points only count {{ boostWord }} after you tap {{ buttonInSentence }}.</p>
              <button type="button" class="ann-skip" :disabled="busy" @click="skip">Not now</button>
            </template>
            <button v-else-if="ended" type="button" class="ann-skip" @click="close">Close</button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import { Check, Timer } from 'lucide-vue-next'
import { siDiscord } from 'simple-icons'
import { useAnnouncement } from '../composables/useAnnouncement'
import { countdownText } from '../utils/announcement'
import { track } from '../utils/analytics'

const { current: a, answer, close, tookVisit } = useAnnouncement()

// Same split as the account modal: a side column needs width and height.
const WIDE_QUERY = '(min-width: 760px) and (min-height: 600px)'
const wideMedia = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null
const wide = ref(wideMedia?.matches ?? false)
const onWideChange = (e: MediaQueryListEvent) => { wide.value = e.matches }

const busy = ref(false)
const failed = ref(false)
const justJoined = ref(false)
const ended = ref(false)
const discordEl = ref<HTMLAnchorElement | null>(null)
const appEl = typeof document !== 'undefined' ? document.getElementById('app') : null
const DISCORD_INVITE = 'https://discord.gg/4hwKGhJak9'
const now = ref(Date.now())
const joinEl = ref<HTMLButtonElement | null>(null)
let tick: ReturnType<typeof setInterval> | null = null
const opener = typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null

const started = computed(() => now.value >= (a.value?.startsAt ?? 0))
// Before the points start the clock counts down to the start, then to the end.
const countdown = computed(() => countdownText((started.value ? a.value?.endsAt ?? 0 : a.value?.startsAt ?? 0) - now.value))
const boostWord = computed(() => (a.value?.pointsMultiplier === 2 ? 'double' : `${a.value?.pointsMultiplier}x`))
const buttonInSentence = computed(() => {
  const label = (a.value?.buttonLabel ?? '').toLowerCase()
  return label.charAt(0).toUpperCase() + label.slice(1)
})

async function join() {
  busy.value = true
  failed.value = false
  const result = await answer(true)
  busy.value = false
  if (result === 'error') { failed.value = true; return }
  track(`announcement_${result}`, eventParams())
  // Ended early while this tab was open: say so instead of closing silently.
  if (result === 'closed') { ended.value = true; return }
  if (result !== 'joined' || !a.value?.pointsMultiplier) { close(); return }
  justJoined.value = true
  void nextTick(() => discordEl.value?.focus())
}

// One event name per answer, so GA counts them with no custom definitions.
// `phase` is already a registered dimension: early = before the points start.
function eventParams() {
  return { announcement_id: a.value?.id, phase: started.value ? 'live' : 'early' }
}

function openDiscord() {
  track('announcement_discord', eventParams())
  close()
}

function skip() {
  if (busy.value || justJoined.value) return
  track('announcement_skipped', eventParams())
  // The skip is counted on the server; the modal closes either way.
  void answer(false)
  close()
}

// A points announcement waits for an explicit answer: a stray tap on the dim
// backdrop must not use up one of the player's two chances to join.
function dismiss() {
  if (justJoined.value || ended.value) close()
  else if (!a.value?.pointsMultiplier) skip()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') dismiss()
}

onMounted(() => {
  tookVisit.value = true
  track('announcement_shown', eventParams())
  // Keeps Tab and taps inside the dialog; it is teleported out of #app.
  appEl?.setAttribute('inert', '')
  wideMedia?.addEventListener('change', onWideChange)
  window.addEventListener('keydown', onKeydown)
  tick = setInterval(() => {
    now.value = Date.now()
    // It ended while open: the server would refuse the tap anyway.
    if (a.value && now.value >= a.value.endsAt) close()
  }, 1000)
  void nextTick(() => joinEl.value?.focus())
})

onUnmounted(() => {
  wideMedia?.removeEventListener('change', onWideChange)
  window.removeEventListener('keydown', onKeydown)
  if (tick) clearInterval(tick)
  appEl?.removeAttribute('inert')
  if (opener?.isConnected) opener.focus()
})
</script>

<style scoped>
.ann-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
}

.ann {
  display: flex;
  background: var(--bg-concrete-light);
  color: var(--text-primary);
  font-family: var(--font-body);
  overflow-y: auto;
  overscroll-behavior: contain;
}

/* Phone: a bottom sheet, picture on top. */
.ann--sheet {
  flex-direction: column;
  width: 100%;
  max-height: 92dvh;
  padding: var(--spacing-3) var(--spacing-6) calc(var(--spacing-8) + env(safe-area-inset-bottom));
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
}

/* Desktop: one dialog, picture in a darker side column. */
.ann--wide {
  align-self: center;
  width: min(960px, calc(100vw - 48px));
  max-height: calc(100dvh - 48px);
  border-radius: var(--radius-lg);
  border: 1px solid var(--surface-metal);
  box-shadow: var(--shadow-lg);
}

.ann--wide:not(.ann--media) {
  width: min(560px, calc(100vw - 48px));
}

.ann-grabber {
  align-self: center;
  flex-shrink: 0;
  width: 36px;
  height: 4px;
  border-radius: var(--radius-pill);
  background: var(--surface-metal);
}

.ann-media {
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.ann--sheet .ann-media {
  padding-top: var(--spacing-6);
}

.ann--wide .ann-media {
  flex: 0 0 420px;
  padding: var(--spacing-12) var(--spacing-8);
  background: var(--surface-metal-dark);
}

/* A photo pinned to the board: white frame, a slight tilt. */
.ann-photo {
  display: flex;
  flex-direction: column;
  width: min(300px, 100%);
  padding: var(--spacing-2) var(--spacing-2) 0;
  border-radius: var(--radius-md);
  background: #ffffff;
  box-shadow: var(--shadow-lg);
  transform: rotate(-2.5deg);
}

.ann--wide .ann-photo {
  width: 340px;
  transform: rotate(-3deg);
}

.ann-photo img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: var(--radius-sm);
}

.ann-caption {
  padding: var(--spacing-2) var(--spacing-1);
  font-size: var(--text-sm);
  font-weight: 500;
  color: #4a4a52;
}

.ann-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.ann--sheet .ann-copy {
  padding-top: var(--spacing-6);
}

.ann--wide .ann-copy {
  flex: 1;
  padding: var(--spacing-12);
}

.ann-eyebrow {
  margin: 0 0 var(--spacing-1);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  /* Small red text is mixed toward white so it stays readable on the dark sheet. */
  color: color-mix(in srgb, var(--color-alert) 85%, white);
}

.ann-headline {
  margin: 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
}

.ann-hero {
  font-family: var(--font-display);
  font-size: var(--text-hero);
  line-height: 1;
  font-weight: 400;
  color: var(--color-alert);
}

.ann-hero-side {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.ann-hero-title {
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  font-weight: 400;
  line-height: 1;
}

.ann-hero-note {
  font-size: var(--text-base);
  font-weight: 600;
  letter-spacing: 0.06em;
}

.ann-body {
  margin: var(--spacing-4) 0 0;
  font-size: var(--text-base);
  line-height: 1.5;
  color: var(--text-secondary);
}

.ann-clock {
  margin: var(--spacing-3) 0 0;
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.12em;
}

.ann-clock svg,
.ann-clock-time {
  color: color-mix(in srgb, var(--color-alert) 85%, white);
}

.ann-clock-time {
  font-variant-numeric: tabular-nums;
}

.ann-actions {
  margin-top: var(--spacing-8);
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-3);
}

.ann-join {
  height: 56px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  border: 1px solid var(--color-alert);
  border-radius: var(--radius-lg);
  background: var(--color-alert);
  color: #ffffff;
  font-family: var(--font-body);
  font-size: var(--text-lg);
  font-weight: 700;
  letter-spacing: 0.06em;
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
  transition: background-color var(--duration-snap) var(--ease-snap);
}

.ann-join:disabled {
  cursor: default;
}

.ann-join.is-in {
  background: var(--surface-metal);
  border-color: var(--surface-metal);
  color: var(--color-neon-green);
}

.ann-error {
  margin: 0;
  font-size: var(--text-sm);
  text-align: center;
  color: color-mix(in srgb, var(--color-alert) 85%, white);
}

.ann-fine {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.4;
  text-align: center;
  color: var(--text-muted);
}

.ann-skip {
  align-self: center;
  min-height: 44px;
  padding: 0 var(--spacing-4);
  border: none;
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-secondary);
  text-decoration: underline;
  text-underline-offset: 4px;
  cursor: pointer;
}

/* Joined: the optional Discord invite, quieter than the red button above. */
.ann-next {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: var(--spacing-3);
  padding-top: var(--spacing-3);
}

.ann-next-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  text-align: center;
  color: var(--text-primary);
}

.ann-discord {
  height: 48px;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  border-radius: var(--radius-lg);
  /* Discord's own blurple, the same as the release card's Discord button. */
  background: #5865f2;
  color: #ffffff;
  font-size: var(--text-base);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-decoration: none;
}

.ann-discord svg {
  fill: currentColor;
}

@media (hover: hover) {
  .ann-discord:hover {
    background: #4752c4;
  }
}

@media (prefers-reduced-motion: no-preference) {
  .ann-join {
    transition: scale var(--duration-snap) var(--ease-snap), background-color var(--duration-snap) var(--ease-snap);
  }
  .ann-join:enabled:active {
    scale: 0.96;
  }
  .ann--sheet {
    animation: ann-rise var(--duration-soft) var(--ease-strut) backwards;
  }
  .ann--wide {
    animation: ann-fade var(--duration-soft) var(--ease-strut) backwards;
  }
}

@media (prefers-reduced-motion: reduce) {
  .ann {
    animation: ann-fade var(--duration-snap) ease-out backwards;
  }
}

@keyframes ann-rise {
  from { transform: translateY(24px); opacity: 0; }
}

@keyframes ann-fade {
  from { opacity: 0; }
}
</style>
