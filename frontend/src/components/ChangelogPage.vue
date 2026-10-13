<template>
  <div class="cl-page">
    <header class="cl-topbar">
      <button class="back-link" @click="navigate({ name: 'home' })">
        <ChevronLeft :size="14" :stroke-width="2" aria-hidden="true" />
        BACK
      </button>
      <h1 class="cl-title">WHAT'S NEW</h1>
      <span class="cl-topbar-spacer" aria-hidden="true"></span>
    </header>

    <div class="cl-body">
      <div class="cl-lede">
        <h2 class="cl-hero">EVERY CHANGE<br />WE HAVE SHIPPED</h2>
        <p class="cl-sub">Newest first. Nothing is removed from this list.</p>
      </div>

      <div class="cl-filters" role="group" aria-label="Filter by kind">
        <button
          v-for="f in filters"
          :key="f.key"
          class="cl-filter"
          :class="{ active: tag === f.key }"
          :aria-pressed="tag === f.key"
          @click="tag = f.key"
        >
          {{ f.label }} {{ f.count }}
        </button>
      </div>

      <p v-if="!visible.length" class="cl-empty">Nothing under that filter yet.</p>

      <section v-for="group in months" :key="group.key" class="cl-month">
        <h3 class="cl-month-title">{{ group.label }}</h3>
        <article v-for="e in group.entries" :key="e.id" class="cl-entry">
          <span class="cl-date">{{ shortDate(e.id) }}</span>
          <div class="cl-content">
            <span class="cl-tag" :class="`cl-tag--${e.tag.toLowerCase()}`">{{ e.tag }}</span>
            <h4 class="cl-entry-title">{{ e.title }}</h4>
            <p class="cl-text">{{ e.body }}</p>
            <button v-if="e.cta" class="cl-cta" type="button" @click="followCta(e.cta, navigate)">
              {{ e.cta.label }}
              <ArrowRight :size="14" :stroke-width="2" aria-hidden="true" />
            </button>
          </div>
        </article>
      </section>
    </div>

    <SiteFooter />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { ChevronLeft, ArrowRight } from 'lucide-vue-next'
import { CHANGELOG, type ChangelogTag, type ChangelogEntry } from '../data/changelog'
import { navigate } from '../utils/routes'
import { followCta } from '../utils/whatsNew'
import SiteFooter from './SiteFooter.vue'

type Filter = 'ALL' | ChangelogTag

const tag = ref<Filter>('ALL')

const sorted = computed(() => [...CHANGELOG].sort((a, b) => (a.id < b.id ? 1 : -1)))

// A filter with no count is not worth pressing, so the count is the label.
const filters = computed(() => {
    const kinds: Filter[] = ['ALL', 'NEW', 'IMPROVED', 'FIXED']
    return kinds.map(key => ({
        key,
        label: key,
        count: key === 'ALL' ? sorted.value.length : sorted.value.filter(e => e.tag === key).length,
    }))
})

const visible = computed(() =>
    tag.value === 'ALL' ? sorted.value : sorted.value.filter(e => e.tag === tag.value),
)

const MONTH_LABEL = new Intl.DateTimeFormat('en', { month: 'long', year: 'numeric', timeZone: 'UTC' })
const DAY_LABEL = new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', timeZone: 'UTC' })

function shortDate(id: string): string {
    const d = new Date(id)
    return Number.isFinite(d.getTime()) ? DAY_LABEL.format(d) : id
}

const months = computed(() => {
    const groups: { key: string; label: string; entries: ChangelogEntry[] }[] = []
    for (const e of visible.value) {
        const key = e.id.slice(0, 7)
        let group = groups.find(g => g.key === key)
        if (!group) {
            const d = new Date(e.id)
            group = {
                key,
                label: (Number.isFinite(d.getTime()) ? MONTH_LABEL.format(d) : key).toUpperCase(),
                entries: [],
            }
            groups.push(group)
        }
        group.entries.push(e)
    }
    return groups
})
</script>

<style scoped>
.cl-page {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--bg-void, #0a0a0a);
}

.cl-topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--spacing-3);
  padding: var(--spacing-4) var(--spacing-6);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
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
  white-space: nowrap;
}

.back-link:hover { color: var(--color-neon-blue); }

.cl-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: 1.2rem;
  letter-spacing: 0.14em;
  color: var(--text-primary);
}

.cl-topbar-spacer { width: 72px; }

.cl-body {
  flex: 1;
  width: 100%;
  max-width: 720px;
  margin: 0 auto;
  padding: var(--spacing-8) var(--spacing-4) var(--spacing-12);
}

.cl-lede {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding-bottom: var(--spacing-6);
}

.cl-hero {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-3xl);
  line-height: 1.12;
  color: var(--text-primary);
}

.cl-sub {
  margin: 0;
  font-size: var(--text-base);
  color: var(--text-muted);
}

.cl-filters {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-2);
  padding-bottom: var(--spacing-2);
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.cl-filter {
  min-height: 36px;
  padding: 0 var(--spacing-3);
  border-radius: var(--radius-pill);
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: none;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.12em;
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
}

.cl-filter.active {
  border-color: rgba(255, 204, 0, 0.35);
  background: rgba(255, 204, 0, 0.08);
  color: var(--color-hazard);
  font-weight: 700;
}

.cl-empty {
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  color: var(--text-muted);
  text-align: center;
  padding: var(--spacing-8) 0;
}

.cl-month-title {
  margin: 0;
  padding: var(--spacing-6) 0 var(--spacing-1);
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.2em;
  font-weight: 700;
  color: var(--text-muted);
}

/* Date on its own lane so the list scans by time, not by paragraph. */
.cl-entry {
  display: flex;
  gap: var(--spacing-6);
  padding: var(--spacing-4) 0;
  border-top: 1px solid rgba(255, 255, 255, 0.07);
}

.cl-date {
  width: 96px;
  flex: none;
  padding-top: 2px;
  font-family: var(--font-mono);
  font-size: var(--text-sm);
  letter-spacing: 0.06em;
  color: var(--text-muted);
}

.cl-content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
}

.cl-tag {
  align-self: flex-start;
  padding: 2px 8px;
  border-radius: 3px;
  font-family: var(--font-mono);
  font-size: 0.56rem;
  letter-spacing: 0.14em;
  font-weight: 700;
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-secondary);
}

.cl-tag--new { background: rgba(255, 204, 0, 0.16); color: var(--color-hazard); }
.cl-tag--improved { background: rgba(0, 255, 102, 0.12); color: var(--color-neon-green); }

.cl-entry-title {
  margin: 0;
  font-size: var(--text-lg);
  font-weight: 600;
  color: var(--text-primary);
}

.cl-text {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.55;
  color: var(--text-secondary);
}

.cl-cta {
  align-self: flex-start;
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: none;
  padding: var(--spacing-1) 0;
  min-height: 36px;
  font-family: var(--font-mono);
  font-size: var(--text-xs);
  letter-spacing: 0.08em;
  font-weight: 700;
  color: var(--color-neon-blue);
  cursor: pointer;
}

@media (max-width: 640px) {
  .cl-hero { font-size: var(--text-2xl); }

  /* The rail costs a third of a phone's width. Stack it instead. */
  .cl-entry { flex-direction: column; gap: var(--spacing-2); }
  .cl-date { width: auto; padding-top: 0; }
}
</style>
