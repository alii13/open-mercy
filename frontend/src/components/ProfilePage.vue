<template>
  <div class="pp-page" :class="{ 'pp-page--actions': showActions }" :style="tierStyle">
    <header class="pp-topbar">
      <button class="back-link" @click="$emit('back')">
        <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
        BACK
      </button>
      <a class="brand-mark" href="#" @click.prevent>
        <span class="brand-mark-uno">OPEN</span>
        <span class="brand-mark-nomercy">MERCY</span>
      </a>
      <button v-if="p" class="share-btn" @click="onShare">
        <Check v-if="shareState === 'copied'" :size="14" :stroke-width="2" aria-hidden="true" />
        {{ shareState === 'copied' ? 'COPIED' : 'SHARE' }}
      </button>
      <span v-else class="pp-topbar-spacer" aria-hidden="true"></span>
    </header>

    <div v-if="pp.loading.value" class="pp-state">
      <p class="pp-state-text">LOADING PROFILE…</p>
    </div>

    <div v-else-if="pp.unavailable.value || pp.notFound.value" class="pp-state">
      <h2 class="pp-state-title">{{ pp.notFound.value ? 'PLAYER NOT FOUND' : 'PROFILES ARE WARMING UP' }}</h2>
      <p class="pp-state-desc">
        {{ pp.notFound.value
          ? 'This profile link doesn\'t match any player.'
          : 'Public profiles aren\'t live yet. The game definitely is.' }}
      </p>
      <Button variant="primary" size="lg" @click="$emit('home')">PLAY</Button>
    </div>

    <div v-else-if="p" ref="contentEl" class="pp-content">
      <!-- WHO: the tier crest is the hero, the player's face rides its foot. -->
      <header class="pp-hero">
        <div class="pp-crest">
          <!-- The same badge as everywhere else, so hovering it shows the tier
               popover and tapping it opens that tier on the badges page. -->
          <Badge
            v-if="badgeInfo"
            class="pp-crest-badge"
            :badge="badgeInfo.badge"
            :points="badgeInfo.points"
            :progress="badgeInfo.progress"
            size="mark"
            link
          />
          <div class="pp-crest-face">
            <Avatar :uid="p.user_id" :name="p.username" :size="64" />
            <button
              v-if="isOwn && avatarsAvailable"
              type="button"
              class="pp-photo-btn"
              aria-label="Change profile photo"
              title="Profile photo"
              @click="openPhotoSheet"
            >
              <Camera :size="16" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </div>

        <div class="pp-who">
          <p v-if="badgeInfo" class="pp-tier">{{ badgeInfo.badge.title }} · Tier {{ badgeInfo.badge.tier }} of {{ BADGES.length }}</p>

          <form v-if="editing" class="pp-rename" @submit.prevent="saveName">
            <input
              ref="nameInputEl"
              v-model="nameInput"
              class="pp-rename-input"
              :class="{ 'has-error': nameError }"
              maxlength="20"
              aria-label="Your name"
              :aria-invalid="!!nameError"
              aria-describedby="pp-rename-error"
              :disabled="saving"
              @input="nameError = ''; nameSuggestions = []"
              @keyup.esc="cancelEdit"
            />
            <button type="submit" class="pp-rename-btn pp-rename-save" :disabled="saving" aria-label="Save name">
              <Check :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
            <button type="button" class="pp-rename-btn" :disabled="saving" aria-label="Cancel" @click="cancelEdit">
              <X :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
            <p v-if="nameError" id="pp-rename-error" class="pp-rename-error" role="alert">{{ nameError }}</p>
            <div v-if="nameSuggestions.length" class="pp-rename-suggest">
              <span>Free:</span>
              <button v-for="n in nameSuggestions" :key="n" type="button" class="pp-rename-chip" @click="nameInput = n; saveName()">{{ n }}</button>
            </div>
          </form>
          <h1 v-else class="pp-name" :class="{ 'pp-name--long': p.username.length > 13 }">
            {{ p.username }}
            <button v-if="isOwn" type="button" class="pp-rename-pencil" aria-label="Edit your name" title="Edit name" @click="startEdit">
              <Pencil :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
          </h1>

          <p class="pp-meta">
            <template v-if="countryName">
              <span class="pp-flag" aria-hidden="true">{{ flagEmoji(p.country) }}</span>
              <span class="pp-meta-strong">{{ countryName }}</span>
              <span class="pp-dot" aria-hidden="true">·</span>
            </template>
            <template v-if="!isOwn && presenceOnline">
              <span class="pp-live" aria-hidden="true"></span>
              <span class="pp-meta-strong">Online now</span>
              <span class="pp-dot" aria-hidden="true">·</span>
            </template>
            <template v-else-if="!isOwn && lastSeenLabel">
              <span>Last seen {{ lastSeenLabel }}</span>
              <span class="pp-dot" aria-hidden="true">·</span>
            </template>
            <span>Joined {{ memberSince }}</span>
          </p>

          <div v-if="socialLinks.length || (isOwn && pp.socials.value)" class="pp-socials">
            <a
              v-for="s in socialLinks"
              :key="s.network"
              class="pp-social"
              :href="s.url"
              target="_blank"
              rel="noopener noreferrer nofollow ugc"
              :aria-label="`${s.handle} on ${s.label}`"
              @click="track('profile_social_opened', { network: s.network, own: isOwn })"
            >
              <svg class="pp-social-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path :d="s.icon" /></svg>
              {{ s.handle }}
            </a>
            <template v-if="isOwn && pp.socials.value">
              <button
                v-for="s in missingSocials"
                :key="s.network"
                type="button"
                class="pp-social pp-social--add"
                @click="socialsOpen = true"
              >
                <Plus :size="14" :stroke-width="2" aria-hidden="true" />
                Add {{ s.label }}
              </button>
              <button
                v-if="socialLinks.length"
                type="button"
                class="pp-social pp-social--edit"
                aria-label="Edit your socials"
                title="Edit socials"
                @click="socialsOpen = true"
              >
                <Pencil :size="14" :stroke-width="2" aria-hidden="true" />
              </button>
            </template>
          </div>
        </div>
      </header>

      <!-- On a phone this is the bar at the bottom of the screen; on a wide
           screen it sits beside the name. -->
      <div v-if="showActions" class="pp-actions">
        <template v-if="!social.unavailable">
          <button v-if="friendState === 'asked-me'" type="button" class="pp-friend pp-friend--accept" @click="acceptFromProfile">
            <UserPlus :size="16" :stroke-width="2" aria-hidden="true" />
            Accept request
          </button>
          <button
            v-else
            type="button"
            class="pp-friend"
            :class="{ 'pp-friend--done': friendState === 'friends' || friendState === 'asked' }"
            :disabled="friendState !== 'none' || adding"
            @click="addFriend"
          >
            <Check v-if="friendState === 'friends' || friendState === 'asked'" :size="16" :stroke-width="2" aria-hidden="true" />
            <UserPlus v-else :size="16" :stroke-width="2" aria-hidden="true" />
            {{ addLabel }}
          </button>
        </template>
        <button type="button" class="pp-play" :disabled="!!invite.busy.value" @click="playTogether">{{ playLabel }}</button>
      </div>

      <div class="pp-body">
        <div class="pp-main">
          <!-- No games yet: a hand nobody has dealt, and what fills this page. -->
          <section v-if="p.games === 0" class="pp-empty">
            <div class="pp-empty-hand" aria-hidden="true">
              <CardBack class="pp-empty-card pp-empty-card--left" :size="EMPTY_CARD" />
              <CardBack class="pp-empty-card pp-empty-card--right" :size="EMPTY_CARD" />
              <CardBack class="pp-empty-card" :size="EMPTY_CARD" />
            </div>
            <h2 class="pp-empty-title">{{ isOwn ? 'YOUR FIRST GAME' : 'NO GAMES YET' }}</h2>
            <p class="pp-empty-line">
              {{ isOwn
                ? 'Play one game and this page fills in with your win rate, your rank and your best moments.'
                : `${p.username} joined in ${memberSince} and hasn't played a game. Invite them to a table and you'll be their first.` }}
            </p>
            <button v-if="isOwn" type="button" class="pp-play pp-empty-play" @click="$emit('home')">PLAY A GAME</button>
          </section>

          <template v-else>
          <section class="pp-stats">
            <div class="pp-stat-row">
              <div class="pp-card pp-stat">
                <p class="pp-label">WIN RATE</p>
                <p class="pp-value">{{ winRate }}%</p>
              </div>
              <div class="pp-card pp-stat">
                <p class="pp-label">WINS</p>
                <p class="pp-value">{{ p.wins.toLocaleString() }}</p>
              </div>
              <div v-if="dossier.standing.value?.globalRank" class="pp-card pp-stat pp-stat--wide">
                <p class="pp-label">GLOBAL RANK</p>
                <p class="pp-value">#{{ dossier.standing.value.globalRank.toLocaleString() }}</p>
              </div>
            </div>
            <p class="pp-caption">{{ statsCaption }}</p>
          </section>

          <!-- Only between two people who have shared a table. A 0-0 tells
               nobody anything. -->
          <section v-if="h2h" class="pp-section">
            <h2 class="pp-section-title">HEAD TO HEAD</h2>
            <div class="pp-card pp-h2h">
              <div class="pp-h2h-score">
                <div class="pp-h2h-side">
                  <Avatar class="pp-ring pp-ring--you" :uid="authStore.user?.id" :name="authStore.username" :size="48" />
                  <div>
                    <p class="pp-label pp-label--you">YOU</p>
                    <p class="pp-h2h-num">{{ h2h.my_wins }}</p>
                  </div>
                </div>
                <span class="pp-h2h-vs" aria-hidden="true">VS</span>
                <div class="pp-h2h-side pp-h2h-side--them">
                  <div>
                    <p class="pp-label">THEM</p>
                    <p class="pp-h2h-num">{{ h2h.their_wins }}</p>
                  </div>
                  <Avatar class="pp-ring" :uid="p.user_id" :name="p.username" :size="48" />
                </div>
              </div>
              <div v-if="h2h.my_wins + h2h.their_wins > 0" class="pp-h2h-bar" aria-hidden="true">
                <span class="pp-h2h-bar-you" :style="{ flexGrow: h2h.my_wins }"></span>
                <span class="pp-h2h-bar-them" :style="{ flexGrow: h2h.their_wins }"></span>
              </div>
              <p class="pp-h2h-line">{{ headToHeadLine(h2h, presenceNow) }}</p>
            </div>
          </section>

          <section v-if="dossier.games.value.length || p.recent_form.length" class="pp-section">
            <div class="pp-section-head">
              <h2 class="pp-section-title">RECENT GAMES</h2>
              <ol class="pp-form" aria-label="Last five results, newest first">
                <li
                  v-for="(f, i) in p.recent_form.slice(0, 5)"
                  :key="i"
                  class="pp-result"
                  :class="`pp-result--${f}`"
                  :title="f"
                  role="img"
                  :aria-label="f"
                >{{ RESULT_LETTER[f] ?? '–' }}</li>
              </ol>
            </div>
            <ul v-if="dossier.games.value.length" class="pp-card pp-games">
              <ProfileGameRow
                v-for="(g, i) in dossier.games.value"
                :key="i"
                :game="g"
                :meta="dayLabel(g.played_at, presenceNow)"
              />
            </ul>
            <a
              v-if="dossier.games.value.length && p.games > dossier.games.value.length"
              class="pp-link"
              :href="gamesHref"
              @click.prevent="navigate({ name: 'profileGames', code })"
            >
              ALL {{ p.games.toLocaleString() }} GAMES <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" />
            </a>
          </section>
          </template>
        </div>

        <div class="pp-side">
          <!-- With no games, only the owner gets the ladder: the first rung is theirs to climb. -->
          <section v-if="badgeInfo && (p.games > 0 || isOwn)" class="pp-section pp-section--ladder">
            <h2 class="pp-section-title">THE LADDER</h2>
            <div class="pp-card pp-ladder">
              <Badge class="pp-ladder-mark" :badge="badgeInfo.badge" size="mark" aria-hidden="true" />
              <div class="pp-ladder-body">
                <p class="pp-ladder-points">
                  {{ badgeInfo.points.toLocaleString() }}<span v-if="next" class="pp-ladder-of"> / {{ next.threshold.toLocaleString() }}</span>
                </p>
                <div v-if="next" class="pp-ladder-bar" aria-hidden="true">
                  <span :style="{ width: `${Math.round(badgeInfo.progress.pct * 100)}%` }"></span>
                </div>
                <p class="pp-ladder-next">
                  {{ next ? `${badgeInfo.progress.needed.toLocaleString()} to ${next.title}` : 'Top rank reached' }}
                </p>
              </div>
              <Badge v-if="next" class="pp-ladder-mark pp-ladder-mark--next" :badge="next" size="mark" aria-hidden="true" />
            </div>
            <a class="pp-link" :href="badgesHref" @click.prevent="openBadges">
              ALL {{ BADGES.length }} BADGES <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" />
            </a>
          </section>

          <section v-if="p.games > 0" class="pp-section">
            <h2 class="pp-section-title">SERVICE RECORD</h2>
            <ul class="pp-records">
              <li v-for="r in records" :key="r.label" class="pp-card pp-record" :class="{ 'pp-record--wide': r.wide }">
                <p class="pp-label">{{ r.label }}</p>
                <p class="pp-value">{{ r.value }}</p>
              </li>
            </ul>
          </section>
        </div>
      </div>

      <!-- Outside the games branch, so a guest with no games still sees how
           to keep this profile. -->
      <section v-if="isOwn && (authStore.isAnonymous || p.games > 0)" class="pp-own">
        <p v-if="authStore.isAnonymous" class="pp-own-line">This is your guest profile - claim it from the lobby (CLAIM ACCOUNT) and everything here is yours forever.</p>
        <Button v-if="authStore.isAnonymous && p.games > 0" variant="secondary" size="md" block @click="$emit('home')">GO TO LOBBY</Button>
        <!-- The one owner tool that is not on the page already: a PNG of
             these numbers, worth posting. -->
        <button v-if="p.games > 0" type="button" class="pp-link" @click="showShareCard = true">
          SHARE A STATS CARD <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" />
        </button>
      </section>
    </div>

    <ShareStatsCard
      v-if="p && badgeInfo"
      :open="showShareCard"
      :username="p.username"
      :badge="badgeInfo.badge"
      :games="p.games"
      :wins="p.wins"
      :losses="Math.max(0, p.games - p.wins - (p.eliminations ?? 0))"
      :eliminated="p.eliminations ?? 0"
      :win-rate="winRate"
      :best-streak="p.best_win_streak"
      :biggest-stack="p.max_stack_survived"
      :peak-cards="p.max_peak_cards"
      :share-url="shareUrl"
      @close="showShareCard = false"
    />
    <SocialsSheet
      v-if="socialsOpen && pp.socials.value"
      :socials="pp.socials.value"
      @close="socialsOpen = false"
      @saved="onSocialsSaved"
    />
    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue'
