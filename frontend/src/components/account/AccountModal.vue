<template>
  <Teleport to="body">
    <div class="acct-overlay" @click.self="closeAccountModal">
      <div
        class="acct"
        :class="wide ? 'acct--wide' : 'acct--sheet'"
        role="dialog"
        aria-modal="true"
        aria-label="Account"
      >
        <aside v-if="wide" class="acct-side">
          <AccountIdentity wide :hide-claim="step !== 'home'" @claim="go('claim')" @photo="go('photo')" @view-profile="viewProfile" />
        </aside>

        <section class="acct-main">
          <header class="acct-head" :class="{ 'acct-head--tabs': wide && step === 'home' }">
            <!-- Desktop home: Friends and Sign-in are separate screens, one tab each. -->
            <div v-if="wide && step === 'home'" class="acct-tabs" role="tablist" aria-label="Account sections">
              <button
                v-for="t in homeTabs"
                :key="t.id"
                type="button"
                role="tab"
                class="acct-tab"
                :class="{ 'is-active': homeTab === t.id }"
                :aria-selected="homeTab === t.id"
                @click="homeTab = t.id"
              >
                {{ t.label }}
                <span v-if="t.count" class="acct-tab-count">{{ t.count }}</span>
              </button>
            </div>
            <button v-else-if="step !== 'home'" ref="backEl" type="button" class="acct-back" aria-label="Back to account" @click="go('home')">
              <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
              <span>ACCOUNT</span>
            </button>
            <h2 v-else class="acct-label">ACCOUNT</h2>
            <button ref="closeEl" type="button" class="acct-close" aria-label="Close" @click="closeAccountModal">
              <X :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <div class="acct-body">
            <!-- Desktop home -->
            <template v-if="step === 'home' && wide">
              <FriendsSection v-if="homeTab === 'friends'" @opened-room="closeAccountModal" />

              <template v-else>
                <section class="acct-section">
                  <div v-if="authStore.canChangeEmail" class="acct-email">
                    <Mail class="acct-row-icon" :size="20" :stroke-width="2" aria-hidden="true" />
                    <span class="acct-email-text">{{ authStore.user?.email }}</span>
                    <button type="button" class="acct-change" @click="go('email')">Change</button>
                  </div>
                  <p v-else-if="authStore.isAnonymous" class="acct-copy">
                    You're playing as a guest, saved on this device only. Claim your account to sign in anywhere.
                  </p>
                  <p v-else class="acct-copy">You sign in with {{ providerName }}, which looks after your password and email.</p>
                </section>

                <!-- Deleting sits alone at the bottom, apart from everything else -->
                <div class="acct-danger">
                  <span class="acct-danger-text">
                    <span class="acct-danger-title">Delete account</span>
                    <span class="acct-danger-note">Removes your profile, games and friends for good.</span>
                  </span>
                  <button type="button" class="acct-danger-btn" @click="go('delete')">
                    <Trash2 :size="16" :stroke-width="2" aria-hidden="true" />
                    Delete
                  </button>
                </div>
              </template>
            </template>

            <!-- Phone home: rows, each opening its own screen -->
            <template v-else-if="step === 'home'">
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

              <div class="acct-danger acct-danger--sheet">
                <button type="button" class="acct-danger-link" @click="go('delete')">
                  <Trash2 :size="16" :stroke-width="2" aria-hidden="true" />
                  Delete account
                </button>
              </div>
            </template>

            <!-- Phones: Friends opens in this sheet, like every other row. -->
            <FriendsSection v-else-if="step === 'friends'" @opened-room="closeAccountModal" />

            <DeleteAccountStep v-else-if="step === 'delete'" :wide="wide" @keep="go('home')" />

            <!-- Photo and email are steps in this frame, never a second modal on top. -->
            <PhotoSheet v-else-if="step === 'photo'" embedded @done="go('home')" @claim="claimForPhoto" />
            <EmailSheet v-else-if="step === 'email'" embedded @done="go('home')" />

            <div v-else class="acct-claim">
              <h2 v-if="authStore.isAnonymous" class="acct-claim-title">Claim your account</h2>
              <AuthView embedded initial-mode="claim" @back="authStore.isAnonymous ? go('home') : closeAccountModal()" />
            </div>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, Mail, Trash2, Users, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AuthView from '../AuthView.vue'
