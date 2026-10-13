<template>
  <div v-if="entry" class="rc" role="dialog" :aria-label="entry.title">
    <header class="rc-head">
      <span class="rc-kicker">JUST SHIPPED</span>
      <button class="rc-close" type="button" aria-label="Dismiss" @click="dismiss">
        <X :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </header>

    <div class="rc-body">
      <h2 class="rc-title">{{ entry.title }}</h2>
      <p class="rc-text">{{ signedIn ? entry.body : (entry.bodySignedOut ?? entry.body) }}</p>

      <p v-if="stat" class="rc-stat">
        <span class="rc-stat-value">{{ stat.value }}</span>
        <span class="rc-stat-label">{{ stat.label }}</span>
      </p>

      <div class="rc-actions">
        <button v-if="entry.cta" class="rc-go" type="button" @click="go">
          {{ (!signedIn && entry.ctaSignedOut) || entry.cta.label }}
        </button>
        <button class="rc-later" type="button" @click="dismiss">NOT NOW</button>
      </div>
    </div>
  </div>

  <!-- The same card asking instead of announcing. v-else-if, so a release the
       player has not read always wins the corner: two cards stacked there is
       how a channel stops being read. -->
  <div v-else-if="question" class="rc" role="dialog" :aria-label="question.question">
    <header class="rc-head">
      <span class="rc-kicker">{{ thanked ? 'THANKS' : 'ONE QUESTION' }}</span>
      <button class="rc-close" type="button" aria-label="Dismiss" @click="skipQuestion">
        <X :size="14" :stroke-width="2" aria-hidden="true" />
      </button>
    </header>

    <div class="rc-body">
      <h2 class="rc-title">{{ question.question }}</h2>
      <p class="rc-text">{{ thanked ? 'Answer recorded. That is all we needed.' : question.body }}</p>

      <div v-if="!thanked" class="rc-actions">
        <button
          v-for="(option, i) in question.options"
          :key="option"
          class="rc-go rc-opt"
          :class="{ 'rc-alt': i > 0 }"
          type="button"
          @click="vote(option)"
        >{{ option }}</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { X } from 'lucide-vue-next'
import { useWhatsNew } from '../composables/useWhatsNew'
import { usePoll } from '../composables/usePoll'
import type { Poll } from '../data/polls'
import { useAuthStore } from '../stores/authStore'
import { supabase } from '../lib/supabase'
import { navigate } from '../utils/routes'
import { followCta } from '../utils/whatsNew'
import { track } from '../utils/analytics'

const { card, dismissCard, markAllRead } = useWhatsNew()
const authStore = useAuthStore()

const entry = computed(() => card.value)
const signedIn = computed(() => authStore.isAuthenticated)
const stat = ref<{ value: string; label: string } | null>(null)

/**
 * Only fetched when the pending entry asks for it, so a card shows at most
 * one extra call and only about once a quarter. Signed out, my_rank comes
 * back null and the field size carries the line instead.
 */
onMounted(async () => {
    if (entry.value?.stat !== 'alltime_rank') return
    try {
        const { data, error } = await supabase.rpc('alltime_my_rank', { p_country: null })
        if (error) return
        const row = (data as { my_rank: number | null; total_players: number }[] | null)?.[0]
        if (!row?.total_players) return
        stat.value = row.my_rank
            ? { value: `#${row.my_rank}`, label: `of ${row.total_players.toLocaleString()} players` }
            : { value: row.total_players.toLocaleString(), label: 'players ranked so far' }
    } catch { /* the card reads fine without a number */ }
})

// Fires once per card, not once per mount: the component is always mounted in
// App.vue and only renders when an entry is owed. This is the denominator the
// taken- and dismissed-rates are read against.
let reported: string | null = null
watch(entry, (e) => {
    if (!e || reported === e.id) return
    reported = e.id
    track('release_card_shown', { entry_id: e.id })
}, { immediate: true })

function dismiss() {
    if (!entry.value) return
    track('release_card_dismissed', { entry_id: entry.value.id })
    dismissCard(entry.value.id)
}

/*
 * The question the card asks when it owes no release.
 *
 * `asked` is a local copy because `pending` empties the moment a choice is
 * recorded, and the thank-you has to outlive that. `question` is what the
 * template reads: null while a release card holds the corner.
 */
