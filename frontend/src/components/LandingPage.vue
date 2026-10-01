<template>
  <div class="landing-container">
    <!-- Top bar — all three CTAs visible from the first pixel, no scroll needed -->
    <header class="top-bar">
      <a class="brand-mark" href="#" @click.prevent>
        <span class="brand-mark-uno">OPEN</span>
        <span class="brand-mark-nomercy">MERCY</span>
      </a>

      <div class="top-bar-cta">
        <button class="text-link" @click="reportAndEmit('showAuth', 'signup')">
          SIGN UP
        </button>
        <span class="text-link-sep" aria-hidden="true">·</span>
        <button class="text-link" @click="reportAndEmit('showAuth', 'login')">
          SIGN IN
        </button>
      </div>
    </header>

    <!-- HERO — cinematic card-stack choreography -->
    <section class="hero">
      <div class="hero-bloom" aria-hidden="true"></div>

      <div class="hero-stage" ref="heroStage">
        <!-- The 5-card stack. Each card has a unique entry trajectory. After
             the explosion beat they scatter to ambient positions behind the
             wordmark. Refs are GSAP-driven. -->
        <div
          v-for="(card, idx) in heroCards"
          :key="card.id"
          class="hero-card"
          :ref="(el) => { if (el) cardRefs[idx] = el as HTMLElement }"
        >
          <Card :card="card" :size="cardSize" />
        </div>

        <!-- The counter — typographic centerpiece during the stack beats -->
        <div class="hero-counter" ref="counterRef" aria-hidden="true">
          <span class="counter-plus">+</span><span class="counter-num">0</span>
        </div>
      </div>

      <!-- Wordmark — fades in after the explosion. It's the page's h1: the
           boot-screen h1 in index.html is destroyed when Vue mounts, so the
           rendered landing page had no top-level heading at all. -->
      <h1 class="hero-wordmark" ref="wordmarkRef">
        <span class="wm-uno">OPEN</span>
        <span class="wm-row">
          <span class="wm-mercy-wrap">
            <span class="wm-mercy">MERCY</span>
            <svg
              class="wm-strike"
              ref="strikeRef"
              viewBox="0 0 100 8"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <line x1="2" y1="4" x2="98" y2="4" stroke="currentColor" stroke-width="5" stroke-linecap="round" />
            </svg>
          </span>
        </span>
      </h1>

      <p class="hero-tagline" ref="taglineRef">THE RUTHLESS CARD BATTLE</p>

      <div class="hero-cta" ref="heroCtaRef">
        <p v-if="inviteCode" class="invite-banner">
          You've been invited to room <strong>{{ inviteCode }}</strong> — jump in.
        </p>
        <Button variant="primary" size="lg" :disabled="loading" @click="reportAndEmit('playGuest')">
          {{ loading ? 'ENTERING…' : (inviteCode ? 'JOIN THE GAME' : 'PLAY NOW') }}
        </Button>
        <button type="button" class="rules-peek" @click="showRules = true">
          New to Open Mercy? See how it works
        </button>
        <button type="button" class="rules-peek" @click="navigate({ name: 'leaderboard' })">
          Today's leaderboard <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>

      <LandingStatsBadge class="hero-stats" />

      <!-- Sentinel for sticky-CTA observer -->
      <div ref="heroSentinel" class="hero-sentinel" aria-hidden="true"></div>
    </section>

    <!-- Scroll sections (kept from Phase 1) -->
    <LandingScrollSections @openFeedback="showFeedback = true" />

    <LandingGuide />

    <LandingFAQ />

    <!-- The sticky CTA covers the bottom of the screen, so it steps aside once
         the footer arrives; otherwise its links can't be tapped on phones. -->
    <div ref="footerSentinel" aria-hidden="true"></div>
    <SiteFooter />

    <!-- Sticky mobile CTA — teleported so containing-block doesn't pin it -->
    <Teleport to="body">
      <Transition name="sticky-cta">
        <div v-show="showStickyCta" class="sticky-cta-wrap">
          <Button variant="primary" size="lg" block :disabled="loading" @click="reportAndEmit('playGuest')">
            {{ loading ? 'ENTERING…' : 'PLAY NOW' }}
          </Button>
        </div>
      </Transition>
    </Teleport>

    <FeedbackModal v-if="showFeedback" @close="showFeedback = false" />
    <RulesModal v-if="showRules" @close="showRules = false" />
  </div>
