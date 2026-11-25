<template>
  <div class="card-pile-container">
    <div 
      class="card-pile" 
      :class="{ 'is-discard': isDiscard, 'is-draw': !isDiscard }"
      :style="{ width: cardSize.width + 'px', height: cardSize.height + 'px' }"
    >
      <!-- Draw Pile: Stack of face-down cards -->
      <template v-if="!isDiscard">
        <div class="pile-stack">
          <CardBack 
            v-for="i in Math.min(stackDepth, 8)" 
            :key="`stack-${i}`"
            :size="cardSize"
            class="stacked-card"
            :style="getStackStyle(i)"
          />
        </div>
      </template>
      
      <!-- Discard Pile: Scattered cards with top visible -->
      <template v-else>
        <div class="discard-scatter">
          <!-- Background scattered cards for depth -->
          <CardBack 
            v-for="i in Math.min(scatterCount, 5)" 
            :key="`scatter-${i}`"
            :size="cardSize"
            class="scattered-card-back"
            :style="getScatterStyle(i)"
          />
          
          <!-- Top card (face up) -->
          <div v-if="topCard" class="top-card" ref="topCardRef">
            <Card 
              :card="topCard" 
              :size="cardSize"
              :is-playable="false"
            />
          </div>
        </div>
      </template>
    </div>
    
    <div class="card-count" v-if="!isDiscard">
      {{ cards.length }} left
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, nextTick } from 'vue'
import gsap from 'gsap'
import type { Card as CardType } from '../../types/card'
import Card from './Card.vue'
import CardBack from './CardBack.vue'
import { useScreenSize } from '../../composables/useScreenSize'
import { useGameStore } from '../../stores/gameStore'
import { useMultiplayerStore } from '../../stores/multiplayerStore'

const props = defineProps<{
  cards: CardType[]
  isDiscard?: boolean
  large?: boolean
}>()

const topCardRef = ref<HTMLElement | null>(null)
const { isMobile, isTablet, isShortLandscape } = useScreenSize()

const cardSize = computed(() => {
  // Landscape phones are height-starved — shrink the piles so the table, hand
  // band, and dock all fit without scrolling.
  if (isShortLandscape.value) {
    return props.large ? { width: 60, height: 84 } : { width: 45, height: 63 }
  }
  if (props.large) {
    if (isMobile.value) return { width: 75, height: 105 }
    if (isTablet.value) return { width: 90, height: 126 }
    return { width: 110, height: 154 }
  }
  if (isMobile.value) return { width: 55, height: 77 }
  if (isTablet.value) return { width: 65, height: 91 }
  return { width: 80, height: 112 }
})

// Show 7 visible cards in the deck stack so it reads as a real pile — was
// 8 max but offsets were too tight to differentiate.
const stackDepth = computed(() => Math.min(Math.max(Math.ceil(props.cards.length / 8), 3), 7))
// Discard scatter: up to 5 history cards peek behind the top card
const scatterCount = computed(() => Math.min(Math.max(props.cards.length - 1, 0), 5))

const topCard = computed(() => {
  if (props.cards.length === 0) return undefined
  return props.cards[props.cards.length - 1]
})

function getStackStyle(index: number) {
  // Visible pile depth: top card (i=1) sits at origin, cards behind peek
  // out down-and-right at ~6px Y / ~2.5px X per layer with rotation
  // jitter. Z-index INVERTED so i=1 is on top (the "drawable" card), not
  // the deepest card. Stronger rotation per card so the pile doesn't
  // look machine-stacked.
  const i = Math.max(0, index - 1) // 0-based: 0 = top, 6 = deepest
  const yLift = i * 6
  const xLift = i * 2.5
  const seed = i * 31 + 7
  const rot = ((seed % 20) - 10) * 0.5 // ±5 deg
  const shadowDepth = 2 + i * 0.7
  return {
    transform: `translate3d(${xLift}px, ${yLift}px, 0) rotate(${rot}deg)`,
    zIndex: 20 - index,
    filter: `brightness(${1 - i * 0.05})`,
    boxShadow: `0 ${shadowDepth}px ${shadowDepth * 2}px rgba(0, 0, 0, 0.6)`,
  }
}

function getScatterStyle(index: number) {
  // Discard history cards — each previously-played card peeks out at a
  // sharper rotation than the deck (these were thrown, not placed) with
  // wider XY offsets so multiple show clearly behind the top card.
  const seed = index * 31 + 7
  const rotation = ((seed % 50) - 25) // -25 to +25 deg
  const offsetX = ((seed * 11) % 44) - 22 // -22 to +22 px
  const offsetY = ((seed * 17) % 30) - 15 // -15 to +15 px
  const zPush = index * -3
  return {
    transform: `translate3d(${offsetX}px, ${offsetY}px, ${zPush}px) rotate(${rotation}deg)`,
    zIndex: index,
    boxShadow: `0 ${4 + index * 0.5}px ${10 + index}px rgba(0, 0, 0, 0.5)`,
  }
}

