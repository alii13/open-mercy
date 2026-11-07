<script setup lang="ts">
import Button from './ui/Button.vue'
import tableRender from '../assets/public-table.jpg'
import type { PublicTableView } from '../utils/publicTable'

defineProps<{
  view: PublicTableView
  online: { show: boolean; count: number }
  loading: boolean
}>()

defineEmits<{ takeSeat: [] }>()
</script>

<template>
  <!-- Strangers, no code: the table a tap sits you at, with the 3D table it
       opens onto. Hazard yellow is this card's colour. -->
  <section id="public-table" class="pt-card" aria-labelledby="pt-eyebrow pt-headline">
    <div class="pt-render">
      <img :src="tableRender" alt="" width="440" height="216" loading="lazy" decoding="async" />
      <span v-if="online.show" class="pt-online"><span class="pt-dot" aria-hidden="true" />{{ online.count }} ONLINE</span>
    </div>
    <div class="pt-body">
      <p id="pt-eyebrow" class="pt-eyebrow">PUBLIC TABLE<span class="pt-rules"> · {{ view.rules }}</span></p>
      <h2 id="pt-headline" class="pt-headline">{{ view.headline }}</h2>
      <p v-if="view.status" class="pt-status">{{ view.status }}</p>
      <p class="pt-desc">{{ view.body }}</p>
      <Button variant="hazard" size="md" block class="pt-cta" :disabled="loading" @click="$emit('takeSeat')">
        {{ loading ? 'FINDING A SEAT...' : 'TAKE A SEAT' }}
      </Button>
    </div>
  </section>
</template>

<style scoped>
.pt-card {
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #120d07;
  border: 1px solid rgba(255, 159, 67, 0.2);
  border-radius: var(--radius-md);
}

.pt-render {
  position: relative;
  aspect-ratio: 440 / 216;
  background: #050506;
}

.pt-render img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.pt-online {
  position: absolute;
  top: var(--spacing-3);
  left: var(--spacing-3);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-2);
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.7);
  font-family: var(--font-body);
  font-size: 0.7rem;
  letter-spacing: 0.14em;
  color: var(--color-neon-green);
}

.pt-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: currentColor;
}

.pt-body {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-2);
  padding: var(--spacing-4);
}

.pt-eyebrow,
.pt-status {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.16em;
  color: var(--color-hazard);
}

.pt-rules {
  color: var(--text-muted);
}

.pt-headline {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-2xl);
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--text-primary);
}

.pt-desc {
  margin: 0;
  font-family: var(--font-body);
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-secondary);
}

.pt-cta {
  margin-top: var(--spacing-2);
}

/* Wide screens: copy on the left, the table on the right, the button pinned
   to the bottom of the copy. */
@media (min-width: 1180px) {
  .pt-card {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 55%;
    align-items: stretch;
  }

  .pt-render {
    grid-column: 2;
    grid-row: 1;
    margin: var(--spacing-4) var(--spacing-4) var(--spacing-4) 0;
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  .pt-body {
    grid-column: 1;
    grid-row: 1;
  }

  .pt-cta {
    margin-top: auto;
  }
}
</style>