</template>

<script setup lang="ts">
import { ArrowRight } from 'lucide-vue-next'
import { ref, onMounted, onUnmounted, computed } from 'vue'
import gsap from 'gsap'
import LandingScrollSections from './LandingScrollSections.vue'
import LandingGuide from './LandingGuide.vue'
import LandingFAQ from './LandingFAQ.vue'
import SiteFooter from './SiteFooter.vue'
import FeedbackModal from './FeedbackModal.vue'
import RulesModal from './RulesModal.vue'
import LandingStatsBadge from './LandingStatsBadge.vue'
import Card from './game/Card.vue'
import Button from './ui/Button.vue'
import { useScreenSize } from '../composables/useScreenSize'
import { navigate } from '../utils/routes'

const props = defineProps<{ loading?: boolean }>()

const showFeedback = ref(false)
const showRules = ref(false)

// If the visitor arrived via a shared invite URL (?join=CODE), surface that
// context instead of a generic landing — the lobby auto-joins the code once
// they sign in as a guest.
const inviteCode = (() => {
  if (typeof window === 'undefined') return ''
  const c = new URLSearchParams(window.location.search).get('join')?.toUpperCase().trim() || ''
  return /^[A-Z0-9]{4,8}$/.test(c) ? c : ''
})()
const heroOutOfView = ref(false)
const footerInView = ref(false)
const showStickyCta = computed(() => heroOutOfView.value && !footerInView.value)
const heroSentinel = ref<HTMLElement>()
const footerSentinel = ref<HTMLElement>()
const heroStage = ref<HTMLElement>()
const cardRefs = ref<HTMLElement[]>([])
const counterRef = ref<HTMLElement>()
const wordmarkRef = ref<HTMLElement>()
const strikeRef = ref<SVGSVGElement>()
const taglineRef = ref<HTMLElement>()
const heroCtaRef = ref<HTMLElement>()

const emit = defineEmits<{
  (e: 'showAuth', mode: 'login' | 'signup'): void
  (e: 'playGuest', nickname?: string): void
}>()

const { isMobile } = useScreenSize()
const cardSize = computed(() =>
  isMobile.value ? { width: 84, height: 118 } : { width: 124, height: 174 },
)

// The hero card sequence — each represents one beat of the stack escalation.
// Counter values that match: +2, +6, +12, +22 (peak before mercy rule).
const heroCards = [
  { id: 'h1', color: 'red', type: 'draw2' },
  { id: 'h2', color: 'wild', type: 'draw4' },
  { id: 'h3', color: 'wild', type: 'draw6' },
  { id: 'h4', color: 'wild', type: 'draw10' },
  { id: 'h5', color: 'red', type: 'skipEveryone' },
] as const

const COUNTER_BEATS = [2, 6, 12, 22, 22] // index-matched to heroCards (5th doesn't add)

function reportAndEmit(event: 'playGuest'): void
function reportAndEmit(event: 'showAuth', mode: 'login' | 'signup'): void
function reportAndEmit(event: 'playGuest' | 'showAuth', mode?: 'login' | 'signup') {
  // Guard against a second guest sign-in (e.g. Enter key while the first is
  // still in flight) — the buttons are :disabled but the input's Enter isn't.
  if (event === 'playGuest' && props.loading) return
  const fn = (window as unknown as { gtag_report_conversion?: () => void }).gtag_report_conversion
  if (typeof fn === 'function') {
    try { fn() } catch { /* noop */ }
  }
  if (event === 'showAuth' && mode) emit('showAuth', mode)
  else if (event === 'playGuest') emit('playGuest')
}

