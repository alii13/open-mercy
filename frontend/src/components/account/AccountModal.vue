<template>
  <Teleport to="body">
    <div class="acct-overlay" @click.self="closeAccountModal">
      <div
        class="acct"
        :class="wide ? 'acct--wide' : 'acct--sheet'"
        role="dialog"
        aria-modal="true"
        aria-labelledby="acct-label"
      >
        <!-- Desktop: who you are on top, one tab per concern below. -->
        <nav v-if="wide" class="acct-rail" aria-label="Account">
          <div class="acct-who">
            <Avatar :uid="authStore.user?.id" :name="authStore.username" :size="40" />
            <span class="acct-who-text">
              <span id="acct-label" class="acct-who-name">{{ authStore.username }}</span>
              <span class="acct-who-kind">{{ authStore.isAnonymous ? 'Guest' : 'Your account' }}</span>
            </span>
          </div>
          <button
            v-for="t in tabs"
            :key="t.id"
            type="button"
            class="acct-tab"
            :class="[`acct-tab--${t.id}`, { 'is-active': tab === t.id }]"
            :aria-current="tab === t.id ? 'page' : undefined"
            @click="openTab(t.id)"
          >
            <component :is="t.icon" :size="20" :stroke-width="2" aria-hidden="true" />
            <span class="acct-tab-label">{{ t.label }}</span>
            <span v-if="t.count" class="acct-tab-count">{{ t.count }}</span>
          </button>
        </nav>

        <section class="acct-main">
          <header class="acct-head">
            <button v-if="!wide && step !== 'home'" type="button" class="acct-back" @click="go('home')">
              <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
              <span>ACCOUNT</span>
            </button>
            <h2 v-else-if="!wide" id="acct-label" class="acct-label">ACCOUNT</h2>
            <span v-else aria-hidden="true" />
            <button ref="closeEl" type="button" class="acct-close" aria-label="Close" @click="closeAccountModal">
              <X :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <div class="acct-body">
            <!-- Desktop tabs -->
            <template v-if="wide">
              <div v-if="tab === 'profile'" class="acct-panel">
                <h2 class="acct-title">Profile</h2>
                <AccountIdentity wide hide-avatar @claim="go('claim')" @view-profile="viewProfile" />
                <PhotoSheet embedded @done="go('home')" @claim="claimForPhoto" />
              </div>

              <div v-else-if="tab === 'friends'" class="acct-panel">
                <h2 class="acct-title">Friends</h2>
                <FriendsSection @opened-room="closeAccountModal" />
              </div>

              <div v-else-if="tab === 'signin'" class="acct-panel">
                <template v-if="authStore.isAnonymous">
                  <h2 class="acct-title">Claim your account</h2>
                  <AuthView embedded initial-mode="claim" @back="go('home')" />
                </template>
                <EmailSheet v-else-if="authStore.canChangeEmail" embedded @done="go('home')" />
                <template v-else>
                  <h2 class="acct-title">Sign-in</h2>
                  <p class="acct-copy">You sign in with {{ providerName }}. {{ providerName }} looks after your password and email.</p>
                </template>
              </div>

              <DeleteAccountStep v-else wide class="acct-panel" @keep="go('home')" />
            </template>

            <!-- Phones: a list, each row opening its own screen in the same sheet -->
            <template v-else>
              <template v-if="step === 'home'">
                <AccountIdentity class="acct-identity" @claim="go('claim')" @photo="go('photo')" />

                <button v-if="!social.unavailable" type="button" class="acct-row" @click="go('friends')">
                  <Users class="acct-row-icon acct-row-icon--friends" :size="20" :stroke-width="2" aria-hidden="true" />
                  <span class="acct-row-label">Friends</span>
                  <span v-if="social.incoming.length" class="acct-pill">{{ requestLabel }}</span>
                  <ChevronRight class="acct-row-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
                </button>
                <button v-if="authStore.canChangeEmail" type="button" class="acct-row" @click="go('email')">
                  <Mail class="acct-row-icon" :size="20" :stroke-width="2" aria-hidden="true" />
                  <span class="acct-row-label">Email</span>
                  <span class="acct-row-meta">{{ maskedEmail }}</span>
                  <ChevronRight class="acct-row-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
                </button>

                <div class="acct-danger">
                  <button type="button" class="acct-danger-link" @click="go('delete')">
                    <Trash2 :size="16" :stroke-width="2" aria-hidden="true" />
                    Delete account
                  </button>
                </div>
              </template>

              <FriendsSection v-else-if="step === 'friends'" @opened-room="closeAccountModal" />
              <PhotoSheet v-else-if="step === 'photo'" embedded @done="go('home')" @claim="claimForPhoto" />
              <EmailSheet v-else-if="step === 'email'" embedded @done="go('home')" />
              <DeleteAccountStep v-else-if="step === 'delete'" @keep="go('home')" />
              <div v-else>
                <h2 class="acct-title">Claim your account</h2>
                <AuthView embedded initial-mode="claim" @back="go('home')" />
              </div>
            </template>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, KeyRound, Mail, Trash2, UserRound, Users, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import Avatar from '../Avatar.vue'
