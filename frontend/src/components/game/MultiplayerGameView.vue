<template>
  <div class="game-view" :class="{ 'shake-screen': isShakeActive }">
    <!-- Shared Background Elements -->
    <GameBackground :direction="direction" />

    <!-- Top Bar: All Opponents + audio/settings -->
    <SurveillanceBar>
      <OpponentChip
        v-for="opp in allOpponents"
        :key="opp.user_id"
        :uid="opp.user_id"
        :name="opp.name"
        :badge="mpBadges[opp.user_id]?.badge"
        :badge-points="mpBadges[opp.user_id]?.points"
        :badge-progress="mpBadges[opp.user_id]?.progress"
        :card-count="(opp.hand as Card[])?.length || 0"
        count-label="INTEL"
        :is-active="currentGame?.current_player_id === opp.user_id"
        :is-eliminated="mpStore.eliminatedIds.has(opp.user_id)"
        :is-disconnected="isDisconnected(opp.user_id)"
        :can-kick="mpStore.isHost && !mpStore.eliminatedIds.has(opp.user_id)"
        :in-voice="voiceStore.voiceUserIds.has(opp.user_id)"
        :is-speaking="voiceStore.speakingUserIds.has(opp.user_id)"
        :can-voice-mute="canVoiceMute(opp.user_id)"
        :voice-muted="voiceStore.localMutedUserIds.has(opp.user_id)"
        :voice-mute-title="voiceMuteTitle(opp.user_id)"
        @voice-mute="handleVoiceMute(opp.user_id)"
        @kick="requestKick(opp.user_id, opp.name)"
      />
      <template #controls>
        <button
          class="hud-exit"
          @click="leaveGame"
          aria-label="Leave game"
          title="Leave game"
        >
          <LogOut :size="16" :stroke-width="2" aria-hidden="true" />
        </button>
        <button
          class="hud-audio"
          :class="{ active: !soundEffects.isMuted.value }"
          @click="toggleSound"
          :aria-label="soundEffects.isMuted.value ? 'Unmute audio' : 'Mute audio'"
        >
          <span class="hud-audio-label">AUDIO</span>
          <span class="hud-audio-dot"></span>
        </button>
        <VoiceMicCluster :can-moderate="mpStore.isHost" />
        <SettingsButton />
      </template>
    </SurveillanceBar>

    <!-- Status ticker — own row between the bar and the pit; also carries the
         "who played what" action feed as its event text. -->
    <StatusPanel
      :current-player-name="currentPlayerName"
      :direction="direction"
      :draw-stack="drawStack"
      :current-color="currentColor"
      :message="statusMessage"
      :message-style="statusMessageStyle"
      :stacking-mode="mpStore.stackingMode"
      :turn-label="turnLabel"
      :turn-is-mine="isMyTurn"
      :action-text="actionFeed"
    />

    <!-- Main Game Table -->
    <BattlePit
      ref="battlePitRef"
      :show-draw-hint="isMyTurn && turnState === 'WAITING_FOR_ACTION'"
      :is-muted="soundEffects.isMuted.value"
      :current-color="currentColor"
      :direction="direction"
      :draw-stack="drawStack"
      :my-card-count="myHand.length"
      @draw="handleDraw"
    >
      <template #draw-pile>
        <CardPile :cards="deckDisplay" />
      </template>
      
      <template #discard-pile>
        <CardPile :cards="discardPile" :is-discard="true" :large="true" />
      </template>
    </BattlePit>

    <!-- My Hand -->
    <div
      class="floating-hand-wrapper"
      :class="{ 'is-my-turn': isMyTurn && turnState === 'WAITING_FOR_ACTION' }"
      ref="playerHandRef"
    >
      <HandFan
        v-if="visibleHand.length > 0 && showHand"
        :cards="visibleHand"
        :is-my-turn="isMyTurn"
        :can-play="canPlayFromHand"
        :disabled="showColorPicker"
        @play="handlePlayCard"
      />
    </div>

    <!-- Player Console Bar -->
    <PlayerConsoleBar
      :show-uno-button="showUnoButton"
      @call-uno="handleCallUno"
    >
      <!-- Catch an opponent who forgot to call Mercy -->
      <Transition name="catch-pop">
        <button
          v-if="caughtTarget"
          class="catch-btn"
          @click="mpStore.catchPlayer(caughtTarget.user_id)"
        >
          CAUGHT! {{ caughtTarget.name }} forgot RIOT
        </button>
      </Transition>
    </PlayerConsoleBar>

    <!-- Animated Card Layer (for flying cards) -->
    <div class="animation-layer" ref="animationLayer"></div>

    <!-- WebGL FX layer: particles, shockwaves, ambient heat (?fx=1 shows debug) -->
    <FxLayer />

    <!-- Stack cam: cinematic when the draw stack goes big -->
    <StackCam />

    <!-- Badge-up: in-room banner when any player crosses into a new badge -->
    <BadgeUpBanner />

    <!-- Quick chat: preset phrases relayed by the room, bubbles over seats -->
    <QuickChat />

    <!-- Color Picker Modal (for regular Wild cards) -->
    <ColorPickerModal 
      v-if="showColorPicker"
      title="WILD CARD"
      subtitle="CHOOSE COLOR"
      :color-counts="myColorCounts"
      @select="handleColorSelect"
    />

    <!-- Roulette Color Picker Modal (for victim choosing color) -->
    <ColorPickerModal
      v-if="turnState === 'CHOOSING_ROULETTE_COLOR' && isMyTurn"
      title="ROULETTE TRAP DETECTED"
      subtitle="CHOOSE YOUR FATE"
      :is-roulette="true"
      :color-counts="myColorCounts"
      @select="handleRouletteColorSelect"
    />

    <!-- Drawn Wild Card Color Picker -->
    <ColorPickerModal
      v-if="mpStore.pendingDrawnWildCard"
      title="WILD CARD DRAWN"
      subtitle="CHOOSE COLOR TO PLAY"
      :card="mpStore.pendingDrawnWildCard"
      :color-counts="myColorCounts"
      @select="handleDrawnWildColorSelect"
    />

    <!-- Player Select Modal (for Number 7 swap - shows all active opponents) -->
    <PlayerSelectModal
      v-if="turnState === 'CHOOSING_PLAYER_TO_SWAP' && isMyTurn"
      :eligible-players="allOpponents.filter(o => !mpStore.eliminatedIds.has(o.user_id)).map(o => ({ id: o.user_id, name: o.name, hand: (o.hand as Card[]) || [], isEliminated: false }))"
      @select="handleSwapPlayer"
      @skip="mpStore.skipSwap()"
    />

    <!-- Discard All Top Card Picker -->
    <DiscardAllPickerModal
      v-if="mpStore.pendingDiscardAllCards.length > 0"
      :cards="mpStore.pendingDiscardAllCards"
      @select="handleDiscardAllTopSelect"
    />


    <!-- Realtime reconnect pill -->
    <Transition name="rt-pill">
      <div
        v-if="mpStore.realtimeStatus !== 'SUBSCRIBED' && !opponentLeft"
        class="reconnect-pill"
        role="status"
        aria-live="polite"
      >
        <span class="rt-dot"></span>
        {{ mpStore.realtimeStatus === 'CONNECTING' ? 'CONNECTING…' : 'RECONNECTING…' }}
      </div>
    </Transition>

    <!-- Opponent Left -->
    <div v-if="opponentLeft" class="overlay">
      <div class="modal terminal-modal">
        <h1 class="glitch-text" data-text="DISCONNECTED">DISCONNECTED</h1>
        <p class="winner-text">OPPONENT LEFT THE GAME</p>
        <button @click="leaveFromGameOver" class="btn-primary">RETURN TO LOBBY</button>
      </div>
    </div>

    <!-- KO stinger: one dramatic beat the moment WE get knocked out, then
         the table settles into spectator chrome (or the game-over modal). -->
    <div v-if="showKO" class="ko-overlay" aria-hidden="true">
      <div class="ko-stamp">ELIMINATED</div>
      <div class="ko-sub">{{ koCards }} CARDS — CLAIMED BY RUIN</div>
    </div>

    <!-- You're out, but the round plays on — spectate or bail. Non-blocking
         HUD so the table stays fully watchable. -->
    <div v-if="amEliminated && gameStatus === 'playing' && !showKO" class="spectator-hud" role="status">
      <span class="spectator-hud__dot" aria-hidden="true"></span>
      <span class="spectator-hud__label">SPECTATING</span>
      <span class="spectator-hud__meta">{{ mpStore.playersLeft }} STILL IN</span>
      <button class="spectator-hud__leave" @click="leaveGame">LEAVE</button>
    </div>

    <GameOverModal
      v-if="gameStatus === 'finished' && !opponentLeft && !showKO"
      :is-winner="isMpWinner"
      :winner-name="winnerName"
      :opponent-name="opponentDisplayName"
      :stats="mpGameStats"
      :is-anonymous="authStore.isAnonymous"
      mode="mp"
      :can-rematch="mpStore.isHost"
      :notice="mpStore.error"
      :is-spectator="amEliminated"
      :placement="mpStore.myPlacement"
      :total-players="mpStore.gamePlayers.length"
      :opponents="finishedOpponents"
      @rematch="handleGameOverPrimary"
      @back-to-lobby="leaveFromGameOver"
      @upgrade-account="handleUpgrade"
    />

    <!-- Spectators have nothing to forfeit — the confirm only guards
         against losing their seat in the host's next rematch. -->
    <ConfirmDialog
      :open="showLeaveConfirm"
      :title="amEliminated ? 'Stop watching?' : 'Leave the game?'"
      :message="amEliminated
        ? 'You\'ll return to the lobby. Stick around instead and the host\'s rematch deals you back in.'
        : 'You\'ll forfeit this round and return to the lobby. You can rejoin from the same device while the game is live.'"
      confirm-label="LEAVE"
      :cancel-label="amEliminated ? 'KEEP WATCHING' : 'STAY'"
      @confirm="confirmLeave"
      @cancel="showLeaveConfirm = false"
    />

    <ConfirmDialog
      :open="!!kickTarget"
      title="Remove this player?"
      :message="`${kickTarget?.name ?? 'This player'} will be removed from the game. Play continues without them.`"
      confirm-label="REMOVE"
      cancel-label="CANCEL"
      @confirm="confirmKick"
      @cancel="kickTarget = null"
    />
  </div>
