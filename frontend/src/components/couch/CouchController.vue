<template>
  <main class="controller-shell">
    <header class="controller-header">
      <div><span>RUNE RIOT</span><strong>COUCH CONTROLLER</strong></div>
      <div class="code">{{ roomCode }}</div>
    </header>

    <section v-if="!joined" class="join-card">
      <Smartphone :size="38" aria-hidden="true" />
      <p class="kicker">DER RUNENTISCH RUFT</p>
      <h1>Raum {{ roomCode }}</h1>
      <label>Dein Name <small>2–16 Zeichen</small>
        <input v-model="name" maxlength="16" minlength="2" autocomplete="nickname" placeholder="Runenname" @keyup.enter="join" />
      </label>
      <p v-if="localError || mp.error" class="error" role="alert">{{ localError || mp.error }}</p>
      <button class="primary" :disabled="joining || auth.loading" @click="join">
        <LoaderCircle v-if="joining" class="spin" :size="20" />
        <LogIn v-else :size="20" /> {{ joining ? 'VERBINDE …' : 'BEITRETEN' }}
      </button>
      <p class="private"><ShieldCheck :size="17" /> Diese Ansicht ist privat. Zeige deine Hand nicht auf dem TV.</p>
    </section>

    <section v-else-if="status === 'waiting'" class="lobby-card">
      <div class="sigil"><Sparkles :size="44" /></div>
      <p class="kicker">IM RUNENKREIS</p>
      <h1>{{ myName }}</h1>
      <form class="rename" @submit.prevent="rename">
        <input v-model="renameValue" maxlength="16" minlength="2" aria-label="Spielername ändern" />
        <button title="Name ändern"><Pencil :size="18" /></button>
      </form>
      <div class="players">
        <span>{{ mp.presence.filter(p => p.connected).length }}/8 Spieler</span>
        <span>{{ mp.presence.filter(p => p.ready).length }} bereit</span>
      </div>
      <button class="ready-button" :class="{ active: isReady }" @click="toggleReady">
        <CheckCircle2 :size="28" /> {{ isReady ? 'BEREIT' : 'ICH BIN BEREIT' }}
      </button>
      <p class="wait-copy">{{ isReady ? 'Warte auf den TV-Host …' : 'Bestätige, wenn du startklar bist.' }}</p>
    </section>

    <section v-else class="game-controller">
      <div class="turn-banner" :class="{ active: mp.isMyTurn }">
        <WifiOff v-if="mp.realtimeStatus !== 'SUBSCRIBED'" :size="18" />
        <Swords v-else :size="18" />
        {{ turnText }}
      </div>

      <div class="mini-board">
        <div class="discard">
          <Card v-if="topCard" :card="topCard" :size="{ width: 86, height: 124 }" />
          <span v-if="game?.draw_stack" class="penalty">+{{ game.draw_stack }}</span>
        </div>
        <div class="round-info">
          <span>{{ game?.current_color?.toUpperCase() }}</span>
          <strong>{{ myHand.length }} KARTEN</strong>
        </div>
        <button class="draw" :disabled="!mp.isMyTurn || mp.actionInProgress" @click="mp.drawCard()">
          <Layers3 :size="24" /> ZIEHEN
        </button>
      </div>

      <div v-if="choice === 'color' || needsRouletteColor || mp.pendingDrawnWildCard" class="choice-panel" role="dialog" aria-label="Farbe wählen">
        <strong>RUNENFAMILIE WÄHLEN</strong>
        <div class="colors">
          <button v-for="color in colors" :key="color" :class="color" @click="selectColor(color)">{{ colorLabels[color] }}</button>
        </div>
      </div>

      <div v-else-if="needsSwap" class="choice-panel">
        <strong>HANDTAUSCH WÄHLEN</strong>
        <button v-for="player in swapTargets" :key="player.user_id" class="target" @click="mp.swapHands(player.user_id)">
          {{ player.name }} · {{ player.hand.length }} Karten
        </button>
        <button class="target ghost" @click="mp.skipSwap()">Hand behalten</button>
      </div>

      <div v-else-if="mp.pendingDiscardAllCards.length" class="choice-panel">
        <strong>OBERSTE KARTE WÄHLEN</strong>
        <div class="discard-options">
          <button v-for="card in mp.pendingDiscardAllCards" :key="card.id" @click="mp.selectDiscardAllTop(card.id)">
            <Card :card="card" :size="{ width: 70, height: 101 }" />
          </button>
        </div>
      </div>

      <div class="hand-zone">
        <p class="hand-label">DEINE HAND · {{ myHand.length }}</p>
        <HandFan :cards="myHand" :is-my-turn="mp.isMyTurn" :can-play="canPlay" :disabled="!!choice" @play="onPlay" />
      </div>

      <button v-if="myHand.length <= 2 && status === 'playing'" class="mercy" @click="mp.callUno()">
        <Zap :size="22" /> RUNE!
      </button>

      <div v-if="status === 'finished'" class="finish-card">
        <Crown :size="48" />
        <h2>{{ didWin ? 'DU HAST GEWONNEN' : `${winnerName} GEWINNT` }}</h2>
        <p>Die nächste Runde startet der TV-Host.</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { CheckCircle2, Crown, Layers3, LoaderCircle, LogIn, Pencil, ShieldCheck, Smartphone, Sparkles, Swords, WifiOff, Zap } from 'lucide-vue-next'
