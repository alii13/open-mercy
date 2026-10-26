<template>
  <div
    :class="[
      'card-wrapper',
      `color-${card.color}`,
      `type-${card.type}`,
      {
        playable: isPlayable || card.isPlayable,
        selected: isSelected,
        flipped: isFlipped,
      },
    ]"
    :style="{
      width: `${size.width}px`,
      height: `${size.height}px`,
      '--card-width': `${size.width}px`,
    }"
    role="img"
    :aria-label="cardAlt"
    @click="handleClick"
    @mouseenter="handleHover"
  >
    <div class="card-face">
      <div class="card-inlay" aria-hidden="true"></div>
      <div class="card-corner card-corner--top" aria-hidden="true">
        <span>{{ cornerMark }}</span>
        <component :is="familyIcon" :stroke-width="1.7" />
      </div>

      <div class="card-sigil" aria-hidden="true">
        <span class="sigil-orbit sigil-orbit--outer"></span>
        <span class="sigil-orbit sigil-orbit--inner"></span>
        <component
          v-if="card.type !== 'number'"
          :is="actionIcon"
          class="action-glyph"
          :stroke-width="1.45"
        />
        <span v-else class="number-glyph">{{ card.value }}</span>
        <span v-if="drawValue" class="draw-value">+{{ drawValue }}</span>
      </div>

      <div class="family-rune" aria-hidden="true">
        <component :is="familyIcon" :stroke-width="1.35" />
      </div>
      <div class="card-title">{{ cardTitle }}</div>

      <div class="card-corner card-corner--bottom" aria-hidden="true">
        <span>{{ cornerMark }}</span>
        <component :is="familyIcon" :stroke-width="1.7" />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, type Component } from 'vue'
import {
  Ban,
  CircleDotDashed,
  Flame,
  Leaf,
  Layers3,
  ListX,
  Palette,
  Repeat2,
  RotateCw,
  Snowflake,
  Sparkles,
  Users,
  Zap,
} from 'lucide-vue-next'
import type { Card, CardColor, CardType } from '@/types/card'

interface Props {
  card: Card
  isPlayable?: boolean
  isSelected?: boolean
  isFlipped?: boolean
  size?: { width: number; height: number }
  /** Kept for call-site compatibility; RUNE RIOT cards are rendered as vectors/CSS. */
  srcset?: string
}

const props = withDefaults(defineProps<Props>(), {
  isPlayable: false,
  isSelected: false,
  isFlipped: false,
  size: () => ({ width: 250, height: 350 }),
  srcset: undefined,
})

const emit = defineEmits<{
  click: [card: Card]
  hover: [card: Card]
}>()

const FAMILY_ICONS: Record<CardColor, Component> = {
  red: Flame,
  blue: Snowflake,
  green: Leaf,
  yellow: Zap,
  wild: Sparkles,
}

const ACTION_ICONS: Record<CardType, Component> = {
  number: CircleDotDashed,
  skip: Ban,
  reverse: RotateCw,
  draw2: Layers3,
  skipEveryone: Users,
  discardAll: ListX,
  wild: Palette,
  draw4: Layers3,
  draw6: Layers3,
  draw10: Layers3,
  wildReverseDraw4: Repeat2,
  wildColorRoulette: CircleDotDashed,
}

const CARD_TITLES: Record<CardType, string> = {
  number: 'Rune',
  skip: 'Ward',
  reverse: 'Reversal',
  draw2: 'Draw Two',
  skipEveryone: 'Time Lock',
  discardAll: 'Rune Purge',
  wild: 'Wild Arcana',
  draw4: 'Draw Four',
  draw6: 'Draw Six',
  draw10: 'Draw Ten',
  wildReverseDraw4: 'Fate Reversal',
  wildColorRoulette: 'Chaos Wheel',
}

const COLOR_NAMES: Record<CardColor, string> = {
  red: 'Flame Rune',
  blue: 'Frost Seal',
  green: 'Grove Mark',
  yellow: 'Storm Glyph',
  wild: 'Arcane Relic',
}

const familyIcon = computed(() => FAMILY_ICONS[props.card.color])
const actionIcon = computed(() => ACTION_ICONS[props.card.type])
const cardTitle = computed(() => CARD_TITLES[props.card.type])
const drawValue = computed(() => {
  if (props.card.type === 'draw2') return 2
  if (props.card.type === 'draw4' || props.card.type === 'wildReverseDraw4') return 4
  if (props.card.type === 'draw6') return 6
  if (props.card.type === 'draw10') return 10
  return 0
})
const cornerMark = computed(() => {
  if (props.card.type === 'number') return String(props.card.value ?? '')
  if (drawValue.value) return `+${drawValue.value}`
  const marks: Partial<Record<CardType, string>> = {
    skip: 'WARD',
    reverse: 'TURN',
    skipEveryone: 'LOCK',
    discardAll: 'PURGE',
    wild: 'WILD',
    wildColorRoulette: 'CHAOS',
  }
  return marks[props.card.type] ?? 'RUNE'
})
const cardAlt = computed(() => {
  const value = props.card.type === 'number' ? ` ${props.card.value}` : ''
  return `${COLOR_NAMES[props.card.color]}${value}: ${cardTitle.value}`
})