import { ArrowRight, Camera, Check, ChevronLeft, Pencil, Plus, UserPlus, X } from 'lucide-vue-next'
import { siInstagram, siX } from 'simple-icons'
import gsap from 'gsap'
import { useProfile, type ProfileSocials } from '../composables/useProfile'
import { useMotion } from '../composables/useMotion'
import { useAuthStore } from '../stores/authStore'
import { flagEmoji } from '../utils/country'
import { usePresence } from '../composables/usePresence'
import { useNow } from '../composables/useClock'
import { isOnline, relativeTime } from '../utils/relativeTime'
import { useSocialStore } from '../stores/socialStore'
import { shareProfile } from '../utils/share'
import { track } from '../utils/analytics'
import { useBadges } from '../composables/useBadges'
import { useProfileDossier } from '../composables/useProfileDossier'
import { usePlayWithFriend } from '../composables/usePlayWithFriend'
import { BADGES, badgeSlug } from '../utils/badges'
import { dayLabel, headToHeadLine, RESULT_LETTER } from '../utils/profileGames'
import { socialUrl, type SocialNetwork } from '../utils/socialHandles'
import { navigate, routePath } from '../utils/routes'
import SiteFooter from './SiteFooter.vue'
import Button from './ui/Button.vue'
import Badge from './Badge.vue'
import Avatar from './Avatar.vue'
import ProfileGameRow from './ProfileGameRow.vue'
import CardBack from './game/CardBack.vue'
import SocialsSheet from './SocialsSheet.vue'
import { openPhotoSheet } from '../composables/usePhotoSheet'
import { avatarsAvailable } from '../composables/useAvatars'
import ShareStatsCard from './ShareStatsCard.vue'
import { siteOrigin } from '../utils/siteOrigin'