import type { Card as CardType, CardColor } from '../../types/card'
import { canPlayCard } from '../../utils/gameRules'
import { useAuthStore } from '../../stores/authStore'
import { useMultiplayerStore } from '../../stores/multiplayerStore'
import Card from '../game/Card.vue'
import HandFan from '../game/HandFan.vue'

const props = defineProps<{ roomCode: string }>()
const auth = useAuthStore()
const mp = useMultiplayerStore()
const name = ref('')
const renameValue = ref('')
const localError = ref('')
const joining = ref(false)
const joined = computed(() => !!mp.currentGame && mp.roomCode === props.roomCode)
const game = computed(() => mp.currentGame)
const status = computed(() => game.value?.status ?? 'waiting')
const myHand = computed(() => mp.myPlayer?.hand ?? [])
const topCard = computed(() => {
  const pile = game.value?.discard_pile ?? []
  return pile.length ? pile[pile.length - 1] : null
})
const myPresence = computed(() => mp.presence.find(p => p.userId === mp.myUserId))
const myName = computed(() => myPresence.value?.name ?? name.value)
const isReady = computed(() => !!myPresence.value?.ready)
const needsSwap = computed(() => game.value?.turn_state === 'CHOOSING_PLAYER_TO_SWAP' && mp.isMyTurn)
const needsRouletteColor = computed(() => game.value?.turn_state === 'CHOOSING_ROULETTE_COLOR' && mp.isMyTurn)
const swapTargets = computed(() => mp.opponents.filter(p => !p.is_eliminated))
const winnerName = computed(() => mp.gamePlayers.find(p => p.user_id === game.value?.winner_id)?.name ?? 'Eine Rune')
const didWin = computed(() => game.value?.winner_id === mp.myUserId)
const turnText = computed(() => status.value === 'finished' ? 'PARTIE BEENDET' : mp.isMyTurn ? 'DU BIST AM ZUG' : `${mp.gamePlayers.find(p => p.user_id === game.value?.current_player_id)?.name ?? 'Spieler'} IST AM ZUG`)
const choice = ref<'color' | null>(null)
const pendingCard = ref<CardType | null>(null)
const colors = ['red', 'blue', 'green', 'yellow'] as const
const colorLabels: Record<typeof colors[number], string> = { red: 'FLAMME', blue: 'FROST', green: 'WALD', yellow: 'STURM' }

onMounted(() => {
  const saved = localStorage.getItem(`rune_riot_couch_name_${props.roomCode}`)
  if (saved) { name.value = saved; void join() }
})

async function join() {
  localError.value = ''
  const value = name.value.trim()
  const length = [...value].length
  if (length < 2 || length > 16) { localError.value = 'Bitte wähle einen Namen mit 2 bis 16 Zeichen.'; return }
  joining.value = true
  try {
    if (!auth.isAuthenticated) {
      const result = await auth.signInAnonymously(value)
      if (!result.success) { localError.value = result.error || 'Anmeldung fehlgeschlagen.'; return }
    }
    const result = await mp.joinCouchGame(props.roomCode, value)
    if (result) {
      localStorage.setItem(`rune_riot_couch_name_${props.roomCode}`, value)
      renameValue.value = value
    }
  } finally { joining.value = false }
}

function toggleReady() { mp.setReady(!isReady.value) }
function rename() {
  const value = renameValue.value.trim()
  if ([...value].length < 2) return
  name.value = value
  localStorage.setItem(`rune_riot_couch_name_${props.roomCode}`, value)
  void mp.updateMyName(value)
}
function canPlay(card: CardType) {
  if (!topCard.value || !game.value) return false
  return canPlayCard(card, topCard.value, game.value.current_color as CardColor, game.value.draw_stack, mp.stackingMode)
}
function onPlay(card: CardType) {
  if (card.color === 'wild') { pendingCard.value = card; choice.value = 'color'; return }
  void mp.playCard(card)
}
function selectColor(color: string) {
  const selected = color as CardColor
  if (mp.pendingDrawnWildCard) void mp.playDrawnWildCard(selected)
  else if (needsRouletteColor.value) void mp.setRouletteColor(selected)
  else if (pendingCard.value) void mp.playCard(pendingCard.value, selected)
  pendingCard.value = null
  choice.value = null
}
</script>

