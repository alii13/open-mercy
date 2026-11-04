<template>
  <div class="battle-pit" :style="{ '--mercy-intensity': mercyIntensity }">
    <!-- Decorative table layers never receive pointer input. -->
    <div class="pit-hatching" aria-hidden="true"></div>

    <!-- Ancient stone surface with top-down arcane light. -->
    <div class="pit-surface" aria-hidden="true"></div>

    <!-- Layer 3: Danger gradient bleeding from top-right, intensity scales with Mercy % -->
    <div class="pit-danger-gradient" aria-hidden="true"></div>

    <!-- Compact grimoire rail: direction, active rune, curse stack and ruin limit. -->
    <aside class="pit-rail" aria-label="Game state">
      <div ref="railDirectionRef" class="rail-cell rail-direction" :class="{ ccw: direction === -1 }" :title="direction === 1 ? 'Clockwise' : 'Counter-clockwise'">
        <RotateCw :size="16" :stroke-width="2" aria-hidden="true" />
        <span>{{ direction === 1 ? 'CW' : 'CCW' }}</span>
      </div>

      <div v-if="currentColor && currentColor !== 'wild'" class="rail-cell rail-color">
        <span class="color-dot" :class="`dot-${currentColor}`" aria-hidden="true"></span>
        <span>{{ colorLabel }}</span>
      </div>

      <div v-if="drawStack && drawStack > 0" class="rail-cell rail-stack" :class="{ critical: drawStack >= 12 }">
        <span class="rail-cell-label">CURSE</span>
        <span class="rail-cell-value">+<RollingNumber :value="drawStack" /></span>
      </div>

      <!-- Ruin meter — fills bottom→top toward the unchanged 25-card limit. -->
      <div v-if="myCardCount !== undefined" class="rail-mercy" :class="mercyClass">
        <div class="mercy-track" role="progressbar" :aria-valuenow="myCardCount" aria-valuemin="0" aria-valuemax="25" aria-label="Ruin meter">
          <div class="mercy-fill" :style="{ height: mercyPct + '%' }"></div>
          <span class="mercy-tick mercy-tick-warn"></span>
          <span class="mercy-tick mercy-tick-crit"></span>
        </div>
        <div class="mercy-readout">
          <span class="mercy-num"><RollingNumber :value="myCardCount ?? 0" /></span>
          <span class="mercy-of">/25</span>
          <span class="mercy-label-text">RUIN</span>
        </div>
      </div>
    </aside>

    <!-- Layer 6: The play surface — asymmetric draw+discard pair with perspective -->
    <div class="pit-table" ref="pitTableRef">
      <div class="station draw-station" @click="$emit('draw')">
        <slot name="draw-pile"></slot>
        <div class="action-hint" v-if="showDrawHint">
          {{ drawHintText }}
        </div>
      </div>

      <div
        class="station discard-station"
        :class="currentColor && currentColor !== 'wild' ? `discard-color-${currentColor}` : ''"
        ref="discardAreaRef"
      >
        <slot name="discard-pile"></slot>
      </div>
    </div>

    <!-- Mobile HUD: horizontal pill below the table (rail collapses on small screens) -->
    <div class="pit-hud-mobile" v-if="myCardCount !== undefined">
      <div class="hud-cell" ref="hudDirectionRef">
        <RotateCw :size="14" :stroke-width="2" aria-hidden="true" />
        <span>{{ direction === 1 ? 'CW' : 'CCW' }}</span>
      </div>
      <div v-if="currentColor && currentColor !== 'wild'" class="hud-cell">
        <span class="color-dot" :class="`dot-${currentColor}`" aria-hidden="true"></span>
      </div>
      <div v-if="drawStack && drawStack > 0" class="hud-cell hud-stack-mobile" :class="{ critical: drawStack >= 12 }">+<RollingNumber :value="drawStack" /></div>
      <div class="hud-cell hud-mercy-mobile" :class="mercyClass">
        <span class="mobile-mercy-bar">
          <span class="mobile-mercy-fill" :style="{ width: mercyPct + '%' }"></span>
        </span>
        <span class="mobile-mercy-text"><RollingNumber :value="myCardCount ?? 0" />/25</span>
      </div>
    </div>

  </div>
</template>

<script setup lang="ts">
import { RotateCw } from 'lucide-vue-next'
import { ref, computed, watch } from 'vue'
import gsap from 'gsap'
import { useScreenSize } from '../../composables/useScreenSize'
import { sweepDirectionRing } from '../../composables/useGameFeel'
import RollingNumber from './RollingNumber.vue'

const props = defineProps<{
  showDrawHint: boolean
  isMuted: boolean
  currentColor?: string
  direction?: number
  drawStack?: number
  myCardCount?: number
}>()

const { isMobile } = useScreenSize()
const drawHintText = computed(() => (isMobile.value ? 'TAP TO DRAW' : 'DRAW A RUNE'))
const colorLabel = computed(() => ({
  red: 'FLAME',
  blue: 'FROST',
  green: 'GROVE',
  yellow: 'STORM',
}[props.currentColor ?? ''] ?? props.currentColor?.toUpperCase() ?? ''))

const mercyPct = computed(() => {
  if (props.myCardCount === undefined) return 0
  return Math.min(100, (props.myCardCount / 25) * 100)
})

const mercyClass = computed(() => {
  const n = props.myCardCount ?? 0
  if (n >= 20) return 'critical'
  if (n >= 15) return 'warning'
  return ''
})

// Drives the danger-gradient bleed from top-right. 0 = none, 1 = max red.
const mercyIntensity = computed(() => {
  if (props.myCardCount === undefined) return 0
  return Math.min(1, props.myCardCount / 25)
})

defineEmits<{
  draw: []
  'toggle-sound': []
}>()

const discardAreaRef = ref<HTMLElement | null>(null)
const pitTableRef = ref<HTMLElement | null>(null)
const railDirectionRef = ref<HTMLElement | null>(null)
const hudDirectionRef = ref<HTMLElement | null>(null)

// Direction reversal payoff — comet ring sweeps the table in the new
// direction while the CW/CCW indicator flips in with its new value.
// flush: 'post' so the indicator already shows the new label when it flips.
watch(() => props.direction, (dir, prev) => {
  if (dir === undefined || prev === undefined || dir === prev) return
  if (pitTableRef.value) sweepDirectionRing(pitTableRef.value, dir as 1 | -1)
  for (const cell of [railDirectionRef.value, hudDirectionRef.value]) {
    if (!cell) continue
    gsap.fromTo(cell,
      { rotationX: -90, transformPerspective: 500 },
      { rotationX: 0, duration: 0.45, ease: 'back.out(1.8)', clearProps: 'transform' }
    )
  }
}, { flush: 'post' })

defineExpose({
  discardAreaRef,
})
</script>
