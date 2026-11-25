<template>
  <div class="ag-page">
    <header class="ag-top">
      <button type="button" class="ag-back" aria-label="Back" @click="$emit('back')">
        <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
      </button>
      <Avatar v-if="p" class="ag-face" :uid="p.user_id" :name="p.username" :size="28" />
      <div class="ag-heading">
        <h1 class="ag-title">ALL GAMES</h1>
        <p v-if="p" class="ag-who">{{ p.username }}</p>
      </div>
    </header>

    <p v-if="pp.loading.value" class="ag-state">LOADING GAMES…</p>
    <p v-else-if="!p" class="ag-state">
      {{ pp.notFound.value ? "This profile link doesn't match any player." : "Couldn't load this player's games. Try again in a moment." }}
    </p>

    <main v-else class="ag-body">
      <div class="ag-stats">
        <div class="ag-stat">
          <p class="ag-label">WON</p>
          <p class="ag-value">{{ p.wins.toLocaleString() }}</p>
        </div>
        <div class="ag-stat">
          <p class="ag-label">GAMES</p>
          <p class="ag-value">{{ p.games.toLocaleString() }}</p>
        </div>
        <div v-if="badgeInfo" class="ag-stat">
          <p class="ag-label">POINTS</p>
          <p class="ag-value ag-value--points">{{ badgeInfo.points.toLocaleString() }}</p>
        </div>
      </div>

      <div v-if="filters.length > 1" class="ag-filters" role="group" aria-label="Show games">
        <button
          v-for="f in filters"
          :key="f.id"
          type="button"
          class="ag-filter"
          :class="{ 'ag-filter--on': filter === f.id }"
          :aria-pressed="filter === f.id"
          @click="pick(f.id)"
        >{{ f.label }}</button>
      </div>

      <section v-for="day in days" :key="day.label" class="ag-day">
        <div class="ag-day-head">
          <h2 class="ag-day-label">{{ day.label }}</h2>
          <span class="ag-day-tally">{{ day.tally }}</span>
        </div>
        <ul class="ag-card">
          <ProfileGameRow v-for="(g, i) in day.games" :key="i" :game="g" :meta="g.is_bot_game ? 'BOT' : 'PVP'" />
        </ul>
      </section>

      <p v-if="list.failed.value" class="ag-state ag-state--inline">
        Couldn't load these games.
        <button type="button" class="ag-retry" @click="reload">Try again</button>
      </p>
      <p v-else-if="!list.loading.value && !list.games.value.length" class="ag-state ag-state--inline">{{ emptyLine }}</p>

      <div v-if="list.games.value.length" class="ag-more">
        <button
          v-if="list.more.value"
          type="button"
          class="ag-more-btn"
          :disabled="list.loading.value"
          @click="loadMore"
        >{{ list.loading.value ? 'LOADING…' : `SHOW ${GAMES_PAGE} MORE` }}</button>
        <p class="ag-count">Showing {{ list.games.value.length.toLocaleString() }} of {{ total.toLocaleString() }}</p>
      </div>
      <p v-else-if="list.loading.value" class="ag-state ag-state--inline">LOADING GAMES…</p>
    </main>

    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { ChevronLeft } from 'lucide-vue-next'
import { supabase } from '../lib/supabase'
import { useProfile } from '../composables/useProfile'
import { useBadges } from '../composables/useBadges'
import { useProfileGames, GAMES_PAGE, type GamesFilter } from '../composables/useProfileGames'
import { useAuthStore } from '../stores/authStore'
import { useNow } from '../composables/useClock'
import { groupByDay } from '../utils/profileGames'
import Avatar from './Avatar.vue'
import ProfileGameRow from './ProfileGameRow.vue'
import SiteFooter from './SiteFooter.vue'

const props = defineProps<{ code: string }>()
defineEmits<{ (e: 'back'): void }>()

const pp = useProfile()
const p = computed(() => pp.profile.value)
const list = useProfileGames()
const authStore = useAuthStore()
const now = useNow()

const { badges, fetchBadges } = useBadges()
watch(() => p.value?.user_id, (id) => { if (id) void fetchBadges([id]) }, { immediate: true })
const badgeInfo = computed(() => (p.value?.user_id ? badges.value[p.value.user_id] : undefined))

// "Vs you" only means something between two people who have shared a table.
const gamesTogether = ref(0)
async function fetchTogether(code: string) {
  gamesTogether.value = 0
  const { data, error } = await supabase.rpc('profile_head_to_head', { p_share_code: code })
  if (!error) gamesTogether.value = (data as { games: number }[] | null)?.[0]?.games ?? 0
}

const isOwn = computed(() => authStore.profile?.share_code === props.code)

const filter = ref<GamesFilter>('all')
const filters = computed(() => {
  const v = p.value
  if (!v) return []
  const out: { id: GamesFilter; label: string }[] = [{ id: 'all', label: 'All' }]
  if (v.wins > 0) out.push({ id: 'won', label: 'Won' })
  if (!isOwn.value && gamesTogether.value > 0) out.push({ id: 'with_viewer', label: 'Vs you' })
  if (v.daily_played > 0) out.push({ id: 'daily', label: 'Daily' })
  return out
})

