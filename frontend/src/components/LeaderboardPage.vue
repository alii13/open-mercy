<template>
  <div class="lb-page">
    <header class="lb-topbar">
      <button class="back-link" @click="$emit('back')">
        <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
        BACK
      </button>
      <h1 class="lb-title">LEADERBOARDS</h1>
      <span class="lb-topbar-spacer" aria-hidden="true"></span>
    </header>

    <div class="lb-body">
      <div class="lb-tabs-wrap">
        <div class="lb-tabs" role="tablist">
          <button
            class="lb-tab"
            :class="{ active: tab === 'daily' }"
            role="tab"
            :aria-selected="tab === 'daily'"
            @click="switchTab('daily')"
          >
            TODAY'S CHALLENGE
          </button>
          <button
            class="lb-tab"
            :class="{ active: tab === 'weekly' }"
            role="tab"
            :aria-selected="tab === 'weekly'"
            @click="switchTab('weekly')"
          >
            THIS WEEK
          </button>
          <button
            v-if="lb.alltimeAvailable.value"
            class="lb-tab"
            :class="{ active: tab === 'alltime' }"
            role="tab"
            :aria-selected="tab === 'alltime'"
            @click="switchTab('alltime')"
          >
            ALL TIME
          </button>
        </div>
      </div>

      <AllTimeBoard
        v-if="tab === 'alltime'"
        :rows="lb.alltime.value"
        :context="lb.alltimeContext.value"
        :champion="lb.champion.value"
        :countries="lb.countries.value"
        :country="lb.country.value"
        :loading="lb.alltimeLoading.value"
        :my-country="myCountry"
        @update:country="onCountryChange"
      />

      <p v-else-if="lb.loading.value" class="lb-empty">LOADING...</p>

      <p v-else-if="rows.length === 0" class="lb-empty">
        {{ tab === 'daily' ? "No one has played today's deal yet. Be first." : 'No wins recorded this week yet.' }}
      </p>

      <template v-else>
        <!-- Top three get the stage -->
        <div ref="podiumEl" class="lb-podium">
          <component
            :is="row.share_code ? 'button' : 'div'"
            v-for="row in podium"
            :key="row.rank"
            class="lb-pod"
            :class="[`lb-pod--${row.rank}`, { me: row.is_me, clickable: !!row.share_code }]"
            @click="openProfile(row)"
          >
            <Crown v-if="row.rank === 1" class="lb-pod-crown" :size="16" aria-hidden="true" />
            <Avatar
              :uid="row.user_id"
              :name="row.username"
              :badge="badgeInfoFor(row)?.badge"
              :points="badgeInfoFor(row)?.points"
              :progress="badgeInfoFor(row)?.progress"
              :presence="row.user_id ? presence[row.user_id] ?? null : undefined"
              badge-link
              class="lb-pod-emblem"
            />
            <span class="lb-pod-badge" :class="medalClass(row.rank)">{{ row.rank }}</span>
            <span class="lb-pod-name">
              {{ row.is_me ? 'YOU' : row.username }}
              <template v-if="flagEmoji(row.country)"> {{ flagEmoji(row.country) }}</template>
            </span>
            <span class="lb-pod-metric" :class="{ out: metric(row).out }">{{ metric(row).main }}</span>
            <span class="lb-pod-sub">{{ metric(row).sub }}</span>
          </component>
        </div>

        <!-- Everyone else -->
        <ol v-if="rest.length" ref="listEl" class="lb-list">
          <li
            v-for="row in rest"
            :key="row.rank"
            class="lb-row"
            :class="{ me: row.is_me, clickable: !!row.share_code }"
            :role="row.share_code ? 'button' : undefined"
            :tabindex="row.share_code ? 0 : undefined"
            @click="openProfile(row)"
            @keydown.enter="openProfile(row)"
          >
            <span class="lb-rank">{{ row.rank }}</span>
            <BadgedName
              :uid="row.user_id"
              :name="row.username"
              :badge="badgeInfoFor(row)?.badge"
              :points="badgeInfoFor(row)?.points"
              :progress="badgeInfoFor(row)?.progress"
              :presence="row.user_id ? presence[row.user_id] ?? null : undefined"
              link
              class="lb-ident"
            >
              <span class="lb-name">{{ row.is_me ? 'YOU' : row.username }}</span>
            </BadgedName>
            <span v-if="flagEmoji(row.country)" class="lb-flag" :title="row.country ?? ''">{{ flagEmoji(row.country) }}</span>
            <span class="lb-score" :class="{ out: metric(row).out }">
              {{ metric(row).main }}<template v-if="metric(row).sub"> · {{ metric(row).sub }}</template>
            </span>
          </li>
        </ol>

        <p v-if="footerLine" class="lb-context">{{ footerLine }}</p>
      </template>

      <!-- Global weekly records: three skill archetypes get famous, not
           just the win grinders. -->
      <section v-if="tab !== 'alltime' && lb.spotlights.value.length" class="lb-records">
        <h3 class="lb-records-title">THIS WEEK'S RECORDS</h3>
        <div class="lb-records-strip">
          <button
            v-for="s in lb.spotlights.value"
            :key="s.kind"
            class="lb-record"
            :disabled="!s.share_code"
            @click="s.share_code && navigate({ name: 'profile', code: s.share_code })"
          >
            <span class="lb-record-kind">
              <component :is="SPOT_META[s.kind].icon" :size="14" :stroke-width="2" aria-hidden="true" />
              {{ SPOT_META[s.kind].label }}
            </span>
            <span class="lb-record-value">{{ SPOT_META[s.kind].fmt(s.value) }}</span>
            <span class="lb-record-name">{{ s.username }} {{ flagEmoji(s.country) }}</span>
          </button>
        </div>
      </section>
    </div>

    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue'