</template>

<script setup lang="ts">
import { LogOut } from 'lucide-vue-next'
import { ref, computed, watch, provide, onMounted, onUnmounted } from 'vue'
import { music } from '../../composables/useMusic'
import { useMultiplayerStore } from '../../stores/multiplayerStore'
import { useAuthStore } from '../../stores/authStore'
import { useVoiceStore } from '../../stores/voiceStore'
import { soundEffects } from '../../composables/useSoundEffects'
import { useCardAnimations } from '../../composables/useCardAnimations'
import { useBadges } from '../../composables/useBadges'
import { preloadCardImages } from '../../utils/preloadCardImages'
import CardPile from './CardPile.vue'
import HandFan from './HandFan.vue'
import OpponentChip from './OpponentChip.vue'
import ColorPickerModal from './ColorPickerModal.vue'
import PlayerSelectModal from './PlayerSelectModal.vue'
import DiscardAllPickerModal from './DiscardAllPickerModal.vue'
import GameBackground from './GameBackground.vue'
import SurveillanceBar from './SurveillanceBar.vue'
import SettingsButton from '../SettingsButton.vue'
import VoiceMicCluster from './VoiceMicCluster.vue'
import BattlePit from './BattlePit.vue'
import StatusPanel from './StatusPanel.vue'
import PlayerConsoleBar from './PlayerConsoleBar.vue'
import GameOverModal from './GameOverModal.vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import FxLayer from './FxLayer.vue'
import StackCam from './StackCam.vue'
import BadgeUpBanner from './BadgeUpBanner.vue'
import QuickChat from '../QuickChat.vue'
import { useBadgeUp } from '../../composables/useBadgeUp'
import type { Card, CardColor } from '../../types/card'
import { canPlayCard } from '../../utils/gameRules'
import { countByColor } from '../../utils/gameHelpers'
import { useStackEscalation } from '../../composables/useStackEscalation'
import { playDealerIntro } from '../../composables/useDealerIntro'
import { useRetentionStore } from '../../stores/retentionStore'
import { animateOpponentThrow, skipEveryoneShockwave, showTurnBanner, pulseSeat } from '../../composables/useGameFeel'
import { useGameFx, type FxColor } from '../../composables/fx/useGameFx'
import { useHeatWiring, useWildFloodWiring, useStackCamWiring, slamMagnitude, STACK_CAM_THRESHOLD } from '../../composables/fx/useFxWiring'

