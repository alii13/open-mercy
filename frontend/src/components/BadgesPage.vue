<template>
  <div class="bp-page">
    <header class="bp-topbar">
      <button class="back-link" @click="$emit('back')">
        <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
        BACK
      </button>
      <h1 class="bp-title">BADGES</h1>
      <button type="button" class="bp-share" :aria-label="`Share ${tierOf(sel).title}`" @click="share">
        <Share :size="20" :stroke-width="2" aria-hidden="true" />
        <span v-if="copied" class="bp-copied" role="status">Copied</span>
      </button>
    </header>

    <main class="bp-col">
      <!-- One medal up close: its name, the live 3D medal and two facts about it. -->
      <section class="bp-hero" aria-live="polite">
        <div ref="nameEl" class="bp-name-block" @pointerdown="swipeStart" @pointerup="swipeEnd">
          <h2 class="bp-name">{{ tierOf(sel).title }}</h2>
          <p class="bp-meta">{{ metaLine(sel) }}</p>
        </div>
        <div class="bp-medal-wrap">
          <span class="bp-glow" :class="`bp-glow--${stateOf(sel)}`" aria-hidden="true"></span>
          <MedalView class="bp-medal" :tier="sel" :locked="stateOf(sel) === 'locked'" :facts="facts" :sides="wide" :label="wide ? tierOf(sel).title : `${tierOf(sel).title}: next fact`">
            <button v-if="sel > 1" type="button" class="bp-arrow bp-arrow--prev" :aria-label="`Previous badge, ${tierOf(sel - 1).title}`" @click="select(sel - 1)">
              <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
            <button v-if="sel < 20" type="button" class="bp-arrow bp-arrow--next" :aria-label="`Next badge, ${tierOf(sel + 1).title}`" @click="select(sel + 1)">
              <ChevronRight :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
          </MedalView>
        </div>
      </section>

      <!-- Desktop puts the count above the wall; the phone puts it under the cabinet. -->
      <footer v-if="wide" class="bp-foot">
        <div>
          <p class="bp-foot-title">{{ badge.tier }} of 20 on your shelf</p>
          <p v-if="rarityLine" class="bp-foot-sub">{{ rarityLine }}</p>
        </div>
        <button type="button" class="bp-how" @click="sheetOpen = true">
          <span class="bp-how-in">
            How you climb
            <ChevronRight :size="14" :stroke-width="2" aria-hidden="true" />
          </span>
        </button>
      </footer>

      <BadgeShelf :tier="badge.tier" :sel="sel" :points="badgePoints" :holders="holders" :dates="dates" :cols="wide ? 5 : 3" @select="pick" />

      <footer v-if="!wide" class="bp-foot">
        <div>
          <p class="bp-foot-title">{{ badge.tier }} of 20 on your shelf</p>
          <p v-if="rarityLine" class="bp-foot-sub">{{ rarityLine }}</p>
        </div>
        <button type="button" class="bp-how" @click="sheetOpen = true">
          <span class="bp-how-in">
            How you climb
            <ChevronRight :size="14" :stroke-width="2" aria-hidden="true" />
          </span>
        </button>
      </footer>
    </main>

    <SiteFooter />
    <PointsSheet v-if="sheetOpen" :tier="badge.tier" @close="sheetOpen = false" />
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, Share } from 'lucide-vue-next'
import gsap from 'gsap'
import { useMediaQuery } from '@vueuse/core'
import { computed, ref, watch } from 'vue'
import { BADGES, applyDecay, badgeFor, badgeSlug, pointsFromRetention, tierFromSlug } from '../utils/badges'
import { currentRoute, router } from '../utils/routes'
import { useBadges } from '../composables/useBadges'
import { useAuthStore } from '../stores/authStore'
import { useRetentionStore } from '../stores/retentionStore'
import MedalView from './badges/MedalView.vue'
import BadgeShelf from './badges/BadgeShelf.vue'
import PointsSheet from './badges/PointsSheet.vue'
import { badgeFacts } from '../utils/badgeFacts'
import { useBadgeHolders } from '../composables/useBadgeHolders'
import { useBadgeDates } from '../composables/useBadgeDates'
import { shareText } from '../utils/share'
import SiteFooter from './SiteFooter.vue'

defineEmits<{ (e: 'back'): void }>()

const auth = useAuthStore()
const retention = useRetentionStore()
// The same player_points read as every other badge in the app, rather than
// the player's whole game history. Fresh, because the cache is per session and
// this page is about the total after today's games.
const { badges, fetchBadges } = useBadges()
const { dates, fetchDates } = useBadgeDates()
watch(() => auth.user?.id, (id) => {
  void fetchDates(id ?? null)
  if (id) void fetchBadges([id], { fresh: true })
}, { immediate: true })

