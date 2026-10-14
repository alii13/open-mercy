<template>
  <div class="wn" ref="rootEl">
    <button
      class="wn-trigger"
      type="button"
      :aria-label="unread ? `What's new — ${unread} unread` : `What's new`"
      :aria-expanded="open"
      @click="toggle"
    >
      <Sparkles class="wn-trigger-icon" :size="16" :stroke-width="2" aria-hidden="true" />
      <span class="wn-trigger-text">WHAT'S NEW</span>
      <span v-if="unread" class="wn-dot" aria-hidden="true"></span>
    </button>

    <!-- The landing top bar sets backdrop-filter, which makes it the
         containing block for position:fixed children — the mobile sheet would
         be trapped inside a 104px header. Teleporting only in sheet mode keeps
         the desktop dropdown anchored to its trigger. -->
    <Teleport to="body" :disabled="!sheetMode">
      <div v-if="open" class="wn-scrim" @click="close"></div>

      <div v-if="open" ref="panelEl" class="wn-panel" role="dialog" aria-label="What's new">
      <span class="wn-grabber" aria-hidden="true"></span>
      <header class="wn-head">
        <h2 class="wn-title">WHAT'S NEW</h2>
        <button class="wn-close" type="button" aria-label="Close" @click="close">
          <X :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
      </header>

      <ol class="wn-list">
        <li
          v-for="e in entries"
          :key="e.id"
          class="wn-entry"
          :class="{ fresh: freshIds.has(e.id) }"
        >
          <div class="wn-meta">
            <span class="wn-tag" :class="`wn-tag--${e.tag.toLowerCase()}`">{{ e.tag }}</span>
            <span class="wn-when">{{ relativeTime(e.id) }}</span>
          </div>
          <h3 class="wn-entry-title">{{ e.title }}</h3>
          <p class="wn-body">{{ e.body }}</p>
          <button v-if="e.cta" class="wn-cta" type="button" @click="goEntry(e)">
            {{ e.cta.label }}
            <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" />
          </button>
        </li>
      </ol>

        <button class="wn-all" type="button" @click="goChangelog()">
          SEE EVERYTHING THAT CHANGED
        </button>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { Sparkles, X, ArrowRight } from 'lucide-vue-next'
import { useWhatsNew } from '../composables/useWhatsNew'
import { relativeTime } from '../utils/relativeTime'
import { navigate, type Route } from '../utils/routes'
import { followCta } from '../utils/whatsNew'
import { useAuthStore } from '../stores/authStore'
import { track } from '../utils/analytics'
import type { ChangelogEntry } from '../data/changelog'

const authStore = useAuthStore()

const { entries, unread, unreadIds, markAllRead } = useWhatsNew()

// Must match the max-width in this component's media query: below it the
// panel is a fixed bottom sheet, above it an absolutely-anchored dropdown.
const SHEET_BREAKPOINT = '(max-width: 640px)'

const open = ref(false)
const rootEl = ref<HTMLElement | null>(null)
const panelEl = ref<HTMLElement | null>(null)
const sheetMode = ref(
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
        ? window.matchMedia(SHEET_BREAKPOINT).matches
        : false,
)
let sheetMql: MediaQueryList | null = null
// Snapshotted on open: marking read immediately would clear the yellow bars
// under the player's eyes, so the highlight survives the session it belongs to.
const freshIds = ref<Set<string>>(new Set())

function toggle() {
    open.value ? close() : openPanel()
}

function openPanel() {
    freshIds.value = new Set(unreadIds.value)
    // Read the count before markAllRead zeroes it.
    track('whatsnew_opened', { unread: unread.value })
    open.value = true
    // Opening is the read receipt — the dot clears, the highlight stays.
    // It also retires any pending release card: the card carries the same
    // words the player has just read, so leaving it up would only nag.
    markAllRead()
}

function close() {
    open.value = false
}

function go(route: Route) {
    close()
    navigate(route)
}

function goEntry(entry: ChangelogEntry) {
    if (!entry.cta) return
    track('whatsnew_entry_clicked', { entry_id: entry.id })
    followCta(entry.cta, go, undefined, authStore.profile?.share_code)
}

function goChangelog() {
    track('whatsnew_changelog_opened')
    go({ name: 'changelog' })
}

function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') close()
}

// Desktop has no scrim to catch the click, so the panel closes on any click
// outside it — the behaviour every other dropdown on the page has.
// In sheet mode the panel is teleported out of rootEl, so it has to be
// tested separately or a click inside it would close it.
function onClickAway(e: MouseEvent) {
    if (!open.value) return
    const t = e.target as Node
    if (rootEl.value?.contains(t) || panelEl.value?.contains(t)) return
    close()
}

