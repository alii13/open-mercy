<template>
  <div
    class="hand-fan"
    :class="{ 'not-my-turn': !isMyTurn, 'is-peeking': peekPhase === 'PEEKING' }"
    ref="rootEl"
    @focusout="onFocusOut"
  >
    <div class="hand-scroller" :class="{ scroll: layout.mode === 'scroll' }">
      <div
        class="hand-strip"
        ref="handContainer"
        :style="{ width: stripWidth + 'px', height: layout.cardH + 'px' }"
        @pointermove="peek.onPointerMove"
        @pointerup="peek.onPointerUp"
        @pointercancel="peek.onPointerCancel"
        @contextmenu.prevent
      >
        <div
          v-for="(card, index) in cards"
          :key="card.id"
          class="hand-card-wrapper"
          :class="{
            unplayable: isMyTurn && !canPlay(card),
            'playable-glow': isMyTurn && canPlay(card),
            'fresh-card': hiddenCardIds.has(card.id)
          }"
          :ref="(el: any) => setCardRef(card.id, el)"
          :style="slotStyle(index)"
          role="button"
          :tabindex="index === clampedFocus ? 0 : -1"
          :aria-disabled="!(isMyTurn && canPlay(card))"
          :aria-label="cardLabel(card) + (isMyTurn && canPlay(card) ? ', playable' : '')"
          @mouseenter="hoverIndex = index"
          @mouseleave="hoverIndex = -1"
          @focus="focusIndex = index"
          @pointerdown="onCardPointerDown($event, index)"
          @click="onCardClick(card)"
          @keydown="onKeydown($event, card, index)"
        >
          <Card
            :card="card"
            :size="{ width: layout.cardW, height: layout.cardH }"
            :is-playable="isMyTurn && canPlay(card)"
            class="hand-card"
          />
        </div>
      </div>
    </div>

    <!-- Parked selection catches a tap outside the preview to dismiss. -->
    <div
      v-if="peekPhase === 'SELECTED'"
      class="peek-backdrop"
      @pointerdown.self="peek.dismiss()"
    ></div>

    <!-- Lifted preview lives OUTSIDE the scroller so overflow can't clip it. -->
    <Transition name="peek">
      <div v-if="previewCard" class="peek-overlay" :class="{ 'peek-static': motionReduced }">
        <div
          ref="peekPreviewEl"
          class="peek-preview"
          @click.stop="onPreviewTap"
        >
          <Card
            :card="previewCard"
            :size="previewSize"
            :is-playable="previewPlayable"
            class="peek-card"
          />
          <div class="peek-hint" :class="{ playable: previewSelected && previewPlayable }">
            {{ previewHint }}
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, inject, watch, nextTick, onMounted, onUnmounted, type Ref, type ComponentPublicInstance } from 'vue'
import gsap from 'gsap'
import { Flip } from 'gsap/Flip'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'

gsap.registerPlugin(Flip, MotionPathPlugin)
import type { Card as CardType } from '../../types/card'
import Card from './Card.vue'
import { computeHandLayout } from '../../utils/handLayout'
import { useScreenSize } from '../../composables/useScreenSize'
import { useMotion } from '../../composables/useMotion'
import { useHandPeek } from '../../composables/useHandPeek'
import { soundEffects } from '../../composables/useSoundEffects'
import { useGameFx } from '../../composables/fx/useGameFx'
import { slamMagnitude } from '../../composables/fx/useFxWiring'

// Unified hand for both single-player and multiplayer. It owns fan/scroll
// layout, the flying-clone play animation, and the throw sound only — the
// parent owns the store update (via @play) and the land/special sounds, so a
// card's sounds fire exactly once from each path's central mechanism.
const props = defineProps<{
  cards: CardType[]
  isMyTurn: boolean
  canPlay: (card: CardType) => boolean
  disabled?: boolean
}>()

const emit = defineEmits<{ (e: 'play', card: CardType): void }>()