const emit = defineEmits<{ (e: 'claim-account'): void }>()

const mpStore = useMultiplayerStore()
const authStore = useAuthStore()
const voiceStore = useVoiceStore()

// One speaker button per seat: hosts cut the mic for the whole room (shown
// while the target is unmuted), everyone else silences the seat locally.
function canVoiceMute(userId: string): boolean {
  if (!voiceStore.voiceUserIds.has(userId)) return false
  return mpStore.isHost ? voiceStore.unmutedUserIds.has(userId) : true
}
function voiceMuteTitle(userId: string): string {
  if (mpStore.isHost) return 'Mute for everyone'
  return voiceStore.localMutedUserIds.has(userId) ? 'Unmute for me' : 'Mute for me'
}
function handleVoiceMute(userId: string) {
  if (mpStore.isHost) void voiceStore.muteParticipant(userId)
  else voiceStore.toggleMuteForMe(userId)
}
const { animateFlyingCard, animateDrawCardsStaggered, killAllFlyingCards } = useCardAnimations()

const isShakeActive = ref(false)
const showColorPicker = ref(false)
const pendingCard = ref<Card | null>(null)

// Transient "who played what" feed, driven by the store's broadcast action feed.
// An opponent caught on 1 card without calling UNO — we can penalize them.
const caughtTarget = computed(() => {
  const id = mpStore.catchableUserId
  if (!id || id === authStore.user?.id) return null
  const p = mpStore.gamePlayers.find(pl => pl.user_id === id)
  if (!p || ((p.hand as Card[])?.length || 0) !== 1) return null
  return p
})

// UNO is callable on our turn at 1-2 cards, and ALSO while we're exposed in a
// catch window (we played to 1 without calling — the turn has moved on, but
// calling still saves us before an opponent's catch lands).
const showUnoButton = computed(() => {
  if (myPlayer.value?.has_called_uno) return false
  if (mpStore.catchableUserId && mpStore.catchableUserId === myPlayer.value?.user_id) return true
  return (myHand.value.length === 2 || myHand.value.length === 1) && isMyTurn.value
})

const actionFeed = ref('')
let actionFeedTimer: ReturnType<typeof setTimeout> | null = null
watch(() => mpStore.lastAction, (a) => {
  if (!a?.text) return
  actionFeed.value = a.text
  if (actionFeedTimer) clearTimeout(actionFeedTimer)
  actionFeedTimer = setTimeout(() => { actionFeed.value = '' }, 2600)
})

// Animation refs
const battlePitRef = ref<InstanceType<typeof BattlePit> | null>(null)
const discardAreaRef = computed(() => battlePitRef.value?.discardAreaRef || null)
const animationLayer = ref<HTMLElement | null>(null)
const playerHandRef = ref<HTMLElement | null>(null)

// Provide refs for child components
provide('discardAreaRef', discardAreaRef)
provide('animationLayer', animationLayer)

// Track previous hand sizes for animation detection
const prevMyHandLength = ref(0)
const prevOpponentHandLengths = ref<Record<string, number>>({})

// Track if we're in initial deal animation mode
const isInitialDeal = ref(false)
const showHand = ref(false)  // Controls hand visibility during initial deal animation
const visibleCardCount = ref(0)  // How many cards to show (for progressive reveal during draw)

// Visible hand - only show cards up to visibleCardCount
const visibleHand = computed(() => {
  const hand = myHand.value
  // If not animating, show all cards
  if (visibleCardCount.value >= hand.length || visibleCardCount.value === 0) {
    return hand
  }
  // During animation, show only the visible portion
  return hand.slice(0, visibleCardCount.value)
})

// Computed from store
const myPlayer = computed(() => mpStore.myPlayer)
const allOpponents = computed(() => mpStore.opponents)

// Badges for every seat — fetched once via player_points as ids become known.
const { badges: mpBadges, fetchBadges } = useBadges()
watch(
  () => [myPlayer.value?.user_id, ...allOpponents.value.map(o => o.user_id)].filter(Boolean) as string[],
  (ids) => { if (ids.length) void fetchBadges(ids) },
  { immediate: true },
)
const myHand = computed(() => (myPlayer.value?.hand as Card[]) || [])
const myColorCounts = computed(() => countByColor(myHand.value))
const isMyTurn = computed(() => mpStore.isMyTurn)
const gameStatus = computed(() => mpStore.gameStatus)
const opponentLeft = computed(() => mpStore.opponentLeft)
const amEliminated = computed(() =>
  !!myPlayer.value && mpStore.eliminatedIds.has(myPlayer.value.user_id)
)

