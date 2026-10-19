<template>
  <div class="app-container">
    <!-- Loading state -->
    <div v-if="authStore.loading" class="loading-screen" role="status" aria-label="Loading">
      <h1 class="loading-brand">
        <span class="loading-uno">OPEN</span>
        <span class="loading-nomercy">MERCY</span>
      </h1>
      <div class="loading-dot" aria-hidden="true"></div>
      <p class="loading-text">INITIALIZING</p>
    </div>

    <!-- Password recovery mode -->
    <template v-else-if="showPasswordReset">
      <div class="reset-container">
        <div class="reset-card">
          <h1 class="reset-brand">
            <span class="reset-uno">OPEN</span>
            <span class="reset-nomercy">MERCY</span>
          </h1>
          <p class="reset-tagline">SET A NEW PASSWORD</p>

          <form class="reset-form" @submit.prevent="handlePasswordUpdate">
            <label class="field">
              <span class="field-label">NEW PASSWORD</span>
              <input
                v-model="newPassword"
                v-focus-ring
                type="password"
                placeholder="At least 6 characters"
                required
                minlength="6"
                autocomplete="new-password"
                class="field-input"
              />
            </label>

            <label class="field">
              <span class="field-label">CONFIRM PASSWORD</span>
              <input
                v-model="confirmPassword"
                v-focus-ring
                type="password"
                placeholder="Re-enter password"
                required
                minlength="6"
                autocomplete="new-password"
                class="field-input"
              />
            </label>

            <p v-if="resetError" class="msg msg-error">{{ resetError }}</p>
            <p v-if="resetSuccess" class="msg msg-success">{{ resetSuccess }}</p>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              block
              :disabled="resetLoading"
            >
              {{ resetLoading ? 'UPDATING...' : 'UPDATE PASSWORD' }}
            </Button>
          </form>
        </div>
      </div>
    </template>

    <!-- Playing local game vs bot (works without auth for guest play) -->
    <GameView v-else-if="localGameStore.gameState !== 'LOBBY'" @claim-account="handleShowAuth('claim')" @play-daily="startDailyGame('game_over')" />

    <!-- Shareable leaderboard page (/leaderboard) — works signed in or out.
         An active multiplayer match always wins over the route. -->
    <LeaderboardPage
      v-else-if="currentRoute.name === 'leaderboard' && !inMpMatch"
      @back="navigate({ name: 'home' })"
    />

    <!-- Badge system explainer (/badges) — how points and tiers work -->
    <BadgesPage
      v-else-if="currentRoute.name === 'badges' && !inMpMatch"
      @back="navigate({ name: 'home' })"
    />

    <!-- Full changelog (/changelog) — works signed in or out -->
    <ChangelogPage
      v-else-if="currentRoute.name === 'changelog' && !inMpMatch"
    />

    <!-- Shareable public profile (/p/<code>) — works signed in or out -->
    <ProfilePage
      v-else-if="currentRoute.name === 'profile' && !inMpMatch"
      :code="currentRoute.code"
      @back="navigate({ name: 'home' })"
    />


    <!-- Not authenticated -->
    <template v-else-if="!authStore.isAuthenticated">
      <AuthView v-if="showAuthView" @back="showAuthView = false" :initial-mode="authMode" />
      <LandingPage v-else @showAuth="handleShowAuth" @playGuest="playAsGuest" :loading="guestLoading" />
    </template>

    <!-- Playing multiplayer game -->
    <MultiplayerGameView
      v-else-if="mpStore.currentGame && (mpStore.currentGame.status === 'playing' || mpStore.currentGame.status === 'finished')"
      @claim-account="handleShowAuth('claim')"
    />

    <!-- A signed-in guest claiming their account in place: same user id,
         so their stats, badges and profile link stay attached. -->
    <AuthView
      v-else-if="showAuthView"
      initial-mode="claim"
      @back="showAuthView = false"
    />

    <!-- Friends: its own screen, reachable from the account menu -->
    <FriendsPage
      v-else-if="showFriends"
      @back="showFriends = false"
    />

    <!-- Authenticated - show lobby -->
    <MultiplayerLobby
      v-else
      @playLocal="startLocalGame"
      @playDaily="startDailyGame('lobby')"
      @showAuth="handleShowAuth('claim')"
      @showFriends="showFriends = true"
    />

    <!-- Always-mounted global settings drawer (Teleport'd to body) -->
    <SettingsDrawer />

    <!-- Guest sign-in failure toast. Top-center: the landing page owns the
         bottom edge with its sticky mobile CTA. -->
    <Transition name="signin-toast">
      <div v-if="guestError" class="signin-toast" role="alert">
        <div class="signin-toast__text">
          <span class="signin-toast__title">SIGN-IN FAILED</span>
          <span class="signin-toast__sub">{{ guestError }}</span>
        </div>
        <button class="signin-toast__retry" :disabled="guestLoading" @click="retryGuestSignin">
          {{ guestLoading ? 'RETRYING...' : 'RETRY' }}
        </button>
        <button class="signin-toast__dismiss" aria-label="Dismiss" @click="guestError = null"><X :size="16" :stroke-width="2" aria-hidden="true" /></button>
      </div>
    </Transition>

    <!-- A player on the home screen holds no game socket, so an invite
         arrives over Realtime and lands here, above every screen. -->
    <InviteToast />

    <!-- Friend requests and "they accepted", live. Never over a game: the
         count on the username chip and the Friends page keep the request
         until the match is over. Not on the Friends page either, which already
         shows the same request with ACCEPT. -->
    <FriendToast
      v-if="authStore.isAuthenticated && !inMpMatch && localGameStore.gameState === 'LOBBY' && currentScreen !== 'friends'"
    />

    <!-- One-time release card. Signed in only: someone who has not played has
         no stake in what changed, and a guest who plays is signed in, so this
         is the same line the landing page is drawn on. Never over a game. -->
    <ReleaseCard
      v-if="authStore.isAuthenticated && !inMpMatch && localGameStore.gameState === 'LOBBY'"
    />
  </div>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref, computed, watch, onMounted, onUnmounted, defineAsyncComponent } from 'vue'