let observer: IntersectionObserver | null = null
let masterTl: gsap.core.Timeline | null = null

const reducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia('(prefers-reduced-motion: reduce)').matches

onMounted(() => {
  if (heroSentinel.value) {
    observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.target === heroSentinel.value) heroOutOfView.value = !entry.isIntersecting
          else footerInView.value = entry.isIntersecting
        }
      },
      { threshold: 0 },
    )
    observer.observe(heroSentinel.value)
    if (footerSentinel.value) observer.observe(footerSentinel.value)
  }

  // If reduced motion, set the final state directly and skip the choreography.
  if (reducedMotion) {
    setStaticState()
    return
  }

  // Defer GSAP setup so refs are wired
  requestAnimationFrame(() => runHeroChoreography())
})

onUnmounted(() => {
  observer?.disconnect()
  observer = null
  masterTl?.kill()
  masterTl = null
})

function setStaticState() {
  // Final pose: cards offscreen, wordmark + strike + tagline + CTA visible
  cardRefs.value.forEach((el) => {
    if (!el) return
    gsap.set(el, { opacity: 0 })
  })
  gsap.set(counterRef.value!, { opacity: 0 })
  gsap.set(wordmarkRef.value!, { opacity: 1, y: 0 })
  gsap.set(strikeRef.value!.querySelector('line'), { strokeDashoffset: 0 })
  gsap.set(taglineRef.value!, { opacity: 1, y: 0 })
  gsap.set(heroCtaRef.value!, { opacity: 1, y: 0 })
}

/**
 * Exit trajectories — cards fly off-screen entirely after the climax so the
 * wordmark stands alone. Was scatter-behind-wordmark; that competed with
 * the typography and read as noise.
 */
const exitPoses = [
  { x: -800, y: -400, rotation: -180 },
  { x: 800, y: -500, rotation: 220 },
  { x: -700, y: 500, rotation: -160 },
  { x: 750, y: 600, rotation: 240 },
  { x: 0, y: -800, rotation: -360 },
] as const

