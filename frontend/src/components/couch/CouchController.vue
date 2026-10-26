<template>
  <main class="controller-shell" :class="{ 'is-playing': joined && status !== 'waiting' }">
    <header v-if="!joined || status === 'waiting'" class="controller-header">
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
        <CircleCheckBig :size="28" /> {{ isReady ? 'BEREIT' : 'ICH BIN BEREIT' }}
      </button>
      <p class="wait-copy">{{ isReady ? 'Warte auf den TV-Host …' : 'Bestätige, wenn du startklar bist.' }}</p>
    </section>

    <section v-else class="game-controller">
      <header class="player-hud">
        <div class="player-identity">
          <UserRound :size="20" aria-hidden="true" />
          <div><span>DU SPIELST ALS</span><strong :title="myName">{{ myName }}</strong></div>
        </div>
        <div class="hand-count"><Layers3 :size="18" /><strong>{{ myHand.length }}</strong><span>Karten</span></div>
        <span class="hud-room">{{ roomCode }}</span>
      </header>

      <div class="turn-banner" :class="{ active: mp.isMyTurn && isConnected, offline: !isConnected }" role="status" aria-live="polite">
        <WifiOff v-if="mp.realtimeStatus === 'CLOSED'" :size="19" />
        <LoaderCircle v-else-if="mp.realtimeStatus === 'CONNECTING'" class="spin" :size="19" />
        <Sparkles v-else-if="mp.isMyTurn" :size="19" />
        <Swords v-else :size="19" />
        <strong>{{ turnText }}</strong>
      </div>

      <section class="table-focus" aria-labelledby="table-card-title">
        <div class="table-card-wrap">
          <span id="table-card-title" class="section-label">TISCHKARTE</span>
          <div class="table-card">
            <Card v-if="topCard" :card="topCard" :size="{ width: 112, height: 160 }" />
            <span v-if="game?.draw_stack" class="penalty">+{{ game.draw_stack }}</span>
          </div>
        </div>
        <div class="table-state">
          <span class="section-label">AKTIVE FAMILIE</span>
          <div class="color-rune" :class="`color-${activeColor}`">
            <component :is="activeColorIcon" :size="24" aria-hidden="true" />
            <div><strong>{{ activeColorLabel }}</strong><span>{{ activeColorSubline }}</span></div>
          </div>
          <div v-if="tableEffect" class="effect-chip" :class="{ danger: !!game?.draw_stack }">
            <TriangleAlert v-if="game?.draw_stack" :size="18" />
            <Sparkles v-else :size="18" />
            <span>{{ tableEffect }}</span>
          </div>
        </div>
      </section>

      <div v-if="choice === 'color' || needsRouletteColor || mp.pendingDrawnWildCard" class="choice-panel" role="dialog" aria-label="Farbe wählen">
        <strong>RUNENFAMILIE WÄHLEN</strong>
        <p>Diese Farbe gilt nach deinem Spielzug.</p>
        <div class="colors">
          <button v-for="color in colors" :key="color" :class="color" @click="selectColor(color)">
            <component :is="colorIcons[color]" :size="21" /> {{ colorLabels[color] }}
          </button>
        </div>
      </div>

      <div v-else-if="needsSwap" class="choice-panel">
        <strong>HANDTAUSCH WÄHLEN</strong>
        <p>Wessen Hand möchtest du übernehmen?</p>
        <button v-for="player in swapTargets" :key="player.user_id" class="target" @click="mp.swapHands(player.user_id)">
          {{ player.name }} · {{ player.hand.length }} Karten
        </button>
        <button class="target ghost" @click="mp.skipSwap()">Hand behalten</button>
      </div>

      <div v-else-if="mp.pendingDiscardAllCards.length" class="choice-panel">
        <strong>OBERSTE KARTE WÄHLEN</strong>
        <p>Lege fest, welche Karte auf dem Tisch sichtbar bleibt.</p>
        <div class="discard-options">
          <button v-for="card in mp.pendingDiscardAllCards" :key="card.id" @click="mp.selectDiscardAllTop(card.id)">
            <Card :card="card" :size="{ width: 70, height: 101 }" />
          </button>
        </div>
      </div>

      <CouchHand
        :cards="myHand"
        :selected-card-id="selectedCardId"
        :can-play="canSelectCard"
        :disabled="mp.actionInProgress || isDecisionPending"
        @select="selectHandCard"
        @blocked="rejectHandCard"
      />

      <footer class="action-dock" :class="{ split: !!selectedCard }">
        <Transition name="feedback">
          <p v-if="feedback" class="action-feedback" :class="feedback.kind" role="status" aria-live="polite">
            <AlertCircle v-if="feedback.kind === 'error'" :size="17" />
            <CircleCheckBig v-else :size="17" />
            {{ feedback.text }}
          </p>
        </Transition>
        <button
          v-if="selectedCard"
          class="play-selected"
          :disabled="!canSelectCard(selectedCard) || mp.actionInProgress"
          @click="playSelectedCard"
        >
          <LoaderCircle v-if="mp.actionInProgress" class="spin" :size="21" />
          <Send v-else :size="21" />
          Karte ausspielen
        </button>
        <button class="draw-card" :disabled="!canUseTurnActions || mp.actionInProgress || !!selectedCard" @click="drawCard">
          <LoaderCircle v-if="mp.actionInProgress && pendingAction === 'draw'" class="spin" :size="21" />
          <Layers3 v-else :size="21" />
          {{ drawLabel }}
        </button>
        <button v-if="myHand.length <= 2 && status === 'playing'" class="rune-call" @click="mp.callUno()">
          <Zap :size="18" /> RUNE!
        </button>
      </footer>

      <div v-if="status === 'finished'" class="finish-card">
        <Crown :size="48" />
        <h2>{{ didWin ? 'DU HAST GEWONNEN' : `${winnerName} GEWINNT` }}</h2>
        <p>Die nächste Runde startet der TV-Host.</p>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch, type Component } from 'vue'