import AuthView from '../AuthView.vue'
import FriendsSection from '../FriendsSection.vue'
import PhotoSheet from '../PhotoSheet.vue'
import EmailSheet from '../EmailSheet.vue'
import AccountIdentity from './AccountIdentity.vue'
import DeleteAccountStep from './DeleteAccountStep.vue'
import { useAuthStore } from '../../stores/authStore'
import { useSocialStore } from '../../stores/socialStore'
import { accountStep, closeAccountModal, openAccountModal, type AccountStep } from '../../composables/useAccountModal'
import { rememberPhotoAfterClaim } from '../../composables/usePhotoSheet'
import { navigate, router } from '../../utils/routes'

const authStore = useAuthStore()
const social = useSocialStore()

const step = computed<AccountStep>(() => accountStep.value ?? 'home')
function go(next: AccountStep) {
  openAccountModal(next)
}

// On desktop every step belongs to a tab: the photo lives on Profile, the
// email change and the claim form on Sign-in.
type Tab = 'profile' | 'friends' | 'signin' | 'delete'
const TAB_OF: Record<AccountStep, Tab> = {
  home: 'profile', photo: 'profile', friends: 'friends', email: 'signin', claim: 'signin', delete: 'delete',
}
const tab = computed<Tab>(() => TAB_OF[step.value])
const STEP_OF: Record<Tab, () => AccountStep> = {
  profile: () => 'home',
  friends: () => 'friends',
  signin: () => (authStore.isAnonymous ? 'claim' : 'email'),
  delete: () => 'delete',
}
function openTab(t: Tab) {
  go(STEP_OF[t]())
}

const tabs = computed(() => [
  { id: 'profile' as const, label: 'Profile', icon: UserRound, count: 0 },
  ...(social.unavailable ? [] : [{ id: 'friends' as const, label: 'Friends', icon: Users, count: social.incoming.length }]),
  { id: 'signin' as const, label: authStore.isAnonymous ? 'Claim account' : 'Sign-in', icon: KeyRound, count: 0 },
  { id: 'delete' as const, label: 'Delete account', icon: Trash2, count: 0 },
])

const PROVIDERS: Record<string, string> = { google: 'Google', apple: 'Apple' }
const providerName = computed(() => PROVIDERS[String(authStore.user?.app_metadata?.provider ?? '')] ?? 'your provider')

// One layout per width: the two differ in structure (a tab rail, a row list),
// not just in spacing.
const WIDE_QUERY = '(min-width: 760px)'
const wideMedia = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null
const wide = ref(wideMedia?.matches ?? false)
const onWideChange = (e: MediaQueryListEvent) => { wide.value = e.matches }

const closeEl = ref<HTMLButtonElement | null>(null)
function onKeydown(e: KeyboardEvent) {
  // The name field and the claim and email forms use Escape themselves.
  if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) closeAccountModal()
}

// Anything that navigates (a friend's profile, a room) leaves the modal behind.
const stopRouteWatch = watch(() => router.currentRoute.value.fullPath, () => closeAccountModal())

onMounted(() => {
  wideMedia?.addEventListener('change', onWideChange)
  window.addEventListener('keydown', onKeydown)
  void nextTick(() => closeEl.value?.focus())
})
onUnmounted(() => {
  wideMedia?.removeEventListener('change', onWideChange)
  window.removeEventListener('keydown', onKeydown)
  stopRouteWatch()
})

const requestLabel = computed(() => {
  const n = social.incoming.length
  return `${n} request${n === 1 ? '' : 's'}`
})

const maskedEmail = computed(() => {
  const email = authStore.user?.email ?? ''
  const [local, domain] = email.split('@')
  if (!local || !domain) return email
  return `${local.slice(0, 5)}•••@${domain}`
})

// A guest can't upload until claimed: claim here, and the photo step comes
// back by itself once they are (App.vue reads the remembered wish).
function claimForPhoto() {
  rememberPhotoAfterClaim()
  go('claim')
}

function viewProfile() {
  const code = authStore.profile?.share_code
  if (!code) return
  void navigate({ name: 'profile', code })
}
</script>

<style scoped>
.acct-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: flex-end;
  justify-content: center;
  background: rgba(0, 0, 0, 0.72);
}

.acct {
  display: flex;
  background: var(--bg-concrete-light);
  color: var(--text-primary);
  font-family: var(--font-body);
  overflow: hidden;
}