function runHeroChoreography() {
  if (!heroStage.value || cardRefs.value.length < 5) return

  const counterEl = counterRef.value!
  const counterNum = counterEl.querySelector('.counter-num') as HTMLElement
  const strikeLine = strikeRef.value!.querySelector('line') as SVGLineElement

  // Initial setup — cards hidden off-stage, counter dim, wordmark + tagline hidden
  cardRefs.value.forEach((el) => {
    gsap.set(el, { opacity: 0, scale: 1, x: 0, y: -600, rotation: 0 })
  })
  gsap.set(counterEl, { opacity: 0, scale: 0.5 })
  gsap.set(wordmarkRef.value!, { opacity: 0, y: 20 })
  gsap.set(strikeLine, { strokeDasharray: 100, strokeDashoffset: 100 })
  gsap.set(taglineRef.value!, { opacity: 0, y: 12 })
  gsap.set(heroCtaRef.value!, { opacity: 0, y: 16 })

  const tl = gsap.timeline()
  masterTl = tl

  // Pre-define unique entry trajectories per card — each comes from a
  // different direction with its own rotation so the stack feels physical.
  const entries = [
    { fromX: 0, fromY: -600, fromRot: -8, restRot: -2, restY: 0 },
    { fromX: 200, fromY: -500, fromRot: 30, restRot: 4, restY: -4 },
    { fromX: -240, fromY: -450, fromRot: -45, restRot: -3, restY: -8 },
    { fromX: 260, fromY: -550, fromRot: 60, restRot: 5, restY: -12 },
    { fromX: 0, fromY: -650, fromRot: -90, restRot: -1, restY: -16 },
  ]

  // BEAT 1-5: cards slam into stack with counter updates
  cardRefs.value.forEach((el, i) => {
    if (!el) return
    const entry = entries[i]!
    const beatStart = i * 0.32

    // From-state
    gsap.set(el, { x: entry.fromX, y: entry.fromY, rotation: entry.fromRot })

    // Slam in
    tl.to(
      el,
      {
        opacity: 1,
        x: 0,
        y: entry.restY,
        rotation: entry.restRot,
        duration: 0.28,
        ease: 'power3.in',
      },
      beatStart,
    )

    // Tiny squash on impact then settle
    tl.to(
      el,
      { scale: 1.04, duration: 0.06, ease: 'power2.out' },
      beatStart + 0.26,
    )
    tl.to(
      el,
      { scale: 1, duration: 0.18, ease: 'elastic.out(1, 0.5)' },
      beatStart + 0.32,
    )

    // Counter pops in on first beat, then increments
    if (i === 0) {
      tl.to(
        counterEl,
        { opacity: 1, scale: 1, duration: 0.18, ease: 'back.out(2.5)' },
        beatStart + 0.2,
      )
    }
    // Animate the number counting up to the new beat value
    const startValue = i === 0 ? 0 : COUNTER_BEATS[i - 1]!
    const endValue = COUNTER_BEATS[i]!
    const obj = { v: startValue }
    tl.to(
      obj,
      {
        v: endValue,
        duration: 0.18,
        ease: 'power2.out',
        onUpdate: () => {
          counterNum.textContent = String(Math.round(obj.v))
        },
      },
      beatStart + 0.26,
    )
    // Counter punch — scales up on each increment
    tl.to(
      counterEl,
      { scale: 1.18, duration: 0.08, ease: 'power2.out' },
      beatStart + 0.26,
    )
    tl.to(
      counterEl,
      { scale: 1, duration: 0.14, ease: 'elastic.out(1, 0.4)' },
      beatStart + 0.34,
    )
  })

  // BEAT 6: levitation — all cards rise then snap back. The screen shakes.
  const climaxAt = 5 * 0.32 + 0.05
  tl.to(
    cardRefs.value,
    { y: '-=60', duration: 0.18, ease: 'power2.out' },
    climaxAt,
  )
  tl.to(
    counterEl,
    { scale: 1.8, duration: 0.18, ease: 'power2.out' },
    climaxAt,
  )
  tl.to(
    cardRefs.value,
    { y: '+=60', duration: 0.12, ease: 'power3.in' },
    climaxAt + 0.18,
  )
  tl.to(
    counterEl,
    { scale: 1, duration: 0.18, ease: 'elastic.out(1, 0.4)' },
    climaxAt + 0.2,
  )
  // Screen shake — translate the hero stage briefly
  if (heroStage.value) {
    tl.to(
      heroStage.value,
      {
        keyframes: [
          { x: -6 }, { x: 6 }, { x: -4 }, { x: 4 }, { x: -2 }, { x: 0 },
        ],
        duration: 0.36,
        ease: 'power2.out',
      },
      climaxAt + 0.16,
    )
  }

  // BEAT 7: explosion — cards FLY OFFSCREEN entirely, leaving wordmark clean.
  // No more scatter-behind-wordmark (that was noise, not premium texture).
  const explodeAt = climaxAt + 0.4
  cardRefs.value.forEach((el, i) => {
    if (!el) return
    const pose = exitPoses[i]!
    tl.to(
      el,
      {
        x: pose.x,
        y: pose.y,
        rotation: pose.rotation,
        scale: 0.7,
        opacity: 0,
        duration: 0.7,
        ease: 'power3.in',
      },
      explodeAt,
    )
  })
  tl.to(
    counterEl,
    { opacity: 0, scale: 0.6, duration: 0.32, ease: 'power2.in' },
    explodeAt,
  )

  // BEAT 8: wordmark fades up where the stack was — now uncontested
  tl.to(
    wordmarkRef.value!,
    { opacity: 1, y: 0, duration: 0.5, ease: 'power3.out' },
    explodeAt + 0.2,
  )

  // BEAT 9: strike-through draws across MERCY
  tl.to(
    strikeLine,
    { strokeDashoffset: 0, duration: 0.42, ease: 'power2.inOut' },
    explodeAt + 0.55,
  )

  // BEAT 10: tagline rises in
  tl.to(
    taglineRef.value!,
    { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' },
    explodeAt + 0.85,
  )

  // BEAT 11: hero CTA — the conversion moment, anchors the bottom of the hero
  tl.to(
    heroCtaRef.value!,
    { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out' },
    explodeAt + 1.05,
  )
}
</script>

<style scoped>
.landing-container {
  background: var(--bg-concrete);
  color: var(--text-primary);
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 100vh;
}

/* TOP BAR — slim, always visible. Three CTAs visible from pixel one. */
.top-bar {
  position: relative;
  z-index: var(--z-hud);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-4);
  border-bottom: 1px solid rgba(255, 204, 0, 0.08);
  background: linear-gradient(180deg, rgba(10, 10, 11, 0.95), rgba(10, 10, 11, 0.7));
  backdrop-filter: blur(8px);
  flex-wrap: wrap;
}

.brand-mark {
  display: inline-flex;
  align-items: baseline;
  gap: var(--spacing-2);
  text-decoration: none;
  color: var(--text-primary);
}

.brand-mark-uno {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  letter-spacing: 0.05em;
}

.brand-mark-nomercy {
  font-family: var(--font-display);
  font-size: var(--text-sm);
  letter-spacing: 0.2em;
  color: var(--color-alert);
  text-shadow: 0 0 12px rgba(255, 42, 42, 0.5);
}

.top-bar-cta {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-3);
}

