<template>
  <div class="bp-page">
    <header class="bp-topbar" :inert="!!detailTier">
      <button class="back-link" @click="$emit('back')">
        <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
        BACK
      </button>
      <h1 class="bp-title">BADGES</h1>
      <span class="bp-count">{{ sel }}/20</span>
    </header>

    <!-- The ladder as a carousel: one live medal, the neighbours peeking, a rail of all twenty. -->
    <section class="bp-carousel" aria-label="Your badges" :inert="!!detailTier">
      <div class="bp-stage">
        <span class="bp-glow" :class="`bp-glow--${stateOf(sel)}`" aria-hidden="true"></span>
        <span v-if="sel > 1" class="bp-peek bp-peek--left" :class="{ 'bp-peek--locked': stateOf(sel - 1) === 'locked' }" :style="{ backgroundImage: artUrl(sel - 1) }" aria-hidden="true"></span>
        <span v-if="sel < 20" class="bp-peek bp-peek--right" :class="{ 'bp-peek--locked': stateOf(sel + 1) === 'locked' }" :style="{ backgroundImage: artUrl(sel + 1) }" aria-hidden="true"></span>
        <MedalView v-if="!detailTier" class="bp-medal" :tier="sel" :locked="stateOf(sel) === 'locked'" mode="hero" :label="`Open ${tierOf(sel).title}`" @tap="openDetail" />
        <button v-if="sel > 1" type="button" class="bp-edge bp-edge--left" aria-label="Previous badge" @click="select(sel - 1)">
          <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
        <button v-if="sel < 20" type="button" class="bp-edge bp-edge--right" aria-label="Next badge" @click="select(sel + 1)">
          <ChevronRight :size="20" :stroke-width="2" aria-hidden="true" />
        </button>
      </div>
      <div class="bp-info" @pointerdown="swipeStart" @pointerup="swipeEnd">
        <h2 class="bp-name">{{ tierOf(sel).title }}</h2>
        <p class="bp-meta">{{ metaLine(sel) }}</p>
        <div v-if="stateOf(sel) === 'current' && badgeProgress.next" class="bp-climb">
          <div class="bp-climb-row">
            <span class="bp-climb-pts">{{ badgePoints.toLocaleString() }} <span>/ {{ badgeProgress.next.threshold.toLocaleString() }}</span></span>
            <span class="bp-hz">{{ badgeProgress.needed.toLocaleString() }} TO {{ badgeProgress.next.title.toUpperCase() }}</span>
          </div>
          <div class="bp-bar"><i :style="{ width: `${Math.round((badgePoints / badgeProgress.next.threshold) * 100)}%` }"></i></div>
        </div>
        <p v-else-if="stateOf(sel) === 'locked'" class="bp-line">{{ lockedLine(sel) }}</p>
        <p v-else class="bp-line">Tap the medal to see its story.</p>
      </div>
      <div ref="rail" class="bp-rail">
        <button
          v-for="t in BADGES"
          :key="t.tier"
          type="button"
          class="bp-rv"
          :class="{ 'bp-rv--sel': t.tier === sel, 'bp-rv--you': t.tier === badge.tier }"
          :aria-label="`${t.title}, ${STATE_LABEL[stateOf(t.tier)]}`"
          :aria-pressed="t.tier === sel"
          @click="select(t.tier)"
        >
          <span class="bp-rv-art" :class="{ 'bp-rv-art--locked': t.tier > badge.tier }" :style="{ '--art': artUrl(t.tier) }"></span>
        </button>
      </div>
    </section>

    <!-- One medal up close: its story when earned, what it takes when locked. -->
    <div v-if="detailTier" class="bp-detail" role="dialog" aria-modal="true" :aria-label="tierOf(detailTier).title" @keydown.esc="closeDetail">
      <header class="bp-topbar">
        <button ref="detailBack" class="back-link" @click="closeDetail">
          <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
          BADGES
        </button>
        <h1 class="bp-title">{{ tierOf(detailTier).title }}</h1>
        <span class="bp-count">{{ detailTier }}/20</span>
      </header>
      <p class="bp-meta bp-detail-meta">{{ metaLine(detailTier) }}</p>
      <div class="bp-detail-stage">
        <MedalView :tier="detailTier" :locked="stateOf(detailTier) === 'locked'" mode="showcase" :fact="stateOf(detailTier) === 'locked' ? null : BADGE_FACTS[detailTier]" />
      </div>
      <div v-if="stateOf(detailTier) === 'locked'" class="bp-detail-locked">
        <p class="bp-line">{{ lockedLine(detailTier) }}</p>
        <div class="bp-climb-row">
          <span class="bp-climb-pts">{{ badgePoints.toLocaleString() }} <span>/ {{ tierOf(detailTier).threshold.toLocaleString() }}</span></span>
          <span class="bp-hz">{{ (tierOf(detailTier).threshold - badgePoints).toLocaleString() }} TO GO</span>
        </div>
        <div class="bp-bar"><i :style="{ width: `${Math.max(1, Math.round((badgePoints / tierOf(detailTier).threshold) * 100))}%` }"></i></div>
        <button type="button" class="bp-play" @click="play">
          <Play :size="16" :stroke-width="2" aria-hidden="true" />
          PLAY A GAME
        </button>
      </div>
    </div>

    <div class="bp-body" :inert="!!detailTier">
      <!-- Plain-language intro -->
      <section class="bp-intro">
        <h2 class="bp-h2">How it works</h2>
        <p>
          Every game you play earns points. Points add up over time and lift you
          through twenty badges, from Recruit to God of No Mercy. Your badge shows on
          every table you sit at, so everyone sees how far you've climbed.
        </p>
        <p>
          A badge is yours to keep - you never drop one you've earned. But if you
          stop showing up, your progress toward the <em>next</em> badge slips a
          little each day. Play again and it starts building right back.
        </p>
      </section>

      <!-- Earning table -->
      <section class="bp-earn">
        <h2 class="bp-h2">How you earn points</h2>
        <ul class="bp-earn-list">
          <li v-for="e in EARN" :key="e.label">
            <span class="bp-earn-label">{{ e.label }}</span>
            <span class="bp-earn-pts">+{{ e.points }}</span>
          </li>
        </ul>
        <p class="bp-fine">
          Quit games and walkovers don't count - a badge has to be earned at the table.
        </p>
      </section>

      <!-- Inactivity decay -->
      <section class="bp-intro">
        <h2 class="bp-h2">If you go quiet</h2>
        <p>
          Your badge is permanent - once you reach a tier it's yours for good, and no
          amount of time away takes it. Only your progress toward the <em>next</em> badge
          can slip.
        </p>
        <p>
          You get a <strong>one-week grace</strong>: play at least once every seven days
          and nothing slips. After that, you lose <strong>5% of your progress toward the
          next badge each day</strong> you don't play. It only ever touches that progress,
          never the badge underneath.
        </p>
        <p class="bp-fine">Say you're 1,000 points into your climb toward the next badge:</p>
        <table class="bp-table">
          <thead>
            <tr><th>Time away</th><th>Progress you keep</th></tr>
          </thead>
          <tbody>
            <tr><td>Up to 1 week</td><td>1,000 - nothing slips</td></tr>
            <tr><td>2 weeks</td><td>about 700</td></tr>
            <tr><td>3 weeks</td><td>about 490</td></tr>
            <tr><td>4 weeks</td><td>about 340</td></tr>
          </tbody>
        </table>
        <p>Play a single game and it starts climbing back the same day.</p>
      </section>

      <SiteFooter />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, Play } from 'lucide-vue-next'