const props = defineProps<{ code: string }>()
defineEmits<{ (e: 'back'): void; (e: 'home'): void }>()

const pp = useProfile()
const dossier = useProfileDossier()
const showShareCard = ref(false)
const shareUrl = computed(() => `${siteOrigin()}/p/${props.code}`)
const authStore = useAuthStore()
const motion = useMotion()
const contentEl = ref<HTMLElement | null>(null)

const p = computed(() => pp.profile.value)
const isOwn = computed(() => !!authStore.profile?.share_code && authStore.profile.share_code === props.code)

// Rename from your own page: the menu's "Edit name" is easy to miss, and this
// is where people look at their name. Same store call and failure help as the
// lobby chip.
const editing = ref(false)
const saving = ref(false)
const nameInput = ref('')
const nameError = ref('')
const nameSuggestions = ref<string[]>([])
const nameInputEl = ref<HTMLInputElement | null>(null)

function startEdit() {
  nameInput.value = p.value?.username ?? ''
  nameError.value = ''
  nameSuggestions.value = []
  editing.value = true
  track('profile_rename_opened')
  void nextTick(() => { nameInputEl.value?.focus(); nameInputEl.value?.select() })
}

function cancelEdit() {
  editing.value = false
}

async function saveName() {
  const name = nameInput.value.trim()
  if (!name || name === p.value?.username) { cancelEdit(); return }
  saving.value = true
  const res = await authStore.updateUsername(name)
  saving.value = false
  if (!res.success) {
    nameError.value = res.error || 'Could not save that name'
    nameSuggestions.value = await authStore.suggestUsernames(name)
    return
  }
  if (pp.profile.value) pp.profile.value = { ...pp.profile.value, username: authStore.username }
  editing.value = false
  track('profile_renamed')
}