function handleClick() {
  if (props.isPlayable) emit('click', props.card)
}

function handleHover() {
  emit('hover', props.card)
}
</script>

<style scoped>
.card-wrapper {
  --card-accent: #c7a45a;
  --card-accent-bright: #f1d58b;
  --card-glow: rgba(199, 164, 90, 0.45);
  --card-field: #17121e;
  position: relative;
  display: inline-block;
  cursor: pointer;
  user-select: none;
  border-radius: calc(var(--card-width) * 0.07);
  transform-style: preserve-3d;
  transition: transform 180ms cubic-bezier(0.33, 1, 0.68, 1), filter 180ms ease;
}

.color-red { --card-accent: #d55a3b; --card-accent-bright: #ffb069; --card-glow: rgba(235, 75, 42, 0.55); --card-field: #2a0d11; }
.color-blue { --card-accent: #70b6e5; --card-accent-bright: #d7f4ff; --card-glow: rgba(83, 174, 235, 0.52); --card-field: #091b2c; }
.color-green { --card-accent: #55a56f; --card-accent-bright: #b9f2b5; --card-glow: rgba(65, 192, 111, 0.5); --card-field: #0b2319; }
.color-yellow { --card-accent: #d7ae42; --card-accent-bright: #fff0a0; --card-glow: rgba(238, 184, 50, 0.55); --card-field: #2b2108; }
.color-wild { --card-accent: #9b72db; --card-accent-bright: #e8d8ff; --card-glow: rgba(145, 92, 229, 0.58); --card-field: #170b27; }

.card-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border: max(2px, calc(var(--card-width) * 0.026)) solid #09070c;
  border-radius: inherit;
  color: var(--card-accent-bright);
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 18% 82%, rgba(0, 0, 0, 0.42)),
    radial-gradient(circle at 50% 42%, color-mix(in srgb, var(--card-accent) 18%, transparent), transparent 46%),
    var(--card-field);
  box-shadow:
    inset 0 0 0 max(1px, calc(var(--card-width) * 0.009)) rgba(226, 197, 128, 0.56),
    inset 0 0 0 calc(var(--card-width) * 0.036) rgba(10, 7, 14, 0.88),
    inset 0 0 calc(var(--card-width) * 0.16) rgba(0, 0, 0, 0.78),
    0 calc(var(--card-width) * 0.055) calc(var(--card-width) * 0.1) rgba(0, 0, 0, 0.7);
}

.card-inlay {
  position: absolute;
  inset: 7.2%;
  border: max(1px, calc(var(--card-width) * 0.008)) solid color-mix(in srgb, var(--card-accent) 72%, #3c2b18);
  clip-path: polygon(12% 0, 88% 0, 100% 8%, 100% 92%, 88% 100%, 12% 100%, 0 92%, 0 8%);
  box-shadow: inset 0 0 calc(var(--card-width) * 0.08) rgba(0, 0, 0, 0.7);
}

.card-inlay::before,
.card-inlay::after { content: ''; position: absolute; inset: 4%; opacity: 0.28; }
.color-red .card-inlay::before { background: repeating-conic-gradient(from 12deg at 50% 78%, transparent 0 8deg, var(--card-accent) 9deg 10deg, transparent 11deg 19deg); }
.color-blue .card-inlay::before {
  background:
    linear-gradient(45deg, transparent 47%, var(--card-accent) 48% 52%, transparent 53%),
    linear-gradient(-45deg, transparent 47%, var(--card-accent) 48% 52%, transparent 53%);
  background-size: 24% 16%;
}
.color-green .card-inlay::before { background: repeating-radial-gradient(ellipse at 0 50%, transparent 0 13%, var(--card-accent) 14% 15%, transparent 16% 27%); }
.color-yellow .card-inlay::before { background: repeating-linear-gradient(120deg, transparent 0 15%, var(--card-accent) 16% 18%, transparent 19% 31%); }
.color-wild .card-inlay::before { background: conic-gradient(from 45deg, #d45a45, #6aaee6, #62b77b, #dfba4f, #a879e5, #d45a45); opacity: 0.18; }

.card-sigil {
  position: absolute;
  left: 50%;
  top: 44%;
  width: 57%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--card-accent-bright);
  background: radial-gradient(circle, color-mix(in srgb, var(--card-accent) 26%, transparent), transparent 62%), rgba(5, 4, 8, 0.56);
  border: max(1px, calc(var(--card-width) * 0.009)) solid color-mix(in srgb, var(--card-accent) 68%, transparent);
  box-shadow: 0 0 calc(var(--card-width) * 0.12) var(--card-glow), inset 0 0 calc(var(--card-width) * 0.09) rgba(0, 0, 0, 0.84);
}

.sigil-orbit { position: absolute; inset: 8%; border: max(1px, calc(var(--card-width) * 0.006)) solid color-mix(in srgb, var(--card-accent) 50%, transparent); transform: rotate(45deg); }
.sigil-orbit--inner { inset: 22%; border-radius: 50%; transform: rotate(0deg); border-style: dashed; }
.action-glyph { width: 47%; height: 47%; filter: drop-shadow(0 0 calc(var(--card-width) * 0.04) var(--card-glow)); }
.number-glyph { font-family: var(--font-display); font-size: calc(var(--card-width) * 0.42); line-height: 1; text-shadow: 0 0 calc(var(--card-width) * 0.08) var(--card-glow); }
.draw-value {
  position: absolute;
  right: -5%;
  bottom: -4%;
  min-width: 38%;
  padding: 2% 7%;
  border-radius: 999px;
  font-family: var(--font-display);
  font-size: calc(var(--card-width) * 0.13);
  color: #150d06;
  background: var(--card-accent-bright);
  box-shadow: 0 0 calc(var(--card-width) * 0.06) var(--card-glow);
}

.family-rune { position: absolute; left: 50%; bottom: 15.5%; transform: translateX(-50%); width: 13%; color: var(--card-accent); opacity: 0.9; }
.family-rune svg { width: 100%; height: auto; }
.card-title {
  position: absolute;
  left: 13%;
  right: 13%;
  bottom: 8.5%;
  overflow: hidden;
  color: color-mix(in srgb, var(--card-accent-bright) 82%, white);
  font-family: var(--font-display);
  font-size: calc(var(--card-width) * 0.057);
  font-weight: 700;
  letter-spacing: 0.09em;
  line-height: 1;
  text-align: center;
  text-transform: uppercase;
  white-space: nowrap;
}

.card-corner {
  position: absolute;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(var(--card-width) * 0.012);
  width: 20%;
  font-family: var(--font-display);
  font-size: calc(var(--card-width) * 0.077);
  font-weight: 700;
  line-height: 1;
  letter-spacing: 0.03em;
  text-shadow: 0 0 calc(var(--card-width) * 0.03) var(--card-glow);
}
.card-corner svg { width: 54%; height: auto; }
.card-corner--top { top: 5.5%; left: 4.8%; }
.card-corner--bottom { right: 4.8%; bottom: 5.5%; transform: rotate(180deg); }

.card-wrapper::before {
  content: '';
  position: absolute;
  inset: -2px;
  z-index: -1;
  border-radius: inherit;
  background: var(--card-accent);
  filter: blur(calc(var(--card-width) * 0.055));
  opacity: 0.2;
  transition: opacity 180ms ease, filter 180ms ease;
}
.card-wrapper.playable::before { opacity: 0.8; animation: rune-card-pulse 2.4s ease-in-out infinite; }
.card-wrapper.color-wild .card-face::after {
  content: '';
  position: absolute;
  inset: 4%;
  pointer-events: none;
  border-radius: inherit;
  background: conic-gradient(from 0deg, transparent, rgba(137, 86, 220, 0.28), transparent, rgba(67, 194, 126, 0.2), transparent);
  mix-blend-mode: screen;
  animation: arcane-shimmer 7s linear infinite;
}

@media (hover: hover) {
  .card-wrapper:hover { transform: translateY(-8px) rotateX(4deg) scale(1.045); filter: brightness(1.08); }
}
.card-wrapper:active { transform: scale(0.97); }
.card-wrapper.selected { transform: translateY(-12px) scale(1.075); }
.card-wrapper.selected::before { opacity: 1; filter: blur(calc(var(--card-width) * 0.075)); }
.card-wrapper.flipped { transform: rotateY(180deg); }

@keyframes rune-card-pulse {
  0%, 100% { filter: blur(calc(var(--card-width) * 0.045)); opacity: 0.5; }
  50% { filter: blur(calc(var(--card-width) * 0.075)); opacity: 0.95; }
}
@keyframes arcane-shimmer { to { transform: rotate(360deg); } }

@media (prefers-reduced-motion: reduce) {
  .card-wrapper,
  .card-wrapper::before,
  .card-wrapper.color-wild .card-face::after { animation: none; transition-duration: 0.001ms; }
}
</style>