const { screenWidth, screenHeight, isCoarsePointer } = useScreenSize()
const motion = useMotion()
const motionReduced = computed(() => motion.reduced)
const hoverIndex = ref(-1)

// Measure the hand band so the layout solver can cap card height to it.
const rootEl = ref<HTMLElement | null>(null)
const bandHeight = ref(200)
let resizeObserver: ResizeObserver | null = null

onMounted(() => {
  if (rootEl.value && typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      if (rootEl.value) bandHeight.value = rootEl.value.clientHeight
    })
    resizeObserver.observe(rootEl.value)
    bandHeight.value = rootEl.value.clientHeight
  }
})
onUnmounted(() => resizeObserver?.disconnect())

const layout = computed(() =>
  computeHandLayout({
    viewportWidth: screenWidth.value,
    bandHeight: bandHeight.value,
    handSize: props.cards.length,
    pointerCoarse: isCoarsePointer.value
  })
)

const stripWidth = computed(() => {
  const { slots, cardW } = layout.value
  if (slots.length === 0) return cardW
  return slots[slots.length - 1]!.x + cardW
})

function slotStyle(index: number) {
  const s = layout.value.slots[index]
  if (!s) return {}
  return {
    position: 'absolute' as const,
    left: `${s.x}px`,
    bottom: '0px',
    width: `${layout.value.cardW}px`,
    height: `${layout.value.cardH}px`,
    transform: `translateY(${s.arcY}px) rotate(${s.rotate}deg)`,
    zIndex: String(s.zIndex)
  }
}

// Cards that just landed via a draw animation render invisibly until the
// flying card-back clone finishes its travel, so a drawn card doesn't pop into
// the hand while its clone is still mid-air. (Ported from single-player; the
// multiplayer hand gains it here for free.)
const hiddenCardIds = ref(new Set<string>())
const knownIds = new Set<string>()
for (const c of props.cards) knownIds.add(c.id)

watch(() => props.cards.map(c => c.id), (ids) => {
  const fresh: string[] = []
  for (const id of ids) {
    if (!knownIds.has(id)) {
      fresh.push(id)
      knownIds.add(id)
    }
  }
  if (fresh.length === 0) return
  for (const id of fresh) hiddenCardIds.value.add(id)
  setTimeout(() => {
    for (const id of fresh) hiddenCardIds.value.delete(id)
    hiddenCardIds.value = new Set(hiddenCardIds.value)
  }, 380)
})

// Injected from the game view: the discard target rect and the layer the
// flying clone is appended into. Null-safe — animation is skipped if absent.
const discardAreaRef = inject<Ref<HTMLElement | null>>('discardAreaRef', ref(null))
const animationLayer = inject<Ref<HTMLElement | null>>('animationLayer', ref(null))
const handContainer = ref<HTMLElement | null>(null)
const fx = useGameFx()

const cardRefs = ref<Map<string, HTMLElement>>(new Map())
function setCardRef(cardId: string, el: HTMLElement | ComponentPublicInstance | null) {
  if (el) cardRefs.value.set(cardId, el as HTMLElement)
  else cardRefs.value.delete(cardId)
}

// Roving tabindex: the fan is a single tab stop; arrows traverse ALL cards
// (including unplayable ones, so keyboard users can inspect the whole hand).
const focusIndex = ref(0)
const clampedFocus = computed(() => Math.min(focusIndex.value, Math.max(0, props.cards.length - 1)))
// True only while the hand is being driven by the keyboard, so the lifted
// preview appears on arrow navigation but never on a mouse click.
const keyboardNav = ref(false)

function focusCard(index: number) {
  const card = props.cards[index]
  if (!card) return
  nextTick(() => cardRefs.value.get(card.id)?.focus())
}

function moveFocus(delta: number) {
  const n = props.cards.length
  if (n === 0) return
  const next = Math.min(n - 1, Math.max(0, clampedFocus.value + delta))
  focusIndex.value = next
  focusCard(next)
}