import { AlertCircle, CircleCheckBig, Crown, Flame, Leaf, Layers3, LoaderCircle, LogIn, Pencil, Send, ShieldCheck, Smartphone, Snowflake, Sparkles, Swords, TriangleAlert, UserRound, WifiOff, Zap } from 'lucide-vue-next'
import type { Card as CardType, CardColor } from '../../types/card'
import { canPlayCard } from '../../utils/gameRules'
import { couchStatusText, drawButtonLabel, nextCardSelection } from '../../utils/couchController'
import { useAuthStore } from '../../stores/authStore'
import { useMultiplayerStore } from '../../stores/multiplayerStore'
import Card from '../game/Card.vue'
import CouchHand from './CouchHand.vue'

const props = defineProps<{ roomCode: string }>()
const auth = useAuthStore()
const mp = useMultiplayerStore()
const name = ref('')
const renameValue = ref('')
const localError = ref('')
const joining = ref(false)
const selectedCardId = ref<string | null>(null)
const choice = ref<'color' | null>(null)
const pendingCard = ref<CardType | null>(null)
const pendingAction = ref<'play' | 'draw' | null>(null)
const feedback = ref<{ text: string; kind: 'info' | 'error' } | null>(null)
let feedbackTimer: ReturnType<typeof setTimeout> | null = null

const joined = computed(() => !!mp.currentGame && mp.roomCode === props.roomCode)
const game = computed(() => mp.currentGame)
const status = computed(() => game.value?.status ?? 'waiting')
const myHand = computed(() => mp.myPlayer?.hand ?? [])
const topCard = computed(() => { const pile = game.value?.discard_pile ?? []; return pile.length ? pile[pile.length - 1] : null })
const myPresence = computed(() => mp.presence.find(p => p.userId === mp.myUserId))
const myName = computed(() => myPresence.value?.name ?? name.value)
const isReady = computed(() => !!myPresence.value?.ready)
const isConnected = computed(() => mp.realtimeStatus === 'SUBSCRIBED')
const needsSwap = computed(() => game.value?.turn_state === 'CHOOSING_PLAYER_TO_SWAP' && mp.isMyTurn)
const needsRouletteColor = computed(() => game.value?.turn_state === 'CHOOSING_ROULETTE_COLOR' && mp.isMyTurn)
const isDecisionPending = computed(() => !!choice.value || needsRouletteColor.value || !!mp.pendingDrawnWildCard || needsSwap.value || !!mp.pendingDiscardAllCards.length)
const swapTargets = computed(() => mp.opponents.filter(p => !p.is_eliminated))
const winnerName = computed(() => mp.gamePlayers.find(p => p.user_id === game.value?.winner_id)?.name ?? 'Eine Rune')
const didWin = computed(() => game.value?.winner_id === mp.myUserId)
const activePlayerName = computed(() => mp.gamePlayers.find(p => p.user_id === game.value?.current_player_id)?.name)
const turnText = computed(() => status.value === 'finished' ? 'Partie beendet' : couchStatusText({ realtimeStatus: mp.realtimeStatus, turnState: game.value?.turn_state, isMyTurn: mp.isMyTurn, activePlayerName: activePlayerName.value, drawStack: game.value?.draw_stack ?? 0 }))
const canUseTurnActions = computed(() => isConnected.value && mp.isMyTurn && game.value?.turn_state === 'WAITING_FOR_ACTION' && !isDecisionPending.value)
const selectedCard = computed(() => myHand.value.find(card => card.id === selectedCardId.value) ?? null)
const drawLabel = computed(() => drawButtonLabel(game.value?.draw_stack ?? 0))