import { ChevronLeft, Crown, Shield, Zap } from 'lucide-vue-next'
import gsap from 'gsap'
import { useLeaderboard, type DailyRow, type WeeklyRow } from '../composables/useLeaderboard'
import { useMotion } from '../composables/useMotion'
import { navigate, currentRoute, type LeaderboardTab } from '../utils/routes'
import { formatCountdown, msUntilLocalMidnight } from '../utils/countdown'
import { flagEmoji } from '../utils/country'
import { useBadges } from '../composables/useBadges'
import { usePresence } from '../composables/usePresence'
import SiteFooter from './SiteFooter.vue'
import AllTimeBoard from './AllTimeBoard.vue'
import { useAuthStore } from '../stores/authStore'
import { track } from '../utils/analytics'
import Avatar from './Avatar.vue'
import BadgedName from './BadgedName.vue'

defineEmits<{ (e: 'back'): void }>()

type Row = DailyRow | WeeklyRow

const lb = useLeaderboard()
const authStore = useAuthStore()
/** Pins the viewer's own country to the top of the board's filter. */
const myCountry = computed(() => authStore.profile?.country ?? null)
// A deep link names its board: /leaderboard/alltime opens on all-time rather
// than dropping the visitor on today's deal, which is not what the link
// promised. The bare /leaderboard still means the daily board.
const routeTab = currentRoute.value.name === 'leaderboard' ? currentRoute.value.tab : undefined
const tab = ref<LeaderboardTab>(routeTab ?? 'daily')
const podiumEl = ref<HTMLElement | null>(null)
const listEl = ref<HTMLElement | null>(null)
const motion = useMotion()

// The all-time board renders itself, so `rows` only ever feeds the podium.
const rows = computed<Row[]>(() => (tab.value === 'daily' ? lb.daily.value : lb.weekly.value))
// Podium renders 2nd · 1st · 3rd so the champion holds the center.
const podium = computed(() => {
    const top = rows.value.slice(0, 3)
    return [top[1], top[0], top[2]].filter((r): r is Row => !!r)
})
const rest = computed(() => rows.value.slice(3))