import { track, trackScreen } from './utils/analytics'
import { localDateString } from './utils/seededRng'
import { nextBot } from './utils/botLadder'
import { WARM_UP_GAMES } from '@engine/bot'
import { adoptProfileEquip, applyEquipped } from './utils/cosmetics'
import { currentRoute, navigate } from './utils/routes'
import { isRoomCode } from '@roomCode'
import { syncCountryToProfile } from './utils/country'
import LandingPage from './components/LandingPage.vue'
import AuthView from './components/AuthView.vue'
import SettingsDrawer from './components/SettingsDrawer.vue'
import Button from './components/ui/Button.vue'
// The gameplay surfaces are code-split: a first-time visitor who only sees the
// landing page shouldn't download the whole game engine + dashboard. They load
// on demand when the view is first shown.
const MultiplayerLobby = defineAsyncComponent(() => import('./components/MultiplayerLobby.vue'))
const FriendsPage = defineAsyncComponent(() => import('./components/FriendsPage.vue'))
const LeaderboardPage = defineAsyncComponent(() => import('./components/LeaderboardPage.vue'))
const BadgesPage = defineAsyncComponent(() => import('./components/BadgesPage.vue'))
const ProfilePage = defineAsyncComponent(() => import('./components/ProfilePage.vue'))
const ChangelogPage = defineAsyncComponent(() => import('./components/ChangelogPage.vue'))
const GameView = defineAsyncComponent(() => import('./components/game/GameView.vue'))
const MultiplayerGameView = defineAsyncComponent(() => import('./components/game/MultiplayerGameView.vue'))
import { vFocusRing } from './directives/focusRing'
import { useAuthStore } from './stores/authStore'
import { supabase } from './lib/supabase'
import { useMultiplayerStore } from './stores/multiplayerStore'
import { useGameStore } from './stores/gameStore'
import { useRetentionStore } from './stores/retentionStore'
import { usePresenceHeartbeat } from './composables/usePresenceHeartbeat'
import InviteToast from './components/InviteToast.vue'
import FriendToast from './components/FriendToast.vue'
import ReleaseCard from './components/ReleaseCard.vue'

const authStore = useAuthStore()
const mpStore = useMultiplayerStore()
const localGameStore = useGameStore()

