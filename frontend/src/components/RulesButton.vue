<template>
  <!-- The rules, one tap from the table: a first game should not have to be
       left to learn what a stack or the 25-card limit is. -->
  <button
    type="button"
    class="rules-btn"
    aria-label="How to play"
    title="How to play"
    @click="open = true"
  >
    <CircleHelp :size="20" :stroke-width="2" aria-hidden="true" />
  </button>
  <RulesModal v-if="open" @close="open = false" />
</template>

<script setup lang="ts">
import { defineAsyncComponent, ref } from 'vue'
import { CircleHelp } from 'lucide-vue-next'

const RulesModal = defineAsyncComponent(() => import('./RulesModal.vue'))
const open = ref(false)
</script>

<style scoped>
.rules-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  padding: 0;
  background: rgba(0, 0, 0, 0.5);
  border: 1px solid #333;
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition:
    border-color var(--duration-snap) var(--ease-snap),
    color var(--duration-snap) var(--ease-snap);
}
.rules-btn:focus-visible { color: var(--text-primary); }
@media (hover: hover) {
  .rules-btn:hover {
    border-color: var(--text-muted);
    color: var(--text-primary);
  }
}
</style>