// Badge chips for every visible row — feature-detects until badges.sql +
// the user_id-exposing board functions are installed.
const { badges, fetchBadges } = useBadges()
// Presence rides along in the same pass: one batched call per board, and the
// dot answers "could I play them right now" without opening a profile.
const { presence, fetchPresence } = usePresence()
watch(rows, (rs) => {
    const ids = rs.map(r => r.user_id).filter((x): x is string => !!x)
    if (ids.length) {
        void fetchBadges(ids)
        void fetchPresence(ids)
    }
}, { immediate: true })

function badgeInfoFor(row: Row) {
    return row.user_id ? badges.value[row.user_id] : undefined
}

function switchTab(next: LeaderboardTab) {
    if (tab.value === next) return
    tab.value = next
    track('leaderboard_tab_viewed', { tab: next })
    // Keep the URL on the board being shown, so it stays shareable and the
    // browser's back button walks the tabs.
    navigate({ name: 'leaderboard', tab: next })
}

// Back and forward change the route without re-mounting this page, so the
// tab has to follow the URL or the browser buttons move the address bar and
// leave the board behind.
watch(currentRoute, (r) => {
    if (r.name !== 'leaderboard') return
    tab.value = r.tab ?? 'daily'
})

// A deep link can land before the feature probe finishes. If the all-time
// board turns out not to be installed, fall back rather than showing a tab
// that is not there.
watch(() => lb.alltimeAvailable.value, (ok) => {
    if (!ok && tab.value === 'alltime') tab.value = 'daily'
})

// 'global' rather than an absent param: an unset value would be
// indistinguishable from the event not firing at all in GA4.
function onCountryChange(next: string | null) {
    track('leaderboard_filtered', { country: next ?? 'global' })
    void lb.setCountry(next)
}

function openProfile(row: Row) {
    if (row.share_code) navigate({ name: 'profile', code: row.share_code })
}

function medalClass(rank: number): string {
    return rank === 1 ? 'gold' : rank === 2 ? 'silver' : rank === 3 ? 'bronze' : ''
}

function clock(secs: number): string {
    if (!secs || secs <= 0) return '—'
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

function metric(row: Row): { main: string; sub: string; out: boolean } {
    if ('result' in row) {
        return row.result === 'won'
            ? { main: `${row.effort} MOVES`, sub: clock(row.duration_secs), out: false }
            : { main: row.result.toUpperCase(), sub: '', out: true }
    }
    return { main: `${row.wins}W`, sub: `${row.games} GAMES`, out: false }
}

const SPOT_META = {
    fastest_win: { label: 'FASTEST WIN', icon: Zap, fmt: clock },
    biggest_stack: { label: 'STACK SURVIVOR', icon: Shield, fmt: (v: number) => `+${v}` },
    most_wins: { label: 'MOST WINS', icon: Crown, fmt: (v: number) => `${v}W` },
} as const

// The daily board keys on the viewer's local date, so the deal flips at
// their local midnight.
const now = ref(Date.now())
let ticker: number | undefined
const dealCountdown = computed(() =>
    formatCountdown(msUntilLocalMidnight(new Date(now.value))),
)

const footerLine = computed(() => {
    const ctx = tab.value === 'daily' ? lb.dailyContext.value : lb.weeklyContext.value
    const parts: string[] = []
    if (ctx?.total_players) {
        const scope = tab.value === 'daily' ? 'TODAY' : 'THIS WEEK'
        if (ctx.my_rank) {
            const pct = Math.max(1, Math.ceil((ctx.my_rank / ctx.total_players) * 100))
            parts.push(`YOU'RE #${ctx.my_rank} · TOP ${pct}% OF ${ctx.total_players} PLAYERS ${scope}`)
        } else {
            parts.push(`${ctx.total_players} PLAYERS ${scope}`)
        }
    }
    if (tab.value === 'daily') parts.push(`NEW DEAL IN ${dealCountdown.value}`)
    return parts.join(' · ')
})

// Pods pop and rows stagger in on load and tab switch. Final state matches
// the natural layout and clears inline props, so GSAP never fights Vue.
function animateIn() {
    if (motion.reduced) return
    const pods = podiumEl.value?.querySelectorAll('.lb-pod')
    if (pods?.length) {
        gsap.set(pods, { opacity: 0, y: 10, scale: 0.96 })
        motion.soft(pods, { opacity: 1, y: 0, scale: 1, stagger: 0.05, clearProps: 'all' })
    }
    const rowEls = listEl.value?.querySelectorAll('.lb-row')
    if (rowEls?.length) {
        gsap.set(rowEls, { opacity: 0, y: 8 })
        motion.soft(rowEls, { opacity: 1, y: 0, stagger: 0.025, clearProps: 'all' })
    }
}

watch([tab, () => lb.loading.value], async () => {
    await nextTick()
    animateIn()
})

onMounted(() => {
    void lb.fetchBoards()
    // Separate probe: a project without leaderboards-alltime.sql keeps the
    // other two tabs rather than losing the whole page.
    void lb.fetchAlltime()
    // Ticks to the second: at 30s with whole-minute display the number sat
    // unchanged for up to a minute and read as static text.
    ticker = window.setInterval(() => { now.value = Date.now() }, 1000)
})
onUnmounted(() => { if (ticker) clearInterval(ticker) })
</script>

<style scoped>
.lb-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-void, #0a0a0a);
}