import FriendsSection from '../FriendsSection.vue'
import AccountIdentity from './AccountIdentity.vue'
import DeleteAccountStep from './DeleteAccountStep.vue'
import PhotoSheet from '../PhotoSheet.vue'
import EmailSheet from '../EmailSheet.vue'
import { useAuthStore } from '../../stores/authStore'
import { useSocialStore } from '../../stores/socialStore'
import { accountStep, closeAccountModal, openAccountModal, type AccountStep } from '../../composables/useAccountModal'
import { photoSheetOpen, rememberPhotoAfterClaim } from '../../composables/usePhotoSheet'
import { emailSheetOpen } from '../../composables/useEmailSheet'
import { navigate, router } from '../../utils/routes'

const authStore = useAuthStore()
const social = useSocialStore()

const step = computed<AccountStep>(() => accountStep.value ?? 'home')
function go(next: AccountStep) {
  openAccountModal(next)
}

// Desktop home: Friends and Sign-in are separate screens, one tab each.
type HomeTab = 'friends' | 'signin'
const homeTab = ref<HomeTab>(social.unavailable ? 'signin' : 'friends')
const homeTabs = computed(() => [
  ...(social.unavailable ? [] : [{ id: 'friends' as const, label: 'Friends', count: social.incoming.length }]),
  { id: 'signin' as const, label: 'Sign-in', count: 0 },
])

const PROVIDERS: Record<string, string> = { google: 'Google', apple: 'Apple' }
const providerName = computed(() => PROVIDERS[String(authStore.user?.app_metadata?.provider ?? '')] ?? 'your provider')

// One layout per size: the two differ in structure (a side column, tabs), not
// just spacing. A short window (a landscape phone, a zoomed desktop) gets the
// sheet, because the side column cannot fit its content there.
const WIDE_QUERY = '(min-width: 760px) and (min-height: 600px)'
const wideMedia = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null
const wide = ref(wideMedia?.matches ?? false)
const onWideChange = (e: MediaQueryListEvent) => { wide.value = e.matches }

const closeEl = ref<HTMLButtonElement | null>(null)
const backEl = ref<HTMLButtonElement | null>(null)

function onKeydown(e: KeyboardEvent) {
  if (e.key !== 'Escape') return
  // The name field cancels its own edit; a standalone sheet on top closes first.
  if ((e.target as HTMLElement | null)?.classList?.contains('ai-name-input')) return
  if (photoSheetOpen.value || emailSheetOpen.value) return
  closeAccountModal()
}

// Focus: start on Close, move to Back (or Close) as steps swap so it never
// drops to the page behind, and go back to whatever opened the modal.
const opener = document.activeElement as HTMLElement | null
const appEl = document.getElementById('app')
watch(step, () => void nextTick(() => (backEl.value ?? closeEl.value)?.focus()))

// Desktop has no Friends screen of its own: it is the home's Friends tab. A
// window that widens while Friends is open lands on that tab.
watch([step, wide], ([s, w]) => {
  if (w && s === 'friends') {
    homeTab.value = 'friends'
    go('home')
  }
}, { immediate: true })

// Anything that navigates (a friend's profile, a room) leaves the modal behind.
const stopRouteWatch = watch(() => router.currentRoute.value.fullPath, () => closeAccountModal())

