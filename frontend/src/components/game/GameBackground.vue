<template>
  <div class="metal-surface" aria-hidden="true"></div>
  <div class="table-hatching" aria-hidden="true"></div>
  <div class="rune-compass" :class="{ 'rune-compass--reversed': direction === -1 }" aria-hidden="true">
    <span class="rune-compass-core"></span>
  </div>
  <div class="arcane-embers" aria-hidden="true"></div>
  <div class="vignette" aria-hidden="true"></div>
</template>

<script setup lang="ts">
defineProps<{
  direction: number
}>()
</script>
