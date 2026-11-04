<template>
  <div v-if="retention.gamesPlayed > 0" class="combat-record">
    <!-- Header: dossier label + live streak -->
    <div class="cr-head">
      <span class="cr-title">COMBAT RECORD</span>
      <span v-if="retention.effectiveStreak > 0" class="cr-streak">
        <Flame class="cr-flame" :stroke-width="2" aria-hidden="true" />
        <span class="cr-streak-num">{{ retention.effectiveStreak }}</span>
        <span class="cr-streak-unit">DAY{{ retention.effectiveStreak > 1 ? 'S' : '' }}</span>
      </span>
    </div>

    <!-- Stat triad: centered columns, hairline dividers, baseline-locked numerals -->
    <div class="cr-grid">
      <div class="cr-cell">
        <span class="cr-value">{{ retention.gamesWon }}</span>
        <span class="cr-label">WINS</span>
      </div>
      <div class="cr-cell">
        <span class="cr-value cr-value--accent">{{ retention.winRate }}<span class="cr-pct">%</span></span>
        <span class="cr-label">WIN RATE</span>
      </div>
      <div class="cr-cell">
        <span class="cr-value">{{ retention.biggestStackEver }}</span>
        <span class="cr-label">BIG STACK</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Flame } from 'lucide-vue-next'
import { useRetentionStore } from '../stores/retentionStore'

const retention = useRetentionStore()
</script>

<style scoped>
.combat-record {
  --hazard: #ffcc00;
  position: relative;
  display: inline-block;
  width: 280px;
  padding: 0.85rem 1rem 0.9rem;
  background:
    linear-gradient(180deg, rgba(255, 204, 0, 0.04), rgba(0, 0, 0, 0)),
    rgba(8, 8, 9, 0.72);
  border: 1px solid rgba(255, 204, 0, 0.22);
  /* Tactical cut corner — a clipped notch top-right reads as "field-issued". */
  clip-path: polygon(0 0, calc(100% - 14px) 0, 100% 14px, 100% 100%, 0 100%);
  font-family: var(--font-body);
}

/* Thin hazard accent along the top edge for issued-equipment feel. */
.combat-record::before {
  content: '';
  position: absolute;
  top: 0;
  left: 0;
  width: calc(100% - 14px);
  height: 2px;
  background: linear-gradient(90deg, var(--hazard), rgba(255, 204, 0, 0));
}

.cr-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding-bottom: 0.7rem;
  margin-bottom: 0.7rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.07);
}

.cr-title {
  font-size: 0.6rem;
  letter-spacing: 0.28em;
  color: #6b6b73;
  text-transform: uppercase;
}

.cr-streak {
  display: inline-flex;
  align-items: baseline;
  gap: 0.28rem;
  color: var(--hazard);
}

.cr-flame {
  width: 12px;
  height: 12px;
  align-self: center;
  filter: drop-shadow(0 0 5px rgba(255, 204, 0, 0.55));
}

.cr-streak-num {
  font-family: var(--font-display);
  font-size: 0.95rem;
  line-height: 1;
  text-shadow: 0 0 10px rgba(255, 204, 0, 0.4);
}

.cr-streak-unit {
  font-size: 0.56rem;
  letter-spacing: 0.16em;
  color: #8a7a35;
}

.cr-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
}

.cr-cell {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.28rem;
  padding: 0 0.25rem;
}

/* Hairline dividers between cells — the alignment fix: equal columns, every
   numeral centered on the same baseline, separated by a faint rule. */
.cr-cell + .cr-cell {
  border-left: 1px solid rgba(255, 255, 255, 0.08);
}

.cr-value {
  font-family: var(--font-display);
  font-size: 1.45rem;
  line-height: 1;
  color: #f2f2f2;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
}

.cr-value--accent {
  color: var(--hazard);
  text-shadow: 0 0 12px rgba(255, 204, 0, 0.3);
}

.cr-pct {
  font-size: 0.8rem;
  margin-left: 0.05em;
}

.cr-label {
  font-size: 0.55rem;
  letter-spacing: 0.16em;
  color: #5a5a63;
  text-transform: uppercase;
}

@media (max-width: 480px) {
  .combat-record { width: 248px; }
  .cr-value { font-size: 1.3rem; }
}
</style>