const currentGame = computed(() => mpStore.currentGame)
const direction = computed(() => currentGame.value?.direction || 1)
const drawStack = computed(() => currentGame.value?.draw_stack || 0)
useStackEscalation(drawStack)
const fx = useGameFx()
const badgeUp = useBadgeUp()

// Another seat's badge-up arrived over the wire — show it to this client too.
watch(() => mpStore.lastBadgeUp, (b) => {
  if (b) fx.emit('badgeUp', { name: b.name, tier: b.tier, self: false })
})
// Ambient table heat rises with the stack and the local hand's mercy proximity
useHeatWiring(() => drawStack.value, () => myHand.value.length)
const currentColor = computed(() => (currentGame.value?.current_color || 'red') as CardColor)
const turnState = computed(() => currentGame.value?.turn_state || 'WAITING_FOR_ACTION')
const discardPile = computed(() => (currentGame.value?.discard_pile as Card[]) || [])
const topCard = computed(() => discardPile.value[discardPile.value.length - 1])
// Colour flood when a wild's colour is chosen
useWildFloodWiring(() => currentColor.value, () => topCard.value?.color)
// Stack cam: light up while the draw stack is at cinematic size
useStackCamWiring(() => drawStack.value, () => currentColor.value)

// Server-tagged FX signals: the DO tells us who ate a +N stack and who called
// Mercy (the client can't derive these — the snapshot arrives after the turn has
// already advanced). Spray the stack into the victim's seat; flare the caller's.
watch(() => mpStore.lastStackEaten, (e) => {
  if (!e) return
  const discardEl = discardAreaRef.value
  const seatEl = e.playerId === authStore.user?.id ? playerHandRef.value : opponentChipEl(e.playerId)
  if (discardEl && seatEl) {
    fx.emit('stackSpray', { fromEl: discardEl, toEl: seatEl, color: currentColor.value as FxColor, count: e.amount })
  }
  if (e.amount >= STACK_CAM_THRESHOLD) {
    const name = e.playerId === authStore.user?.id
      ? 'YOU'
      : (mpStore.gamePlayers.find(p => p.user_id === e.playerId)?.name ?? '')
    fx.emit('stackCamReveal', { amount: e.amount, color: currentColor.value as FxColor, victimEl: seatEl, victimName: name })
  }
})
watch(() => mpStore.lastMercyCall, (e) => {
  if (!e) return
  const seatEl = e.playerId === authStore.user?.id ? playerHandRef.value : opponentChipEl(e.playerId)
  if (seatEl) fx.emit('impact', { originEl: seatEl, color: 'yellow', power: true })
})
// KO beat on each elimination; confetti when I win.
watch(() => mpStore.eliminationOrder.length, (now, prev) => {
  if (now > prev) fx.emit('ko', {})
})
watch(() => currentGame.value?.winner_id, (id, prev) => {
  if (id && !prev && isMpWinner.value) fx.emit('confetti', { originEl: discardAreaRef.value })
})

const currentPlayerName = computed(() => {
  if (!currentGame.value?.current_player_id) return 'Unknown'
  if (currentGame.value.current_player_id === authStore.user?.id) return 'You'
  const player = mpStore.gamePlayers.find(p => p.user_id === currentGame.value?.current_player_id)
  return player?.name || 'Opponent'
})

const winnerName = computed(() => {
  if (!currentGame.value?.winner_id) return 'Unknown'
  if (currentGame.value.winner_id === authStore.user?.id) return 'YOU!'
  const winner = mpStore.gamePlayers.find(p => p.user_id === currentGame.value?.winner_id)
  return winner?.name || 'Opponent'
})

// Always the "other side" — loser when we won, winner when we lost. Used in
// the share-image sub-line so it never reads "I broke You."
const opponentDisplayName = computed(() => {
  const meId = authStore.user?.id
  if (!meId) return 'opponent'
  const winnerId = currentGame.value?.winner_id
  const otherId = winnerId === meId
    ? mpStore.gamePlayers.find(p => p.user_id !== meId)?.user_id
    : winnerId
  const other = mpStore.gamePlayers.find(p => p.user_id === otherId)
  return other?.name || 'opponent'
})

// Everyone at the table except you, for the game-over ADD chips. Names come
// from the same roster the scoreboard uses, so a rename mid-match is honoured.
const finishedOpponents = computed(() => {
  const meId = authStore.user?.id
  if (!meId) return []
  return mpStore.gamePlayers
    .filter(p => p.user_id !== meId && !!p.user_id)
    .map(p => ({ userId: p.user_id, name: p.name || 'PLAYER' }))
})

const isMpWinner = computed(() => currentGame.value?.winner_id === authStore.user?.id)

const mpGameStats = computed(() => {
  const s = mpStore.mpStats
  if (!s) return undefined
  return {
    cardsPlayed: s.cardsPlayedTotal || 0,
    biggestStack: s.biggestStackSurvived || 0,
    unosCalled: s.unoCalls || 0,
    peakHand: s.peakCards || 0,
  }
})

// Display deck (just show a placeholder array for the pile)
const deckDisplay = computed(() => {
  const count = (currentGame.value?.deck as any[])?.length || 0
  return Array(count).fill({ id: 'deck', color: 'wild', type: 'wild' })
})

// Always-visible, plain-language turn ownership. Reinforces the ambient glow
// and tells you a slow opponent isn't a frozen game.
const turnLabel = computed(() => {
  if (gameStatus.value !== 'playing') return ''
  if (isMyTurn.value) return 'YOUR TURN'
  const name = currentPlayerName.value
  return name && name !== 'Unknown' ? `${name}'S TURN` : 'OPPONENT’S TURN'
})