/* Phone: one bottom sheet, the same height on every screen. */
.acct--sheet {
  width: 100%;
  height: min(640px, 92dvh);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

/* Desktop: one dialog, the same size on every tab. */
.acct--wide {
  align-self: center;
  width: min(920px, calc(100vw - 48px));
  height: min(600px, calc(100dvh - 48px));
  border-radius: var(--radius-lg);
  border: 1px solid var(--surface-metal);
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

/* Desktop tab rail */
.acct-rail {
  flex: 0 0 248px;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-1);
  padding: var(--spacing-6) var(--spacing-3);
  background: var(--surface-metal-dark);
}

.acct-who {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  padding: 0 var(--spacing-3) var(--spacing-6);
}

.acct-who-text {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.acct-who-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  font-weight: 600;
}

.acct-who-kind {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.acct-tab {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 44px;
  padding: 0 var(--spacing-3);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  text-align: left;
  cursor: pointer;
}

.acct-tab.is-active {
  background: var(--surface-metal);
  color: var(--text-primary);
}

.acct-tab-label {
  flex: 1;
}

.acct-tab-count {
  min-width: 20px;
  padding: 0 var(--spacing-2);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-neon-blue) 14%, transparent);
  color: color-mix(in srgb, var(--color-neon-blue) 55%, white);
  font-size: var(--text-xs);
  font-weight: 600;
  text-align: center;
}

.acct-tab--friends svg {
  color: var(--color-neon-blue);
}

/* Deleting sits apart, at the foot of the rail. */
.acct-tab--delete {
  margin-top: auto;
  color: color-mix(in srgb, var(--color-alert) 75%, white);
}

.acct-tab--delete.is-active {
  background: color-mix(in srgb, var(--color-alert) 12%, transparent);
  color: color-mix(in srgb, var(--color-alert) 75%, white);
}

.acct-main {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.acct-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-3) var(--spacing-4) 0 var(--spacing-6);
}

.acct--wide .acct-head {
  padding: var(--spacing-4) var(--spacing-4) 0;
}

.acct-label,
.acct-back {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--text-secondary);
}

.acct-back {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  min-height: 44px;
  margin-left: calc(-1 * var(--spacing-2));
  padding: 0 var(--spacing-2);
  border: none;
  background: none;
  cursor: pointer;
}

.acct-close {
  width: 44px;
  height: 44px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: none;
  color: var(--text-secondary);
  cursor: pointer;
}

.acct-body {
  flex: 1;
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--spacing-2) var(--spacing-6) var(--spacing-6);
}

.acct--wide .acct-body {
  padding: 0 var(--spacing-12) var(--spacing-8);
}

.acct-panel {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-6);
}

.acct-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1.2;
  color: var(--text-primary);
}

.acct-copy {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.acct-identity {
  margin-bottom: var(--spacing-6);
}

/* Phone rows */
.acct-row {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 56px;
  padding: 0 var(--spacing-4);
  border: none;
  background: var(--surface-metal-dark);
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-base);
  text-align: left;
  cursor: pointer;
}

.acct-row:first-of-type {
  border-top-left-radius: var(--radius-lg);
  border-top-right-radius: var(--radius-lg);
}

.acct-row:last-of-type {
  border-bottom-left-radius: var(--radius-lg);
  border-bottom-right-radius: var(--radius-lg);
}

.acct-row + .acct-row {
  border-top: 1px solid var(--surface-metal);
}

.acct-row-icon {
  flex-shrink: 0;
  color: var(--text-secondary);
}

.acct-row-icon--friends {
  color: var(--color-neon-blue);
}

.acct-row-label {
  flex: 1;
  font-weight: 500;
}

.acct-row-meta {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.acct-row-chevron {
  flex-shrink: 0;
  color: var(--text-muted);
}

.acct-pill {
  padding: 2px var(--spacing-3);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-neon-blue) 12%, transparent);
  color: color-mix(in srgb, var(--color-neon-blue) 55%, white);
  font-size: var(--text-xs);
  font-weight: 600;
}

.acct-danger {
  margin-top: auto;
  display: flex;
  justify-content: center;
  padding-top: var(--spacing-6);
}

.acct-danger-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  padding: 0 var(--spacing-4);
  border: none;
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 600;
  color: color-mix(in srgb, var(--color-alert) 75%, white);
  cursor: pointer;
}

@media (hover: hover) {
  .acct-row:hover,
  .acct-tab:not(.is-active):hover { background: var(--surface-metal); }
  .acct-close:hover,
  .acct-back:hover,
  .acct-tab:hover { color: var(--text-primary); }
  .acct-tab--delete:hover { color: color-mix(in srgb, var(--color-alert) 75%, white); }
}

@media (prefers-reduced-motion: no-preference) {
  .acct--sheet {
    animation: acct-sheet-in var(--duration-soft) var(--ease-strut);
  }
  .acct--wide {
    animation: acct-fade-in var(--duration-soft) var(--ease-strut);
  }
}

@media (prefers-reduced-motion: reduce) {
  .acct {
    animation: acct-fade-in var(--duration-snap) linear;
  }
}

@keyframes acct-sheet-in {
  from { transform: translateY(24px); opacity: 0; }
}

@keyframes acct-fade-in {
  from { opacity: 0; }
}
</style>