.top-bar-cta :deep(.btn--sm) {
  letter-spacing: 0.12em;
}

.text-link {
  background: none;
  border: none;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  cursor: pointer;
  padding: var(--spacing-2);
  transition: color var(--duration-snap) var(--ease-snap);
  min-height: 44px;
}

.text-link:hover {
  color: var(--color-neon-blue);
}

.text-link-sep {
  color: var(--text-muted);
}

/* HERO */
.hero {
  position: relative;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-8);
  padding: var(--spacing-12) var(--spacing-4) var(--spacing-16);
  overflow: hidden;
  min-height: 560px;
}

/* The focused radial bloom — replaces the generic full-page atmosphere */
.hero-bloom {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 720px;
  height: 720px;
  max-width: 110vw;
  max-height: 110vh;
  transform: translate(-50%, -50%);
  background: radial-gradient(
    circle,
    rgba(255, 42, 42, 0.18) 0%,
    rgba(255, 42, 42, 0.08) 30%,
    transparent 65%
  );
  pointer-events: none;
  z-index: 0;
}

.hero-stage {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  width: 100%;
  max-width: 480px;
  height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-cards);
  pointer-events: none;
}

.hero-card {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  filter: drop-shadow(0 10px 24px rgba(0, 0, 0, 0.6));
  will-change: transform, opacity;
}

.hero-counter {
  position: absolute;
  top: 50%;
  left: calc(50% + 130px);
  transform: translate(0, -50%);
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 8vw, 4.5rem);
  color: var(--color-alert);
  text-shadow: 0 0 32px rgba(255, 42, 42, 0.7);
  pointer-events: none;
  z-index: var(--z-cards);
  display: flex;
  align-items: baseline;
}

.counter-plus {
  font-size: 0.65em;
  margin-right: 0.08em;
  opacity: 0.85;
}

.hero-wordmark {
  position: relative;
  z-index: var(--z-base);
  text-align: center;
  font-family: var(--font-display);
  line-height: 0.95;
  letter-spacing: 0.04em;
  /* It's an h1 now — drop the UA margin so the hero layout is unchanged. */
  margin: 0;
  font-weight: inherit;
}

.wm-uno {
  display: block;
  font-size: clamp(3.5rem, 13vw, 7rem);
  text-shadow: 0 0 32px rgba(255, 42, 42, 0.35);
}

.wm-row {
  display: inline-flex;
  align-items: baseline;
  font-size: clamp(2rem, 7vw, 4rem);
}

.wm-mercy-wrap {
  position: relative;
  display: inline-block;
}