// True when it's my normal turn and I genuinely have nothing to play, so the
// only legal move is to draw — surfaced so the player isn't left wondering.
const mustDraw = computed(() => {
  if (!isMyTurn.value || turnState.value !== 'WAITING_FOR_ACTION') return false
  if (drawStack.value > 0) return false
  const top = topCard.value
  if (!top) return false
  return !myHand.value.some(c => canPlayCard(c, top, currentColor.value, 0, mpStore.stackingMode))
})

const statusMessage = computed(() => {
  if (mustDraw.value) return 'NO PLAYABLE CARD — TAP THE DECK TO DRAW'
  if (turnState.value === 'CHOOSING_PLAYER_TO_SWAP' && isMyTurn.value) return 'SELECT PLAYER TO SWAP HANDS'
  if (turnState.value === 'CHOOSING_PLAYER_TO_SWAP' && !isMyTurn.value) return 'OPPONENT IS CHOOSING SWAP TARGET...'
  if (turnState.value === 'CHOOSING_ROULETTE_COLOR' && isMyTurn.value) return 'INCOMING ROULETTE! CHOOSE YOUR FATE'
  if (turnState.value === 'CHOOSING_ROULETTE_COLOR' && !isMyTurn.value) return 'ROULETTE: WAITING FOR VICTIM...'
  if (turnState.value === 'ROULETTE_DRAWING') {
    const target = (currentGame.value?.roulette_target_color || currentColor.value).toUpperCase()
    return isMyTurn.value ? `DANGER: SEEKING ${target}` : `${currentPlayerName.value} SEEKING ${target}...`
  }
  if (drawStack.value > 0 && isMyTurn.value) return `WARNING: DRAW ${drawStack.value} OR STACK HIGHER!`
  // No off-turn stack ticker: the +N STACK centerpiece already says it.
  return ''
})

const statusMessageStyle = computed(() => {
  if (turnState.value === 'ROULETTE_DRAWING') {
    const colorMap: Record<string, string> = {
      red: '#ff5555', blue: '#5555ff', green: '#55ff55', yellow: '#ffff55'
    }
    const target = currentGame.value?.roulette_target_color || currentColor.value
    return { color: colorMap[target] || '#fff', textShadow: `0 0 10px ${colorMap[target] || '#fff'}` }
  }
  if (drawStack.value > 0) {
    return { color: '#ff3333', textShadow: '0 0 10px rgba(255, 51, 51, 0.6)' }
  }
  return {}
})

function opponentChipEl(userId: string): HTMLElement | null {
  return document.querySelector(`.opponent-card[data-uid="${userId}"]`)
}

// Seat-to-pile throw when a remote opponent plays. The store sends the action
// broadcast just before the provisional state broadcast (action-before-state),
// so the clone is already flying when the pile updates beneath it — and the
// slam suppression is set before CardPile's length watcher fires. This ordering
// is load-bearing: if the action ever moves back to the post-commit path (as it
// briefly did), the pile pops the card first and the throw arrives a commit-RTT
// late, double-rendering. Keep them together on the provisional path.
watch(() => mpStore.lastRemotePlay, (play) => {
  if (!play || gameStatus.value !== 'playing') return
  const discardEl = discardAreaRef.value
  const fromEl = opponentChipEl(play.userId)
  const isPowerCard = play.card.color === 'wild' || play.card.type.includes('draw') || play.card.type === 'skipEveryone'

  if (fromEl && discardEl && animationLayer.value) {
    mpStore.suppressDiscardSlam = true
    animateOpponentThrow({
      fromEl,
      toEl: discardEl,
      card: play.card,
      layer: animationLayer.value,
      onImpact: () => {
        // Land sound is fired centrally by the topCard watcher (once per play).
        fx.emit('impact', { originEl: discardEl, color: play.card.color, power: isPowerCard })
        if (isPowerCard) fx.emit('slam', { originEl: discardEl, color: play.card.color, magnitude: slamMagnitude(play.card) })
      }
    })
  }

  if (play.card.type === 'skipEveryone' && discardEl) {
    const victims = allOpponents.value
      .filter(o => !mpStore.eliminatedIds.has(o.user_id) && o.user_id !== play.userId)
      .map(o => opponentChipEl(o.user_id))
      .filter((el): el is HTMLElement => !!el)
    setTimeout(() => skipEveryoneShockwave(discardEl, victims), 480)
  }
})

// Skip Everyone payoff for our own play — fires as our flying clone lands.
function triggerOwnSkipEveryone(card: Card) {
  if (card.type !== 'skipEveryone' || !discardAreaRef.value) return
  const discardEl = discardAreaRef.value
  const victims = allOpponents.value
    .filter(o => !mpStore.eliminatedIds.has(o.user_id))
    .map(o => opponentChipEl(o.user_id))
    .filter((el): el is HTMLElement => !!el)
  setTimeout(() => skipEveryoneShockwave(discardEl, victims), 480)
}

// Turn handoff — banner the FIRST time the turn lands on us each game
// (orientation moment), seat pulse when it lands on an opponent. The
// persistent turn pill + hand glow cover every handoff after that.
let turnBannerShown = false
watch(gameStatus, (now, prev) => {
  if (prev === 'waiting' && now === 'playing') turnBannerShown = false
})
watch(isMyTurn, (mine, was) => {
  if (mine && !was && gameStatus.value === 'playing' && !isInitialDeal.value && !turnBannerShown) {
    turnBannerShown = true
    showTurnBanner()
  }
})
watch(() => currentGame.value?.current_player_id, (id, prev) => {
  if (!id || id === prev || gameStatus.value !== 'playing') return
  if (id !== authStore.user?.id) pulseSeat(opponentChipEl(id))
})

// Watch for draw stack increases - shake screen on any increase
// (the special-card sting is fired centrally by the topCard watcher below)
watch(drawStack, (newVal, oldVal) => {
  if (newVal > oldVal && newVal >= 2) {
    isShakeActive.value = true
    setTimeout(() => isShakeActive.value = false, 500)
  }
})