const { badges, fetchBadges } = useBadges()
watch(() => p.value?.user_id, (id) => { if (id) void fetchBadges([id]) }, { immediate: true })
const badgeInfo = computed(() => (p.value?.user_id ? badges.value[p.value.user_id] : undefined))
const next = computed(() => badgeInfo.value?.progress.next ?? null)
const tierStyle = computed(() => (badgeInfo.value ? { '--tier': badgeInfo.value.badge.color } : undefined))

const gamesHref = computed(() => routePath({ name: 'profileGames', code: props.code }))
const badgesHref = computed(() => routePath({ name: 'badges', badge: badgeInfo.value ? badgeSlug(badgeInfo.value.badge) : undefined }))
function openBadges() {
  void navigate({ name: 'badges', badge: badgeInfo.value ? badgeSlug(badgeInfo.value.badge) : undefined })
}

const winRate = computed(() => {
    if (!p.value || p.value.games === 0) return 0
    return Math.round((p.value.wins / p.value.games) * 100)
})

const memberSince = computed(() => {
    if (!p.value) return ''
    return new Date(p.value.member_since).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
})

const countryName = computed(() => {
    const code = p.value?.country
    if (!code || !flagEmoji(code)) return ''
    try {
        return new Intl.DisplayNames(['en'], { type: 'region' }).of(code) ?? ''
    } catch {
        return ''
    }
})

/** Rounded up, so the very top of the board never reads "top 0%". */
const topPercent = computed(() => {
    const st = dossier.standing.value
    if (!st?.globalRank || st.globalTotal <= 0) return 0
    return Math.max(1, Math.ceil((st.globalRank / st.globalTotal) * 100))
})

const statsCaption = computed(() => {
    const v = p.value
    if (!v) return ''
    const st = dossier.standing.value
    const parts = [`${v.games.toLocaleString()} ${v.games === 1 ? 'game' : 'games'} played`]
    if (st && topPercent.value) parts.push(`top ${topPercent.value}% of ${st.globalTotal.toLocaleString()}`)
    if (st?.countryRank && countryName.value) parts.push(`#${st.countryRank.toLocaleString()} in ${countryName.value}`)
    return parts.join(' · ')
})

// Socials. A handle only ever links to its own network: socialUrl builds the
// address from a fixed origin, and the database refuses anything else.
const SOCIALS: { network: SocialNetwork; label: string; icon: string; field: keyof ProfileSocials }[] = [
  { network: 'x', label: 'X', icon: siX.path, field: 'x_handle' },
  { network: 'instagram', label: 'Instagram', icon: siInstagram.path, field: 'instagram_handle' },
]
const socialsOpen = ref(false)
const socialLinks = computed(() => {
  const s = pp.socials.value
  if (!s) return []
  return SOCIALS.flatMap(n => {
    const handle = s[n.field]
    return handle ? [{ ...n, handle, url: socialUrl(n.network, handle) }] : []
  })
})
const missingSocials = computed(() => SOCIALS.filter(n => !pp.socials.value?.[n.field]))

function onSocialsSaved(saved: ProfileSocials) {
  pp.socials.value = saved
  socialsOpen.value = false
  // The button that opened the sheet may be gone now (an Add pill for a handle
  // just saved), so focus lands on the handles row rather than the page body.
  void nextTick(() => {
    if (document.activeElement === document.body) contentEl.value?.querySelector<HTMLElement>('.pp-social')?.focus()
  })
}

// The page can sit open for an hour, and a chip that still reads ONLINE after
// the player left is a small lie.
const presenceNow = useNow()

// Friends. The list is read once so the button can say what it already is,
// rather than offering ADD to someone you asked yesterday.
const social = useSocialStore()
onMounted(() => { if (authStore.isAuthenticated) void social.catchUp() })

type FriendState = 'none' | 'friends' | 'asked' | 'asked-me' | 'blocked'
const friendState = computed<FriendState>(() => {
  const id = p.value?.user_id
  const row = id ? social.rows.find(r => r.user_id === id) : undefined
  if (!row) return 'none'
  if (row.status === 'accepted') return 'friends'
  if (row.status === 'blocked') return 'blocked'
  if (row.status === 'pending') return row.incoming ? 'asked-me' : 'asked'
  return 'none'
})