function onKeydown(e: KeyboardEvent, card: CardType, _index: number) {
  if (e.key === 'ArrowRight') { e.preventDefault(); keyboardNav.value = true; moveFocus(1) }
  else if (e.key === 'ArrowLeft') { e.preventDefault(); keyboardNav.value = true; moveFocus(-1) }
  else if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleCardClick(card) }
  else if (e.key === 'Escape') { keyboardNav.value = false }
}

function onFocusOut(e: FocusEvent) {
  // Leaving the fan entirely hides the keyboard preview.
  if (!rootEl.value?.contains(e.relatedTarget as Node)) keyboardNav.value = false
}

function cardLabel(card: CardType): string {
  const color = card.color === 'wild' ? 'Wild' : card.color.charAt(0).toUpperCase() + card.color.slice(1)
  const names: Record<string, string> = {
    number: card.value !== undefined ? String(card.value) : 'number',
    skip: 'Skip', reverse: 'Reverse', draw2: 'Draw Two', draw4: 'Draw Four',
    draw6: 'Draw Six', draw10: 'Draw Ten', skipEveryone: 'Skip Everyone',
    discardAll: 'Discard All', wild: 'Wild', wildReverseDraw4: 'Wild Reverse Draw Four',
    wildColorRoulette: 'Wild Color Roulette'
  }
  const name = names[card.type] || card.type
  return card.color === 'wild' ? name : `${color} ${name}`
}

function handleCardClick(card: CardType) {
  if (props.disabled) return
  if (!props.isMyTurn || !props.canPlay(card)) return
  executePlay(card)
}

// On touch, the peek gesture owns the tap (its TAP_PLAY effect calls the play
// path); the synthetic click that follows a tap is ignored so a card never
// plays twice. Fine pointers keep click-to-play.
function onCardClick(card: CardType) {
  if (peekEnabled.value) return
  handleCardClick(card)
}

function onCardPointerDown(e: PointerEvent, index: number) {
  keyboardNav.value = false
  peek.onPointerDown(e, index)
}

// ── Long-press peek ────────────────────────────────────────────────────────
const peekPreviewEl = ref<HTMLElement | null>(null)
const peekEnabled = computed(() => isCoarsePointer.value && !props.disabled)

function playByIndex(index: number) {
  const card = props.cards[index]
  if (card) handleCardClick(card)
}

function canPlayIndex(index: number): boolean {
  const card = props.cards[index]
  return !!card && props.isMyTurn && !props.disabled && props.canPlay(card)
}

// Nearest card centre to the finger — cards overlap, so containment is
// ambiguous; closest centre is the honest pick for slide-to-browse.
function indexAtPoint(clientX: number): number {
  let best = clampedFocus.value
  let bestDist = Infinity
  props.cards.forEach((card, i) => {
    const el = cardRefs.value.get(card.id)
    if (!el) return
    const r = el.getBoundingClientRect()
    const d = Math.abs((r.left + r.right) / 2 - clientX)
    if (d < bestDist) { bestDist = d; best = i }
  })
  return best
}

function shakePreview() {
  const el = peekPreviewEl.value
  if (!el || motion.reduced) return
  gsap.fromTo(el, { x: -9 }, { x: 0, duration: 0.45, ease: 'elastic.out(1, 0.3)' })
}

const peek = useHandPeek({
  stripRef: handContainer,
  enabled: peekEnabled,
  cardCount: computed(() => props.cards.length),
  indexAtPoint,
  canPlayIndex,
  play: playByIndex,
  shakePreview,
})
const peekPhase = peek.peekPhase