// Central land/special sound source: fires once for every play, own or remote.
// topCard changes on our optimistic discard update and on realtime updates from
// other players — mirroring single-player, where gameStore.playCard owns it.
// HandFan fires only the throw sound; the land/special sting lives here.
watch(topCard, (newTop, oldTop) => {
  if (isInitialDeal.value) return
  if (!newTop || newTop.id === oldTop?.id) return
  soundEffects.playCardLand()
  if (newTop.color === 'wild' || newTop.type.includes('draw') || newTop.type === 'skip' || newTop.type === 'reverse') {
    soundEffects.playSpecialCard()
  }
})

// Auto-close modals on game end or opponent leaving
watch([gameStatus, opponentLeft], () => {
  if (gameStatus.value === 'finished' || opponentLeft.value) {
    showColorPicker.value = false
    pendingCard.value = null
  }
})

// KO stinger: fires once per own elimination, holds the game-over modal
// back for its beat (2-player knockouts end the game in the same batch).
const showKO = ref(false)
const koCards = ref(0)
let koTimer: ReturnType<typeof setTimeout> | null = null
watch(() => mpStore.selfEliminated, (ko) => {
  if (!ko) { showKO.value = false; return }
  // Peak hand at this instant IS the hand that broke the mercy rule.
  koCards.value = mpStore.mpStats.peakCards
  showKO.value = true
  showColorPicker.value = false
  pendingCard.value = null
  isShakeActive.value = true
  setTimeout(() => { isShakeActive.value = false }, 500)
  soundEffects.playSpecialCard()
  if (koTimer) clearTimeout(koTimer)
  koTimer = setTimeout(() => { showKO.value = false }, 1600)
})

// Bumped on every new draw reveal. An in-flight loop bails the moment a newer
// draw starts, so two overlapping reveals (rapid forced draws / a realtime
// resync mid-draw) can't interleave writes to visibleCardCount and pop cards
// in and out — the latest draw owns the progressive reveal.
let drawRevealGen = 0

// Flying card animation function - now async and syncs with card reveal
async function triggerDrawAnimation(targetEl: HTMLElement | null, count: number, startingVisibleCount: number): Promise<void> {
  const myGen = ++drawRevealGen
  const deckEl = document.querySelector('.draw-station .card-pile') as HTMLElement
  if (!targetEl || !deckEl) {
    // No animation possible, just show all cards
    visibleCardCount.value = startingVisibleCount + count
    return
  }

  // Animate each card one by one using composable
  for (let i = 0; i < count; i++) {
    if (myGen !== drawRevealGen) return // superseded by a newer draw

    // Play sound for this card
    soundEffects.playCardPick()

    // Animate using composable
    await animateFlyingCard(deckEl, targetEl, { duration: 0.3 })

    if (myGen !== drawRevealGen) return // superseded mid-flight

    // Increment visible count so the real card appears
    visibleCardCount.value = startingVisibleCount + i + 1

    // Small delay between cards
    if (i < count - 1) {
      await new Promise(r => setTimeout(r, 50))
    }
  }
}

// Animate initial deal: deal cards one by one with staggered timing
async function animateInitialDeal(target: HTMLElement | null, cardCount: number): Promise<void> {
  const deckEl = document.querySelector('.draw-station .card-pile') as HTMLElement
  if (!target || !deckEl) return

  // Animate each card with sound played before animation
  for (let i = 0; i < cardCount; i++) {
    soundEffects.playCardPick()
    await animateFlyingCard(deckEl, target, { duration: 0.3 })
    
    // Small delay between cards
    if (i < cardCount - 1) {
      await new Promise(r => setTimeout(r, 80))
    }
  }
}

// Local flag to prevent duplicate initial deal animations
let hasRunInitialDealAnimation = false

// Watch for game status change to trigger initial deal animation
watch(gameStatus, async (newStatus, oldStatus) => {
  if (oldStatus === 'waiting' && newStatus === 'playing' && !hasRunInitialDealAnimation) {
    hasRunInitialDealAnimation = true
    isInitialDeal.value = true

    // Wait a moment for DOM to update
    await new Promise(r => setTimeout(r, 200))

    // Dealer ceremony before the deal
    await playDealerIntro()

    // Animate dealing to player hand
    const myHandCount = myHand.value.length
    if (myHandCount > 0 && playerHandRef.value) {
      await animateInitialDeal(playerHandRef.value, myHandCount)
    }

    // Update tracking after initial deal
    prevMyHandLength.value = myHand.value.length
    for (const opp of allOpponents.value) {
      prevOpponentHandLengths.value[opp.user_id] = (opp.hand as Card[])?.length || 0
    }

    isInitialDeal.value = false
  }
})

// Watch for my hand size increases to animate draws
// Use getter function to watch the length directly for more reliable detection
watch(
  () => myHand.value.length,
  (newLen, oldLen) => {
    
    // Skip animation during initial deal animation
    if (isInitialDeal.value) {
      return
    }
    
    // Only animate if cards increased (a draw happened) and we had cards before
    if (newLen > (oldLen ?? 0) && (oldLen ?? 0) > 0) {
      const count = newLen - (oldLen ?? 0)
      // Set visible count to old value (freeze current display)
      const startingCount = oldLen ?? 0
      visibleCardCount.value = startingCount
      // Animate draw and progressively reveal cards
      triggerDrawAnimation(playerHandRef.value, count, startingCount)
    }
  }
)