.lb-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  padding: var(--spacing-2);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 0.12em;
  color: var(--text-secondary);
  cursor: pointer;
  min-height: 44px;
  white-space: nowrap;
}

.back-link:hover {
  color: var(--color-neon-blue);
}

.lb-title {
  font-family: var(--font-display);
  font-size: 1.2rem;
  letter-spacing: 0.14em;
  color: var(--text-primary);
  margin: 0;
}

/* Balances the back link so the title stays centered. */
.lb-topbar-spacer {
  width: 72px;
}

.lb-body {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--spacing-4) var(--spacing-4) var(--spacing-8);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.lb-tabs-wrap {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--bg-void, #0a0a0a);
  padding: var(--spacing-2) 0;
}

.lb-tabs {
  display: flex;
  padding: 3px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.02);
}

.lb-tab {
  flex: 1;
  background: none;
  border: none;
  border-radius: 999px;
  padding: var(--spacing-2) var(--spacing-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  color: var(--text-muted);
  cursor: pointer;
  min-height: 38px;
}

.lb-tab.active {
  background: rgba(0, 229, 255, 0.12);
  color: var(--color-neon-blue);
}

.lb-empty {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-8) 0;
  margin: 0;
}

/* ---- Podium ---- */

.lb-podium {
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: var(--spacing-3);
  padding: var(--spacing-4) 0 var(--spacing-2);
}

.lb-pod {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-1);
  flex: 1;
  max-width: 180px;
  min-width: 0;
  padding: var(--spacing-3) var(--spacing-2);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  font: inherit;
  color: inherit;
}

.lb-pod.clickable { cursor: pointer; }
.lb-pod.clickable:hover { border-color: rgba(0, 229, 255, 0.4); }

.lb-pod--1 {
  padding-top: var(--spacing-4);
  padding-bottom: var(--spacing-4);
  border-color: rgba(255, 215, 0, 0.35);
  background: rgba(255, 215, 0, 0.03);
}

.lb-pod.me { box-shadow: 0 0 0 1px rgba(0, 229, 255, 0.5); }

.lb-pod-crown {
  color: #ffd700;
  filter: drop-shadow(0 0 4px rgba(255, 215, 0, 0.5));
}

.lb-pod-emblem { --av-size: 52px; }
.lb-pod--1 .lb-pod-emblem { --av-size: 64px; }