// The lifted preview is shared by touch peek (PEEKING/SELECTED) and keyboard
// navigation. Touch wins when both could apply.
const previewIndex = computed(() => {
  if (peek.peekIndex.value >= 0) return peek.peekIndex.value
  if (keyboardNav.value && props.isMyTurn) return clampedFocus.value
  return -1
})
const previewCard = computed(() => props.cards[previewIndex.value] ?? null)
const previewPlayable = computed(() => {
  const c = previewCard.value
  return !!c && props.isMyTurn && !props.disabled && props.canPlay(c)
})
const previewSelected = computed(() => peek.peekPhase.value === 'SELECTED')
const previewSize = computed(() => {
  let w = Math.min(190, Math.max(120, screenWidth.value * 0.34))
  let h = w * 1.4
  // Never let the lifted card exceed the viewport — short landscape would
  // otherwise clip its top and collide with the opponent bar.
  const hCap = screenHeight.value * 0.6
  if (h > hCap) { h = hCap; w = h / 1.4 }
  return { width: Math.round(w), height: Math.round(h) }
})
const previewHint = computed(() => {
  if (previewSelected.value) return previewPlayable.value ? 'TAP TO PLAY' : "CAN'T PLAY"
  return previewCard.value ? cardLabel(previewCard.value) : ''
})

function onPreviewTap() {
  peek.confirmTap()
}

// Fires the throw sound, hands the play to the parent (which does the store
// update + land/special sounds), and flies a clone of the card to the discard.
function executePlay(card: CardType) {
  const cardEl = cardRefs.value.get(card.id)
  if (!cardEl || !discardAreaRef?.value || !animationLayer?.value) {
    soundEffects.playCardThrow()
    emit('play', card)
    return
  }

  const cardRect = cardEl.getBoundingClientRect()
  const discardRect = discardAreaRef.value.getBoundingClientRect()

  // Capture the remaining cards' positions before Vue removes the played one,
  // so they slide into their new fan slots instead of jumping.
  const remainingCards = handContainer.value
    ? handContainer.value.querySelectorAll('.hand-card-wrapper')
    : null
  const handFlipState = remainingCards && remainingCards.length > 1
    ? Flip.getState(remainingCards)
    : null

  const clone = cardEl.cloneNode(true) as HTMLElement
  clone.style.position = 'fixed'
  clone.style.left = `${cardRect.left}px`
  clone.style.top = `${cardRect.top}px`
  clone.style.width = `${cardRect.width}px`
  clone.style.height = `${cardRect.height}px`
  clone.style.zIndex = '1000'
  clone.style.pointerEvents = 'none'
  clone.style.margin = '0'
  animationLayer.value.appendChild(clone)
  cardEl.style.opacity = '0'

  soundEffects.playCardThrow()

  const targetX = discardRect.left + discardRect.width / 2 - cardRect.width / 2
  const targetY = discardRect.top + discardRect.height / 2 - cardRect.height / 2
  const dx = targetX - cardRect.left
  const dy = targetY - cardRect.top
  const landRotation = gsap.utils.random(-20, 20)

  // Fire the play FIRST so the game advances at click-speed; the throw is
  // cosmetic theatre in parallel. The parent sets suppressDiscardSlam and
  // updates the store, and its central mechanism plays the land/special sound.
  emit('play', card)

  if (handFlipState) {
    nextTick(() => {
      Flip.from(handFlipState, {
        duration: 0.35,
        ease: 'power3.out',
        stagger: 0.015,
        absolute: false
      })
    })
  }

  const midX = dx / 2
  const arcHeight = Math.max(80, Math.hypot(dx, dy) * 0.22)
  const midY = dy / 2 - arcHeight

  const tl = gsap.timeline({ onComplete: () => clone.remove() })

  // 1. Anticipation — small pull-back opposite the throw.
  tl.to(clone, {
    x: -dx * 0.04,
    y: -dy * 0.04,
    scale: 0.96,
    duration: 0.07,
    ease: 'power2.in'
  })

  // 2. Throw — arced motion path to the pile.
  tl.to(clone, {
    motionPath: {
      path: [{ x: midX, y: midY }, { x: dx, y: dy }],
      curviness: 1.5,
      autoRotate: false
    },
    rotation: landRotation,
    scale: 0.92,
    duration: 0.32,
    ease: 'power2.out'
  })

  // 3. Impact — pile flash + shard burst for power cards. The land SOUND is NOT
  // fired here: each path's central mechanism owns it (SP: gameStore.playCard;
  // MP: the topCard watcher), so it fires exactly once per play.
  const isPowerCard = card.color === 'wild' || card.type.includes('draw') || card.type === 'skipEveryone'
  tl.call(() => {
    if (!discardAreaRef.value) return
    fx.emit('impact', { originEl: discardAreaRef.value, color: card.color, power: isPowerCard })
    if (isPowerCard) {
      triggerPileFlash(card.color === 'wild' ? 'wild' : card.color)
      fx.emit('slam', { originEl: discardAreaRef.value, color: card.color, magnitude: slamMagnitude(card) })
    }
  })

  // 4. Follow-through — settle onto the pile.
  tl.to(clone, {
    scale: 0.82,
    duration: 0.14,
    ease: 'back.out(2.2)'
  }, '+=0.045')
}