// Watch all opponents for hand size changes to animate their draws
watch(
  () => allOpponents.value.map(o => ({ id: o.user_id, len: (o.hand as Card[])?.length || 0 })),
  (newVals) => {
    if (isInitialDeal.value) return

    for (const { id, len } of newVals) {
      const oldLen = prevOpponentHandLengths.value[id] || 0
      if (len > oldLen && oldLen > 0) {
        const count = len - oldLen
        // Target the specific opponent's card element
        const opponentEl = document.querySelector(`.opponent-card[data-uid="${id}"]`) as HTMLElement
          || document.querySelector('.opponent-card') as HTMLElement
        if (opponentEl) {
          triggerOpponentDrawAnimation(opponentEl, count)
        }
      }
      prevOpponentHandLengths.value[id] = len
    }
  }
)

// Separate animation for opponent (visual only, no card reveal sync)
function triggerOpponentDrawAnimation(targetEl: HTMLElement, count: number) {
  const deckEl = document.querySelector('.draw-station .card-pile') as HTMLElement
  if (!targetEl || !deckEl) return

  // Play sound once for the draw action
  soundEffects.playCardPick()

  // Use composable for staggered animation (visual only)
  animateDrawCardsStaggered(deckEl, targetEl, count, {
    duration: 0.3,
    staggerDelay: 0.12
  })
}

// Stop music on unmount (game exit, opponent leaves, etc.) and kill any
// flying-card clones still in flight on document.body.
onUnmounted(() => {
  music.stop()
  killAllFlyingCards()
  if (koTimer) clearTimeout(koTimer)
})

// Music starts when game enters 'playing'; ducks on 'finished'.
const retention = useRetentionStore()
// gameStatus is derived from realtime broadcasts, which can thrash
// (finished → playing → finished on reordered packets) — record each game
// id once or the lifetime stats double-count.
const recordedGameIds = new Set<string>()
watch(gameStatus, (now, prev) => {
  if (now === 'playing' && prev !== 'playing') {
    music.start()
  } else if (now === 'finished' && prev !== 'finished') {
    music.duck()
    // Persist lifetime stats once per game-end.
    const gameId = mpStore.currentGame?.id
    if (gameId && recordedGameIds.has(gameId)) return
    if (gameId) recordedGameIds.add(gameId)
    const s: any = (mpStore as any).mpStats?.value || (mpStore as any).mpStats
    if (s) {
      retention.recordGameResult({
        won: isMpWinner.value,
        cardsPlayed: s.cardsPlayedTotal || 0,
        biggestStackSurvived: s.biggestStackSurvived || 0,
        unoCalls: s.unoCalls || 0,
        peakHand: s.peakCards || 0,
        mode: 'mp',
      })
      // Badge-up: if this game crossed a tier, celebrate here and tell the room.
      const nb = badgeUp.crossed({
        won: isMpWinner.value,
        completedLoss: !isMpWinner.value,
        cardsPlayedTotal: s.cardsPlayedTotal || 0,
        drawCardsPlayed: s.drawCardsPlayed || 0,
        biggestStackSurvived: s.biggestStackSurvived || 0,
        unoCalls: s.unoCalls || 0,
      })
      if (nb) {
        fx.emit('badgeUp', { name: myPlayer.value?.name ?? 'You', tier: nb.tier, self: true })
        mpStore.sendBadgeUp(nb.tier)
      }
    }
  }
})

// Initialize component and run initial deal animation if needed
onMounted(async () => {
  preloadCardImages()
  void badgeUp.snapshotBaseline()
  // If we landed straight into a playing game (refresh / deep link), kick off music.
  if (gameStatus.value === 'playing') music.start()

  // If game is already playing and we have cards, run initial deal animation
  if (gameStatus.value === 'playing' && myHand.value.length > 0) {
    isInitialDeal.value = true
    showHand.value = false  // Hide cards initially

    // Wait for DOM to be ready
    await new Promise(r => setTimeout(r, 100))

    // Dealer ceremony — riffle the deck before any cards fly to the hand
    await playDealerIntro()

    // Animate dealing cards to player hand
    const cardCount = myHand.value.length
    if (playerHandRef.value) {
      await animateInitialDeal(playerHandRef.value, cardCount)
    }
    
    // Show the real hand after animation
    showHand.value = true
    isInitialDeal.value = false
  } else {
    // No animation needed, just show hand
    showHand.value = true
  }
})

async function handlePlayCard(card: Card) {
  if (!isMyTurn.value) return
  
  // Check if wild card needs color selection
  if (card.color === 'wild' && card.type !== 'wildColorRoulette') {
    pendingCard.value = card
    showColorPicker.value = true
    return
  }
  
  // HandFan fires the throw sound; the topCard watcher fires land/special.
  mpStore.suppressDiscardSlam = true
  triggerOwnSkipEveryone(card)
  await mpStore.playCard(card)
}

async function handleColorSelect(color: CardColor) {
  showColorPicker.value = false
  if (pendingCard.value) {
    mpStore.suppressDiscardSlam = true
    await mpStore.playCard(pendingCard.value, color)
    pendingCard.value = null
  }
}

// Predicate handed to HandFan so it can style/gate cards without owning game state.
function canPlayFromHand(card: Card): boolean {
  if (!isMyTurn.value || !topCard.value) return false
  return canPlayCard(card, topCard.value, currentColor.value, drawStack.value, mpStore.stackingMode)
}

// Handler for roulette color selection (victim choosing their fate)
async function handleRouletteColorSelect(color: CardColor) {
  await mpStore.setRouletteColor(color)
}

// Handler for drawn wild card color selection
async function handleDrawnWildColorSelect(color: CardColor) {
  await mpStore.playDrawnWildCard(color)
}

// Handler for player swap (Number 7 card)
async function handleSwapPlayer(playerId: string) {
  await mpStore.swapHands(playerId)
}

// Handler for Discard All top card selection
async function handleDiscardAllTopSelect(cardId: string) {
  await mpStore.selectDiscardAllTop(cardId)
}

async function handleDraw() {
  if (!isMyTurn.value) return
  // Sound is now played by the animation watcher
  await mpStore.drawCard()
}

async function handleCallUno() {
  await mpStore.callUno()
}