const { pending, answer, skip } = usePoll()
const asked = ref<Poll | null>(null)
const thanked = ref(false)
const question = computed(() => (entry.value ? null : asked.value))

// `!entry.value` is the whole of "a release always wins the corner". Without
// it, dismissing a release card summons the question into the space it just
// left, which is two interruptions wearing one card. A player who was owed a
// release is asked on their next visit instead.
watch(pending, (p) => { if (p && !asked.value && !entry.value) asked.value = p }, { immediate: true })

// Same denominator as release_card_shown: an answer rate means nothing without
// the number of people who were asked.
let questionReported: string | null = null
watch(question, (q) => {
    if (!q || questionReported === q.id) return
    questionReported = q.id
    track('poll_shown', { poll_id: q.id })
}, { immediate: true })

// The insert is not awaited: `answer` retires the question before it sends, so
// the thank-you and its timer must not sit behind a round trip that a slow
// network can stretch to ten seconds.
function vote(choice: string) {
    const q = asked.value
    if (!q) return
    track('poll_answered', { poll_id: q.id, choice })
    thanked.value = true
    void answer(q, choice)
    // Both, or the next question renders its thank-you with no buttons.
    window.setTimeout(() => { asked.value = null; thanked.value = false }, 1800)
}

function skipQuestion() {
    const q = asked.value
    if (!q) return
    if (!thanked.value) track('poll_skipped', { poll_id: q.id })
    skip(q)
    asked.value = null
}

function go() {
    if (!entry.value) return
    const cta = entry.value.cta
    track('release_card_taken', { entry_id: entry.value.id })
    dismissCard(entry.value.id)
    // Acting on the card is a stronger read receipt than opening the panel.
    markAllRead()
    if (cta) followCta(cta, navigate)
}
</script>

<style scoped>
.rc {
  position: fixed;
  left: var(--spacing-8);
  bottom: var(--spacing-8);
  z-index: 60;
  width: 400px;
  max-width: calc(100vw - var(--spacing-8));
  display: flex;
  flex-direction: column;
  background: var(--surface-metal-dark, #121416);
  border: 1px solid rgba(255, 204, 0, 0.3);
  border-radius: var(--radius-md);
  box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8);
  overflow: hidden;
}

.rc-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 34px;
  padding: 0 var(--spacing-4);
  background: var(--color-hazard);
}

.rc-kicker {
  font-family: var(--font-display);
  font-size: var(--text-xs);
  letter-spacing: 0.2em;
  color: var(--bg-concrete, #0a0a0b);
}

.rc-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  background: none;
  border: none;
  color: var(--bg-concrete, #0a0a0b);
  cursor: pointer;
}

.rc-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-3);
  padding: var(--spacing-4);
}

.rc-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  line-height: 1.2;
  color: var(--text-primary);
}

.rc-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.5;
  color: var(--text-secondary);
}

.rc-stat {
  display: flex;
  align-items: baseline;
  gap: var(--spacing-2);
  margin: 0;
}

.rc-stat-value {
  font-family: var(--font-display);
  font-size: var(--text-lg);
  color: var(--color-hazard);
}

.rc-stat-label {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.rc-actions {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding-top: var(--spacing-1);
}

.rc-go {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 44px;
  padding: 0 var(--spacing-6);
  border: none;
  border-radius: var(--radius-sm);
  background: var(--color-hazard);
  font-family: var(--font-display);
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  color: var(--bg-concrete, #0a0a0b);
  cursor: pointer;
}

/* The card's other buttons carry their case in the copy ("SEE YOUR RANK").
   An option is also a stored value, so it is written as words and shouted
   here instead. */
.rc-opt { text-transform: uppercase; }

/* Every option after the first. Two hazard-yellow buttons side by side read as
   two primary actions, and a Yes/No pair has only one. */
.rc-alt {
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.22);
  color: var(--text-secondary);
}

.rc-later {
  background: none;
  border: none;
  min-height: 44px;
  padding: 0 var(--spacing-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}

.rc-later:hover { color: var(--text-secondary); }

/* A 400px card pinned to a corner does not fit a phone. It becomes a sheet. */
@media (max-width: 640px) {
  .rc {
    left: var(--spacing-3);
    right: var(--spacing-3);
    bottom: var(--spacing-3);
    width: auto;
    max-width: none;
  }
}
</style>
