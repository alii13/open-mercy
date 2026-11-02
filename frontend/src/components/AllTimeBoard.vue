<template>
  <div class="at">
    <p v-if="loading" class="at-empty">LOADING...</p>

    <p v-else-if="!rows.length" class="at-empty">
      {{ country ? 'No ranked players from there yet.' : 'No games recorded yet. Be first.' }}
    </p>

    <template v-else>
      <!-- One player gets the page's biggest type. The rest of the board is
           a table, so the contrast is the hierarchy. -->
      <section v-if="champion" class="at-hero">
        <div class="at-hero-text">
          <span class="at-kicker">{{ country ? `TOP IN ${countryName(country).toUpperCase()}` : 'REIGNING CHAMPION' }}</span>
          <span class="at-namerow">
            <component
              :is="champion.share_code ? 'button' : 'h2'"
              class="at-name"
              :class="{ clickable: !!champion.share_code }"
              @click="openProfile(champion.share_code)"
            >{{ champion.username }}</component>
            <span v-if="flagEmoji(champion.country)" class="at-name-flag" :title="champion.country ?? ''">{{ flagEmoji(champion.country) }}</span>
          </span>
          <span class="at-hero-sub">
            <template v-if="countryName(champion.country)">{{ countryName(champion.country) }}</template>
            <template v-if="champion.member_since"> · playing since {{ since(champion.member_since) }}</template>
          </span>
        </div>
        <Avatar
          :uid="champion.user_id"
          :name="champion.username"
          :badge="championBadge?.badge"
          :points="championBadge?.points"
          :progress="championBadge?.progress"
          badge-link
          class="at-hero-emblem"
        />
      </section>

      <!-- The same four numbers the table shows, in the same order. The board
           ranks on points, so the champion must be described in the terms
           everyone below them is measured by, and points carries the accent
           here exactly as it does on the column header. -->
      <dl v-if="champion" class="at-rail">
        <div class="at-stat">
          <dt>GAMES</dt>
          <dd>{{ champion.games.toLocaleString() }}</dd>
        </div>
        <div class="at-stat">
          <dt>WINS</dt>
          <dd>{{ champion.wins.toLocaleString() }}</dd>
        </div>
        <div class="at-stat">
          <dt>RATE</dt>
          <dd>{{ rate(champion.wins, champion.games) }}</dd>
        </div>
        <div class="at-stat">
          <dt>POINTS</dt>
          <dd class="hot">{{ champion.points.toLocaleString() }}</dd>
        </div>
      </dl>

      <div class="at-tablehead">
        <h3 class="at-tabletitle">THE ALL-TIME {{ rows.length }}</h3>
        <CountrySelect
          :model-value="country"
          :countries="countries"
          :total="context?.total_players ?? 0"
          :my-country="myCountry"
          @update:model-value="$emit('update:country', $event)"
        />
      </div>

      <div class="at-scroll">
        <table class="at-table">
          <thead>
            <tr>
              <th class="c-rank" scope="col">#</th>
              <th class="c-mark" scope="col"><span class="sr-only">Badge</span></th>
              <th class="c-player" scope="col">PLAYER</th>
              <th class="c-num" scope="col">GAMES</th>
              <th class="c-num" scope="col">WINS</th>
              <th class="c-num" scope="col">RATE</th>
              <th class="c-points" scope="col">POINTS</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="row in others"
              :key="row.rank"
              class="at-row"
              :class="{ me: row.is_me, clickable: !!row.share_code }"
              :tabindex="row.share_code ? 0 : undefined"
              @click="openProfile(row.share_code)"
              @keydown.enter="openProfile(row.share_code)"
            >
              <td class="c-rank">{{ row.rank }}</td>
              <td class="c-mark">
                <Avatar
                  :uid="row.user_id"
                  :name="row.username"
                  :size="24"
                  :badge="badgeFor(row)?.badge"
                  :points="badgeFor(row)?.points"
                  :progress="badgeFor(row)?.progress"
                  :presence="row.user_id ? presence[row.user_id] ?? null : undefined"
                  badge-link
                />
              </td>
              <td class="c-player">
                <span class="at-username">{{ row.is_me ? 'YOU' : row.username }}</span>
                <span v-if="flagEmoji(row.country)" class="at-flag" :title="row.country ?? ''">{{ flagEmoji(row.country) }}</span>
              </td>
              <td class="c-num">{{ row.games.toLocaleString() }}</td>
              <td class="c-num">{{ row.wins.toLocaleString() }}</td>
              <td class="c-num">{{ rate(row.wins, row.games) }}</td>
              <td class="c-points">{{ row.points.toLocaleString() }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Pinned, because a player at #814 would otherwise never see
           themselves on their own leaderboard. -->
      <div v-if="showSelf" class="at-self">
        <span class="c-rank">{{ context!.my_rank }}</span>
        <span class="c-mark">
          <Avatar
            :uid="authStore.user?.id"
            :name="authStore.username"
            :size="24"
            :badge="selfBadge?.badge"
            :points="selfBadge?.points"
            :progress="selfBadge?.progress"
          />
        </span>
        <span class="c-player">
          <span class="at-username">YOU</span>
          <span class="at-self-sub">{{ selfLine }}</span>
        </span>
        <span class="c-num">{{ context!.games.toLocaleString() }}</span>
        <span class="c-num">{{ context!.wins.toLocaleString() }}</span>
        <span class="c-num">{{ rate(context!.wins, context!.games) }}</span>
        <span class="c-points">{{ context!.points.toLocaleString() }}</span>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from 'vue'
import Avatar from './Avatar.vue'
import CountrySelect from './CountrySelect.vue'
import { useAuthStore } from '../stores/authStore'
import { flagEmoji } from '../utils/country'
import { countryName } from '../utils/countryName'
import { navigate } from '../utils/routes'
import { useBadges } from '../composables/useBadges'
import { usePresence } from '../composables/usePresence'
import type { AlltimeRow, AlltimeContext, Champion, CountryOption } from '../composables/useLeaderboard'

const props = defineProps<{
    rows: AlltimeRow[]
    context: AlltimeContext | null
    champion: Champion | null
    countries: CountryOption[]
    country: string | null
    loading: boolean
    myCountry: string | null
}>()

defineEmits<{ (e: 'update:country', v: string | null): void }>()

// The rank comes from raw points; the emblem comes from useBadges like every
// other row in the app, so a player's badge reads the same everywhere. They
// differ only for a long-idle player, whose badge has decayed toward its tier
// floor while the record of what they earned has not.
const { badges, fetchBadges } = useBadges()
const { presence, fetchPresence } = usePresence()

watch(() => props.rows, (rs) => {
    const ids = rs.map(r => r.user_id).filter((x): x is string => !!x)
    if (ids.length) {
        void fetchBadges(ids)
        void fetchPresence(ids)
    }
}, { immediate: true })

const authStore = useAuthStore()

function badgeFor(row: AlltimeRow) {
    return row.user_id ? badges.value[row.user_id] : undefined
}

const championBadge = computed(() =>
    props.champion?.user_id ? badges.value[props.champion.user_id] : undefined,
)

const selfBadge = computed(() => {
    const me = props.rows.find(r => r.is_me)
    return me?.user_id ? badges.value[me.user_id] : undefined
})

/** Rank 1 already has the hero slab; repeating it in the table is noise. */
const others = computed(() => props.rows.filter(r => r.rank !== 1))

const showSelf = computed(() => !!props.context?.my_rank)

const selfLine = computed(() => {
    const ctx = props.context
    if (!ctx?.my_rank || !ctx.total_players) return ''
    const field = ctx.total_players.toLocaleString()
    const where = props.country ? ` IN ${countryName(props.country).toUpperCase()}` : ''
    const pct = Math.max(1, Math.ceil((ctx.my_rank / ctx.total_players) * 100))
    // "TOP 80%" reads as praise to someone in the bottom fifth. Only claim a
    // percentile when it is one; otherwise the rank on the left already says
    // where they stand and the line just sizes the field.
    return pct <= 50
        ? `TOP ${pct}% OF ${field} PLAYERS${where}`
        : `${field} PLAYERS RANKED${where}`
})

const SINCE = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })

function since(iso: string): string {
    const d = new Date(iso)
    return Number.isFinite(d.getTime()) ? SINCE.format(d) : ''
}

function rate(wins: number, games: number): string {
    if (!games) return '—'
    return `${Math.round((wins / games) * 100)}%`
}

function openProfile(code: string | null | undefined) {
    if (code) navigate({ name: 'profile', code })
}
</script>

<style scoped>
.at {
  display: flex;
  flex-direction: column;
}

.at-empty {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-8) 0;
  margin: 0;
}

.at-hero {
  display: flex;
  align-items: center;
  gap: var(--spacing-8);
  padding: var(--spacing-6) 0;
}

.at-hero-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
}

.at-kicker {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.22em;
  font-weight: 700;
  color: var(--color-hazard);
}

/* The row owns the scale so the flag can size itself against the name
   and both shrink together on a phone. */
.at-namerow {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-3);
  min-width: 0;
  font-size: var(--text-display);
}

.at-name {
  margin: 0;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  font-family: var(--font-display);
  font-size: inherit;
  line-height: 1.08;
  color: var(--color-alert);
  overflow-wrap: anywhere;
}

/* 1em, from painted pixels rather than font metrics: at the same probe size
   the name inks 66px and this emoji inks 64px, so they match at 1:1. A metrics
   guess put it at 0.61em and it read like a footnote — the emoji is painted in
   the system colour font, whose box bears no relation to the display face's. */