const colors = ['red', 'blue', 'green', 'yellow'] as const
const colorLabels: Record<typeof colors[number], string> = { red: 'FLAMME', blue: 'FROST', green: 'WALD', yellow: 'STURM' }
const colorSubline: Record<typeof colors[number], string> = { red: 'Flammenrunen', blue: 'Frostsiegel', green: 'Waldzeichen', yellow: 'Sturmglyphen' }
const colorIcons: Record<typeof colors[number], Component> = { red: Flame, blue: Snowflake, green: Leaf, yellow: Zap }
const activeColor = computed(() => colors.includes(game.value?.current_color as typeof colors[number]) ? game.value?.current_color as typeof colors[number] : 'red')
const activeColorLabel = computed(() => colorLabels[activeColor.value])
const activeColorSubline = computed(() => colorSubline[activeColor.value])
const activeColorIcon = computed(() => colorIcons[activeColor.value])
const effectNames: Partial<Record<CardType['type'], string>> = { skip: 'Spieler übersprungen', reverse: 'Richtung gewechselt', draw2: 'Ziehrune +2', draw4: 'Ziehrune +4', draw6: 'Ziehrune +6', draw10: 'Ziehrune +10', skipEveryone: 'Alle übersprungen', discardAll: 'Farbe abgelegt', wild: 'Farbe verwandelt', wildReverseDraw4: 'Wende +4', wildColorRoulette: 'Farbrad aktiv' }
const tableEffect = computed(() => game.value?.draw_stack ? `Ziehstapel: ${game.value.draw_stack} Karten` : topCard.value ? effectNames[(topCard.value as CardType).type] ?? '' : '')

onMounted(() => { const saved = localStorage.getItem(`rune_riot_couch_name_${props.roomCode}`); if (saved) { name.value = saved; void join() } })
onBeforeUnmount(() => { if (feedbackTimer) clearTimeout(feedbackTimer) })

watch(() => mp.actionInProgress, (active, wasActive) => {
  if (active || !wasActive || !pendingAction.value) return
  if (mp.error) showFeedback('Dieser Spielzug wurde abgewiesen. Deine Karte bleibt in der Hand.', 'error')
  else if (pendingAction.value === 'draw') showFeedback('Ziehvorgang abgeschlossen.', 'info')
  else { selectedCardId.value = null; showFeedback('Karte ausgespielt.', 'info') }
  pendingAction.value = null
})
watch(() => mp.error, error => { if (error === 'That move is not allowed') showFeedback('Diese Karte darf jetzt nicht gespielt werden.', 'error') })

