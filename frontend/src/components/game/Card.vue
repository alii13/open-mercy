<template>
  <div
    :class="['card-wrapper', {
      playable: card.isPlayable,
      selected: isSelected,
      flipped: isFlipped,
      [`color-${card.color}`]: true,
      [`type-${card.type}`]: true
    }]"
    @click="handleClick"
    @mouseenter="handleHover"
    :style="{ width: size.width + 'px', height: size.height + 'px' }"
  >
    <!-- Eager, not lazy: hand/pile cards are the game's core content, and
         lazy-loading made faces pop in as ghost outlines mid-deal. -->
    <img
      class="card-image"
      :src="cardUrl"
      :srcset="srcset"
      :sizes="srcset ? `${size.width}px` : undefined"
      :width="size.width"
      :height="size.height"
      decoding="async"
      :alt="cardAlt"
      draggable="false"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { getCardImageUrl } from '@/utils/cardGenerator'
import type { Card } from '@/types/card'

interface Props {
  card: Card
  isPlayable?: boolean
  isSelected?: boolean
  isFlipped?: boolean
  size?: { width: number; height: number }
  /** Smaller encodes for places that show the card small, like the landing hero. */
  srcset?: string
}

const props = withDefaults(defineProps<Props>(), {
  isPlayable: false,
  isSelected: false,
  isFlipped: false,
  size: () => ({ width: 250, height: 350 }),
})

const emit = defineEmits<{
  click: [card: Card]
  hover: [card: Card]
}>()

const cardUrl = computed(() => getCardImageUrl(props.card))
const cardAlt = computed(() => {
  if (props.card.color === 'wild') return `Wild ${props.card.type}`
  const value = props.card.value !== undefined ? ` ${props.card.value}` : ''
  return `${props.card.color}${value} ${props.card.type}`.trim()
})

const handleClick = () => {
  if (props.isPlayable) {
    emit('click', props.card)
  }
}

const handleHover = () => {
  emit('hover', props.card)
}
</script>

<style scoped>
/* Card wrapper carries two pseudo-element layers:
   ::before — color-tinted neon outline (gets brighter / pulses when playable)
   ::after  — holographic conic-gradient shimmer (wild cards + danger pulse on +N)
   Both are positioned absolute on top of the card image with pointer-events: none
   so clicks still reach the wrapper. Pure CSS — no extra DOM, no JS. */
.card-wrapper {
  position: relative;
  display: inline-block;
  cursor: pointer;
  transition: transform 0.2s ease;
  transform-style: preserve-3d;
  user-select: none;
  border-radius: 10px;
}

.card-wrapper .card-image {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  border-radius: 8px;
  pointer-events: none;
  position: relative;
  z-index: 1;
}