const showActions = computed(() => !isOwn.value && !!p.value?.user_id)

const adding = ref(false)
const addResult = ref<string | null>(null)
// One result per profile: an answer about the last player must not label the next.
watch(() => props.code, () => { addResult.value = null })
const addLabel = computed(() => {
  if (adding.value) return 'Adding…'
  if (friendState.value === 'friends') return 'Friends'
  if (friendState.value === 'asked') return 'Request sent'
  if (friendState.value === 'blocked') return 'You blocked this player'
  switch (addResult.value) {
    case 'rate_limited': return 'Too many requests today'
    case 'declined': return 'Try again in a few days'
    case 'blocked': return "Can't add this player"
    case 'failed': return 'Try again'
    default: return 'Add friend'
  }
})

// A visitor from a shared link is often signed out. ADD makes them a guest
// first - the same identity PLAY would give them - and stays on this page.
async function ensureSignedIn(): Promise<boolean> {
  if (authStore.isAuthenticated) return true
  const res = await authStore.signInAnonymously()
  if (res.success) await social.refresh()
  return res.success
}

async function addFriend(): Promise<void> {
  const id = p.value?.user_id
  if (!id || adding.value) return
  adding.value = true
  try {
    if (!(await ensureSignedIn())) { addResult.value = 'failed'; return }
    if (friendState.value !== 'none') return
    const result = await social.sendRequest(id)
    addResult.value = result === 'sent' || result === 'accepted' || result === 'already' ? null : result
  } finally {
    adding.value = false
  }
}

async function acceptFromProfile(): Promise<void> {
  const id = p.value?.user_id
  if (id) await social.respond(id, true)
}

// Anyone may invite anyone (supabase/invites.sql). Opening the room moves the
// URL to /r/CODE (useRoomUrl), which shows the waiting room; navigating home
// from there would leave the room, so this page does not navigate at all.
const invite = usePlayWithFriend()
const playLabel = computed(() => {
  const id = p.value?.user_id
  if (id && invite.busy.value === id) return 'OPENING…'
  return (id && invite.asked.value[id]) || 'PLAY TOGETHER'
})

async function playTogether(): Promise<void> {
  const id = p.value?.user_id
  if (!id || invite.busy.value) return
  if (!(await ensureSignedIn())) return
  if (await invite.playWith(id)) track('profile_play_together')
}

// Same batched lookup and same cache the leaderboard and the friends list
// use - one presence path, so the dot cannot disagree with itself.
const { presence, fetchPresence } = usePresence()
watch(() => p.value?.user_id, (id) => { if (id) void fetchPresence([id]) }, { immediate: true })
const lastSeen = computed(() => (p.value?.user_id ? presence.value[p.value.user_id] ?? null : null))

const presenceOnline = computed(() => isOnline(lastSeen.value, presenceNow.value))
const lastSeenLabel = computed(() => relativeTime(lastSeen.value, presenceNow.value))

const h2h = computed(() => (isOwn.value ? null : dossier.headToHead.value))