async function join() {
  localError.value = ''
  const value = name.value.trim()
  const length = [...value].length
  if (length < 2 || length > 16) { localError.value = 'Bitte wähle einen Namen mit 2 bis 16 Zeichen.'; return }
  joining.value = true
  try {
    if (!auth.isAuthenticated) { const result = await auth.signInAnonymously(value); if (!result.success) { localError.value = result.error || 'Anmeldung fehlgeschlagen.'; return } }
    const result = await mp.joinCouchGame(props.roomCode, value)
    if (result) { localStorage.setItem(`rune_riot_couch_name_${props.roomCode}`, value); renameValue.value = value }
  } finally { joining.value = false }
}
function toggleReady() { mp.setReady(!isReady.value) }
function rename() { const value = renameValue.value.trim(); if ([...value].length < 2) return; name.value = value; localStorage.setItem(`rune_riot_couch_name_${props.roomCode}`, value); void mp.updateMyName(value) }
function canSelectCard(card: CardType) { return !!(canUseTurnActions.value && topCard.value && game.value && canPlayCard(card, topCard.value, game.value.current_color as CardColor, game.value.draw_stack, mp.stackingMode)) }
function selectHandCard(card: CardType) { selectedCardId.value = nextCardSelection(selectedCardId.value, card.id, canSelectCard(card)); showFeedback(selectedCardId.value ? 'Karte ausgewählt. Bestätige den Spielzug.' : 'Auswahl aufgehoben.', 'info') }
function rejectHandCard() { showFeedback(mp.isMyTurn ? 'Diese Karte passt nicht zur Tischkarte.' : 'Warte, bis du am Zug bist.', 'error') }
function playSelectedCard() { const card = selectedCard.value; if (!card || !canSelectCard(card) || mp.actionInProgress) return; if (card.color === 'wild') { pendingCard.value = card; choice.value = 'color'; return }; pendingAction.value = 'play'; void mp.playCard(card) }
function drawCard() { if (!canUseTurnActions.value || mp.actionInProgress) return; pendingAction.value = 'draw'; showFeedback(game.value?.draw_stack ? `Du ziehst ${game.value.draw_stack} Karten …` : 'Du ziehst eine spielbare Karte …', 'info'); void mp.drawCard() }
function selectColor(color: string) { const selected = color as CardColor; if (mp.pendingDrawnWildCard) { pendingAction.value = 'play'; void mp.playDrawnWildCard(selected) } else if (needsRouletteColor.value) void mp.setRouletteColor(selected); else if (pendingCard.value) { pendingAction.value = 'play'; void mp.playCard(pendingCard.value, selected) }; pendingCard.value = null; choice.value = null }
function showFeedback(text: string, kind: 'info' | 'error') { feedback.value = { text, kind }; if (feedbackTimer) clearTimeout(feedbackTimer); feedbackTimer = setTimeout(() => { feedback.value = null }, 2800) }
</script>