// Stamps this player's last-seen while the tab is visible. App-level, so it
// covers every screen and outlives any single one of them.
usePresenceHeartbeat()

const showAuthView = ref(false)
const authMode = ref<'login' | 'signup' | 'claim'>('signup')

// A signed-out → signed-in transition means an auth flow just finished, so the
// auth view has no reason to stay up. AuthView's own back-emit can't be trusted
// for this: login flips isAuthenticated, which unmounts the signed-out branch
// hosting the view, and an emit from an unmounted component never reaches this
// parent — the stale flag would mount the signed-in fallback AuthView (claim
// mode) and greet a plain sign-in with "ACCOUNT CLAIMED". Guest claims are
// untouched: a guest is already signed in, so claiming never transitions here.
watch(() => authStore.isAuthenticated, (is, was) => {
  if (is && !was) showAuthView.value = false
})
const showFriends = ref(false)
const showPasswordReset = ref(false)
const newPassword = ref('')
const confirmPassword = ref('')
const resetError = ref('')
const resetSuccess = ref('')
const resetLoading = ref(false)

// Virtual page views: this SPA has no router, so GA otherwise sees one
// eternal page. One page_view per screen gives time-per-screen for free
// in GA's standard engagement reports. Mirrors the template's v-if chain.
const inMpMatch = computed(() => {
  const s = mpStore.currentGame?.status
  return s === 'playing' || s === 'finished'
})

const currentScreen = computed(() => {
  if (authStore.loading) return null
  if (showPasswordReset.value) return 'password_reset'
  if (localGameStore.gameState !== 'LOBBY') return 'sp_game'
  if (currentRoute.value.name === 'leaderboard' && !inMpMatch.value) return 'leaderboard'
  if (currentRoute.value.name === 'profile' && !inMpMatch.value) return 'profile'
  if (currentRoute.value.name === 'changelog' && !inMpMatch.value) return 'changelog'
  if (!authStore.isAuthenticated) return showAuthView.value ? 'auth' : 'landing'
  if (inMpMatch.value) return 'mp_game'
  if (showAuthView.value) return 'claim_account'
  if (mpStore.currentGame?.status === 'waiting') return 'waiting_room'
  if (showFriends.value) return 'friends'
  return 'lobby'
})
watch(currentScreen, (screen) => {
  if (screen) trackScreen(screen)
})

// The signed-in profile's equip wins over whatever this device had.
watch(() => authStore.profile, (p) => {
  if (p) {
    adoptProfileEquip(p.equipped_card_back)
    // Mirror the CDN-detected country onto the profile (once per session).
    void syncCountryToProfile(p.country)
  }
})

let authSubscription: { unsubscribe: () => void } | null = null

onMounted(async () => {
  // Equipped card back applies via root CSS vars before any card renders.
  applyEquipped()

  const { data } = supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') {
      showPasswordReset.value = true
    }
  })
  authSubscription = data.subscription

  await authStore.initialize()

  // A failed Google link redirects back to the home path, where nothing would
  // explain why. Reopen the claim screen so the reason is visible and the
  // sign-in-instead route is one tap away.
  if (authStore.oauthError) {
    authMode.value = 'claim'
    showAuthView.value = true
  }

  // Reconnect: if we were in an in-progress game when the tab reloaded/dropped,
  // re-enter it instead of stranding the player in the lobby.
  if (authStore.isAuthenticated) {
    await mpStore.restoreActiveGame()
  } else {
    // An invite link shouldn't demand a PLAY NOW click: sign the guest in on
    // arrival and let the lobby's auto-join take over. No play_clicked here —
    // it counts real CTA clicks. Failure falls back to the landing page,
    // where the invite banner and the retry toast still apply.
    const invite = new URLSearchParams(window.location.search).get('join') || ''
    if (isRoomCode(invite)) await attemptGuestSignin()
  }
})

// App remounts (HMR) would otherwise stack PASSWORD_RECOVERY listeners.
onUnmounted(() => {
  authSubscription?.unsubscribe()
  authSubscription = null
})