function triggerPileFlash(color: string) {
  if (!discardAreaRef?.value) return
  const flash = document.createElement('div')
  flash.className = 'pile-flash'
  const colorMap: Record<string, string> = {
    red: 'rgba(255, 60, 60, 0.85)',
    blue: 'rgba(60, 120, 255, 0.85)',
    green: 'rgba(60, 220, 120, 0.85)',
    yellow: 'rgba(255, 220, 60, 0.85)',
    wild: 'rgba(255, 80, 220, 0.9)'
  }
  flash.style.cssText = `
    position: absolute;
    inset: -40px;
    border-radius: 50%;
    background: radial-gradient(circle, ${colorMap[color] || colorMap.wild} 0%, transparent 70%);
    mix-blend-mode: screen;
    pointer-events: none;
    opacity: 0;
    z-index: 50;
    will-change: opacity, transform;
  `
  discardAreaRef.value.appendChild(flash)
  gsap.fromTo(flash,
    { opacity: 0, scale: 0.4 },
    {
      opacity: 1, scale: 1.6, duration: 0.18, ease: 'power2.out',
      onComplete: () => {
        gsap.to(flash, {
          opacity: 0, scale: 1.9, duration: 0.32, ease: 'power2.in',
          onComplete: () => flash.remove()
        })
      }
    }
  )
}
</script>

<style scoped>
.hand-fan {
  position: relative;
  /* Fill the arena's hand band (floating-hand-wrapper owns the height via
     --hand-band-h); the ResizeObserver measures this to size the cards. */
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: flex-end;
  padding: 40px 20px 8px;
  overflow: visible;
  width: 100%;
}

.hand-scroller {
  display: flex;
  justify-content: safe center;
  align-items: flex-end;
  perspective: 1000px;
  max-width: 100%;
}

/* Only scroll (and thus clip vertically) once the fan can't fit — fan mode
   keeps overflow visible so hover lifts aren't clipped. */