function daysIdleFromDate(dateStr: string | null): number {
  if (!dateStr) return 0
  const then = Date.parse(`${dateStr}T00:00:00`)
  if (Number.isNaN(then)) return 0
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000))
}

// Signed out, the local estimate, so a visitor's badge still climbs.
const badgePoints = computed(() => {
  const id = auth.user?.id
  if (id) return badges.value[id]?.points ?? 0
  const earned = pointsFromRetention({
    gamesPlayed: retention.gamesPlayed,
    gamesWon: retention.gamesWon,
    unoCalls: retention.totalUnos,
  })
  return applyDecay(earned, daysIdleFromDate(retention.lastPlayedDate))
})
const badge = computed(() => badgeFor(badgePoints.value))

type TierState = 'earned' | 'current' | 'locked'
const tierOf = (n: number) => BADGES[Math.min(19, Math.max(0, n - 1))]!
const stateOf = (n: number): TierState => (n < badge.value.tier ? 'earned' : n === badge.value.tier ? 'current' : 'locked')

const { holders, fetchHolders } = useBadgeHolders()
void fetchHolders()
const facts = computed(() => badgeFacts(sel.value, holders.value))

function metaLine(n: number): string {
  if (stateOf(n) === 'locked') return `TIER ${n} OF 20 · UNLOCKS AT ${tierOf(n).threshold.toLocaleString()}`
  const on = dates.value[n]
  return `TIER ${n} OF 20 · EARNED${on ? ` ${on.toUpperCase()}` : ''}`
}

// How rare the next badge is, under the shelf count.
const rarityLine = computed(() => {
  const next = BADGES[badge.value.tier]
  const h = holders.value
  if (!next || !h?.total) return ''
  const n = h.byTier[next.tier] ?? 0
  if (n === 0) return `Nobody has ${next.title} yet. Be the first.`
  if (n === 1) return `Only one player has ${next.title}`
  return `Only 1 in ${Math.round(h.total / n).toLocaleString()} players has ${next.title}`
})

// ---- moving through the ladder: arrows, the shelf, or a swipe on the name
const sel = ref(1)
// Follow the player's own tier (it changes when their points load) until they pick one themselves,
// or until a link like /badges/god-of-no-mercy names one.
let picked = false
watch(() => badge.value.tier, (t) => { if (!picked) sel.value = t }, { immediate: true })
watch(() => currentRoute.value.name === 'badges' ? currentRoute.value.badge : undefined, (slug) => {
  const t = slug ? tierFromSlug(slug) : null
  if (slug && !t) void router.replace({ path: '/badges', query: router.currentRoute.value.query })
  else if (t && t !== sel.value) { picked = true; sel.value = t }
}, { immediate: true })
function select(n: number) {
  picked = true
  sel.value = Math.min(20, Math.max(1, n))
}
// The address bar names the badge on show, so copying it shares that badge. Replace, not push:
// flicking through badges should not fill the back button.
watch(sel, (n) => {
  if (!picked) return
  const path = `/badges/${badgeSlug(tierOf(n))}`
  if (router.currentRoute.value.path !== path) void router.replace({ path, query: router.currentRoute.value.query })
})
function pick(n: number) {
  select(n)
  nameEl.value?.scrollIntoView({ block: 'start', behavior: 'smooth' })
}
let swipeX: number | null = null
const swipeStart = (e: PointerEvent) => { swipeX = e.clientX }
function swipeEnd(e: PointerEvent) {
  if (swipeX === null) return
  const dx = e.clientX - swipeX
  swipeX = null
  if (Math.abs(dx) > 40) select(sel.value + (dx < 0 ? 1 : -1))
}

// The name slides in from the side the medal comes from; the medal itself slides in the 3D stage.
const nameEl = ref<HTMLElement | null>(null)
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches
watch(sel, (n, prev) => {
  if (reducedMotion || !nameEl.value) return
  gsap.fromTo(nameEl.value, { x: Math.sign(n - prev) * 24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.32, ease: 'power3.out', overwrite: true })
})

const sheetOpen = ref(false)
const wide = useMediaQuery('(min-width: 1024px)')

const copied = ref(false)
async function share() {
  const b = tierOf(sel.value)
  const url = `${location.origin}/badges/${badgeSlug(b)}`
  const text = stateOf(sel.value) === 'locked'
    ? `On my way to ${b.title} on Open Mercy. Come try and stop me. ${url}`
    : `Just hit ${b.title} on Open Mercy, tier ${b.tier} of 20. Bet you can't catch me. ${url}`
  if ((await shareText(text)) === 'copied') {
    copied.value = true
    setTimeout(() => { copied.value = false }, 2000)
  }
}
</script>

<style scoped>
.bp-page {
  min-height: 100vh;
  min-height: 100dvh;
  background: #0a0a0b;
  color: #e6e6e6;
  display: flex;
  flex-direction: column;
}