<style scoped>
.controller-shell{min-height:100dvh;color:#f3ead8;background:radial-gradient(circle at 50% 12%,#2c1b48,#0a0710 48%,#030204);padding:16px 14px 28px;overflow-x:hidden}.controller-header{display:flex;justify-content:space-between;align-items:center;max-width:720px;margin:auto}.controller-header div:first-child{display:flex;flex-direction:column}.controller-header span{color:#d3ad55;font-weight:900;letter-spacing:.16em}.controller-header strong{font-size:10px;letter-spacing:.14em;color:#988ba2}.code{border:1px solid #6b526e;padding:8px 10px;font-weight:900;letter-spacing:.12em}.join-card,.lobby-card{max-width:440px;margin:8vh auto 0;padding:30px 24px;text-align:center;background:rgba(14,10,20,.92);border:1px solid rgba(202,164,79,.4);box-shadow:0 25px 70px #000}.kicker{font-size:11px;letter-spacing:.22em;color:#b79244;font-weight:900}.join-card h1,.lobby-card h1{font-family:var(--font-display);font-size:36px;margin:8px 0 24px}.join-card label{display:block;text-align:left;color:#d6c9b5;font-size:13px}.join-card small{float:right;color:#817588}input{box-sizing:border-box;width:100%;margin-top:7px;padding:15px;background:#09070c;border:1px solid #564361;color:white;font-size:18px;outline:none}input:focus{border-color:#d0aa51;box-shadow:0 0 0 3px rgba(208,170,81,.12)}button{font:inherit;cursor:pointer}.primary,.ready-button{width:100%;min-height:58px;margin-top:18px;border:1px solid #efd37c;background:linear-gradient(135deg,#d0aa50,#77531c);color:#0d0910;font-weight:900;letter-spacing:.1em;display:flex;align-items:center;justify-content:center;gap:10px}.primary:disabled{opacity:.5}.private{display:flex;gap:8px;justify-content:center;align-items:center;font-size:12px;color:#7fcfae;margin-top:20px}.error{color:#ff8e95;background:#2b0f18;padding:12px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{rotate:360deg}}.sigil{color:#c998ff}.rename{display:grid;grid-template-columns:1fr 48px;gap:5px}.rename input{margin:0}.rename button{border:1px solid #5a4569;background:#17101e;color:#d9c5e8}.players{display:flex;justify-content:space-between;margin:24px 0 0;padding:13px;border-block:1px solid #362a3e;color:#a99ab2}.ready-button.active{background:linear-gradient(135deg,#37d9a0,#14745a);border-color:#75f0c5}.wait-copy{color:#a596ad}.game-controller{max-width:760px;margin:18px auto 0}.turn-banner{padding:13px;text-align:center;background:#19121f;border:1px solid #4b3855;color:#a398aa;font-weight:900;letter-spacing:.1em;display:flex;gap:8px;justify-content:center}.turn-banner.active{background:#123428;border-color:#43efb4;color:#83ffd3;box-shadow:0 0 24px rgba(67,239,180,.16)}.mini-board{display:grid;grid-template-columns:100px 1fr 112px;align-items:center;gap:15px;margin:16px 0;padding:15px;background:rgba(11,8,15,.8);border:1px solid #32263a}.discard{position:relative;min-height:124px}.penalty{position:absolute;right:-8px;top:-8px;background:#ffca4d;color:#160f08;border-radius:50%;padding:6px;font-weight:900}.round-info{display:flex;flex-direction:column;text-align:center;color:#c8a754;font-size:12px;gap:7px}.round-info strong{color:#e8ded0;font-size:16px}.draw{min-height:58px;background:#21172a;border:1px solid #7f6390;color:#f0e3f4;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;font-weight:900}.draw:disabled{opacity:.35}.choice-panel{position:relative;z-index:5;padding:16px;margin-bottom:12px;background:#130e1a;border:1px solid #b88ee1;text-align:center}.choice-panel>strong{font-size:12px;letter-spacing:.15em;color:#d8b4ff}.colors{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:13px}.colors button,.target{min-height:50px;border:1px solid rgba(255,255,255,.25);color:#fff;font-weight:900}.colors .red{background:#8d282d}.colors .blue{background:#234f88}.colors .green{background:#236546}.colors .yellow{background:#8d711d}.target{width:100%;background:#261b31;margin-top:8px}.target.ghost{background:transparent;color:#b4a6bd}.discard-options{display:flex;gap:8px;overflow:auto;margin-top:12px}.discard-options button{padding:0;border:0;background:none}.hand-zone{height:clamp(235px,38dvh,370px);position:relative;padding-top:28px;border-top:1px solid rgba(210,170,82,.25)}.hand-label{position:absolute;top:0;left:0;margin:0;font-size:11px;letter-spacing:.14em;color:#bca96f}.mercy{position:fixed;right:16px;bottom:18px;z-index:20;border:2px solid #ffcf4e;border-radius:50%;width:84px;height:84px;background:#421324;color:#ffe48b;font-weight:1000;box-shadow:0 0 25px rgba(255,63,113,.38)}.finish-card{position:fixed;inset:0;z-index:30;background:rgba(5,3,7,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}.finish-card svg{color:#e4b94d}.finish-card h2{font-family:var(--font-display);font-size:34px}.finish-card p{color:#ad9db3}@media(max-width:420px){.mini-board{grid-template-columns:90px 1fr 88px;gap:8px}.controller-header strong{display:none}.hand-zone{height:43dvh}}@media(prefers-reduced-motion:reduce){.spin{animation:none}}
</style>
