<template>
  <div class="fp">
    <header class="fp-top">
      <button class="back-link" @click="$emit('back')">
        <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
        BACK
      </button>
      <h1 class="fp-title">FRIENDS</h1>
      <span class="fp-spacer" aria-hidden="true" />
    </header>

    <div class="fp-body">
      <!-- Its own screen, not a section of the stats page. Someone looking
           for people should not have to read their own win rate first. -->
      <FriendsSection @opened-room="$emit('back')" />

      <p v-if="social.unavailable" class="fp-note">
        Friends are warming up. Check back in a moment.
      </p>
    </div>

    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { ChevronLeft } from 'lucide-vue-next'
import FriendsSection from './FriendsSection.vue'
import SiteFooter from './SiteFooter.vue'
import { useSocialStore } from '../stores/socialStore'

defineEmits<{ (e: 'back'): void }>()

const social = useSocialStore()
</script>

<style scoped>
.fp {
  display: flex;
  flex-direction: column;
  min-height: 100dvh;
}

.fp-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-2);
  padding: var(--spacing-3) var(--spacing-4);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.fp-title {
  margin: 0;
  font-family: var(--font-display), sans-serif;
  font-size: 1.1rem;
  letter-spacing: 0.12em;
  color: var(--text-primary);
}

.back-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  padding: 0;
  color: var(--text-secondary);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.14em;
  cursor: pointer;
}

.back-link:hover { color: var(--text-primary); }

/* Balances the back link so the title sits centred. */
.fp-spacer { width: 3.5rem; }

.fp-body {
  flex: 1;
  width: 100%;
  max-width: 65rem;
  margin: 0 auto;
  padding: var(--spacing-8) var(--spacing-4);
}

.fp-note {
  margin: var(--spacing-4) 0 0;
  font-size: 0.85rem;
  color: var(--text-muted);
}
</style>