/* Medal badge overlaps the avatar's lower edge, between presence and pip. */
.lb-pod-badge {
  width: 20px;
  height: 20px;
  margin-top: -12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  font-family: var(--font-mono);
  font-size: 0.62rem;
  font-weight: 700;
  color: #0a0a0a;
  background: rgba(255, 255, 255, 0.3);
  z-index: 1;
}

.lb-pod-badge.gold { background: #ffd700; box-shadow: 0 0 8px rgba(255, 215, 0, 0.45); }
.lb-pod-badge.silver { background: #c9ced6; }
.lb-pod-badge.bronze { background: #cd7f32; }

.lb-pod-name {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.06em;
  color: var(--text-primary);
  margin-top: var(--spacing-1);
}

.lb-pod.me .lb-pod-name { color: var(--color-neon-blue); }

.lb-pod-metric {
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.06em;
  color: var(--color-hazard, #ffcc00);
}

.lb-pod--1 .lb-pod-metric { font-size: 1.1rem; }

.lb-pod-metric.out { color: var(--color-alert, #ff2a2a); font-size: 0.7rem; }

.lb-pod-sub {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  min-height: 0.8em;
}

/* ---- List (rank 4+) ---- */

.lb-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
}

.lb-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: var(--spacing-3) var(--spacing-3);
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
}

.lb-row.clickable { cursor: pointer; }

.lb-row.clickable:hover {
  background: rgba(255, 255, 255, 0.03);
}

.lb-row.clickable:hover .lb-name { color: var(--color-neon-blue); }

.lb-row.me {
  background: rgba(0, 229, 255, 0.06);
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: var(--radius-sm);
}

.lb-rank {
  width: 2.2rem;
  flex-shrink: 0;
  text-align: right;
  color: var(--text-muted);
  font-size: var(--text-sm);
  letter-spacing: 0.04em;
}

.lb-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--text-primary);
  letter-spacing: 0.04em;
}

.lb-row.me .lb-name {
  color: var(--color-neon-blue);
}

.lb-flag {
  flex-shrink: 0;
  font-size: var(--text-sm);
  line-height: 1;
}

.lb-ident {
  flex: 1;
  min-width: 0;
}

.lb-score {
  flex-shrink: 0;
  color: rgba(0, 229, 255, 0.85);
  letter-spacing: 0.06em;
  font-size: var(--text-xs);
}

.lb-score.out { color: rgba(255, 42, 42, 0.75); }

.lb-context {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  color: var(--color-hazard, #ffcc00);
  text-align: center;
  padding: var(--spacing-2) 0;
  margin: 0;
}

/* ---- Weekly records strip ---- */

.lb-records {
  margin-top: var(--spacing-2);
}

.lb-records-title {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.14em;
  color: var(--text-muted);
  margin: 0 0 var(--spacing-2);
}

.lb-records-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.lb-record {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--spacing-3) var(--spacing-2);
  background: none;
  border: none;
  border-left: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  min-width: 0;
}

.lb-record:first-child { border-left: none; }
.lb-record:disabled { cursor: default; }
.lb-record:hover:not(:disabled) { background: rgba(255, 204, 0, 0.04); }

.lb-record-kind {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  font-family: var(--font-mono);
  font-size: 0.55rem;
  letter-spacing: 0.1em;
  color: var(--text-muted);
  white-space: nowrap;
}

.lb-record-value {
  font-family: var(--font-display);
  font-size: 1rem;
  color: var(--color-hazard, #ffcc00);
}

.lb-record-name {
  font-family: var(--font-mono);
  font-size: 0.62rem;
  color: var(--text-secondary);
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 480px) {
  .lb-score { font-size: 0.65rem; }
  .lb-row { gap: var(--spacing-2); padding: var(--spacing-3) var(--spacing-2); }
  .lb-podium { gap: var(--spacing-2); }
  .lb-pod { padding: var(--spacing-2) var(--spacing-1); }
  .lb-pod-name { font-size: 0.62rem; }
}
</style>