async function handlePasswordUpdate() {
  resetError.value = ''
  resetSuccess.value = ''

  if (newPassword.value !== confirmPassword.value) {
    resetError.value = 'Passwords do not match'
    return
  }
  if (newPassword.value.length < 6) {
    resetError.value = 'Password must be at least 6 characters'
    return
  }

  resetLoading.value = true
  try {
    const result = await authStore.updatePassword(newPassword.value)
    if (result.success) {
      resetSuccess.value = 'Password updated. Redirecting...'
      setTimeout(() => {
        showPasswordReset.value = false
        newPassword.value = ''
        confirmPassword.value = ''
      }, 1500)
    } else {
      resetError.value = result.error || 'Failed to update password'
    }
  } finally {
    resetLoading.value = false
  }
}

function handleShowAuth(mode: 'login' | 'signup' | 'claim') {
  authMode.value = mode
  showAuthView.value = true
}

const guestLoading = ref(false)
const guestError = ref<string | null>(null)
let lastGuestNickname: string | undefined

async function attemptGuestSignin(nickname?: string) {
  guestLoading.value = true
  guestError.value = null
  lastGuestNickname = nickname
  try {
    const result = await authStore.signInAnonymously(nickname)
    if (!result.success) {
      console.error('Guest sign-in failed:', result.error)
      track('signin_failed', { message: result.error ?? 'unknown' })
      guestError.value = "Couldn't reach the server. Check your connection."
    }
  } finally {
    guestLoading.value = false
  }
}

async function playAsGuest(nickname?: string) {
  track('play_clicked', { method: 'guest' })
  await attemptGuestSignin(nickname)
}

function retryGuestSignin() {
  track('signin_retry')
  void attemptGuestSignin(lastGuestNickname)
}

function startLocalGame(mode?: 'official' | 'house' | 'casual') {
  // Solo faces the next unbeaten rung, so the practice mode has somewhere to go.
  const opponent = nextBot()
  localGameStore.initializeGame(['You', opponent.name], mode, {
    botIds: [opponent.id],
    warmUp: useRetentionStore().gamesPlayed < WARM_UP_GAMES,
  })
}

// The daily challenge: official rules, date-seeded so the whole world gets
// the same deal today. `entry_point` says which surface converted — the lobby
// card or the game-over nudge — so adoption per surface is measurable. It is
// NOT called `source`: GA4 reads a parameter of that name as a traffic source
// and rewrites the session's attribution with it.
function startDailyGame(entry_point: 'lobby' | 'game_over') {
  track('daily_started', { entry_point })
  localGameStore.initializeGame(['You', 'Terminator'], 'official', { dailySeed: localDateString() })
}
</script>

<style scoped>
.app-container {
  min-height: 100vh;
  min-height: 100dvh;
  width: 100vw;
  overflow-y: auto;
  overflow-x: hidden;
  position: relative;
  background: var(--bg-concrete);
  color: var(--text-primary);
}

@media (max-width: 480px) {
  .app-container {
    -webkit-overflow-scrolling: touch;
  }
}

/* Guest sign-in failure toast — mirrors the in-game eliminated banner,
   pinned top-center like the reconnect pill. */
.signin-toast {
  position: fixed;
  top: max(1.25rem, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.7rem 0.85rem 0.7rem 1.25rem;
  background: rgba(20, 0, 0, 0.92);
  border: 1px solid rgba(255, 42, 42, 0.65);
  border-radius: 12px;
  box-shadow: 0 8px 28px rgba(255, 42, 42, 0.35);
  z-index: var(--z-toast);
  max-width: calc(100vw - 2rem);
}

.signin-toast__text {
  display: flex;
  flex-direction: column;
  line-height: 1.15;
}

.signin-toast__title {
  font-family: 'Black Ops One', 'Impact', sans-serif;
  font-size: 1.1rem;
  letter-spacing: 0.14em;
  color: #ff2a2a;
  text-transform: uppercase;
  white-space: nowrap;
}

.signin-toast__sub {
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.7rem;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.72);
  text-transform: uppercase;
}

.signin-toast__retry {
  font-family: 'Chakra Petch', sans-serif;
  font-size: 0.8rem;
  letter-spacing: 0.18em;
  color: #fff;
  background: rgba(255, 42, 42, 0.9);
  border: none;
  border-radius: 8px;
  padding: 0.55rem 1.1rem;
  cursor: pointer;
  transition: background 0.15s;
}