import { computed, nextTick, ref, watch } from 'vue'
import { BADGES, POINT_WEIGHTS, applyDecay, badgeFor, pointsFromRetention, progressToNext } from '../utils/badges'
import { useBadges } from '../composables/useBadges'
import { useAuthStore } from '../stores/authStore'
import { useRetentionStore } from '../stores/retentionStore'
import MedalView from './badges/MedalView.vue'
import { artUrl } from '../utils/badgeArt'
import { BADGE_FACTS } from '../utils/badgeFacts'
import { heldByLine, useBadgeHolders } from '../composables/useBadgeHolders'
import { router } from '../utils/routes'
import SiteFooter from './SiteFooter.vue'

defineEmits<{ (e: 'back'): void }>()

const auth = useAuthStore()
const retention = useRetentionStore()
// The same player_points read as every other badge in the app, rather than
// the player's whole game history. Fresh, because the cache is per session and
// this page is about the total after today's games.
const { badges, fetchBadges } = useBadges()
watch(() => auth.user?.id, (id) => { if (id) void fetchBadges([id], { fresh: true }) }, { immediate: true })

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
const badgeProgress = computed(() => progressToNext(badgePoints.value))

// ---- the carousel
type TierState = 'earned' | 'current' | 'locked'
const sel = ref(1)
watch(() => badge.value.tier, (t) => { sel.value = t }, { immediate: true })
const tierOf = (n: number) => BADGES[Math.min(19, Math.max(0, n - 1))]!
const STATE_LABEL: Record<TierState, string> = { earned: 'earned', current: 'your badge', locked: 'locked' }
const stateOf = (n: number): TierState => (n < badge.value.tier ? 'earned' : n === badge.value.tier ? 'current' : 'locked')