.wm-mercy {
  color: var(--color-alert);
  text-shadow: 0 0 24px rgba(255, 42, 42, 0.55);
}

.wm-strike {
  position: absolute;
  top: 50%;
  left: -4%;
  width: 108%;
  height: 18%;
  transform: translateY(-50%);
  color: var(--color-alert);
  filter: drop-shadow(0 0 12px rgba(255, 42, 42, 0.85));
  pointer-events: none;
}

.hero-tagline {
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  letter-spacing: 0.3em;
  text-transform: uppercase;
  margin: 0;
  z-index: var(--z-base);
}

.hero-cta {
  position: relative;
  z-index: var(--z-base);
  margin-top: var(--spacing-2);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-3);
}

.rules-peek {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  color: var(--text-muted);
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.78rem;
  letter-spacing: 0.08em;
  cursor: pointer;
  padding: var(--spacing-2);
  text-decoration: underline;
  text-underline-offset: 3px;
  transition: color 0.2s;
}
.rules-peek:hover { color: var(--text-primary); }

.invite-banner {
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.85rem;
  letter-spacing: 0.03em;
  color: var(--text-secondary);
  background: rgba(0, 255, 102, 0.1);
  border: 1px solid rgba(0, 255, 102, 0.3);
  border-radius: 6px;
  padding: 0.5rem 1rem;
  max-width: min(360px, 86vw);
  text-align: center;
  margin-bottom: var(--spacing-2);
}
.invite-banner strong { color: #00ff66; letter-spacing: 0.1em; }

.hero-stats {
  z-index: var(--z-base);
}

.hero-sentinel {
  position: absolute;
  bottom: 0;
  left: 0;
  width: 1px;
  height: 1px;
  pointer-events: none;
}

/* STICKY MOBILE CTA */
.sticky-cta-wrap {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  padding: var(--spacing-3) var(--spacing-4)
    calc(var(--spacing-3) + env(safe-area-inset-bottom));
  background: linear-gradient(to top, var(--bg-concrete) 70%, transparent);
  z-index: var(--z-toast);
}

.sticky-cta-enter-active,
.sticky-cta-leave-active {
  transition:
    transform var(--duration-soft) var(--ease-soft),
    opacity var(--duration-soft) var(--ease-soft);
}

.sticky-cta-enter-from,
.sticky-cta-leave-to {
  transform: translateY(100%);
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .sticky-cta-enter-active,
  .sticky-cta-leave-active {
    transition: none;
  }
}

/* MOBILE TWEAKS */
@media (max-width: 600px) {
  .top-bar {
    padding: var(--spacing-3);
    gap: var(--spacing-2);
  }

  .brand-mark-uno {
    font-size: var(--text-lg);
  }

  .brand-mark-nomercy {
    font-size: var(--text-xs);
    letter-spacing: 0.15em;
  }

  .top-bar-cta {
    gap: var(--spacing-2);
  }

  .text-link {
    font-size: var(--text-xs);
    padding: var(--spacing-1) var(--spacing-2);
    letter-spacing: 0.1em;
  }

  .hero {
    padding: var(--spacing-8) var(--spacing-4) var(--spacing-16);
    min-height: 460px;
  }

  .hero-stage {
    height: 200px;
  }

  .hero-counter {
    left: calc(50% + 90px);
    font-size: 2.8rem;
  }
}

@media (max-width: 420px) {
  .top-bar {
    flex-direction: column;
    align-items: stretch;
  }

  .brand-mark {
    justify-content: center;
  }

  .top-bar-cta {
    justify-content: center;
    flex-wrap: wrap;
  }
}

/* DESKTOP */
@media (min-width: 1024px) {
  .top-bar {
    padding: var(--spacing-4) var(--spacing-8);
  }

  .brand-mark-uno {
    font-size: var(--text-2xl);
  }

  .brand-mark-nomercy {
    font-size: var(--text-base);
  }

  .hero {
    min-height: 640px;
  }

  .sticky-cta-wrap {
    display: none;
  }
}
</style>
