<template>
  <div class="game-view" :class="{ 'shake-screen': isShakeActive }">
    <!-- Shared Background Elements -->
    <GameBackground :direction="store.direction" />

    <!-- Top Bar: Opponents Surveillance + audio/settings -->
    <SurveillanceBar>
      <OpponentChip
        v-for="player in opponents"
        :key="player.id"
        :ref="(el) => { if (el) opponentRefs[player.id] = (el as any).$el }"
        :uid="player.id"
        :name="player.name"
        :badge="seatBadge(player.id)"
        :card-count="player.hand.length"
        :is-active="player.id === store.currentPlayer?.id"
        :is-selectable="store.turnState === 'CHOOSING_PLAYER_TO_SWAP' && isMyTurn"
        :is-eliminated="player.isEliminated"
        @click="onOpponentClick(player.id)"
      />
      <template #controls>
        <button
          class="hud-exit"
          @click="showLeaveConfirm = true"
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
        <SettingsButton />
      </template>
    </SurveillanceBar>

    <!-- Status ticker — own row between the bar and the pit -->
    <StatusPanel
      :current-player-name="store.currentPlayer?.name || 'Unknown'"
      :direction="store.direction"
      :draw-stack="store.drawStack"
      :current-color="store.currentColor"
      :message="gameMessage"
      :message-style="messageStyle"
      :stacking-mode="store.stackingMode"
      :turn-label="turnLabel"
      :turn-is-mine="isMyTurn"
    />

    <!-- Main Game Table "The Pit" -->
    <BattlePit
      ref="battlePitRef"
      :show-draw-hint="isMyTurn && store.turnState === 'WAITING_FOR_ACTION'"
      :is-muted="soundEffects.isMuted.value"
      :current-color="store.currentColor"
      :direction="store.direction"
      :draw-stack="store.drawStack"
      :my-card-count="myPlayer?.hand.length"
      @draw="drawCard"
    >
      <template #draw-pile>
        <CardPile :cards="store.deck" />
      </template>
      
      <template #discard-pile>
        <CardPile :cards="store.discardPile" :is-discard="true" :large="true" />
      </template>
    </BattlePit>

    <!-- Player Cards (rendered LAST so they're on top of everything) -->
    <div
      class="floating-hand-wrapper"
      :class="{ 'is-my-turn': isMyTurn && store.turnState === 'WAITING_FOR_ACTION' }"
      ref="playerHandRef"
    >
      <HandFan
        v-if="myPlayer"
        :cards="myPlayer.hand"
        :is-my-turn="isMyTurn"
        :can-play="canPlayFromHand"
        :disabled="showColorPicker"
        @play="handlePlayFromHand"
      />
    </div>

    <!-- Action dock (BOTTOM): DRAW · CAUGHT · MERCY -->
    <PlayerConsoleBar
      :show-uno-button="store.showUnoButton"
      @call-uno="store.callUno(myPlayerId)"
    >
      <!-- Catch an opponent who forgot to call Mercy -->
      <Transition name="catch-pop">
        <button
          v-if="caughtTarget"
          class="catch-btn"
          @click="store.catchNoUno(caughtTarget.id)"
        >
          CAUGHT! {{ caughtTarget.name }} forgot MERCY
        </button>
      </Transition>
    </PlayerConsoleBar>

    <!-- Animated Card Layer (for flying cards) -->
    <div class="animation-layer" ref="animationLayer"></div>

    <!-- WebGL FX layer: particles, shockwaves, ambient heat (?fx=1 shows debug) -->
    <FxLayer />

    <!-- Stack cam: cinematic when the draw stack goes big -->
    <StackCam />

    <!-- Badge-up: celebratory banner when a player crosses into a new badge -->
    <BadgeUpBanner />

    <!-- Modals / Overlays -->
    <ColorPickerModal
      v-if="store.turnState === 'CHOOSING_ROULETTE_COLOR' && isMyTurn"
      title="ROULETTE TRAP DETECTED"
      subtitle="CHOOSE YOUR FATE"
      :is-roulette="true"
      :color-counts="myColorCounts"
      @select="(c) => store.setRouletteColor(c)"
    />

    <ColorPickerModal
      v-if="store.turnState === 'CHOOSING_DRAWN_WILD_COLOR' && isMyTurn"
      title="WILD CARD DRAWN"
      subtitle="CHOOSE COLOR TO PLAY"
      :card="store.pendingDrawnWildCard"
      :color-counts="myColorCounts"
      @select="(c) => store.playDrawnWildCard(c)"
    />

    <!-- Wild played from hand — color picker moved up from PlayerHand. -->
    <ColorPickerModal
      v-if="showColorPicker"
      title="WILD CARD ACTIVATED"
      subtitle="CHOOSE NEXT COLOR"
      :color-counts="myColorCounts"
      @select="handleWildColorSelect"
    />

    <PlayerSelectModal
      v-if="store.turnState === 'CHOOSING_PLAYER_TO_SWAP' && isMyTurn"
      :eligible-players="store.players.filter(p => !p.isEliminated && p.id !== myPlayerId)"
      @select="(id: string) => store.swapHands(id)"
      @skip="store.skipSwap()"
    />

    <DiscardAllPickerModal
      v-if="store.turnState === 'CHOOSING_DISCARD_ALL_TOP' && isMyTurn"
      :cards="store.pendingDiscardAllCards"
      @select="(id: string) => store.selectDiscardAllTop(id)"
    />

    <GameOverModal
      v-if="store.gameState === 'GAME_OVER'"
      :is-winner="isWinner"
      :winner-name="getWinnerName()"
      :opponent-name="opponentDisplayName"
      :stats="gameStats"
      :is-anonymous="authStore.isAnonymous"
      :daily="dailyNudge"
      mode="sp"
      @rematch="restart"
      @play-daily="emit('play-daily')"
      @back-to-lobby="store.returnToLobby()"
      @upgrade-account="handleUpgrade"
    />

    <ConfirmDialog
      :open="showLeaveConfirm"
      title="Leave the game?"
      message="This match against the bot will end and you'll return to the lobby."
      confirm-label="LEAVE"
      cancel-label="STAY"
      @confirm="confirmLeave"
      @cancel="showLeaveConfirm = false"
    />
  </div>
</template>

<script setup lang="ts">
import { LogOut } from 'lucide-vue-next'
import { computed, ref, provide, watch, onMounted, onUnmounted, toRef } from 'vue'
import { music } from '../../composables/useMusic'
import { useStackEscalation } from '../../composables/useStackEscalation'
import { playDealerIntro } from '../../composables/useDealerIntro'
import { useRetentionStore } from '../../stores/retentionStore'
import { useGameStore } from '../../stores/gameStore'
import { useAuthStore } from '../../stores/authStore'
import { canPlayCard } from '../../utils/gameRules'
import { countByColor } from '../../utils/gameHelpers'
import { botBadge } from '../../utils/badges'
import { BOT_LADDER, WARM_UP_GAMES } from '@engine/bot'
import type { Card as CardType, CardColor } from '../../types/card'
import { soundEffects } from '../../composables/useSoundEffects'
import { useCardAnimations } from '../../composables/useCardAnimations'
import { preloadCardImages } from '../../utils/preloadCardImages'
import { animateOpponentThrow, skipEveryoneShockwave, showTurnBanner, pulseSeat } from '../../composables/useGameFeel'
import { useGameFx, type FxColor } from '../../composables/fx/useGameFx'
import { useHeatWiring, useWildFloodWiring, useStackCamWiring, slamMagnitude, STACK_CAM_THRESHOLD } from '../../composables/fx/useFxWiring'
import OpponentChip from './OpponentChip.vue'
import HandFan from './HandFan.vue'
import CardPile from './CardPile.vue'
import ColorPickerModal from './ColorPickerModal.vue'
import PlayerSelectModal from './PlayerSelectModal.vue'
import DiscardAllPickerModal from './DiscardAllPickerModal.vue'
import GameBackground from './GameBackground.vue'
import SurveillanceBar from './SurveillanceBar.vue'
import SettingsButton from '../SettingsButton.vue'
import BattlePit from './BattlePit.vue'
import StatusPanel from './StatusPanel.vue'
import PlayerConsoleBar from './PlayerConsoleBar.vue'
import GameOverModal from './GameOverModal.vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import FxLayer from './FxLayer.vue'
import StackCam from './StackCam.vue'
import BadgeUpBanner from './BadgeUpBanner.vue'
import { useBadgeUp } from '../../composables/useBadgeUp'
import { getDailyRecord } from '../../utils/dailyChallenge'

const emit = defineEmits<{ (e: 'claim-account'): void; (e: 'play-daily'): void }>()

const store = useGameStore()
const fx = useGameFx()
// Wire stack-chain escalation — vignette + shake when drawStack grows
useStackEscalation(toRef(store, 'drawStack'))

const authStore = useAuthStore()
const { animateFlyingCard, animateDrawCardsStaggered, killAllFlyingCards } = useCardAnimations()

// For MVP single player, we assume we are player 0
const myPlayerId = 'p-0'

// Wild-color picker for playing a wild from hand — moved up from PlayerHand so
// HandFan stays store-agnostic. HandFan flings + emits 'play'; we own the store.
const showColorPicker = ref(false)
const pendingWildCard = ref<CardType | null>(null)

// Predicate handed to HandFan — mirrors the old in-hand canPlay, store-driven.
function canPlayFromHand(card: CardType): boolean {
  if (!isMyTurn.value) return false
  if (store.turnState !== 'WAITING_FOR_ACTION') return false
  if (store.actionInProgress) return false
  if (!store.topCard) return false
  return canPlayCard(card, store.topCard, store.currentColor, store.drawStack, store.stackingMode)
}

function handlePlayFromHand(card: CardType) {
  // Wild (non-roulette) needs a color first; roulette color is chosen post-play.
  if (card.color === 'wild' && card.type !== 'wildColorRoulette') {
    pendingWildCard.value = card
    showColorPicker.value = true
    return
  }
  store.suppressDiscardSlam = true
  store.playerActionPlayCard(card)
}

function handleWildColorSelect(color: CardColor) {
  showColorPicker.value = false
  if (pendingWildCard.value) {
    store.suppressDiscardSlam = true
    store.playerActionPlayCard(pendingWildCard.value, color)
    pendingWildCard.value = null
  }
}

// Safety: close the wild picker if the turn changes or the game ends. The
// getter touches only store state (isMyTurn is declared later — reading it here
// would hit the temporal dead zone); the callback checks it at runtime.
watch(() => [store.turnState, store.currentPlayerIndex, store.gameState], () => {
  if (showColorPicker.value && (!isMyTurn.value || store.gameState === 'GAME_OVER')) {
    showColorPicker.value = false
    pendingWildCard.value = null
  }
})

const battlePitRef = ref<InstanceType<typeof BattlePit> | null>(null)
const discardAreaRef = computed(() => battlePitRef.value?.discardAreaRef || null)
const animationLayer = ref<HTMLElement | null>(null)

// Provide refs for child components
provide('discardAreaRef', discardAreaRef)
provide('animationLayer', animationLayer)

const myPlayer = computed(() => store.players.find(p => p.id === myPlayerId))
const myColorCounts = computed(() => countByColor(myPlayer.value?.hand ?? []))
// Ambient table heat rises with the stack and the local hand's mercy proximity
useHeatWiring(() => store.drawStack, () => myPlayer.value?.hand.length ?? 0)
// Colour flood when a wild's colour is chosen
useWildFloodWiring(() => store.currentColor, () => store.topCard?.color)
// Stack cam: light up while the draw stack is at cinematic size
useStackCamWiring(() => store.drawStack, () => store.currentColor)
const opponents = computed(() => store.players.filter(p => p.id !== myPlayerId))

// Bots wear a cosmetic badge tied to their ladder rung, so a solo seat still
// reads as "ranked". The human's real badge shows on their own HUD.
function seatBadge(playerId: string) {
  const prof = store.botProfiles[playerId]
  if (!prof) return undefined
  const rung = BOT_LADDER.findIndex(b => b.id === prof.id) + 1
  return rung > 0 ? botBadge(rung) : undefined
}

// An opponent caught without calling UNO — the human can penalize them.
const caughtTarget = computed(() => {
  const id = store.catchableId
  if (!id || id === myPlayerId) return null
  return store.players.find(p => p.id === id) || null
})

const isMyTurn = computed(() => store.currentPlayer?.id === myPlayerId)

// Persistent turn-ownership pill for the ticker (distinct from the transient
// turn banner). Keeps a slow bot from reading as a frozen game.
const turnLabel = computed(() => {
  if (store.gameState === 'GAME_OVER') return ''
  if (isMyTurn.value) return 'YOUR TURN'
  const name = store.currentPlayer?.name
  return name && name !== 'Unknown' ? `${name.toUpperCase()}'S TURN` : "OPPONENT'S TURN"
})

// Animation Handling
const playerHandRef = ref<HTMLElement | null>(null)
const opponentRefs = ref<Record<string, HTMLElement>>({})
const prevHandLengths = ref<Record<string, number>>({})

// Initial Deal Animation + start background music. Music has to start
// AFTER a user gesture (the PLAY NOW / VS BOT click that led here counts),
// so the play() in music.start() usually resolves cleanly.
onMounted(async () => {
  preloadCardImages()
  music.start()
  void badgeUp.snapshotBaseline()
  if (store.isDealing) {
    // The intro is eye candy — a failure in it must not abort the deal.
    await playDealerIntro().catch(() => {})
    await store.dealInitialCards(animateSingleCardDeal)
  }
})

// Run the deal animation any time isDealing flips true, not just on initial
// mount. Rematch is the obvious case: GameView stays mounted while the
// game-over modal is shown, so when `restart()` calls initializeGame and
// flips isDealing back on, onMounted has long since fired. Without this,
// the modal closes but the hands stay empty and turnState stays 'DEALING'.
watch(() => store.isDealing, async (dealing) => {
  if (dealing) {
    // New game in the same mounted view — drop the previous game's hand-length
    // baselines, or the draw-animation watcher compares against stale counts.
    prevHandLengths.value = {}
    turnBannerShown = false
    await playDealerIntro().catch(() => {})
    await store.dealInitialCards(animateSingleCardDeal)
  }
})

// Stop music on unmount (game exit or route change away from GameView).
// Flying-card clones live on document.body — kill any still in flight so
// they don't keep sailing over the lobby.
onUnmounted(() => {
  music.stop()
  killAllFlyingCards()
})

// Duck the music when the game ends so the modal entrance + win/loss
// sting can cut through; restore on rematch.
const retention = useRetentionStore()

// Today's-deal nudge on game over. Gated on gameState so getDailyRecord()
// (plain localStorage, not reactive) is re-read fresh each time the modal
// appears. Hidden after the daily itself and once today's deal is played on
// this device — the rare played-elsewhere case is caught by the server's
// unique index, not here.
const dailyNudge = computed(() => {
  if (store.gameState !== 'GAME_OVER') return null
  if (store.dailyDate || getDailyRecord()) return null
  return { streak: retention.effectiveStreak }
})

const badgeUp = useBadgeUp()
// KO beat: white flash + board desaturation each time a player is knocked out.
watch(() => store.players.filter(p => p.isEliminated).length, (now, prev) => {
  if (now > prev) fx.emit('ko', {})
})

watch(() => store.gameState, (now, prev) => {
  if (now === 'GAME_OVER') {
    if (store.winnerId === 'p-0') fx.emit('confetti', { originEl: discardAreaRef.value })
    music.duck()
    // Record once per game end — accumulate lifetime stats + advance the streak.
    const s: any = (store as any).playerStats?.['p-0']
    if (s) {
      retention.recordGameResult({
        won: store.winnerId === 'p-0',
        cardsPlayed: s.cardsPlayedTotal || 0,
        biggestStackSurvived: s.biggestStackSurvived || 0,
        unoCalls: s.unoCalls || 0,
        peakHand: s.peakCards || 0,
        mode: 'sp',
      })
      // Badge-up: did this game push the player into a new tier? (crossed reads
      // the retention tally we just updated, so it must run after record.)
      const nb = badgeUp.crossed({
        won: store.winnerId === 'p-0',
        completedLoss: store.winnerId !== 'p-0',
        cardsPlayedTotal: s.cardsPlayedTotal || 0,
        drawCardsPlayed: s.drawCardsPlayed || 0,
        biggestStackSurvived: s.biggestStackSurvived || 0,
        unoCalls: s.unoCalls || 0,
      })
      if (nb) fx.emit('badgeUp', { name: myPlayer.value?.name ?? 'You', tier: nb.tier, self: true })
    }
  } else if (prev === 'GAME_OVER' && now === 'PLAYING') {
    music.unduck()
  }
})

// Animate a single card being dealt to a player
async function animateSingleCardDeal(playerId: string, _card: any): Promise<void> {
  const deckEl = document.querySelector('.draw-station .card-pile') as HTMLElement
  if (!deckEl) return
  
  // Determine target element
  const targetEl = playerId === myPlayerId 
    ? playerHandRef.value 
    : opponentRefs.value[playerId] || null
  
  if (!targetEl) return
  
  // Play sound
  soundEffects.playCardPick()
  
  // Use composable for animation
  await animateFlyingCard(deckEl, targetEl, { duration: 0.3 })
}

function triggerDrawAnimation(playerId: string, count: number) {
    const targetEl = playerId === myPlayerId ? playerHandRef.value : opponentRefs.value[playerId]
    const deckEl = document.querySelector('.draw-station .card-pile') as HTMLElement
    if (!targetEl || !deckEl) return

    // Use composable for staggered draw animation
    animateDrawCardsStaggered(deckEl, targetEl, count, {
        duration: 0.4,
        staggerDelay: 0.15
    })
}

// Watch for hand size increases to animate draws (Flying Cards).
// Watch a derived (id, length) tuple array so Vue doesn't have to deep-traverse
// every card on every mutation.
watch(
  () => store.players.map(p => [p.id, p.hand.length] as const),
  (next) => {
    next.forEach(([id, len]) => {
      const oldLen = prevHandLengths.value[id] || 0
      if (!store.isDealing && len > oldLen && oldLen > 0) {
        triggerDrawAnimation(id, len - oldLen)
      }
      prevHandLengths.value[id] = len
    })
  },
  { immediate: true }
)

// Seat-to-pile throw for bot plays + Skip Everyone payoff. Sync flush so
// suppressDiscardSlam is set before CardPile's length watcher reacts to the
// same mutation — otherwise the slam and the flying clone double up.
watch(() => store.lastPlay, (play) => {
  if (!play || store.isDealing) return
  const discardEl = discardAreaRef.value
  const isHuman = play.playerId === myPlayerId
  const isPowerCard = play.card.color === 'wild' || play.card.type.includes('draw') || play.card.type === 'skipEveryone'

  if (!isHuman && discardEl && animationLayer.value) {
    const fromEl = opponentRefs.value[play.playerId]
    if (fromEl) {
      store.suppressDiscardSlam = true
      // This watcher is flush:'sync', so an exception here would unwind the
      // store's playCard mid-flight. The animation is best-effort: on failure,
      // fall back to CardPile's slam as the visual.
      try {
        animateOpponentThrow({
          fromEl,
          toEl: discardEl,
          card: play.card,
          layer: animationLayer.value,
          onImpact: () => {
            fx.emit('impact', { originEl: discardEl, color: play.card.color, power: isPowerCard })
            if (isPowerCard) fx.emit('slam', { originEl: discardEl, color: play.card.color, magnitude: slamMagnitude(play.card) })
          }
        })
      } catch {
        store.suppressDiscardSlam = false
      }
    }
  }

  if (play.card.type === 'skipEveryone' && discardEl) {
    const victims = opponents.value
      .filter(p => !p.isEliminated && p.id !== play.playerId)
      .map(p => opponentRefs.value[p.id])
      .filter((el): el is HTMLElement => !!el)
    // Fire as the thrown card lands on the pile.
    setTimeout(() => skipEveryoneShockwave(discardEl, victims), 480)
  }
}, { flush: 'sync' })

// Turn handoff — banner the FIRST time the turn lands on the human each game
// (orientation moment), seat pulse when it lands on a bot. Repeating the
// banner every handoff reads as nagging in a fast bot game; after the first
// one the green turn pill + hand glow carry the information.
let turnBannerShown = false
watch(
  () => [store.currentPlayer?.id, store.isDealing] as const,
  ([id, dealing], [prevId, prevDealing]) => {
    if (store.gameState !== 'PLAYING' || dealing) return
    if (id === myPlayerId && (prevId !== myPlayerId || prevDealing)) {
      if (!turnBannerShown) {
        turnBannerShown = true
        showTurnBanner()
      }
    } else if (id && id !== myPlayerId && id !== prevId) {
      pulseSeat(opponentRefs.value[id])
    }
  }
)

const gameMessage = computed(() => {
  if (store.turnState === 'CHOOSING_PLAYER_TO_SWAP') return isMyTurn.value ? "SELECT PLAYER TO SWAP HANDS" : "BOT IS CHOOSING SWAP TARGET..."
  if (store.turnState === 'CHOOSING_ROULETTE_COLOR') return isMyTurn.value ? "INCOMING ROULETTE! CHOOSE YOUR FATE" : "ROULETTE INITIATED: WAITING FOR VICTIM..."
  if (store.turnState === 'ROULETTE_DRAWING') {
    const target = store.rouletteTargetColor?.toUpperCase() || store.currentColor.toUpperCase()
    return isMyTurn.value ? `DANGER: YOU NEED ${target}` : `BOT IS SEEKING ${target}...`
  }
  return ""
})

const messageStyle = computed(() => {
    if (store.turnState === 'ROULETTE_DRAWING') {
        const colorMap: Record<string, string> = {
            red: '#ff5555',
            blue: '#5555ff',
            green: '#55ff55',
            yellow: '#ffff55'
        }
        const target = store.rouletteTargetColor || store.currentColor
        return { 
            color: colorMap[target] || '#fff',
            fontSize: '1rem',
            textShadow: `0 0 10px ${colorMap[target] || '#fff'}`
        }
    }
    return {}
})

const isShakeActive = ref(false)

// Mercy call: a gold spark flare on the caller's seat the moment they declare.
watch(() => ({ ...store.hasCalledUno }), (now, prev) => {
  for (const id in now) {
    if (now[id] && !prev?.[id]) {
      const seatEl = id === myPlayerId ? playerHandRef.value : opponentRefs.value[id]
      if (seatEl) fx.emit('impact', { originEl: seatEl, color: 'yellow', power: true })
    }
  }
})

// Watch for big stack increases to trigger shake
watch(() => store.drawStack, (newVal, oldVal) => {
  if (newVal > oldVal && newVal >= 6) {
    triggerShake()
  }
  // Stack eaten: the reset to 0 lands before advanceTurn, so currentPlayer is
  // still the victim. Spray the stack's cards from the pile into their seat.
  if (oldVal >= 6 && newVal === 0) {
    const discardEl = discardAreaRef.value
    const victim = store.currentPlayer
    const seatEl = victim?.id === myPlayerId ? playerHandRef.value : (victim ? opponentRefs.value[victim.id] : null)
    if (discardEl && seatEl) {
      fx.emit('stackSpray', { fromEl: discardEl, toEl: seatEl, color: (store.currentColor ?? 'wild') as FxColor, count: oldVal })
    }
    if (oldVal >= STACK_CAM_THRESHOLD) {
      fx.emit('stackCamReveal', { amount: oldVal, color: (store.currentColor ?? 'wild') as FxColor, victimEl: seatEl ?? null, victimName: victim?.name ?? '' })
    }
  }
})

function triggerShake() {
  isShakeActive.value = true
  setTimeout(() => {
    isShakeActive.value = false
  }, 500)
}

function drawCard() {
  if (!isMyTurn.value || store.turnState !== 'WAITING_FOR_ACTION') return
  if (store.actionInProgress) return
  // Only allow drawing when no playable cards exist (except during draw stack)
  if (store.drawStack === 0 && store.topCard && myPlayer.value) {
    const hasPlayable = myPlayer.value.hand.some(c =>
      canPlayCard(c, store.topCard!, store.currentColor, 0, store.stackingMode)
    )
    if (hasPlayable) return
  }
  soundEffects.playCardPick()
  store.drawCardsForCurrentPlayer()
}

function toggleSound() {
  // Toggle SFX and keep music in step. If music wasn't playing yet (e.g.
  // the audio file isn't deployed), this is a no-op for music.
  soundEffects.toggleMute()
  music.toggleMute()
}

function getWinnerName() {
  const w = store.players.find(p => p.id === store.winnerId)
  return w ? w.name : 'UNKNOWN_ENTITY'
}

// The human is always 'p-0' in single-player.
const isWinner = computed(() => store.winnerId === 'p-0')

// Pull the per-player stats and shape them for the modal.
const gameStats = computed(() => {
  const s = store.playerStats['p-0']
  if (!s) return undefined
  return {
    cardsPlayed: s.cardsPlayedTotal || 0,
    biggestStack: s.biggestStackSurvived || 0,
    unosCalled: s.unoCalls || 0,
    peakHand: s.peakCards || 0,
  }
})

// Name to render in the share image sub-line. The sub-line reads
// "I broke {x}" on win and "{x} broke me" on loss, so we want the loser
// in the first case and the winner in the second — i.e. always the
// "other side."
const opponentDisplayName = computed(() => {
  const other = store.players.find(p => p.id !== 'p-0')
  return other?.name ?? 'opponent'
})

function restart() {
  const prof = store.botProfiles[opponents.value[0]?.id ?? '']
  store.initializeGame(['You', prof?.name ?? 'Terminator'], undefined, {
    botIds: prof ? [prof.id] : undefined,
    warmUp: retention.gamesPlayed < WARM_UP_GAMES,
  })
}

const showLeaveConfirm = ref(false)
function confirmLeave() {
  showLeaveConfirm.value = false
  store.returnToLobby()
}

// In-place claim keeps the guest's user id — never sign out here, that
// orphans their stats. Emit BEFORE leaving: returnToLobby unmounts this
// view, and an emit from an unmounted component can vanish.
async function handleUpgrade() {
  emit('claim-account')
  store.returnToLobby()
}
function onOpponentClick(playerId: string) {
  if (store.turnState === 'CHOOSING_PLAYER_TO_SWAP' && isMyTurn.value) {
    store.swapHands(playerId)
  }
}
</script>

<style>
@import '../../assets/game-shared.css';
</style>

<style scoped>
/* Component-specific styles only */
.hand-container-wrapper {
  min-height: 180px;
  position: relative;
}

.controls-area {
  display: flex;
  justify-content: center;
  margin-bottom: 1rem;
}

.btn-hazard {
  background: var(--color-hazard);
  color: black;
  border: none;
  padding: 0.5rem 2rem;
  font-weight: bold;
  font-family: var(--font-display);
  cursor: pointer;
  clip-path: polygon(10% 0, 100% 0, 90% 100%, 0% 100%);
}

@media (max-width: 768px) {
  .hand-container-wrapper {
    min-height: 140px;
  }
}

@media (max-width: 480px) {
  .hand-container-wrapper {
    min-height: 100px;
  }

  .btn-hazard {
    padding: 0.5rem 1rem;
    min-height: 44px;
  }
}
</style>