<style scoped>
.controller-shell{min-height:100dvh;color:#f3ead8;background:radial-gradient(circle at 50% 10%,#291a42,#09060e 46%,#030204);padding:12px 12px max(16px,env(safe-area-inset-bottom));overflow-x:hidden}.controller-shell.is-playing{box-sizing:border-box;height:100dvh;min-height:0;overflow:hidden}.controller-header{display:flex;justify-content:space-between;align-items:center;max-width:720px;margin:auto}.controller-header div:first-child{display:flex;flex-direction:column}.controller-header span{color:#d3ad55;font-weight:900;letter-spacing:.16em}.controller-header strong{font-size:.625rem;letter-spacing:.14em;color:#988ba2}.code{border:1px solid #6b526e;padding:8px 10px;font-weight:900;letter-spacing:.12em}.join-card,.lobby-card{max-width:440px;margin:8vh auto 0;padding:30px 24px;text-align:center;background:rgba(14,10,20,.92);border:1px solid rgba(202,164,79,.4);box-shadow:0 25px 70px #000}.kicker{font-size:.69rem;letter-spacing:.22em;color:#b79244;font-weight:900}.join-card h1,.lobby-card h1{font-family:var(--font-display);font-size:2.25rem;margin:8px 0 24px}.join-card label{display:block;text-align:left;color:#d6c9b5;font-size:.82rem}.join-card small{float:right;color:#817588}input{box-sizing:border-box;width:100%;margin-top:7px;padding:15px;background:#09070c;border:1px solid #564361;color:white;font-size:1.125rem;outline:none}input:focus{border-color:#d0aa51;box-shadow:0 0 0 3px rgba(208,170,81,.12)}button{font:inherit;cursor:pointer}.primary,.ready-button{width:100%;min-height:58px;margin-top:18px;border:1px solid #efd37c;background:linear-gradient(135deg,#d0aa50,#77531c);color:#0d0910;font-weight:900;letter-spacing:.1em;display:flex;align-items:center;justify-content:center;gap:10px}.primary:disabled{opacity:.5}.private{display:flex;gap:8px;justify-content:center;align-items:center;font-size:.75rem;color:#7fcfae;margin-top:20px}.error{color:#ff8e95;background:#2b0f18;padding:12px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{rotate:360deg}}.sigil{color:#c998ff}.rename{display:grid;grid-template-columns:1fr 48px;gap:5px}.rename input{margin:0}.rename button{border:1px solid #5a4569;background:#17101e;color:#d9c5e8}.players{display:flex;justify-content:space-between;margin:24px 0 0;padding:13px;border-block:1px solid #362a3e;color:#a99ab2}.ready-button.active{background:linear-gradient(135deg,#37d9a0,#14745a);border-color:#75f0c5}.wait-copy{color:#a596ad}
.game-controller{width:min(100%,760px);height:calc(100dvh - 24px - env(safe-area-inset-bottom));margin:0 auto;display:grid;grid-template-rows:43px 46px minmax(166px,1fr) 216px auto;gap:7px;position:relative;overflow:hidden}.player-hud{display:grid;grid-template-columns:minmax(0,1fr) auto auto;align-items:center;gap:10px;padding:4px 7px;border-bottom:1px solid rgba(202,164,79,.22)}.player-identity{min-width:0;display:flex;align-items:center;gap:8px;color:#cfa8ef}.player-identity div{min-width:0;display:flex;flex-direction:column}.player-identity span{font-size:.55rem;letter-spacing:.13em;color:#8f8297}.player-identity strong{font-size:.98rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.hand-count{display:flex;align-items:center;gap:4px;color:#cfb76f}.hand-count strong{font-size:1.1rem}.hand-count span{font-size:.62rem;text-transform:uppercase;color:#94889c}.hud-room{padding:5px 6px;border:1px solid #4e3e59;font-size:.65rem;font-weight:900;letter-spacing:.08em}.turn-banner{min-width:0;display:flex;align-items:center;justify-content:center;gap:8px;padding:9px;text-align:center;background:#17111d;border:1px solid #493652;color:#c2b6c7;font-size:.9rem}.turn-banner strong{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.turn-banner.active{background:#103329;border-color:#43efb4;color:#83ffd3;box-shadow:0 0 20px rgba(67,239,180,.14);animation:turn-glow 1.8s ease-in-out infinite alternate}.turn-banner.offline{background:#32131a;border-color:#a94151;color:#ffadb7}.table-focus{min-height:0;display:grid;grid-template-columns:132px minmax(0,1fr);gap:15px;align-items:center;padding:9px 11px;background:rgba(10,7,14,.86);border:1px solid #34283d}.table-card-wrap{align-self:stretch;display:flex;flex-direction:column;align-items:center;justify-content:center}.section-label{font-size:.58rem;letter-spacing:.15em;color:#96899e;font-weight:900}.table-card{position:relative;margin-top:5px}.penalty{position:absolute;right:-12px;top:-9px;z-index:5;min-width:39px;height:39px;display:grid;place-items:center;background:#ffca4d;color:#160f08;border:2px solid #fff0a8;border-radius:50%;font-weight:1000;box-shadow:0 0 18px rgba(255,202,77,.45)}.table-state{min-width:0;display:flex;flex-direction:column;gap:7px}.color-rune{display:flex;align-items:center;gap:10px;min-height:56px;padding:8px 10px;border:1px solid currentColor;background:rgba(14,10,19,.82)}.color-rune div{min-width:0;display:flex;flex-direction:column}.color-rune strong{font-size:1rem;letter-spacing:.08em}.color-rune span{font-size:.65rem;color:#c5b9c9}.color-red{color:#ff777c}.color-blue{color:#75baff}.color-green{color:#62e6a8}.color-yellow{color:#ffd466}.effect-chip{display:flex;align-items:center;gap:7px;min-height:35px;padding:6px 8px;background:#23172d;border:1px solid #6f5184;color:#dabaf3;font-size:.72rem;font-weight:800}.effect-chip.danger{background:#35240d;border-color:#d9a638;color:#ffd978}.choice-panel{position:fixed;z-index:50;left:max(12px,calc(50% - 370px));right:max(12px,calc(50% - 370px));bottom:max(86px,calc(env(safe-area-inset-bottom) + 78px));max-height:60dvh;overflow:auto;padding:17px;background:#130e1a;border:1px solid #b88ee1;box-shadow:0 -12px 55px rgba(0,0,0,.72);text-align:center}.choice-panel>strong{font-size:.78rem;letter-spacing:.15em;color:#d8b4ff}.choice-panel>p{margin:6px 0 12px;color:#a99caf;font-size:.78rem}.colors{display:grid;grid-template-columns:1fr 1fr;gap:8px}.colors button,.target{min-height:52px;border:1px solid rgba(255,255,255,.25);color:#fff;font-weight:900;display:flex;align-items:center;justify-content:center;gap:7px}.colors .red{background:#8d282d}.colors .blue{background:#234f88}.colors .green{background:#236546}.colors .yellow{background:#8d711d}.target{width:100%;background:#261b31;margin-top:8px}.target.ghost{background:transparent;color:#b4a6bd}.discard-options{display:flex;gap:8px;overflow:auto}.discard-options button{padding:0;border:0;background:none}.action-dock{position:relative;display:grid;grid-template-columns:1fr;gap:7px;min-height:66px;padding-top:1px}.action-dock.split{grid-template-columns:1.25fr 1fr}.play-selected,.draw-card{min-height:58px;border:1px solid;display:flex;align-items:center;justify-content:center;gap:8px;font-size:.76rem;font-weight:1000;text-transform:uppercase;letter-spacing:.055em}.play-selected{background:linear-gradient(135deg,#e0b75a,#76521a);border-color:#f4da86;color:#100b08}.draw-card{background:#21172a;border-color:#806193;color:#f1e7f5}.play-selected:disabled,.draw-card:disabled{filter:grayscale(.8);opacity:.38;cursor:default}.rune-call{position:absolute;right:2px;top:-51px;z-index:8;min-width:76px;height:42px;border:1px solid #ffca55;border-radius:999px;background:#48162a;color:#ffe491;font-size:.72rem;font-weight:1000;box-shadow:0 0 18px rgba(255,63,113,.25)}.action-feedback{position:absolute;left:4px;right:4px;bottom:calc(100% + 6px);z-index:12;margin:0;padding:8px 10px;display:flex;align-items:center;justify-content:center;gap:7px;background:#132a22;border:1px solid #3abe91;color:#9af1ce;font-size:.72rem;text-align:center;box-shadow:0 8px 24px #000}.action-feedback.error{background:#35131b;border-color:#d05264;color:#ffb0ba}.feedback-enter-active,.feedback-leave-active{transition:opacity .16s ease,transform .16s ease}.feedback-enter-from,.feedback-leave-to{opacity:0;transform:translateY(5px)}.finish-card{position:fixed;inset:0;z-index:60;background:rgba(5,3,7,.95);display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:22px}.finish-card svg{color:#e4b94d}.finish-card h2{font-family:var(--font-display);font-size:2.15rem}.finish-card p{color:#ad9db3}@keyframes turn-glow{from{box-shadow:0 0 7px rgba(67,239,180,.08)}to{box-shadow:0 0 22px rgba(67,239,180,.27)}}
@media(max-width:380px){.controller-shell{padding-inline:8px}.game-controller{height:calc(100dvh - 20px - env(safe-area-inset-bottom));grid-template-rows:41px 44px minmax(158px,1fr) 209px auto;gap:5px}.table-focus{grid-template-columns:125px minmax(0,1fr);gap:9px;padding:7px}.table-card{scale:.94}.color-rune{padding:6px 8px}.hud-room{display:none}.play-selected,.draw-card{font-size:.69rem}.action-dock.split{grid-template-columns:1.2fr 1fr}}
@media(max-height:700px){.game-controller{grid-template-rows:39px 42px minmax(143px,1fr) 184px auto;gap:4px}.table-card{scale:.84}.table-card-wrap{margin-block:-10px}.color-rune{min-height:47px}.effect-chip{min-height:30px}.action-dock{min-height:58px}.play-selected,.draw-card{min-height:52px}.rune-call{top:-44px;height:36px}}
@media(prefers-reduced-motion:reduce){.spin,.turn-banner.active{animation:none}.feedback-enter-active,.feedback-leave-active{transition:none}}
</style>