.signin-toast__retry:hover {
  background: #ff2a2a;
}

.signin-toast__retry:disabled {
  opacity: 0.6;
  cursor: default;
}

.signin-toast__dismiss {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  font-size: 1.1rem;
  line-height: 1;
  color: rgba(255, 255, 255, 0.55);
  background: none;
  border: none;
  padding: 0.25rem;
  cursor: pointer;
}

.signin-toast__dismiss:hover {
  color: #fff;
}

.signin-toast-enter-active,
.signin-toast-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}

.signin-toast-enter-from,
.signin-toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

/* Narrow screens: pin edge-to-edge and let the actions wrap below the text
   instead of squeezing the message into a sliver. */
@media (max-width: 480px) {
  .signin-toast {
    left: 1rem;
    right: 1rem;
    transform: none;
    flex-wrap: wrap;
    justify-content: flex-end;
  }

  .signin-toast__text {
    flex: 1 1 100%;
  }

  .signin-toast-enter-from,
  .signin-toast-leave-to {
    transform: translateY(-8px);
  }
}

/* LOADING SCREEN — brand-led, single pulsing dot, no spinner */
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  gap: var(--spacing-6);
  z-index: var(--z-toast);
  background: var(--bg-concrete);
}

.loading-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-1);
  margin: 0;
}

.loading-uno {
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 8vw, 3.5rem);
  letter-spacing: 0.05em;
  color: var(--text-primary);
}

.loading-nomercy {
  font-family: var(--font-display);
  font-size: clamp(0.875rem, 3vw, 1.25rem);
  letter-spacing: 0.3em;
  color: var(--color-alert);
  text-shadow: 0 0 12px rgba(255, 42, 42, 0.5);
}

.loading-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-alert);
  box-shadow: 0 0 16px var(--color-alert);
  animation: loading-pulse 1.4s ease-in-out infinite;
}

@keyframes loading-pulse {
  0%, 100% {
    transform: scale(1);
    opacity: 0.5;
  }
  50% {
    transform: scale(1.6);
    opacity: 1;
  }
}

.loading-text {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.4em;
  margin: 0;
}

@media (prefers-reduced-motion: reduce) {
  .loading-dot {
    animation: none;
    opacity: 0.8;
  }
}

/* PASSWORD RESET CARD — matches auth card styling */
.reset-container {
  position: fixed;
  inset: 0;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: var(--z-modal);
  padding: var(--spacing-4);
  background: var(--bg-concrete);
}

.reset-card {
  width: 100%;
  max-width: 440px;
  background: linear-gradient(180deg, #18191b 0%, #0a0a0b 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: var(--radius-md);
  padding: var(--spacing-8) var(--spacing-6);
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.reset-brand {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-1);
  margin: 0;
}

.reset-uno {
  font-family: var(--font-display);
  font-size: clamp(2.5rem, 8vw, 3.5rem);
  letter-spacing: 0.05em;
  color: var(--text-primary);
}

.reset-nomercy {
  font-family: var(--font-display);
  font-size: clamp(0.875rem, 3vw, 1.25rem);
  letter-spacing: 0.3em;
  color: var(--color-alert);
  text-shadow: 0 0 12px rgba(255, 42, 42, 0.5);
}

.reset-tagline {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  letter-spacing: 0.2em;
  color: var(--text-secondary);
  text-transform: uppercase;
  text-align: center;
}

.reset-form {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.field {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.field-label {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
  letter-spacing: 0.18em;
}

.field-input {
  width: 100%;
  padding: var(--spacing-3) var(--spacing-4);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  border-radius: var(--radius-sm);
  transition: border-color var(--duration-snap) var(--ease-snap);
  min-height: 44px;
}

.field-input:focus {
  outline: none;
  border-color: var(--color-neon-blue);
}

.msg {
  margin: 0;
  padding: var(--spacing-3);
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  border-radius: var(--radius-sm);
  border: 1px solid;
  text-align: center;
}

.msg-error {
  background: rgba(255, 42, 42, 0.08);
  border-color: var(--color-alert);
  color: var(--color-alert);
}

.msg-success {
  background: rgba(0, 255, 102, 0.08);
  border-color: var(--color-neon-green);
  color: var(--color-neon-green);
}
</style>