const gameStore = useGameStore()
const mpStore = useMultiplayerStore()

// Trigger the colored ring burst on the parent discard-station whenever a
// card lands. Lives separately from the slam so it ALWAYS fires (even when
// the human throws their own card and the slam is suppressed).
function flashDiscardRing() {
  if (!topCardRef.value) return
  const station = topCardRef.value.closest('.discard-station') as HTMLElement | null
  if (!station) return
  // Remove + re-add to retrigger the CSS animation
  station.classList.remove('discard-flash')
  // Force reflow so the re-added class triggers a fresh animation cycle
  void station.offsetWidth
  station.classList.add('discard-flash')
  setTimeout(() => station.classList.remove('discard-flash'), 650)
}

// Animate new card landing on discard pile
watch(() => props.cards.length, (newLen, oldLen) => {
  if (props.isDiscard && newLen > oldLen && topCardRef.value) {
    // The flying-clone in PlayerHand IS the visual when the human throws their
    // own card — skip our own slam for that beat so the user doesn't see two
    // animations stacked. Bot plays (and any other state mutation) leave the
    // flag false, so the slam fires as the only visual.
    const suppressSlam = gameStore.suppressDiscardSlam || mpStore.suppressDiscardSlam
    if (suppressSlam) {
      gameStore.suppressDiscardSlam = false
      mpStore.suppressDiscardSlam = false
      // A flying clone (own throw or opponent throw) is delivering this card, so
      // the real top card must not pop in at full opacity while the clone is
      // still mid-air — that reads as the card teleporting then a clone flying
      // onto it. Hold it invisible until the clone lands (~0.36s), then reveal
      // it under the clone and fire the ring flash as it settles.
      const el = topCardRef.value
      gsap.set(el, { opacity: 0 })
      gsap.to(el, {
        opacity: 1,
        duration: 0.12,
        delay: 0.36,
        onStart: flashDiscardRing
      })
      return
    }
    nextTick(() => {
      if (topCardRef.value) {
        // Dramatic slam — back.out overshoots and settles, less cartoony than bounce.
        gsap.fromTo(topCardRef.value,
          {
            y: -100,
            scale: 1.5,
            opacity: 0,
            rotation: gsap.utils.random(-30, 30)
          },
          {
            y: 0,
            scale: 1,
            opacity: 1,
            rotation: 0,
            duration: 0.42,
            ease: 'back.out(1.7)'
          }
        )
      }
      flashDiscardRing()
    })
  }
})
</script>

<style scoped>
.card-pile-container {
  display: flex;
  flex-direction: column;
  align-items: center;
  position: relative;
  /* Perspective enables real 3D depth on the translate3d children below.
     Without this, the per-card Z offsets collapse to 2D. */
  perspective: 800px;
  perspective-origin: 50% 30%;
}

/* Subtle base shadow under each pile — implies the cards sit on a surface
   rather than float. Width tapers in (60% of card width) so the shadow
   reads as cast from a stack, not a billboard behind it. */
.card-pile::before {
  content: '';
  position: absolute;
  left: 20%;
  right: 20%;
  bottom: -8px;
  height: 18px;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.7) 0%, transparent 70%);
  filter: blur(6px);
  pointer-events: none;
  z-index: -1;
}

.card-pile {
  position: relative;
  cursor: pointer;
  transition: transform 0.18s ease;
  transform-style: preserve-3d;
}

/* Pile Interaction — draw pile lifts subtly on hover, presses on click */
.card-pile.is-draw:hover {
  transform: translateY(-3px) scale(1.02);
}
.card-pile.is-draw:active {
  transform: translateY(2px);
}

.pile-stack {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}

.stacked-card {
  position: absolute;
  top: 0;
  left: 0;
  border-radius: 6px;
  backface-visibility: hidden;
}

/* The top card of the deck lifts a touch when the pile is hovered so the
   draw target reads as interactive. */
.card-pile.is-draw:hover .stacked-card {
  filter: brightness(1.05);
}

.discard-scatter {
  position: relative;
  width: 100%;
  height: 100%;
  transform-style: preserve-3d;
}

/* Discard history cards — visible behind the top card so the pile reads
   as a real pile of played cards, not a single floating card. */
.scattered-card-back {
  position: absolute;
  top: 0;
  left: 0;
  opacity: 0.78;
  filter: grayscale(0.25) brightness(0.78);
  backface-visibility: hidden;
  border-radius: 6px;
}

.top-card {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  filter: drop-shadow(0 10px 20px rgba(0, 0, 0, 0.6));
}

.card-count {
  position: absolute;
  bottom: -25px;
  color: var(--text-muted);
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 0.8rem;
  background: #111;
  padding: 2px 6px;
  border-radius: 4px;
  border: 1px solid #333;
}
</style>
