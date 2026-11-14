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
        <aside v-if="wide" class="acct-side">
          <AccountIdentity wide :hide-claim="step === 'claim'" @claim="go('claim')" @photo="go('photo')" @view-profile="viewProfile" />
        </aside>

        <section class="acct-main">
          <header class="acct-head">
            <button v-if="step !== 'home'" type="button" class="acct-back" @click="go('home')">
              <ChevronLeft :size="20" :stroke-width="2" aria-hidden="true" />
              <span id="acct-label">ACCOUNT</span>
            </button>
            <h2 v-else id="acct-label" class="acct-label">ACCOUNT</h2>
            <button ref="closeEl" type="button" class="acct-close" aria-label="Close" @click="closeAccountModal">
              <X :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <div class="acct-body">
            <template v-if="step === 'home'">
              <AccountIdentity v-if="!wide" class="acct-identity" @claim="go('claim')" @photo="go('photo')" />

              <!-- Friends: requests answered in place on desktop, one row on phones -->
              <template v-if="!social.unavailable">
                <section v-if="wide" class="acct-section acct-friends">
                  <div class="acct-section-head">
                    <h3 class="acct-section-title">Friends <span class="acct-section-meta">{{ friendCount }}</span></h3>
                    <button type="button" class="acct-see-all" @click="openFriends">
                      See all
                      <ChevronRight :size="14" :stroke-width="2" aria-hidden="true" />
                    </button>
                  </div>
                  <ul v-if="social.incoming.length" class="acct-requests">
                    <li v-for="r in social.incoming" :key="r.user_id" class="acct-request">
                      <Avatar :uid="r.user_id" :name="r.username" :size="36" />
                      <span class="acct-request-text">
                        <span class="acct-request-name">{{ r.username }}</span>
                        <span class="acct-request-note">Wants to be friends</span>
                      </span>
                      <button type="button" class="acct-decline" :disabled="responding === r.user_id" @click="respond(r.user_id, false)">Decline</button>
                      <button type="button" class="acct-accept" :disabled="responding === r.user_id" @click="respond(r.user_id, true)">Accept</button>
                    </li>
                  </ul>
                  <p v-else class="acct-empty">No friend requests right now.</p>
                </section>
                <button v-else type="button" class="acct-row" @click="openFriends">
                  <Users class="acct-row-icon acct-row-icon--friends" :size="20" :stroke-width="2" aria-hidden="true" />
                  <span class="acct-row-label">Friends</span>
                  <span v-if="social.incoming.length" class="acct-pill">{{ requestLabel }}</span>
                  <ChevronRight class="acct-row-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
                </button>
              </template>

              <!-- Email: email accounts only (Google and Apple own theirs) -->
              <template v-if="authStore.canChangeEmail">
                <section v-if="wide" class="acct-section">
                  <h3 class="acct-section-title">Sign-in</h3>
                  <div class="acct-email">
                    <Mail class="acct-row-icon" :size="20" :stroke-width="2" aria-hidden="true" />
                    <span class="acct-email-text">{{ authStore.user?.email }}</span>
                    <button type="button" class="acct-change" @click="go('email')">Change</button>
                  </div>
                </section>
                <button v-else type="button" class="acct-row" @click="go('email')">
                  <Mail class="acct-row-icon" :size="20" :stroke-width="2" aria-hidden="true" />
                  <span class="acct-row-label">Email</span>
                  <span class="acct-row-meta">{{ maskedEmail }}</span>
                  <ChevronRight class="acct-row-chevron" :size="16" :stroke-width="2" aria-hidden="true" />
                </button>
              </template>

              <!-- Deleting sits alone at the bottom, apart from everything else -->
              <div v-if="wide" class="acct-danger">
                <span class="acct-danger-text">
                  <span class="acct-danger-title">Delete account</span>
                  <span class="acct-danger-note">Removes your profile, games and friends for good.</span>
                </span>
                <button type="button" class="acct-danger-btn" @click="go('delete')">
                  <Trash2 :size="16" :stroke-width="2" aria-hidden="true" />
                  Delete
                </button>
              </div>
              <div v-else class="acct-danger acct-danger--sheet">
                <button type="button" class="acct-danger-link" @click="go('delete')">
                  <Trash2 :size="16" :stroke-width="2" aria-hidden="true" />
                  Delete account
                </button>
              </div>
            </template>

            <DeleteAccountStep v-else-if="step === 'delete'" :wide="wide" @keep="go('home')" />

            <!-- Photo and email are steps in this frame, never a second modal on top. -->
            <PhotoSheet v-else-if="step === 'photo'" embedded @done="go('home')" @claim="claimForPhoto" />
            <EmailSheet v-else-if="step === 'email'" embedded @done="go('home')" />

            <div v-else class="acct-claim">
              <h2 class="acct-claim-title">Claim your account</h2>
              <AuthView embedded initial-mode="claim" @back="go('home')" />
            </div>
          </div>
        </section>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ChevronLeft, ChevronRight, Mail, Trash2, Users, X } from 'lucide-vue-next'