const { holders, fetchHolders } = useBadgeHolders()
void fetchHolders()

function metaLine(n: number): string {
  const s = stateOf(n)
  if (s === 'current') return `YOUR TIER · ${n} OF 20`
  if (s === 'earned') return `EARNED · TIER ${n} OF 20`
  return `LOCKED · ${tierOf(n).threshold.toLocaleString()} POINTS`
}
function lockedLine(n: number): string {
  const held = heldByLine(n, holders.value)
  const need = `You need ${(tierOf(n).threshold - badgePoints.value).toLocaleString()} more points.`
  return held ? `${held}. ${need}` : need
}

const rail = ref<HTMLElement | null>(null)
function select(n: number) {
  sel.value = Math.min(20, Math.max(1, n))
  void nextTick(() => rail.value?.children[sel.value - 1]?.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }))
}
// The medal spins under a drag, so moving through the ladder is a swipe on the name area, the edges or the rail.
let swipeX: number | null = null
const swipeStart = (e: PointerEvent) => { swipeX = e.clientX }
function swipeEnd(e: PointerEvent) {
  if (swipeX === null) return
  const dx = e.clientX - swipeX
  swipeX = null
  if (Math.abs(dx) > 40) select(sel.value + (dx < 0 ? 1 : -1))
}

// ---- the detail view
const detailTier = ref<number | null>(null)
const detailBack = ref<HTMLButtonElement | null>(null)
function openDetail() {
  detailTier.value = sel.value
  void nextTick(() => detailBack.value?.focus())
}
function closeDetail() {
  detailTier.value = null
  void nextTick(() => (rail.value?.children[sel.value - 1] as HTMLElement | undefined)?.focus())
}
function play() { void router.push('/public') }

const EARN = [
  { label: 'Win a game', points: POINT_WEIGHTS.win },
  { label: "Finish a game you're losing", points: POINT_WEIGHTS.completedLoss },
  { label: 'Each draw card you play', points: POINT_WEIGHTS.drawCard },
  { label: 'Per card in the biggest stack you survive', points: POINT_WEIGHTS.stackSurvived },
  { label: 'Call "Mercy!"', points: POINT_WEIGHTS.unoCall },
  { label: 'Show up and play (per day)', points: POINT_WEIGHTS.dayPlayed },
]
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

.bp-body {
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  padding: var(--spacing-6) var(--spacing-4) var(--spacing-8);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-8);
  flex: 1;
}

