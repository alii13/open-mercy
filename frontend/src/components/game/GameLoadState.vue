<template>
  <div class="gls" role="status">
    <template v-if="error">
      <p class="gls-title">The game didn't load</p>
      <p class="gls-copy">Check your connection, then reload.</p>
      <Button class="gls-btn" variant="primary" size="lg" block @click="reload">RELOAD</Button>
    </template>
    <p v-else class="gls-copy">Loading the game…</p>
  </div>
</template>

<script setup lang="ts">
import Button from '../ui/Button.vue'

defineProps<{ error?: Error }>()

const reload = () => location.reload()
</script>

<style scoped>
.gls {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-4);
  min-height: 100dvh;
  padding: var(--spacing-6);
  background: var(--bg-concrete);
  font-family: var(--font-body);
  text-align: center;
}

.gls-title {
  margin: 0;
  font-size: var(--text-xl);
  font-weight: 600;
  color: var(--text-primary);
}

.gls-copy {
  margin: 0;
  max-width: 32ch;
  font-size: var(--text-base);
  line-height: 1.45;
  color: var(--text-secondary);
}

.gls-btn {
  max-width: 320px;
  margin-top: var(--spacing-4);
}
</style>