.at-name-flag {
  flex: none;
  font-size: 1em;
  line-height: 1;
}

.at-name.clickable { cursor: pointer; }
.at-name.clickable:hover { color: var(--color-hazard); }

.at-hero-sub {
  font-size: var(--text-base);
  letter-spacing: 0.04em;
  color: var(--text-muted);
}

.at-hero-emblem { --av-size: 96px; }

.at-rail {
  display: flex;
  margin: 0;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.at-stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  padding: var(--spacing-4) 0 var(--spacing-4) var(--spacing-6);
  border-left: 1px solid rgba(255, 255, 255, 0.07);
}

.at-stat:first-child { padding-left: 0; border-left: none; }

.at-stat dt {
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.18em;
  font-weight: 700;
  color: var(--text-muted);
}

.at-stat dd {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  color: var(--text-primary);
}

.at-stat dd.hot { color: var(--color-hazard); }

.at-tablehead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  flex-wrap: wrap;
  padding: var(--spacing-8) 0 var(--spacing-3);
}

.at-tabletitle {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-base);
  letter-spacing: 0.12em;
  color: var(--text-primary);
}

/* Six numeric columns do not fit a phone. The table scrolls inside its own
   box rather than the page scrolling sideways. */
.at-scroll { overflow-x: auto; }

.at-table {
  width: 100%;
  min-width: 560px;
  border-collapse: collapse;
}

.at-table th {
  padding: 0 var(--spacing-2) var(--spacing-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  font-family: var(--font-mono);
  font-size: 0.6rem;
  letter-spacing: 0.16em;
  font-weight: 700;
  color: var(--text-muted);
  text-align: right;
}

.at-table th.c-player { text-align: left; }
.at-table th.c-points { color: var(--color-hazard); }

.at-row { border-bottom: 1px solid rgba(255, 255, 255, 0.045); }
.at-row.clickable { cursor: pointer; }
.at-row.clickable:hover { background: rgba(255, 255, 255, 0.03); }
.at-row.me { background: rgba(0, 243, 255, 0.05); }

.at-table td {
  padding: var(--spacing-3) var(--spacing-2);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-secondary);
  text-align: right;
  white-space: nowrap;
}

/* Fixed lanes: the rank, the emblem and the trailing numbers must line up
   across every row whatever the name's length. */
.c-rank {
  width: 48px;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.c-mark { width: 36px; }
.c-num { width: 72px; }

.c-points {
  width: 96px;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  color: var(--text-primary);
}

.at-table td.c-player {
  width: auto;
  max-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  text-align: left;
  color: var(--text-primary);
}

.at-username { font-weight: 500; }

/* Vue collapses the whitespace between the name and the flag, so the gap has
   to be a margin — the daily rows space theirs the same way. */
.at-flag { margin-left: var(--spacing-2); }
.at-row.me .at-username { color: var(--color-neon-blue); font-weight: 700; }

.at-self {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin-top: var(--spacing-6);
  padding: var(--spacing-3) var(--spacing-2);
  border: 1px solid rgba(0, 243, 255, 0.35);
  border-radius: var(--radius-md);
  background: var(--surface-metal-dark, #121416);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.at-self > span { text-align: right; flex: none; }

.at-self .c-rank { color: var(--color-neon-blue); font-size: var(--text-base); }
.at-self .c-points { color: var(--color-hazard); }

.at-self .c-player {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  text-align: left;
}

.at-self .at-username { color: var(--color-neon-blue); font-weight: 700; }

.at-self-sub {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.05em;
  color: var(--text-muted);
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 640px) {
  .at-hero { gap: var(--spacing-4); }
  .at-namerow { font-size: var(--text-3xl); }
  /* Slightly under the letters on a phone, where a full-height flag next to
     a shorter name crowds the line. */
  .at-name-flag { font-size: 0.9em; }
  .at-hero-emblem { --av-size: 60px; }
  .at-stat { padding-left: var(--spacing-3); }
  .at-stat dd { font-size: var(--text-lg); }
  .at-self { overflow-x: auto; }
}
</style>
