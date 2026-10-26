<template>
  <div class="player-console-bar action-dock">
    <!-- CAUGHT! and other transient center content (was a fixed overlay). -->
    <div class="dock-center">
      <slot />
    </div>

    <!-- Last-card call (right thumb). The engine event remains CALL_UNO. -->
    <button
      v-if="showUnoButton"
      class="dock-btn uno-btn"
      type="button"
      @click="$emit('call-uno')"
    >
      RIOT!
    </button>
  </div>
</template>

<script setup lang="ts">
defineProps<{
  showUnoButton: boolean
}>()

defineEmits<{
  'call-uno': []
}>()
</script>