.hand-scroller.scroll {
  overflow-x: auto;
  overflow-y: visible;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
  touch-action: pan-x;
  padding: 0 var(--spacing-3);
  /* Fade the horizontal edges so clipped cards read as "more off-screen"
     rather than hard-cut. Vertical stays full-alpha so hover/arc lifts aren't
     touched. Scroll mode only — a fitted fan needs no cue. */
  -webkit-mask-image: linear-gradient(to right, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
  mask-image: linear-gradient(to right, transparent 0, #000 22px, #000 calc(100% - 22px), transparent 100%);
}
.hand-scroller.scroll::-webkit-scrollbar { display: none; }

.hand-strip {
  position: relative;
  flex-shrink: 0;
}

.hand-card-wrapper {
  transition: transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275), opacity 0.2s ease-out;
  cursor: pointer;
  transform-origin: bottom center;
  will-change: transform;
  /* Kill the iOS/Android long-press callout + text selection so a hold peeks. */
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  user-select: none;
}

/* While actively peeking, stop the scroller from also panning under the finger
   (the non-passive touchmove guard in useHandPeek backs this up). */
.hand-fan.is-peeking .hand-scroller.scroll {
  touch-action: none;
}

.hand-card-wrapper.fresh-card {
  opacity: 0;
}

@media (hover: hover) and (pointer: fine) {
  .hand-card-wrapper:hover {
    z-index: 9999 !important;
    transform: translateY(-40px) scale(1.12) !important;
  }
  .hand-card-wrapper:hover .hand-card {
    box-shadow: 0 18px 28px rgba(0, 0, 0, 0.55);
  }
}

.unplayable {
  opacity: 0.7;
  filter: brightness(0.75);
}

.hand-card-wrapper.playable-glow:active {
  transform: translateY(-32px) scale(1.04) !important;
  transition: transform 0.06s ease-out;
}

.playable-glow .hand-card {
  box-shadow: 0 0 15px rgba(0, 243, 255, 0.5);
  border: 1px solid rgba(0, 243, 255, 0.8);
  border-radius: 8px;
  position: relative;
}

.playable-glow .hand-card::after {
  content: "";
  position: absolute;
  inset: -2px;
  border-radius: 10px;
  pointer-events: none;
  box-shadow: 0 0 22px rgba(0, 243, 255, 0.85);
  opacity: 0;
  animation: pulse-glow 2.4s ease-in-out infinite;
}

@keyframes pulse-glow {
  0%, 100% { opacity: 0; }
  50% { opacity: 1; }
}

.not-my-turn .hand-scroller {
  filter: grayscale(0.7) brightness(0.7);
  opacity: 0.7;
}
.not-my-turn .hand-card-wrapper {
  cursor: not-allowed;
}

/* ── Long-press peek overlay ─────────────────────────────────────────────── */
.peek-backdrop {
  position: fixed;
  inset: 0;
  z-index: 40;
}

.peek-overlay {
  position: absolute;
  left: 0;
  right: 0;
  /* Float above the hand band, over the pit, where the card is readable. */
  bottom: calc(100% - 48px);
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 50;
}

.peek-preview {
  pointer-events: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
  transform-origin: center bottom;
  filter: drop-shadow(0 22px 38px rgba(0, 0, 0, 0.7));
}

.peek-hint {
  font-family: var(--font-display, sans-serif);
  font-size: 0.78rem;
  letter-spacing: 0.14em;
  color: var(--text-secondary, #cbd5e1);
  background: rgba(8, 10, 14, 0.88);
  padding: 4px 14px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  white-space: nowrap;
}
.peek-hint.playable {
  color: #04121a;
  background: var(--color-neon-blue, #2ad4ff);
  border-color: transparent;
  font-weight: 700;
}

.peek-enter-active,
.peek-leave-active {
  transition: opacity 0.16s ease, transform 0.18s cubic-bezier(0.2, 0.9, 0.3, 1.35);
}
.peek-enter-from,
.peek-leave-to {
  opacity: 0;
  transform: translateY(14px) scale(0.9);
}

/* Reduced motion (OS or in-app override): instant preview, no scale tween. */
.peek-overlay.peek-static.peek-enter-active,
.peek-overlay.peek-static.peek-leave-active {
  transition: none;
}
.peek-overlay.peek-static.peek-enter-from,
.peek-overlay.peek-static.peek-leave-to {
  transform: none;
}

@media (max-width: 768px) {
  .hand-fan {
    padding: 30px 10px 8px;
  }
}

@media (max-width: 480px) {
  .hand-fan {
    padding: 20px 5px 5px;
  }
}
</style>