/* ---------- Color tokens per card color ---------- */
.card-wrapper.color-red    { --card-glow: #ff2a2a; --card-glow-soft: rgba(255, 42, 42, 0.55); }
.card-wrapper.color-blue   { --card-glow: #00bfff; --card-glow-soft: rgba(0, 191, 255, 0.55); }
.card-wrapper.color-green  { --card-glow: #00ff66; --card-glow-soft: rgba(0, 255, 102, 0.55); }
.card-wrapper.color-yellow { --card-glow: #ffcc00; --card-glow-soft: rgba(255, 204, 0, 0.55); }
.card-wrapper.color-wild   { --card-glow: #ff66dd; --card-glow-soft: rgba(255, 102, 221, 0.55); }

/* ---------- Neon outline (::before, behind the image as a glow halo) ---------- */
.card-wrapper::before {
  content: '';
  position: absolute;
  inset: -2px;
  border-radius: 10px;
  pointer-events: none;
  z-index: 0;
  box-shadow:
    0 0 0 1px var(--card-glow-soft, rgba(255, 255, 255, 0.08)) inset,
    0 0 12px var(--card-glow-soft, transparent);
  opacity: 0.45;
  transition: opacity 0.2s, box-shadow 0.2s;
}

.card-wrapper.playable::before {
  opacity: 1;
  box-shadow:
    0 0 0 1.5px var(--card-glow) inset,
    0 0 24px var(--card-glow-soft);
  animation: cardGlowPulse 2.2s ease-in-out infinite;
}

@keyframes cardGlowPulse {
  0%, 100% { box-shadow: 0 0 0 1.5px var(--card-glow) inset, 0 0 18px var(--card-glow-soft); }
  50%      { box-shadow: 0 0 0 2px var(--card-glow) inset, 0 0 34px var(--card-glow); }
}

/* ---------- Wild holographic shimmer (::after) ----------
   A conic gradient that rotates slowly across the card with screen blend mode.
   Only active on wild-color cards; doesn't show on colored cards. */
.card-wrapper.color-wild::after {
  content: '';
  position: absolute;
  inset: 4px;
  border-radius: 6px;
  pointer-events: none;
  z-index: 2;
  background: conic-gradient(
    from var(--shimmer-angle, 0deg),
    rgba(255, 0, 200, 0.0),
    rgba(0, 200, 255, 0.35),
    rgba(255, 220, 0, 0.0),
    rgba(255, 100, 200, 0.35),
    rgba(255, 0, 200, 0.0)
  );
  mix-blend-mode: screen;
  opacity: 0.65;
  animation: holoShimmer 4.5s linear infinite;
}

@property --shimmer-angle {
  syntax: '<angle>';
  initial-value: 0deg;
  inherits: false;
}

@keyframes holoShimmer {
  to { --shimmer-angle: 360deg; }
}

/* Fallback for browsers without @property (Safari < 16.4): rotate via transform */
@supports not (background: conic-gradient(from 0deg, red, blue)) {
  .card-wrapper.color-wild::after {
    animation: none;
  }
}

/* ---------- Danger pulse on +N draw cards ----------
   Aggressive red ring + shake-ready overlay so the player reads "incoming pain"
   before they read the number. Only fires on playable +N cards — an unplayable
   draw card in hand should sit quietly like any other unplayable card. */
.card-wrapper.playable.type-draw2::after,
.card-wrapper.playable.type-draw4::after,
.card-wrapper.playable.type-draw6::after,
.card-wrapper.playable.type-draw10::after,
.card-wrapper.playable.type-wildReverseDraw4::after,
.card-wrapper.playable.type-wildColorRoulette::after {
  content: '';
  position: absolute;
  inset: -1px;
  border-radius: 10px;
  pointer-events: none;
  z-index: 2;
  box-shadow:
    0 0 0 1.5px rgba(255, 42, 42, 0.6) inset,
    0 0 20px rgba(255, 42, 42, 0.4);
  animation: dangerPulse 1.8s ease-in-out infinite;
}

@keyframes dangerPulse {
  0%, 100% {
    box-shadow:
      0 0 0 1.5px rgba(255, 42, 42, 0.45) inset,
      0 0 14px rgba(255, 42, 42, 0.3);
  }
  50% {
    box-shadow:
      0 0 0 2.5px rgba(255, 42, 42, 0.9) inset,
      0 0 28px rgba(255, 42, 42, 0.7);
  }
}

/* When a +N card is ALSO playable (your turn, valid play), upgrade the pulse
   to the color glow + the danger ring layered, so playable danger cards
   visually scream "play me and ruin them". */
.card-wrapper.playable.type-draw2::before,
.card-wrapper.playable.type-draw4::before,
.card-wrapper.playable.type-draw6::before,
.card-wrapper.playable.type-draw10::before,
.card-wrapper.playable.type-wildReverseDraw4::before,
.card-wrapper.playable.type-wildColorRoulette::before {
  opacity: 1;
  box-shadow:
    0 0 0 2px var(--card-glow) inset,
    0 0 32px var(--card-glow);
}

/* ---------- Interaction states ---------- */
@media (hover: hover) {
  .card-wrapper:hover {
    transform: translateY(-8px) rotateX(5deg) rotateY(-2deg) scale(1.05);
  }
  .card-wrapper:hover::before {
    opacity: 1;
    box-shadow:
      0 0 0 1px var(--card-glow) inset,
      0 0 30px var(--card-glow-soft);
  }
}

.card-wrapper:active {
  transform: scale(0.97);
  transition-duration: 0.1s;
}

.card-wrapper.selected {
  transform: translateY(-12px) scale(1.08);
}
.card-wrapper.selected::before {
  opacity: 1;
  box-shadow:
    0 0 0 2px var(--card-glow) inset,
    0 0 40px var(--card-glow);
}

.card-wrapper.flipped {
  transform: rotateY(180deg);
}

@media (prefers-reduced-motion: reduce) {
  .card-wrapper.playable::before,
  .card-wrapper.color-wild::after,
  .card-wrapper.type-draw2::after,
  .card-wrapper.type-draw4::after,
  .card-wrapper.type-draw6::after,
  .card-wrapper.type-draw10::after,
  .card-wrapper.type-wildReverseDraw4::after,
  .card-wrapper.type-wildColorRoulette::after {
    animation: none;
  }
}
</style>