function toggleSound() {
  // Keep SFX and music mutes in step until the proper settings drawer ships.
  soundEffects.toggleMute()
  music.toggleMute()
}

function isDisconnected(userId: string) {
  return mpStore.disconnectedUserIds.includes(userId)
}

const kickTarget = ref<{ id: string; name: string } | null>(null)

function requestKick(userId: string, name: string) {
  kickTarget.value = { id: userId, name }
}

async function confirmKick() {
  const target = kickTarget.value
  kickTarget.value = null
  if (target) await mpStore.kickPlayer(target.id)
}

const showLeaveConfirm = ref(false)

// PlayerConsoleBar emits 'leave'. Open the confirmation instead of
// firing leaveRoom immediately — fat-finger taps on the mobile leave
// button were ending live games. From the GameOverModal, leave is
// already deliberate so we skip the confirm (see leaveFromGameOver).
function leaveGame() {
  showLeaveConfirm.value = true
}

async function confirmLeave() {
  showLeaveConfirm.value = false
  await mpStore.leaveGame()
}

// Used by GameOverModal — the user has already seen the result screen,
// no second confirmation needed.
// Primary CTA on the game-over modal: the host restarts the same room
// (server re-deals to everyone still connected); guests leave.
async function handleGameOverPrimary() {
  if (mpStore.isHost) {
    await mpStore.startGame()
    return
  }
  await leaveFromGameOver()
}

async function leaveFromGameOver() {
  await mpStore.leaveGame()
}

// In-place claim keeps the guest's user id — never sign out here, that
// orphans their stats. Emit BEFORE leaving: leaveGame unmounts this view,
// and an emit from an unmounted component can vanish.
async function handleUpgrade() {
  emit('claim-account')
  await mpStore.leaveGame()
}
</script>

<style>
@import '../../assets/game-shared.css';
</style>

<style scoped>
/* Realtime reconnect pill — top-center floating indicator */
.reconnect-pill {
  position: fixed;
  top: max(1.25rem, env(safe-area-inset-top));
  left: 50%;
  transform: translateX(-50%);
  background: rgba(255, 42, 42, 0.9);
  color: #fff;
  padding: 0.4rem 0.95rem;
  border-radius: 999px;
  font-family: var(--font-body);
  font-size: 0.75rem;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  z-index: var(--z-toast);
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 16px rgba(255, 42, 42, 0.4);
}

.rt-dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #fff;
  animation: rt-pulse 1.1s ease-in-out infinite;
}

@keyframes rt-pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.6); }
}

.rt-pill-enter-active, .rt-pill-leave-active {
  transition: opacity 0.2s, transform 0.2s;
}
.rt-pill-enter-from, .rt-pill-leave-to {
  opacity: 0;
  transform: translate(-50%, -8px);
}

@media (prefers-reduced-motion: reduce) {
  .rt-dot { animation: none; }
}

/* KO stinger — one full-screen beat when the local player is knocked out. */
.ko-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  background: radial-gradient(ellipse at center, rgba(255, 42, 42, 0.28) 0%, rgba(0, 0, 0, 0.9) 65%);
  animation: ko-flash 1.6s ease-out both;
  pointer-events: none;
}

.ko-stamp {
  font-family: var(--font-display);
  font-size: clamp(3rem, 12vw, 5.5rem);
  letter-spacing: 0.08em;
  color: #ff2a2a;
  text-shadow: 0 0 35px rgba(255, 42, 42, 0.7), 0 0 6px rgba(255, 42, 42, 0.9);
  transform: rotate(-4deg);
  animation: ko-stamp-in 0.45s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.ko-sub {
  font-family: var(--font-body);
  font-size: 0.85rem;
  letter-spacing: 0.35em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.75);
}

@keyframes ko-flash {
  0% { opacity: 0; }
  8% { opacity: 1; }
  85% { opacity: 1; }
  100% { opacity: 0; }
}

@keyframes ko-stamp-in {
  0%   { opacity: 0; transform: scale(2.6) rotate(-10deg); }
  60%  { opacity: 1; transform: scale(0.92) rotate(-2deg); }
  100% { opacity: 1; transform: scale(1) rotate(-4deg); }
}

/* Spectator HUD after the KO beat: a calm state pill, not an alarm. Pinned
   near the bottom (the hand is empty) so the table stays fully visible. */
.spectator-hud {
  position: fixed;
  bottom: max(1.5rem, env(safe-area-inset-bottom));
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.55rem 0.65rem 0.55rem 1.1rem;
  background: rgba(8, 12, 14, 0.92);
  border: 1px solid rgba(0, 229, 255, 0.35);
  border-radius: 999px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.5);
  z-index: var(--z-toast);
  max-width: calc(100vw - 2rem);
  font-family: var(--font-body);
  text-transform: uppercase;
}

.spectator-hud__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: #00e5ff;
  animation: rt-pulse 1.6s ease-in-out infinite;
}

.spectator-hud__label {
  font-size: 0.78rem;
  letter-spacing: 0.22em;
  color: #00e5ff;
}

.spectator-hud__meta {
  font-size: 0.68rem;
  letter-spacing: 0.12em;
  color: rgba(255, 255, 255, 0.55);
  white-space: nowrap;
}

.spectator-hud__leave {
  font-family: var(--font-body);
  font-size: 0.72rem;
  letter-spacing: 0.16em;
  color: rgba(255, 255, 255, 0.85);
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 999px;
  padding: 0.4rem 1rem;
  min-height: 44px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.spectator-hud__leave:hover {
  background: rgba(255, 42, 42, 0.25);
  border-color: rgba(255, 42, 42, 0.6);
}

@media (prefers-reduced-motion: reduce) {
  .ko-overlay { animation: none; }
  .ko-stamp { animation: none; }
  .spectator-hud__dot { animation: none; }
}
</style>
