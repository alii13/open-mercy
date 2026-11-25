<template>
  <li class="gr">
    <span class="gr-result" :class="`gr-result--${game.result}`" :title="game.result" role="img" :aria-label="game.result">{{ RESULT_LETTER[game.result] ?? '–' }}</span>
    <div class="gr-text">
      <p class="gr-title">{{ gameSummary(game) }}</p>
      <p class="gr-sub">
        <span v-for="(s, j) in opponentSegments(game)" :key="j" :class="{ 'gr-you': s.you }">{{ s.text }}</span>
        · {{ meta }}
      </p>
    </div>
    <span class="gr-points" :class="{ 'gr-points--win': game.result === 'won' }">+{{ game.points }}</span>
  </li>
</template>

<script setup lang="ts">
import type { ProfileGame } from '../composables/useProfileDossier'
import { gameSummary, opponentSegments, RESULT_LETTER } from '../utils/profileGames'

/** One game in a player's list. `meta` ends the second line: the day, or PVP/BOT. */
defineProps<{ game: ProfileGame; meta: string }>()
</script>

<style scoped>
.gr {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 64px;
  padding: var(--spacing-2) 0;
  font-family: var(--font-body);
}
.gr + .gr { border-top: 1px solid var(--surface-metal); }

.gr-result {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: var(--radius-sm);
  background: var(--text-secondary);
  font-size: var(--text-xs);
  font-weight: 700;
  color: var(--bg-concrete);
}
.gr-result--won { background: var(--color-neon-green); }
.gr-result--abandoned { background: var(--surface-metal); color: var(--text-secondary); }

.gr-text {
  flex: 1;
  min-width: 0;
}

.gr-title {
  margin: 0;
  font-size: var(--text-base);
  line-height: 22px;
  color: #fff;
}

.gr-sub {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 20px;
  color: var(--text-secondary);
}

.gr-you {
  font-weight: 600;
  color: color-mix(in srgb, var(--color-neon-blue) 50%, white);
}

.gr-points {
  flex: none;
  font-size: var(--text-base);
  font-weight: 700;
  line-height: 22px;
  font-variant-numeric: tabular-nums;
  color: var(--text-secondary);
}
.gr-points--win { color: var(--color-hazard); }
</style>