.bp-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}
.back-link {
  width: 72px;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  color: #a1a1aa;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  letter-spacing: 0.1em;
  cursor: pointer;
}
.back-link:hover { color: #e6e6e6; }
.bp-title {
  font-family: var(--font-display), sans-serif;
  font-size: 1.3rem;
  letter-spacing: 0.18em;
  margin: 0;
}

/* One phone-width column, centred on wider screens. */
.bp-col { width: 100%; max-width: 480px; margin: 0 auto; padding: 0 var(--spacing-4); display: flex; flex-direction: column; flex: 1; }
.bp-share { position: relative; width: 72px; height: 44px; display: flex; align-items: center; justify-content: flex-end; background: none; border: 0; color: var(--text-primary); cursor: pointer; }
.bp-copied { position: absolute; top: 100%; right: 0; padding: var(--spacing-1) var(--spacing-2); border-radius: var(--radius-sm); background: var(--surface-metal); font-size: var(--text-xs); white-space: nowrap; }

.bp-hero { display: flex; flex-direction: column; padding-top: var(--spacing-4); }
.bp-name-block { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-1); touch-action: pan-y; }
.bp-name { margin: 0; font-family: var(--font-display); font-size: var(--text-3xl); line-height: 1.15; font-weight: 400; color: #fff; }
.bp-meta { margin: 0; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.12em; color: #ffcf99; }
.bp-medal-wrap { position: relative; height: 540px; margin-top: var(--spacing-2); }
.bp-medal { position: relative; }
.bp-glow { position: absolute; left: 50%; top: 190px; width: 320px; height: 320px; margin: -160px 0 0 -160px; border-radius: var(--radius-pill); pointer-events: none; }
.bp-glow--earned, .bp-glow--current { background: radial-gradient(circle, rgba(255, 150, 60, 0.28) 0%, transparent 62%); }
.bp-glow--locked { background: radial-gradient(circle, rgba(160, 160, 170, 0.08) 0%, transparent 62%); }
.bp-arrow { position: absolute; top: 50%; width: 44px; height: 44px; margin-top: -22px; display: flex; align-items: center; justify-content: center; border-radius: var(--radius-pill); background: var(--surface-metal-dark); border: 1px solid var(--surface-metal); color: var(--text-primary); cursor: pointer; }
.bp-arrow--prev { left: 0; }
.bp-arrow--next { right: 0; }

.bp-hero + * { margin-top: var(--spacing-6); }

.bp-foot { --bp-foot-lh: 24px; display: flex; justify-content: space-between; align-items: flex-start; gap: var(--spacing-4); padding: var(--spacing-4) 0 var(--spacing-8); }
.bp-foot-title { margin: 0; line-height: var(--bp-foot-lh); font-family: var(--font-display); font-size: var(--text-lg); font-weight: 400; color: var(--text-primary); }
.bp-foot-sub { margin: 2px 0 0; font-size: var(--text-sm); color: var(--text-secondary); }
.bp-how { flex-shrink: 0; min-height: 44px; display: flex; align-items: flex-start; padding: 0; gap: var(--spacing-1); background: none; border: 0; font-family: var(--font-display); font-size: var(--text-base); color: var(--text-secondary); cursor: pointer; }
/* Text on the title's line; the rest of the 44 px tap area hangs below it. */
.bp-how-in { height: var(--bp-foot-lh); display: inline-flex; align-items: center; gap: var(--spacing-1); }
@media (hover: hover) { .bp-how:hover { color: var(--text-primary); } }

/* Phones: one centred line after another, the link last. */
@media (max-width: 640px) {
  .bp-foot { flex-direction: column; align-items: center; gap: var(--spacing-2); text-align: center; }
}

/* Desktop: the trophy wall. Facts either side of the medal, every badge on show. */
@media (min-width: 1024px) {
  .bp-col { max-width: calc(1200px + 2 * var(--spacing-4)); }
  .bp-hero { padding-top: var(--spacing-8); }
  .bp-name { font-size: var(--text-display); }
  .bp-medal-wrap { height: 480px; margin-top: var(--spacing-4); --mv-medal: 480px; }
  .bp-glow { top: 50%; width: 440px; height: 440px; margin: -220px 0 0 -220px; }
  .bp-arrow { width: 56px; height: 56px; margin-top: -28px; }
  .bp-arrow--prev { left: calc(50% - 296px); }
  .bp-arrow--next { right: calc(50% - 296px); }
  .bp-foot { padding: var(--spacing-4) 0 var(--spacing-8); }
  .bp-foot { --bp-foot-lh: 32px; }
  .bp-foot-title { font-size: var(--text-2xl); }
  .bp-foot + .bs { margin-bottom: var(--spacing-16); }
}
</style>