.bp-h2 {
  font-family: var(--font-display), sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #ffcc00;
  margin: 0 0 var(--spacing-3);
}
.bp-intro p {
  margin: 0 0 var(--spacing-3);
  color: #cfcfd4;
  line-height: 1.6;
}
.bp-intro em { color: #e6e6e6; font-style: italic; }

.bp-earn-list {
  list-style: none;
  margin: 0 0 var(--spacing-3);
  padding: 0;
  display: flex;
  flex-direction: column;
}
.bp-earn-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3) 0;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}
.bp-earn-label { color: #cfcfd4; font-size: 0.9rem; }
.bp-earn-pts {
  font-family: var(--font-mono);
  font-weight: 700;
  color: #5ed17c;
  white-space: nowrap;
}
.bp-fine { margin: 0; color: #8a8f98; font-size: 0.8rem; line-height: 1.5; }

.bp-table {
  width: 100%;
  border-collapse: collapse;
  margin: var(--spacing-3) 0;
  font-family: var(--font-mono);
  font-size: 0.85rem;
}
.bp-table th,
.bp-table td {
  padding: var(--spacing-2) var(--spacing-3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  text-align: left;
}
.bp-table th {
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: #8a8f98;
}
.bp-table td { color: #cfcfd4; }
.bp-table th:last-child,
.bp-table td:last-child { text-align: right; color: #e6e6e6; }

/* ---- carousel: one live medal fills the first screen; the explainer is below it */
.bp-count { width: 48px; text-align: right; font-size: var(--text-xs); font-weight: 600; letter-spacing: 0.12em; color: var(--text-secondary); }
.bp-carousel { display: flex; flex-direction: column; height: calc(100dvh - 72px); min-height: 600px; }
.bp-stage { position: relative; flex: 1; min-height: 340px; overflow: hidden; }
.bp-medal { position: absolute; inset: 0 56px; width: auto; }
.bp-glow { position: absolute; left: 50%; top: 50%; width: 340px; height: 340px; margin: -185px 0 0 -170px; border-radius: var(--radius-pill); pointer-events: none; }
.bp-glow--earned { background: radial-gradient(circle, rgba(255, 80, 40, 0.28) 0%, transparent 65%); }
.bp-glow--current { background: radial-gradient(circle, rgba(255, 150, 60, 0.34) 0%, transparent 65%); }
.bp-glow--locked { background: radial-gradient(circle, rgba(160, 160, 170, 0.1) 0%, transparent 65%); }
.bp-peek { position: absolute; top: 50%; width: 120px; height: 120px; margin-top: -76px; background: center / contain no-repeat; opacity: 0.35; filter: saturate(0.6); pointer-events: none; }
.bp-peek--left { left: -60px; }
.bp-peek--right { right: -60px; }
.bp-peek--locked { filter: grayscale(1) brightness(0.35); }
.bp-edge { position: absolute; top: 0; bottom: 0; width: 56px; display: flex; align-items: flex-end; justify-content: center; padding-bottom: var(--spacing-4); background: none; border: none; color: var(--text-secondary); cursor: pointer; touch-action: pan-y; }
.bp-edge--left { left: 0; }
.bp-edge--right { right: 0; }
@media (pointer: coarse) { .bp-edge svg { visibility: hidden; } }
.bp-info { display: flex; flex-direction: column; align-items: center; gap: var(--spacing-1); min-height: 168px; padding: 0 var(--spacing-6) var(--spacing-6); text-align: center; touch-action: pan-y; }
.bp-name { margin: 0; font-family: var(--font-display); font-size: var(--text-3xl); line-height: 1.15; font-weight: 400; color: #fff; }
.bp-meta { margin: 0; font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.12em; color: #ffcf99; }
.bp-line { margin: var(--spacing-3) 0 0; font-size: var(--text-sm); line-height: 1.5; color: var(--text-secondary); }
.bp-climb { width: 100%; margin-top: var(--spacing-4); display: flex; flex-direction: column; gap: var(--spacing-2); }
.bp-climb-row { display: flex; justify-content: space-between; align-items: baseline; gap: var(--spacing-3); }
.bp-climb-pts { font-size: var(--text-base); font-weight: 700; color: #fff; font-variant-numeric: tabular-nums; }
.bp-climb-pts span { font-weight: 400; color: var(--text-secondary); }
.bp-hz { font-size: var(--text-xs); font-weight: 700; letter-spacing: 0.12em; color: var(--color-hazard); white-space: nowrap; }
.bp-bar { height: 8px; border-radius: 2px; background: var(--surface-metal); overflow: hidden; }
.bp-bar i { display: block; height: 100%; background: repeating-linear-gradient(135deg, var(--color-hazard) 0 8px, var(--color-hazard-dim) 8px 14px); }
.bp-rail { display: flex; gap: var(--spacing-1); padding: var(--spacing-3) var(--spacing-3) calc(var(--spacing-4) + env(safe-area-inset-bottom)); overflow-x: auto; scrollbar-width: none; border-top: 1px solid var(--surface-metal); }
.bp-rv { position: relative; flex-shrink: 0; width: 44px; height: 56px; display: flex; align-items: center; justify-content: center; background: none; border: none; cursor: pointer; }
.bp-rv-art { width: 36px; height: 36px; background: var(--art) center / contain no-repeat; }
.bp-rv-art--locked { background: var(--surface-metal); -webkit-mask: var(--art) center / contain no-repeat; mask: var(--art) center / contain no-repeat; }
.bp-rv::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: 0; height: 2px; border-radius: 1px; }
.bp-rv--sel::after { background: #ffcf99; }
.bp-rv--you::before { content: 'YOU'; position: absolute; top: 0; font-size: 8px; font-weight: 700; letter-spacing: 0.16em; color: #ffcf99; }

/* ---- detail */
.bp-detail { position: fixed; inset: 0; z-index: 50; display: flex; flex-direction: column; background: var(--bg-concrete); }
.bp-detail-meta { text-align: center; padding-top: var(--spacing-2); }
.bp-detail-stage { position: relative; flex: 1; min-height: 360px; margin: var(--spacing-2) var(--spacing-4) var(--spacing-4); }
.bp-detail-locked { display: flex; flex-direction: column; gap: var(--spacing-2); padding: 0 var(--spacing-4) calc(var(--spacing-6) + env(safe-area-inset-bottom)); }
.bp-detail-locked .bp-line { margin: 0 0 var(--spacing-2); text-align: center; }
.bp-play { margin-top: var(--spacing-3); min-height: 52px; display: flex; align-items: center; justify-content: center; gap: var(--spacing-2); border: none; border-radius: var(--radius-md); background: var(--color-alert); color: #fff; font-family: var(--font-display); font-size: var(--text-lg); letter-spacing: 0.06em; cursor: pointer; }
</style>