import { computed, nextTick, onMounted, onUnmounted, ref } from 'vue'
import Avatar from '../Avatar.vue'
import AuthView from '../AuthView.vue'
import AccountIdentity from './AccountIdentity.vue'
import DeleteAccountStep from './DeleteAccountStep.vue'
import PhotoSheet from '../PhotoSheet.vue'
import EmailSheet from '../EmailSheet.vue'
import { useAuthStore } from '../../stores/authStore'
import { useSocialStore } from '../../stores/socialStore'
import { accountStep, closeAccountModal, openAccountModal, type AccountStep } from '../../composables/useAccountModal'
import { rememberPhotoAfterClaim } from '../../composables/usePhotoSheet'
import { navigate } from '../../utils/routes'

const authStore = useAuthStore()
const social = useSocialStore()

const step = computed<AccountStep>(() => accountStep.value ?? 'home')
function go(next: AccountStep) {
  openAccountModal(next)
}

// One layout per width, chosen once per resize: the two layouts differ in
// structure (a side column, inline requests), not just in spacing.
const WIDE_QUERY = '(min-width: 760px)'
const wideMedia = typeof window !== 'undefined' ? window.matchMedia(WIDE_QUERY) : null
const wide = ref(wideMedia?.matches ?? false)
const onWideChange = (e: MediaQueryListEvent) => { wide.value = e.matches }

const closeEl = ref<HTMLButtonElement | null>(null)
function onKeydown(e: KeyboardEvent) {
  // The name field and the claim form use Escape themselves.
  if (e.key === 'Escape' && !(e.target instanceof HTMLInputElement)) closeAccountModal()
}

onMounted(() => {
  wideMedia?.addEventListener('change', onWideChange)
  window.addEventListener('keydown', onKeydown)
  void nextTick(() => closeEl.value?.focus())
})
onUnmounted(() => {
  wideMedia?.removeEventListener('change', onWideChange)
  window.removeEventListener('keydown', onKeydown)
})

const friendCount = computed(() => {
  const n = social.friends.length
  return `${n} friend${n === 1 ? '' : 's'}`
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

const responding = ref<string | null>(null)
async function respond(userId: string, accept: boolean) {
  responding.value = userId
  try {
    await social.respond(userId, accept)
  } finally {
    responding.value = null
  }
}

// A guest can't upload until claimed: claim here, and the photo step comes
// back by itself once they are (App.vue reads the remembered wish).
function claimForPhoto() {
  rememberPhotoAfterClaim()
  go('claim')
}

function openFriends() {
  closeAccountModal()
  void navigate({ name: 'friends' })
}

function viewProfile() {
  const code = authStore.profile?.share_code
  if (!code) return
  closeAccountModal()
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
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.6);
}

.acct-side {
  flex: 0 0 320px;
  display: flex;
  align-items: center;
  justify-content: center;
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
  padding: var(--spacing-3) var(--spacing-4) 0 var(--spacing-6);
}

.acct--wide .acct-head {
  padding: var(--spacing-4) var(--spacing-6) 0 var(--spacing-8);
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
  padding: var(--spacing-2) var(--spacing-8) var(--spacing-8);
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

.acct-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
}

.acct-section-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.acct-section-meta {
  margin-left: var(--spacing-2);
  font-size: var(--text-sm);
  font-weight: 400;
  color: var(--text-muted);
}

.acct-see-all {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  min-height: 44px;
  border: none;
  background: none;
  color: color-mix(in srgb, var(--color-neon-blue) 55%, white);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.acct-requests {
  margin: 0;
  padding: var(--spacing-1) 0;
  list-style: none;
  border-radius: var(--radius-lg);
  background: var(--surface-metal-dark);
}

.acct-request {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 60px;
  padding: 0 var(--spacing-3) 0 var(--spacing-4);
}

.acct-request-text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.acct-request-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--text-base);
  font-weight: 500;
}

.acct-request-note,
.acct-empty {
  font-size: var(--text-sm);
  color: var(--text-muted);
}

.acct-empty {
  margin: 0;
}

.acct-decline,
.acct-accept,
.acct-change {
  min-height: 36px;
  padding: 0 var(--spacing-4);
  border-radius: var(--radius-md);
  font-family: var(--font-body);
  font-size: var(--text-sm);
  font-weight: 600;
  cursor: pointer;
}

.acct-decline,
.acct-change {
  border: none;
  background: none;
  color: var(--text-secondary);
}

.acct-change {
  color: var(--text-primary);
}

.acct-accept {
  border: 1px solid color-mix(in srgb, var(--color-neon-blue) 50%, transparent);
  background: none;
  color: color-mix(in srgb, var(--color-neon-blue) 55%, white);
}

.acct-decline:disabled,
.acct-accept:disabled {
  opacity: 0.4;
  cursor: default;
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
  .acct-back:hover { color: var(--text-primary); }
  .acct-accept:not(:disabled):hover { background: color-mix(in srgb, var(--color-neon-blue) 10%, transparent); }
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
