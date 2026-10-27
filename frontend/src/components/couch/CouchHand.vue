<template>
  <section class="couch-hand" aria-labelledby="couch-hand-title">
    <header class="hand-heading">
      <h2 id="couch-hand-title">Deine Hand <span>{{ cards.length }}</span></h2>
      <span v-if="showHint" class="scroll-hint"><MoveHorizontal :size="16" /> Wischen für mehr</span>
    </header>

    <div class="cards-scroll" tabindex="0" aria-label="Deine Handkarten, horizontal scrollbar">
      <div class="cards-track" :style="{ '--card-count': cards.length }">
        <button
          v-for="(card, index) in cards"
          :key="card.id"
          :ref="element => setCardElement(card.id, element)"
          class="hand-card-button"
          :class="{
            playable: canPlay(card),
            blocked: !canPlay(card),
            selected: selectedCardId === card.id,
          }"
          :style="{ zIndex: selectedCardId === card.id ? cards.length + 2 : index + 1 }"
          :aria-pressed="selectedCardId === card.id"
          :aria-label="cardAria(card)"
          :disabled="disabled"
          @click="choose(card)"
          @focus="emit('inspect', card)"
        >
          <Card
            :card="card"
            :ruleset="ruleset"
            :size="cardSize"
            :is-playable="canPlay(card)"
            :is-selected="selectedCardId === card.id"
          />
          <span class="play-state" aria-hidden="true">
            <CircleCheckBig v-if="canPlay(card)" :size="18" />
            <LockKeyhole v-else :size="16" />
          </span>
          <span v-if="selectedCardId === card.id" class="selected-label">AUSGEWÄHLT</span>
        </button>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, nextTick, type ComponentPublicInstance } from 'vue'
import { CircleCheckBig, LockKeyhole, MoveHorizontal } from 'lucide-vue-next'
import type { Card as CardType } from '../../types/card'
import type { GameRuleset } from '@engine'
import { cardFamily, cardPresentation } from '../../utils/cardPresentation'
import { showHandScrollHint } from '../../utils/couchController'
import Card from '../game/Card.vue'

const props = defineProps<{
  cards: CardType[]
  selectedCardId: string | null
  canPlay: (card: CardType) => boolean
  disabled?: boolean
  ruleset?: GameRuleset
}>()

const emit = defineEmits<{
  select: [card: CardType]
  blocked: [card: CardType]
  inspect: [card: CardType]
}>()

const cardElements = new Map<string, HTMLElement>()
const showHint = computed(() => showHandScrollHint(props.cards.length))
const cardSize = { width: 102, height: 143 }

function setCardElement(id: string, element: Element | ComponentPublicInstance | null) {
  if (element instanceof HTMLElement) cardElements.set(id, element)
  else if (!element) cardElements.delete(id)
}

function cardAria(card: CardType): string {
  const state = props.canPlay(card) ? 'spielbar' : 'nicht spielbar'
  const selected = props.selectedCardId === card.id ? ', ausgewählt' : ''
  return `${cardPresentation(card, props.ruleset).name}, ${cardFamily(card)}, ${state}${selected}`
}

function choose(card: CardType) {
  emit('inspect', card)
  if (!props.canPlay(card)) {
    emit('blocked', card)
    return
  }
  emit('select', card)
  void nextTick(() => cardElements.get(card.id)?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' }))
}
</script>

<style scoped>
.couch-hand{min-width:0;display:flex;flex-direction:column;border-top:1px solid rgba(210,170,82,.24)}.hand-heading{height:34px;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:0 3px}.hand-heading h2{margin:0;font-family:var(--font-body);font-size:.76rem;line-height:1;text-transform:uppercase;letter-spacing:.13em;color:#c8b374}.hand-heading h2 span{display:inline-grid;place-items:center;min-width:25px;height:21px;margin-left:5px;border:1px solid #6e586f;border-radius:999px;color:#fff}.scroll-hint{display:flex;align-items:center;gap:5px;color:#a493ac;font-size:.69rem;white-space:nowrap}.cards-scroll{min-width:0;height:181px;overflow-x:auto;overflow-y:hidden;overscroll-behavior-x:contain;scroll-snap-type:x proximity;scrollbar-color:#80658d #100b15;scrollbar-width:thin;padding:29px 15px 8px 4px}.cards-scroll:focus-visible{outline:2px solid #d2ac55;outline-offset:-2px}.cards-track{display:flex;align-items:flex-end;width:max-content;min-width:100%;height:143px;padding-right:20px}.hand-card-button{position:relative;flex:0 0 102px;width:102px;height:143px;padding:0;border:0;background:transparent;scroll-snap-align:center;transition:transform .18s ease,filter .18s ease,opacity .18s ease}.hand-card-button+.hand-card-button{margin-left:-30px}.hand-card-button.blocked{filter:saturate(.55) brightness(.62);opacity:.78}.hand-card-button.playable{filter:drop-shadow(0 0 7px rgba(67,239,180,.28))}.hand-card-button.selected{transform:translateY(-22px);filter:drop-shadow(0 0 14px rgba(255,205,91,.86));opacity:1}.hand-card-button.selected::after{content:'';position:absolute;inset:-4px;z-index:5;border:2px solid #f0c85e;border-radius:10px;box-shadow:0 0 13px rgba(240,200,94,.5);pointer-events:none}.hand-card-button:focus-visible{outline:2px solid #f0cf78;outline-offset:3px}.hand-card-button:disabled{pointer-events:none}.play-state{position:absolute;right:5px;top:5px;z-index:6;width:26px;height:26px;display:grid;place-items:center;border-radius:50%;background:#08060c;border:1px solid #6b596f;color:#887b8e}.playable .play-state{border-color:#49e6af;color:#62f7c3;box-shadow:0 0 10px rgba(73,230,175,.34)}.selected-label{position:absolute;left:50%;bottom:-23px;translate:-50%;z-index:7;color:#f2cf72;font-size:.58rem;font-weight:900;letter-spacing:.12em;white-space:nowrap}@media(max-height:700px){.cards-scroll{height:159px;padding-top:23px}.cards-track{height:127px}.hand-card-button{transform-origin:bottom left;scale:.89}.hand-card-button.selected{transform:translateY(-18px);scale:.89}.hand-card-button+.hand-card-button{margin-left:-38px}}@media(prefers-reduced-motion:reduce){.hand-card-button{transition:none}.cards-scroll{scroll-behavior:auto}.hand-card-button.selected{transform:translateY(-12px)}}
</style>
