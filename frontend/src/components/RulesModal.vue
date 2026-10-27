<template>
  <Modal :open="true" :close-on-backdrop="true" aria-label="How to play" @close="$emit('close')">
    <div class="rules-card">
      <header class="rules-header">
        <h2 class="rules-title">HOW TO PLAY</h2>
        <button class="rules-close" aria-label="Close" @click="$emit('close')">
          <X :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
      </header>

      <div class="rules-body">
        <p class="rules-goal">
          Be the first to empty your hand. RUNE RIOT is unforgiving — penalties stack high
          and if you ever hold <strong>25 cards</strong>, you're <strong>eliminated</strong>.
        </p>

        <section class="rules-section">
          <h3 class="rules-subhead">BASICS</h3>
          <ul class="rules-list">
            <li>Play a card that matches the <strong>color</strong> or the <strong>number/symbol</strong> on the pile.</li>
            <li>Can't play? <strong>Draw</strong> from the deck. If the drawn card is playable it plays automatically.</li>
            <li>Down to one card? <strong>Call RIOT!</strong> — forget and you're penalized.</li>
          </ul>
        </section>

        <section class="rules-section">
          <h3 class="rules-subhead">THE GREATER RUNES</h3>
          <ul class="rules-cards">
            <li><span class="chip chip-num">+2 +4</span> <span><strong>Draw cards.</strong> Stack them on the next player — they draw the whole pile or stack their own to pass it on.</span></li>
            <li><span class="chip chip-danger">+6 +10</span> <span><strong>Wild draws.</strong> Massive penalties that send a hand spiralling toward the 25-card ruin limit.</span></li>
            <li><span class="chip">SKIP</span> <span>Skip the next player's turn.</span></li>
            <li><span class="chip">REV</span> <span>Reverse the direction of play.</span></li>
            <li><span class="chip">SKIP ALL</span> <span><strong>Skip everyone</strong> — you immediately play again.</span></li>
            <li><span class="chip">DISCARD ALL</span> <span>Dump <strong>every card of that color</strong> from your hand at once.</span></li>
            <li><span class="chip chip-num">7</span> <span><strong>Swap hands</strong> with any player you choose.</span></li>
            <li><span class="chip chip-num">0</span> <span><strong>Everyone passes</strong> their whole hand in the direction of play.</span></li>
            <li><span class="chip chip-wild">ROULETTE</span> <span><strong>Wild Color Roulette.</strong> The victim calls a color, then draws until they hit it. Could be one card — could be ten.</span></li>
            <li><span class="chip chip-wild">WILD +4 REV</span> <span>Reverse direction <em>and</em> hit the next player with +4.</span></li>
          </ul>
        </section>

        <section class="rules-section rules-section--last">
          <h3 class="rules-subhead">STACKING RULES</h3>
          <ul class="rules-list">
            <li><strong>Official</strong> — stack a draw card only on an equal or higher value.</li>
            <li><strong>House</strong> — wild draws (+4/+6/+10) stack on anything; colored draws stay strict.</li>
            <li><strong>Casual</strong> — anything goes, any draw stacks on any draw.</li>
          </ul>
        </section>
      </div>

      <footer class="rules-footer">
        <button class="rules-got-it" @click="$emit('close')">GOT IT</button>
      </footer>
    </div>
  </Modal>
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import Modal from './ui/Modal.vue'

defineEmits<{ close: [] }>()
</script>

<style scoped>
.rules-card {
  display: flex;
  flex-direction: column;
  max-height: min(82vh, 760px);
  width: min(540px, 94vw);
  background: #111;
  border: 2px solid var(--color-hazard);
  border-radius: 4px;
  box-shadow: 0 24px 70px rgba(0, 0, 0, 0.6), 0 0 50px rgba(255, 204, 0, 0.12);
  color: var(--text-primary);
  overflow: hidden;
}

/* Anchored header — stays put while the body scrolls. */
.rules-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid rgba(255, 204, 0, 0.22);
  background: linear-gradient(180deg, rgba(255, 204, 0, 0.06), transparent);
}

.rules-title {
  font-family: var(--font-display);
  font-size: 1.4rem;
  letter-spacing: 0.14em;
  color: var(--color-hazard);
  margin: 0;
}

.rules-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 4px;
  color: var(--text-secondary);
  font-size: 0.95rem;
  cursor: pointer;
  line-height: 1;
  transition: border-color 0.15s, color 0.15s;
}
.rules-close:hover { color: var(--text-primary); border-color: rgba(255, 255, 255, 0.3); }

/* Only the body scrolls. */
.rules-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.1rem 1.25rem;
  scrollbar-width: thin;
  scrollbar-color: rgba(255, 204, 0, 0.35) transparent;
}
.rules-body::-webkit-scrollbar { width: 6px; }
.rules-body::-webkit-scrollbar-thumb { background: rgba(255, 204, 0, 0.3); border-radius: 3px; }

.rules-goal {
  font-size: 0.92rem;
  line-height: 1.55;
  margin: 0 0 1.25rem;
  color: var(--text-secondary);
}
.rules-goal strong { color: var(--color-alert); }

.rules-section { margin-bottom: 1.25rem; }
.rules-section--last { margin-bottom: 0; }

.rules-subhead {
  font-family: var(--font-mono);
  font-size: 0.68rem;
  letter-spacing: 0.24em;
  color: var(--color-neon-blue, #2ad4ff);
  margin: 0 0 0.6rem;
}

.rules-list {
  margin: 0;
  padding-left: 1.1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
  font-size: 0.86rem;
  line-height: 1.45;
  color: var(--text-secondary);
}
.rules-list strong { color: var(--text-primary); }

.rules-cards {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  font-size: 0.84rem;
  line-height: 1.4;
  color: var(--text-secondary);
}
.rules-cards li {
  display: grid;
  grid-template-columns: 84px 1fr;
  gap: 0.85rem;
  align-items: center;
}
.rules-cards strong { color: var(--text-primary); }

.chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-display);
  font-size: 0.6rem;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 5px 6px;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.07);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.14);
  min-height: 26px;
}
.chip-num { background: rgba(42, 212, 255, 0.18); border-color: rgba(42, 212, 255, 0.4); }
.chip-danger { background: rgba(255, 42, 42, 0.18); border-color: rgba(255, 42, 42, 0.45); color: var(--color-alert); }
.chip-wild {
  background: linear-gradient(135deg, rgba(255, 42, 42, 0.25), rgba(42, 212, 255, 0.25));
  border-color: rgba(255, 204, 0, 0.4);
}

/* Anchored footer — GOT IT always reachable, with breathing room. */
.rules-footer {
  flex-shrink: 0;
  padding: 0.85rem 1.25rem 1rem;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
}

.rules-got-it {
  width: 100%;
  padding: 0.7rem;
  background: var(--color-hazard);
  color: #111;
  border: none;
  border-radius: 3px;
  font-family: var(--font-display);
  font-size: 0.95rem;
  letter-spacing: 0.12em;
  cursor: pointer;
  transition: filter 0.15s, transform 0.05s;
}
.rules-got-it:hover { filter: brightness(1.08); }
.rules-got-it:active { transform: translateY(1px); }

@media (max-width: 480px) {
  .rules-card { max-height: 88vh; }
  .rules-title { font-size: 1.2rem; }
  .rules-cards li { grid-template-columns: 74px 1fr; gap: 0.65rem; }
}
</style>
