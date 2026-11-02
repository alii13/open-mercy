<template>
  <!-- Single root carrying `opponent-card` + `data-uid`: single-player captures
       its $el into a ref-map by id, multiplayer finds it via
       document.querySelector('.opponent-card[data-uid=...]') for fly-to-chip
       animations. Both contracts must hold — don't rename the class or drop the
       attribute. -->
  <div
    class="opponent-card"
    :data-uid="uid"
    :class="{ active: isActive, selectable: isSelectable, eliminated: isEliminated, disconnected: isDisconnected, danger: !isEliminated && cardCount >= 20 }"
    :role="isSelectable ? 'button' : undefined"
    :tabindex="isSelectable ? 0 : undefined"
    :aria-label="`${name}, ${cardCount} cards${isActive ? ', current turn' : ''}`"
    @click="$emit('click')"
    @keydown.enter.prevent="isSelectable && $emit('click')"
    @keydown.space.prevent="isSelectable && $emit('click')"
  >
    <Avatar
      :uid="uid"
      :name="name"
      :badge="badge"
      :points="badgePoints"
      :progress="badgeProgress"
      :state="avatarState"
      class="seat-avatar"
    />
    <div class="opponent-info">
      <span class="name">{{ name }}
        <span v-if="inVoice" class="voice-dot" :class="{ speaking: isSpeaking }" title="In voice"></span>
      </span>
      <span v-if="isDisconnected && !isEliminated" class="card-count dc-text">DISCONNECTED</span>
      <span v-else-if="isEliminated" class="card-count eliminated-text">OUT</span>
      <span v-else class="card-count">{{ cardCount }} {{ displayLabel }}</span>
    </div>
    <button
      v-if="canVoiceMute"
      class="opp-voice-btn"
      :class="{ 'is-muted': voiceMuted }"
      :title="voiceMuteTitle"
      :aria-label="voiceMuteTitle"
      @click.stop="$emit('voiceMute')"
    >
      <VolumeX v-if="voiceMuted" :size="14" :stroke-width="2" aria-hidden="true" />
      <Volume1 v-else :size="14" :stroke-width="2" aria-hidden="true" />
    </button>
    <button
      v-if="canKick"
      class="opp-kick-btn"
      title="Remove player"
      aria-label="Remove player"
      @click.stop="$emit('kick')"
    ><X :size="14" :stroke-width="2" aria-hidden="true" /></button>
    <span class="status-indicator" :class="{ active: isActive }"></span>
  </div>
</template>

<script setup lang="ts">
import { Volume1, VolumeX, X } from 'lucide-vue-next'
import { computed } from 'vue'
import Avatar from '../Avatar.vue'
import type { Badge as BadgeType, Progress } from '../../utils/badges'

const props = defineProps<{
  name: string
  cardCount: number
  uid?: string
  badge?: BadgeType
  badgePoints?: number
  badgeProgress?: Progress
  isActive?: boolean
  isEliminated?: boolean
  isDisconnected?: boolean
  isSelectable?: boolean
  canKick?: boolean
  countLabel?: string
  inVoice?: boolean
  isSpeaking?: boolean
  canVoiceMute?: boolean
  voiceMuted?: boolean
  voiceMuteTitle?: string
}>()

defineEmits<{ click: []; kick: []; voiceMute: [] }>()

// Explicit label (e.g. multiplayer's "INTEL") wins; otherwise pluralize.
const displayLabel = computed(() => props.countLabel ?? (props.cardCount === 1 ? 'card' : 'cards'))

// One ring at a time, most final first: out beats gone beats talking beats turn.
const avatarState = computed(() => {
  if (props.isEliminated) return 'out'
  if (props.isDisconnected) return 'disconnected'
  if (props.isSpeaking) return 'speaking'
  if (props.isActive) return 'turn'
  return null
})
</script>