function onSheetChange(e: MediaQueryListEvent) {
    sheetMode.value = e.matches
}

onMounted(() => {
    window.addEventListener('keydown', onKey)
    window.addEventListener('click', onClickAway)
    if (typeof window.matchMedia === 'function') {
        sheetMql = window.matchMedia(SHEET_BREAKPOINT)
        sheetMode.value = sheetMql.matches
        sheetMql.addEventListener('change', onSheetChange)
    }
})
onUnmounted(() => {
    window.removeEventListener('keydown', onKey)
    window.removeEventListener('click', onClickAway)
    sheetMql?.removeEventListener('change', onSheetChange)
})
</script>

<style scoped>
.wn {
  position: relative;
  display: inline-flex;
}

.wn-trigger {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  background: none;
  border: none;
  padding: var(--spacing-2);
  min-height: 44px;
  /* Matches .text-link in the landing and lobby top bars — the unread dot
     is the signal, so the label itself must not shout over its neighbours. */
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.15em;
  color: var(--text-secondary);
  cursor: pointer;
  white-space: nowrap;
}

.wn-trigger:hover { color: var(--color-neon-blue); }

/* The icon is the whole control on narrow screens; the words are the
   control on wide ones. Never both. */
.wn-trigger-icon { display: none; }

.wn-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-hazard);
  box-shadow: 0 0 8px rgba(255, 204, 0, 0.8);
  flex: none;
}

.wn-scrim { display: none; }

.wn-panel {
  position: absolute;
  top: calc(100% + var(--spacing-2));
  right: 0;
  z-index: 50;
  width: 400px;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--surface-metal-dark, #121416);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: var(--radius-md);
  box-shadow: 0 18px 50px rgba(0, 0, 0, 0.75);
}

.wn-grabber { display: none; }

.wn-head {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--spacing-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.wn-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-sm);
  letter-spacing: 0.16em;
  color: var(--text-primary);
}

.wn-close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  padding: 0;
}

.wn-close:hover { color: var(--text-primary); }

/* The list is the only scroller: the header and the footer link stay put,
   so "see everything" is never pushed below the panel's fold. */
.wn-list {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  list-style: none;
  margin: 0;
  padding: 0;
}

.wn-entry {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.055);
  border-left: 2px solid transparent;
}

.wn-entry.fresh {
  border-left-color: var(--color-hazard);
  background: rgba(255, 204, 0, 0.035);
}

.wn-meta {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
}

.wn-tag {
  padding: 2px 7px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-secondary);
}

.wn-tag--new { background: rgba(255, 204, 0, 0.16); color: var(--color-hazard); }
.wn-tag--improved { background: rgba(0, 255, 102, 0.12); color: var(--color-neon-green); }

.wn-when {
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  color: var(--text-muted);
}

.wn-entry-title {
  margin: 0;
  font-size: var(--text-base);
  font-weight: 600;
  color: var(--text-secondary);
}

.wn-body {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-muted);
}

.wn-entry.fresh .wn-entry-title { color: var(--text-primary); }
.wn-entry.fresh .wn-body { color: var(--text-secondary); }

.wn-cta {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  padding: var(--spacing-1) 0;
  min-height: 32px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--color-neon-blue);
  cursor: pointer;
}

.wn-all {
  flex: none;
  padding: var(--spacing-3) var(--spacing-4);
  min-height: 44px;
  background: rgba(255, 255, 255, 0.015);
  border: none;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
}

.wn-all:hover { color: var(--text-secondary); }

/* Under 640px the trigger collapses to the icon and the panel becomes a
   bottom sheet — a 400px dropdown does not fit a 390px viewport. */
@media (max-width: 640px) {
  .wn-trigger-icon { display: inline-flex; }
  .wn-trigger-text { display: none; }
  .wn-dot { position: absolute; top: 6px; right: 4px; }

  .wn-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 49;
    background: rgba(0, 0, 0, 0.6);
  }

  .wn-panel {
    position: fixed;
    top: auto;
    right: var(--spacing-3);
    bottom: var(--spacing-3);
    left: var(--spacing-3);
    width: auto;
    max-height: 80vh;
    border-radius: var(--radius-lg, 12px);
  }

  .wn-grabber {
    display: block;
    width: 36px;
    height: 4px;
    margin: var(--spacing-3) auto var(--spacing-1);
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.18);
  }
}
</style>