function clock(secs: number): string {
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`
}

interface RecordRow {
    label: string
    value: string
    wide?: boolean
}

const records = computed<RecordRow[]>(() => {
    const v = p.value
    if (!v) return []
    // A record a player has not set yet renders as a dash rather than
    // vanishing, so the grid keeps its shape.
    return [
        { label: 'FASTEST WIN', value: v.min_duration_won ? clock(v.min_duration_won) : '—' },
        { label: 'BEST RUN', value: `${v.best_win_streak}` },
        { label: 'STACK EATEN', value: v.max_stack_survived > 0 ? `+${v.max_stack_survived}` : '—' },
        { label: 'PEAK HELD', value: v.max_peak_cards > 0 ? `${v.max_peak_cards}` : '—' },
        { label: 'LEANEST WIN', value: v.min_cards_won ? `${v.min_cards_won}` : '—', wide: true },
    ]
})

const EMPTY_CARD = { width: 68, height: 95 }

const shareState = ref<'idle' | 'copied'>('idle')

async function onShare() {
    if (!p.value) return
    const outcome = await shareProfile({
        username: p.value.username,
        wins: p.value.wins,
        max_stack_survived: p.value.max_stack_survived,
        isOwn: isOwn.value,
        url: `${siteOrigin()}/p/${props.code}`,
    })
    track('profile_shared', { method: outcome, own: isOwn.value })
    if (outcome === 'copied') {
        shareState.value = 'copied'
        setTimeout(() => { shareState.value = 'idle' }, 2000)
    }
}

// Sections rise in once - final state matches natural layout, inline props
// cleared so GSAP never fights Vue.
function animateIn() {
    const blocks = contentEl.value?.querySelectorAll('section')
    if (!blocks?.length || motion.reduced) return
    gsap.set(blocks, { opacity: 0, y: 10 })
    motion.soft(blocks, { opacity: 1, y: 0, stagger: 0.06, clearProps: 'all' })
}

watch(p, async (val) => {
    if (val) {
        await nextTick()
        animateIn()
    }
})

onMounted(() => {
    void pp.fetchProfile(props.code)
    void dossier.fetchDossier(props.code)
})
watch(() => props.code, (code) => {
    socialsOpen.value = false
    void pp.fetchProfile(code)
    void dossier.fetchDossier(code)
})
</script>

<style scoped>
.pp-page {
  --tier: #ffcf99;
  --tier-light: color-mix(in srgb, var(--tier) 45%, white);
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  /* The tier's colour lights the top of the page, behind the crest. */
  background:
    radial-gradient(ellipse 120% 420px at 50% 0, color-mix(in srgb, var(--tier) 22%, transparent), transparent 100%) no-repeat,
    var(--bg-concrete);
}

.pp-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
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
}

.back-link:hover { color: var(--color-neon-blue); }

.brand-mark {
  font-family: var(--font-display);
  letter-spacing: 0.08em;
  text-decoration: none;
  font-size: var(--text-base);
}
.brand-mark-uno { color: var(--text-primary); }
.brand-mark-nomercy { color: var(--color-alert); margin-left: 0.4ch; }

.pp-topbar-spacer { width: 72px; }

.share-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: 1px solid var(--color-neon-blue);
  border-radius: var(--radius-sm);
  padding: var(--spacing-2) var(--spacing-3);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  color: var(--color-neon-blue);
  cursor: pointer;
  min-height: 44px;
}

.share-btn:hover {
  background: rgba(0, 229, 255, 0.08);
}

.pp-state {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-4);
  padding: var(--spacing-8) var(--spacing-4);
  text-align: center;
}

.pp-state-text,
.pp-state-desc {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
  margin: 0;
}

.pp-state-title {
  font-family: var(--font-display);
  font-size: var(--text-xl);
  letter-spacing: 0.12em;
  color: var(--text-primary);
  margin: 0;
}

/* ---- layout ---------------------------------------------------------------
   Phone: one column, the actions pinned to the bottom of the screen.
   Wide: the actions beside the name, then two columns. */
.pp-content {
  flex: 1;
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  grid-template-areas: "hero" "body" "own";
  align-content: start;
  width: 100%;
  max-width: 640px;
  margin: 0 auto;
  font-family: var(--font-body);
}

.pp-hero { grid-area: hero; }
.pp-body { grid-area: body; }
.pp-actions { grid-area: actions; }
.pp-own { grid-area: own; }

.pp-body {
  display: flex;
  flex-direction: column;
  padding: 0 var(--spacing-4) var(--spacing-12);
}

.pp-main,
.pp-side {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

@media (min-width: 1024px) {
  .pp-content {
    max-width: 1120px;
    padding: 0 var(--spacing-8);
    grid-template-columns: minmax(0, 1fr) auto;
    grid-template-areas: "hero actions" "body body" "own own";
  }
  .pp-body {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 400px;
    gap: var(--spacing-16);
    align-items: start;
    padding: var(--spacing-6) 0 var(--spacing-24);
  }
  /* The ladder heading sits above the line, so its card starts level with
     the stat cards beside it. */
  .pp-main { padding-top: 40px; }
  .pp-side .pp-section.pp-section--ladder { padding-top: 0; }
}

/* ---- hero ---------------------------------------------------------------- */
.pp-hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-8);
  padding: var(--spacing-1) var(--spacing-4) var(--spacing-8);
  text-align: center;
}

@media (min-width: 1024px) {
  .pp-hero {
    flex-direction: row;
    gap: var(--spacing-8);
    padding: var(--spacing-8) 0;
    text-align: left;
  }
  .pp-page {
    background:
      radial-gradient(ellipse 900px 420px at 22% 0, color-mix(in srgb, var(--tier) 22%, transparent), transparent 100%) no-repeat,
      var(--bg-concrete);
  }
}

.pp-crest {
  position: relative;
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 180px;
  height: 180px;
  background: radial-gradient(circle, color-mix(in srgb, var(--tier) 35%, transparent) 0%, transparent 65%);
}

.pp-hero .pp-crest-badge {
  --emblem-size: 150px;
}

.pp-crest-face {
  position: absolute;
  left: 50%;
  bottom: -14px;
  transform: translateX(-50%);
}

.pp-crest-face :deep(.av-face) {
  box-shadow: 0 0 0 3px var(--tier-light), 0 0 0 7px var(--bg-concrete);
}

/* The camera sits on the face's top-right edge: 32px to look at, 44px to hit. */
.pp-photo-btn {
  position: absolute;
  top: -8px;
  right: -16px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.18);
  background: var(--surface-metal);
  color: var(--text-primary);
  box-shadow: 0 0 0 3px var(--bg-concrete);
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap);
}
.pp-photo-btn::before {
  content: '';
  position: absolute;
  inset: -6px;
}
.pp-photo-btn:hover,
.pp-photo-btn:focus-visible {
  background: #2a2d32;
}

.pp-who {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-3);
  min-width: 0;
}

@media (min-width: 1024px) {
  .pp-who {
    flex: 1;
    align-items: flex-start;
  }
}

.pp-tier {
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--tier-light);
}

.pp-name {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  margin: 0;
  font-family: var(--font-display);
  font-size: 34px;
  font-weight: 400;
  line-height: 1.1;
  color: #fff;
  overflow-wrap: anywhere;
}

/* Names run to 20 characters; a long one steps down a size rather than
   breaking mid-word. */
.pp-name--long { font-size: 28px; }

@media (min-width: 1024px) {
  .pp-name {
    justify-content: flex-start;
    font-size: var(--text-display);
  }
  .pp-name--long { font-size: var(--text-3xl); }
}

.pp-rename-pencil {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: none;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  color: var(--text-muted);
  cursor: pointer;
  transition: color var(--duration-snap) var(--ease-snap), border-color var(--duration-snap) var(--ease-snap);
}

.pp-rename-pencil:hover,
.pp-rename-pencil:focus-visible {
  color: var(--color-hazard);
  border-color: rgba(255, 204, 0, 0.35);
}

.pp-rename {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  width: 100%;
  margin: 0;
}

.pp-rename-input {
  flex: 1 1 14rem;
  /* Size from the row, not from 20 characters of display type, or the input's
     natural width pushes the header past a phone's edge. */
  width: 0;
  min-width: 0;
  max-width: 26rem;
  padding: var(--spacing-2) var(--spacing-3);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-md);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1.1;
  color: var(--text-primary);
}

.pp-rename-input:focus {
  outline: none;
  border-color: var(--color-hazard);
}

.pp-rename-input.has-error { border-color: var(--color-alert); }

.pp-rename-btn {
  flex: none;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: var(--radius-md);
  color: var(--text-secondary);
  cursor: pointer;
}

.pp-rename-save {
  background: var(--color-hazard);
  border-color: var(--color-hazard);
  color: #000;
}

.pp-rename-btn:disabled { opacity: 0.5; cursor: default; }

.pp-rename-error {
  flex-basis: 100%;
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-alert);
}

.pp-rename-suggest {
  flex-basis: 100%;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--spacing-2);
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.pp-rename-chip {
  min-height: 44px;
  padding: 0 var(--spacing-3);
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.18);
  border-radius: var(--radius-pill);
  font: inherit;
  color: var(--text-primary);
  cursor: pointer;
}

.pp-rename-chip:hover { border-color: var(--color-hazard); }

.pp-meta {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  margin: 0;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
}

.pp-meta-strong { color: var(--text-primary); }
.pp-dot { color: var(--text-muted); }
.pp-flag { font-size: 1em; line-height: 1; }

.pp-live {
  width: 8px;
  height: 8px;
  border-radius: var(--radius-pill);
  background: var(--color-neon-green);
}

.pp-socials {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--spacing-2);
  padding-top: var(--spacing-1);
}

/* 36px to look at, 44px to hit. */
.pp-social {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  height: 36px;
  padding: 0 14px;
  border: 1px solid transparent;
  border-radius: var(--radius-pill);
  background: var(--bg-concrete-light);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-primary);
  text-decoration: none;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap), border-color var(--duration-snap) var(--ease-snap);
}
.pp-social::before {
  content: '';
  position: absolute;
  inset: -4px 0;
}
.pp-social:hover,
.pp-social:focus-visible {
  background: var(--surface-metal);
}

.pp-social-icon {
  width: 14px;
  height: 14px;
  flex: none;
}

.pp-social--add {
  background: none;
  border: 1px dashed color-mix(in srgb, var(--text-muted) 55%, transparent);
  color: var(--text-secondary);
}
.pp-social--add:hover,
.pp-social--add:focus-visible {
  background: none;
  border-color: var(--text-muted);
  color: var(--text-primary);
}

.pp-social--edit {
  width: 36px;
  justify-content: center;
  padding: 0;
  color: var(--text-secondary);
}
.pp-social--edit::before { inset: -4px; }

@media (min-width: 1024px) {
  .pp-socials,
  .pp-meta { justify-content: flex-start; }
}

/* ---- actions -------------------------------------------------------------- */
/* Fixed rather than sticky: a grid item can only stick inside its own row. */
.pp-actions {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  z-index: var(--z-hud);
  display: flex;
  gap: var(--spacing-2);
  padding: var(--spacing-4) var(--spacing-4) calc(var(--spacing-4) + env(safe-area-inset-bottom));
  background: var(--bg-concrete);
  border-top: 1px solid var(--surface-metal);
}

.pp-page--actions {
  padding-bottom: calc(88px + env(safe-area-inset-bottom));
}
:global(html:has(.pp-page--actions)) {
  scroll-padding-bottom: calc(88px + env(safe-area-inset-bottom));
}

@media (min-width: 1024px) {
  .pp-page--actions { padding-bottom: 0; }
  :global(html:has(.pp-page--actions)) { scroll-padding-bottom: 0; }
  .pp-actions {
    position: static;
    align-self: center;
    padding: 0;
    background: none;
    border: none;
  }
}

.pp-friend {
  flex: 0 1 auto;
  min-width: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  height: 56px;
  padding: 0 18px;
  background: var(--surface-metal-dark);
  border: 1px solid var(--surface-metal);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 600;
  line-height: 1.2;
  text-align: left;
  color: var(--text-primary);
  cursor: pointer;
  transition: border-color var(--duration-snap) var(--ease-snap), background var(--duration-snap) var(--ease-snap);
}
.pp-friend:hover:not(:disabled) { border-color: var(--text-muted); }
.pp-friend:disabled { cursor: default; }
.pp-friend--done { color: var(--text-secondary); }
.pp-friend--done svg { color: var(--color-neon-green); }

/* Answering someone is the game's solid gold. */
.pp-friend--accept {
  background: var(--color-hazard);
  border-color: var(--color-hazard);
  color: var(--bg-concrete);
}

.pp-play {
  flex: 1 0 auto;
  height: 56px;
  padding: 0 var(--spacing-4);
  border: none;
  border-radius: var(--radius-md);
  /* The shared primary button's red, which keeps white text readable. */
  background: linear-gradient(180deg, var(--color-alert) 0%, var(--color-alert-dim) 100%);
  font-family: var(--font-display);
  font-size: var(--text-xl);
  letter-spacing: 0.06em;
  color: #fff;
  white-space: nowrap;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap), opacity var(--duration-snap) var(--ease-snap);
}
.pp-play:hover:not(:disabled) { filter: brightness(1.1); }

@media (max-width: 374px) {
  .pp-play { font-size: var(--text-base); }
}
.pp-play:disabled { opacity: 0.7; cursor: wait; }

@media (min-width: 1024px) {
  .pp-play {
    flex: none;
    width: 240px;
    height: 52px;
  }
  .pp-friend { height: 52px; }
}

/* ---- body ----------------------------------------------------------------- */
.pp-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-8) 0 var(--spacing-2);
  text-align: center;
}

.pp-empty-hand {
  position: relative;
  width: 180px;
  height: 116px;
  margin-bottom: var(--spacing-1);
}

.pp-empty-card {
  position: absolute;
  top: 0;
  left: 56px;
}
.pp-empty-card--left,
.pp-empty-card--right {
  top: 14px;
  opacity: 0.55;
}
.pp-empty-card--left { left: 22px; transform: rotate(-14deg); }
.pp-empty-card--right { left: 90px; transform: rotate(14deg); }

.pp-empty-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 400;
  letter-spacing: 0.06em;
  line-height: 28px;
  color: #fff;
}

.pp-empty-line {
  max-width: 300px;
  margin: 0;
  font-size: var(--text-base);
  line-height: 24px;
  color: var(--text-secondary);
}

.pp-empty-play {
  flex: none;
  width: 100%;
  margin-top: var(--spacing-1);
}

@media (min-width: 1024px) {
  .pp-empty-play { width: 240px; height: 52px; }
}

.pp-card {
  background: var(--surface-metal-dark);
  border: 1px solid var(--surface-metal);
  border-radius: var(--radius-md);
}

.pp-label {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 16px;
  color: var(--text-secondary);
}

.pp-value {
  margin: 0;
  font-family: var(--font-display);
  font-size: 28px;
  line-height: 32px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.pp-stats {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
}

.pp-stat-row {
  display: flex;
  gap: var(--spacing-2);
}

.pp-stat {
  flex: 1 1 0;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
}
.pp-stat--wide { flex-grow: 1.5; }

/* Below 375px three 28px numbers no longer fit side by side. */
@media (max-width: 374px) {
  .pp-stat-row { flex-wrap: wrap; }
  .pp-stat--wide { flex-basis: 100%; }
}

.pp-caption {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 20px;
  color: var(--text-secondary);
}

.pp-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding-top: var(--spacing-12);
}

.pp-side .pp-section { padding-top: var(--spacing-8); }

@media (min-width: 1024px) {
  .pp-side .pp-section + .pp-section { padding-top: 28px; }
}

/* 24px tall, the same as the result chips beside RECENT GAMES, so headings
   in the two columns line up. */
.pp-section-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-lg);
  font-weight: 400;
  letter-spacing: 0.06em;
  line-height: 24px;
  color: #fff;
}

.pp-section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
}

.pp-link {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  margin-top: calc(-1 * var(--spacing-2));
  padding: 0;
  border: none;
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  letter-spacing: 0.12em;
  color: var(--text-primary);
  text-decoration: none;
  cursor: pointer;
}
.pp-link:hover,
.pp-link:focus-visible { color: var(--color-neon-blue); }

/* Head to head */
.pp-h2h {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
  padding: var(--spacing-4);
}

.pp-h2h-score {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.pp-h2h-side {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  width: 120px;
}
.pp-h2h-side--them {
  justify-content: flex-end;
  text-align: right;
}

.pp-ring :deep(.av-face) { box-shadow: 0 0 0 2px var(--tier-light); }
.pp-ring--you :deep(.av-face) { box-shadow: 0 0 0 2px var(--color-neon-blue); }

.pp-label--you { color: color-mix(in srgb, var(--color-neon-blue) 50%, white); }

.pp-h2h-num {
  margin: 0;
  font-family: var(--font-display);
  font-size: 40px;
  line-height: 44px;
  color: #fff;
  font-variant-numeric: tabular-nums;
}

.pp-h2h-vs {
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  color: var(--text-secondary);
}

.pp-h2h-bar {
  display: flex;
  gap: 2px;
  height: 6px;
  border-radius: 3px;
  overflow: hidden;
}
.pp-h2h-bar span { flex-basis: 0; }
.pp-h2h-bar-you { background: var(--color-neon-blue); }
.pp-h2h-bar-them { background: var(--tier-light); }

.pp-h2h-line {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 20px;
  color: var(--text-primary);
}

/* Results */
.pp-form {
  display: flex;
  gap: var(--spacing-1);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp-result {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--bg-concrete);
}
.pp-result--won { background: var(--color-neon-green); }
.pp-result--abandoned { background: var(--surface-metal); color: var(--text-secondary); }

.pp-games {
  margin: 0;
  padding: 0 var(--spacing-4);
  list-style: none;
}

/* Ladder */
.pp-ladder {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  height: 90px;
  padding: 0 var(--spacing-4);
}

.pp-ladder .pp-ladder-mark { --emblem-size: 44px; flex: none; }
.pp-ladder .pp-ladder-mark--next { opacity: 0.35; }

.pp-ladder-body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.pp-ladder-points {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  color: #fff;
}
.pp-ladder-of {
  font-weight: 400;
  color: var(--text-secondary);
}

.pp-ladder-bar {
  height: 12px;
  border-radius: 2px;
  background: var(--surface-metal);
  overflow: hidden;
}
/* The hazard stripe: the climb is the daily loop's colour. */
.pp-ladder-bar span {
  display: block;
  height: 100%;
  background: repeating-linear-gradient(135deg, var(--color-hazard) 0 8px, var(--color-hazard-dim) 8px 14px);
}

.pp-ladder-next {
  margin: 0;
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  line-height: 16px;
  text-transform: uppercase;
  color: var(--color-hazard);
}

/* Service record: two by two, the leanest win across the bottom. */
.pp-records {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--spacing-2);
  margin: 0;
  padding: 0;
  list-style: none;
}

.pp-record {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
}
.pp-record--wide {
  grid-column: 1 / -1;
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
}

.pp-own {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--spacing-3);
  max-width: 400px;
  padding: 0 var(--spacing-4) var(--spacing-12);
}

@media (min-width: 1024px) {
  .pp-own { padding: 0 0 var(--spacing-24); }
  .pp-body { padding-bottom: var(--spacing-12); }
}

.pp-own-line {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-secondary);
}
</style>