onMounted(() => {
  wideMedia?.addEventListener('change', onWideChange)
  window.addEventListener('keydown', onKeydown)
  appEl?.setAttribute('inert', '')
  void nextTick(() => closeEl.value?.focus())
})
onUnmounted(() => {
  wideMedia?.removeEventListener('change', onWideChange)
  window.removeEventListener('keydown', onKeydown)
  appEl?.removeAttribute('inert')
  stopRouteWatch()
  opener?.focus?.()
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

/* Phone: one bottom sheet, the same height on every step. */
.acct--sheet {
  width: 100%;
  height: min(640px, 92dvh);
  border-radius: var(--radius-lg) var(--radius-lg) 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}

/* Desktop: one wide dialog, the same size on every step. */
.acct--wide {
  align-self: center;
  width: min(920px, calc(100vw - 48px));
  height: min(560px, calc(100dvh - 48px));
  border-radius: var(--radius-lg);
  border: 1px solid var(--surface-metal);
  box-shadow: var(--shadow-lg);
}

.acct-side {
  flex: 0 0 320px;
  display: flex;
  align-items: safe center;
  justify-content: center;
  overflow-y: auto;
  padding: var(--spacing-8);
  background: var(--surface-metal-dark);
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
  padding: var(--spacing-3) var(--spacing-6) 0;
}

.acct--wide .acct-head {
  padding: var(--spacing-4) var(--spacing-8) 0;
}

/* The tab bar rule spans the content width; the active tab's underline sits on it. */
.acct--wide .acct-head.acct-head--tabs {
  margin: 0 var(--spacing-8);
  padding-left: 0;
  padding-right: 0;
  border-bottom: 1px solid var(--surface-metal);
}

.acct--wide .acct-head--tabs .acct-tab {
  margin-bottom: -1px;
}

.acct-label,
.acct-back {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
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

.acct-tabs {
  display: flex;
  gap: var(--spacing-6);
}

.acct-tab {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  padding: 0;
  border: none;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--text-secondary);
  font-family: var(--font-body);
  font-size: var(--text-lg);
  font-weight: 600;
  cursor: pointer;
}

.acct-tab.is-active {
  border-bottom-color: var(--text-primary);
  color: var(--text-primary);
}

.acct-tab-count {
  min-width: 20px;
  padding: 0 var(--spacing-2);
  border-radius: var(--radius-pill);
  background: color-mix(in srgb, var(--color-neon-blue) 14%, transparent);
  color: color-mix(in srgb, var(--color-neon-blue) 55%, white);
  font-size: var(--text-xs);
  text-align: center;
}

.acct-copy {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-secondary);
}

.acct-close {
  width: 44px;
  height: 44px;
  margin-right: calc(-1 * var(--spacing-3));
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
  container-type: inline-size;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding: var(--spacing-2) var(--spacing-6) var(--spacing-6);
}

.acct--wide .acct-body {
  padding: var(--spacing-6) var(--spacing-8) var(--spacing-8);
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

/* Desktop sections */
.acct-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding-bottom: var(--spacing-6);
}

.acct-change {
  min-height: 44px;
  padding: 0 var(--spacing-4);
  border: none;
  border-radius: var(--radius-md);
  background: none;
  color: var(--text-primary);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.acct-email {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 56px;
  padding: 0 var(--spacing-3) 0 var(--spacing-4);
  border-radius: var(--radius-lg);
  background: var(--surface-metal-dark);
}

.acct-email-text {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Delete: pinned to the bottom of the frame, alone */
.acct-danger {
  margin-top: auto;
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding-top: var(--spacing-6);
  border-top: 1px solid var(--surface-metal);
}

.acct-danger--sheet {
  justify-content: center;
  border-top: none;
}

.acct-danger-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.acct-danger-title {
  font-size: var(--text-base);
  font-weight: 600;
}

.acct-danger-note {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.acct-danger-btn,
.acct-danger-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  font-family: var(--font-body);
  font-weight: 600;
  color: color-mix(in srgb, var(--color-alert) 75%, white);
  cursor: pointer;
}

.acct-danger-btn {
  padding: 0 var(--spacing-4);
  border: 1px solid color-mix(in srgb, var(--color-alert) 55%, transparent);
  border-radius: var(--radius-md);
  background: none;
  font-size: var(--text-sm);
}

.acct-danger-link {
  padding: 0 var(--spacing-4);
  border: none;
  background: none;
  font-size: var(--text-base);
}

.acct-claim-title {
  margin: 0 0 var(--spacing-2);
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1.2;
  color: var(--text-primary);
}

@media (hover: hover) {
  .acct-row:hover,
  .acct-email:hover { background: var(--surface-metal); }
  .acct-close:hover,
  .acct-back:hover,
  .acct-tab:hover { color: var(--text-primary); }
  .acct-danger-btn:hover { background: color-mix(in srgb, var(--color-alert) 10%, transparent); }
}

@media (prefers-reduced-motion: no-preference) {
  .acct--sheet {
    animation: acct-sheet-in var(--duration-soft) var(--ease-strut);
  }
  .acct--wide {
    animation: acct-fade-in var(--duration-soft) var(--ease-strut);
  }
}

@keyframes acct-sheet-in {
  from { transform: translateY(24px); opacity: 0; }
}

@keyframes acct-fade-in {
  from { opacity: 0; }
}
</style>