const total = computed(() => {
  const v = p.value
  const counted = !v ? 0
    : filter.value === 'won' ? v.wins
    : filter.value === 'daily' ? v.daily_played
    : filter.value === 'with_viewer' ? gamesTogether.value
    : v.games
  const shown = list.games.value.length
  // The counts come from a different query; never claim fewer than are on screen.
  return list.more.value ? Math.max(counted, shown) : shown
})

const emptyLine = computed(() => {
  if (filter.value === 'won') return 'No wins yet.'
  if (filter.value === 'daily') return 'No daily challenges yet.'
  if (filter.value === 'with_viewer') return "You haven't played each other yet."
  return 'No games yet.'
})

const days = computed(() => groupByDay(list.games.value, now.value))

function pick(f: GamesFilter) {
  if (f === filter.value) return
  filter.value = f
  void list.load(props.code, f)
}

function reload() {
  void list.load(props.code, filter.value)
}

function loadMore() {
  void list.load(props.code, filter.value, true)
}

function open(code: string) {
  filter.value = 'all'
  void pp.fetchProfile(code)
  void fetchTogether(code)
  void list.load(code, 'all')
}

onMounted(() => open(props.code))
watch(() => props.code, open)
</script>

<style scoped>
.ag-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-concrete);
  font-family: var(--font-body);
}

.ag-top {
  display: flex;
  align-items: center;
  gap: var(--spacing-1);
  height: 60px;
  padding: var(--spacing-2);
  border-bottom: 1px solid var(--surface-metal);
}

.ag-back {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-primary);
  cursor: pointer;
}
.ag-back:hover,
.ag-back:focus-visible { background: var(--surface-metal-dark); }

.ag-face { margin-right: var(--spacing-2); }
.ag-face :deep(.av-face) { box-shadow: 0 0 0 2px var(--surface-metal); }

.ag-heading { min-width: 0; }

.ag-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 400;
  letter-spacing: 0.06em;
  line-height: 22px;
  color: #fff;
}

.ag-who {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 16px;
  color: var(--text-secondary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ag-body {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--spacing-4) var(--spacing-4) var(--spacing-12);
}

.ag-stats {
  display: flex;
  gap: var(--spacing-2);
}

.ag-stat {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  padding: var(--spacing-3) var(--spacing-4);
  background: var(--surface-metal-dark);
  border: 1px solid var(--surface-metal);
  border-radius: var(--radius-md);
}

.ag-label {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 16px;
  color: var(--text-secondary);
}

.ag-value {
  margin: 0;
  font-family: var(--font-display);
  font-size: 22px;
  line-height: 26px;
  font-variant-numeric: tabular-nums;
  color: #fff;
}
.ag-value--points { color: var(--color-hazard); }

/* Below 375px a five-digit points total no longer fits its card at 22px. */
@media (max-width: 374px) {
  .ag-stat { padding: var(--spacing-3); }
  .ag-value { font-size: var(--text-lg); line-height: 22px; }
}

.ag-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  padding-top: var(--spacing-4);
}

.ag-filter {
  height: 44px;
  padding: 0 14px;
  border: 1px solid var(--surface-metal);
  border-radius: var(--radius-pill);
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  color: var(--text-primary);
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap), border-color var(--duration-snap) var(--ease-snap);
}
.ag-filter:hover:not(.ag-filter--on) { border-color: var(--text-muted); }
.ag-filter--on {
  border-color: var(--text-primary);
  background: var(--text-primary);
  color: var(--bg-concrete);
}

.ag-day {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding-top: var(--spacing-6);
}

.ag-day-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.ag-day-label,
.ag-day-tally {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 16px;
  text-transform: uppercase;
  color: var(--text-secondary);
}

.ag-card {
  margin: 0;
  padding: 0 var(--spacing-4);
  list-style: none;
  background: var(--surface-metal-dark);
  border: 1px solid var(--surface-metal);
  border-radius: var(--radius-md);
}

.ag-more {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-3);
  padding-top: var(--spacing-6);
}

.ag-more-btn {
  width: 100%;
  height: 44px;
  border: 1px solid var(--surface-metal);
  border-radius: var(--radius-md);
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text-primary);
  cursor: pointer;
}
.ag-more-btn:hover:not(:disabled) { border-color: var(--text-muted); }
.ag-more-btn:disabled { opacity: 0.6; cursor: wait; }

.ag-count {
  margin: 0;
  font-size: var(--text-xs);
  line-height: 16px;
  color: var(--text-secondary);
}

.ag-state {
  margin: 0;
  padding: var(--spacing-12) var(--spacing-4);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-align: center;
}
.ag-state--inline { padding: var(--spacing-8) 0; }

.ag-retry {
  min-height: 44px;
  padding: 0 var(--spacing-2);
  border: none;
  background: none;
  font: inherit;
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: underline;
  cursor: pointer;
}
</style>
