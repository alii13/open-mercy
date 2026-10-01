import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type { Card, Player, GameState, TurnState, CardColor } from '../types/card'
import * as engine from '@engine'
import type { EngineEvent, EngineState } from '@engine'
import { canPlayCard, getDrawValue, generateFullDeck, shuffleDeck, DEFAULT_STACKING_MODE } from '@engine'
import {
    BOT_LADDER, botById, dailyBot, chooseCard, chooseSwapTarget, chooseWildColor, willCatchMercy,
    type BotProfile,
} from '@engine/bot'
import { seededRng } from '../utils/seededRng'
import { markDailyDone } from '../utils/dailyChallenge'
import { recordBotWin } from '../utils/botLadder'
import type { StackingMode } from '@engine'
import { soundEffects } from '../composables/useSoundEffects'
import { supabase } from '../lib/supabase'
import { track } from '../utils/analytics'

export const useGameStore = defineStore('game', () => {
    // Timings (single tunable block).
    //
    // Two distinct categories — don't blindly cut both:
    //   BOT_DELAYS         pure dead time waiting on the bot. Cut aggressively.
    //   COMPREHENSION_STALLS  time the human needs to absorb what just happened
    //                      (stack landing, roulette spin, mercy elimination).
    //                      These ARE the drama — over-cutting makes the game feel
    //                      anaemic even when "snappier" by the stopwatch.
    const TIMINGS = {
        // --- BOT_DELAYS (pure dead time) ---
        botThink: 1100,                 // turn-start -> bot acts (was 2000)
        botRoulette: 250,               // bot reacts to roulette (was 500)
        botRouletteColorPick: 600,      // bot picks roulette target color (was 1500)

        // --- COMPREHENSION_STALLS (human reads the moment) ---
        drawStaggerPenalty: 200,        // per card when human eats a +N stack (was 250 -> 90 too fast, restored drama)
        drawUntilPlayableRetry: 280,    // between unplayable draws so human reads each card (was 400 -> 150 too fast)
        drawnPlayableAutoPlay: 750,     // pause to read the drawn card before it auto-plays (was 1000 -> 400 too fast)
        rouletteSpin: 520,              // between roulette card reveals — the most dramatic beat (was 800 -> 320 too fast)
        rouletteSafeStall: 1100,        // "Safe!" pause — relief should breathe (was 1500 -> 600 too fast)
        rouletteEliminatedStall: 1500,  // mercy-elimination during roulette — emotional landing (was 1000 -> 400 way too fast)
    } as const

    // --- State ---
    const gameState = ref<GameState>('LOBBY')
    const turnState = ref<TurnState>('WAITING_FOR_ACTION')

    // Dealing Animation State
    const isDealing = ref(false)
    const pendingDealCard = ref<{ playerId: string; card: Card } | null>(null)

    const deck = ref<Card[]>([])
    const discardPile = ref<Card[]>([])

    const players = ref<Player[]>([])
    const currentPlayerIndex = ref(0)
    const direction = ref<1 | -1>(1)

    const drawStack = ref(0)
    // One character per human turn: played / drew / ate a stack. Drives the
    // daily's share grid, and is the substrate a replay would need later.
    const turnLog = ref<string[]>([])
    const currentColor = ref<CardColor>('red')

    // For Roulette logic
    const rouletteTargetColor = ref<CardColor | null>(null)

    // For draw-until-playable wild card color selection
    const pendingDrawnWildCard = ref<Card | null>(null)

    // For Discard All top card selection
    const pendingDiscardAllCards = ref<Card[]>([])

    const winnerId = ref<string | null>(null)
    const swapInitiatorId = ref<string | null>(null)
    const hasCalledUno = ref<Record<string, boolean>>({})
    // A player who hit 1 card without calling UNO — catchable until the window
    // closes. If it's a bot, the human gets a CAUGHT button; if it's the human,
    // a bot may catch them (~70%). Penalty is a brutal draw 10 (No Mercy).
    const catchableId = ref<string | null>(null)
    let catchTimer: ReturnType<typeof setTimeout> | null = null
    const UNO_PENALTY = 10

    // Re-entrancy guard. Set when a play/draw is in flight so rapid clicks don't queue
    // up actions while bot delays / draw cascades / animations are still resolving.
    const actionInProgress = ref(false)

    // When the human throws their own card, PlayerHand already shows a flying-clone
    // animation arriving on the discard pile. CardPile would otherwise also fire its
    // "slam from above" on the new top card — double animation. Set this true right
    // before player-initiated playCard; CardPile reads + resets it. Bot plays leave
    // it false, so the slam is the ONLY visual (which is correct — there's no clone
    // for bot throws).
    const suppressDiscardSlam = ref(false)

    // Provenance of the most recent play — who threw which card. Drives the
    // seat-to-pile throw animation and special-card payoffs in GameView. The
    // counter retriggers watchers even when consecutive plays look identical.
    const lastPlay = ref<{ playerId: string; card: Card; n: number } | null>(null)
    let playCounter = 0

    // Stacking mode - persists in localStorage so the user keeps their pick across sessions
    function loadStackingMode(): StackingMode {
        try {
            const v = localStorage.getItem('uno_stacking_mode')
            if (v === 'official' || v === 'house' || v === 'casual') return v
        } catch { /* localStorage unavailable */ }
        return DEFAULT_STACKING_MODE
    }
    const stackingMode = ref<StackingMode>(loadStackingMode())
    function setStackingMode(m: StackingMode) {
        stackingMode.value = m
        try { localStorage.setItem('uno_stacking_mode', m) } catch { /* noop */ }
    }

    // --- Per-player stat tracking (keyed by player id) ---
    const gameStartTime = ref<number>(0)
    const playerStats = ref<Record<string, {
        peakCards: number
        drawCardsPlayed: number
        wildCardsPlayed: number
        cardsPlayedTotal: number
        skipsDealt: number
        swapsMade: number
        drawsTaken: number
        biggestStackSurvived: number
        unoCalls: number
        unoPenalties: number
    }>>({})

    // --- Getters ---
    const currentPlayer = computed(() => players.value[currentPlayerIndex.value])
    const topCard = computed(() => discardPile.value[discardPile.value.length - 1])

    // Derived, never latched — a stored flag here once stuck visible after the
    // hand grew past 2 (draw penalties), showing a pointless UNO button at 3+
    // cards. Show it only while calling UNO is meaningful: the human's turn at
    // exactly 2 cards (including choosing a drawn wild's color, since that
    // play counts as going to 1), or while exposed in a catch window.
    const showUnoButton = computed(() => {
        if (gameState.value !== 'PLAYING') return false
        const human = players.value.find(pl => !pl.isBot)
        if (!human || human.isEliminated || hasCalledUno.value[human.id]) return false
        if (catchableId.value === human.id) return true
        return currentPlayer.value?.id === human.id
            && (turnState.value === 'WAITING_FOR_ACTION' || turnState.value === 'CHOOSING_DRAWN_WILD_COLOR')
            && human.hand.length === 2
    })

    // --- Engine bridge ---

    // The engine works on plain mutable state; here that state lives in the
    // store's refs, bridged through accessors so engine mutations hit the same
    // reactive objects the components render.
    const engineState: EngineState = {
        get players() { return players.value }, set players(v) { players.value = v },
        get deck() { return deck.value }, set deck(v) { deck.value = v },
        get discardPile() { return discardPile.value }, set discardPile(v) { discardPile.value = v },
        get currentPlayerIndex() { return currentPlayerIndex.value }, set currentPlayerIndex(v) { currentPlayerIndex.value = v },
        get direction() { return direction.value }, set direction(v) { direction.value = v },
        get drawStack() { return drawStack.value }, set drawStack(v) { drawStack.value = v },
        get currentColor() { return currentColor.value }, set currentColor(v) { currentColor.value = v },
        get turnState() { return turnState.value }, set turnState(v) { turnState.value = v },
        get gameState() { return gameState.value }, set gameState(v) { gameState.value = v },
        get winnerId() { return winnerId.value }, set winnerId(v) { winnerId.value = v },
        get rouletteTargetColor() { return rouletteTargetColor.value }, set rouletteTargetColor(v) { rouletteTargetColor.value = v },
        get pendingDiscardAllCards() { return pendingDiscardAllCards.value }, set pendingDiscardAllCards(v) { pendingDiscardAllCards.value = v },
        get swapInitiatorId() { return swapInitiatorId.value }, set swapInitiatorId(v) { swapInitiatorId.value = v },
        get hasCalledUno() { return hasCalledUno.value }, set hasCalledUno(v) { hasCalledUno.value = v },
        get stackingMode() { return stackingMode.value }, set stackingMode(v) { stackingMode.value = v },
    }

    // Map engine events onto host concerns: sounds, stats, the action guard,
    // and UNO policy (bot auto-call odds / catch windows are host decisions).
    function applyEvents(events: EngineEvent[]) {
        for (const e of events) {
            switch (e.t) {
                case 'RESHUFFLE':
                    soundEffects.playCardShuffle()
                    break
                case 'DRAW': {
                    soundEffects.playCardPick()
                    const p = players.value.find(x => x.id === e.playerId)
                    const s = playerStats.value[e.playerId]
                    if (p && s && p.hand.length > s.peakCards) {
                        s.peakCards = p.hand.length
                    }
                    break
                }
                case 'TURN_ADVANCED':
                case 'PLAY_AGAIN':
                    // The previous player's action has fully resolved (or Skip
                    // Everyone kept the turn) — release the action guard.
                    actionInProgress.value = false
                    break
                case 'UNO_PENALTY': {
                    const s = playerStats.value[e.playerId]
                    if (s) s.unoPenalties++
                    break
                }
                case 'AT_ONE_UNCALLED': {
                    const p = players.value.find(x => x.id === e.playerId)
                    if (!p) break
                    if (p.isBot && willCatchMercy(profileFor(p), hostRng)) {
                        callUno(p.id)
                    } else {
                        openCatchWindow(p)
                    }
                    break
                }
                case 'ELIMINATED':
                case 'GAME_OVER':
                case 'CHOOSE_DISCARD_ALL_TOP':
                    // State carries these; the gameState watcher handles logging.
                    break
            }
        }
    }

    // --- Actions ---

    // Bumped whenever the current deal becomes obsolete (new game, return to
    // lobby). The async deal loop checks it after every await so a deal that
    // outlives its game can't keep mutating the next game's state.
    let dealGeneration = 0
    let spStartedAt = 0

    // The host's randomness source. The daily challenge swaps in a
    // date-seeded PRNG so shuffle, deals, and bot decisions replay
    // identically for every player in the world on the same day.
    let hostRng: () => number = Math.random
    // Ref, not a local: views need to know the game on screen is the daily
    // (the game-over nudge must not offer today's deal after the daily itself).
    const dailyDate = ref<string | null>(null)
    /** Personality per bot seat, keyed by player id. */
    const botProfiles = ref<Record<string, BotProfile>>({})
    function profileFor(p: Player): BotProfile {
        return botProfiles.value[p.id] ?? BOT_LADDER[0]!
    }

    function initializeGame(
        playerNames: string[],
        mode?: StackingMode,
        opts?: { dailySeed?: string; botIds?: string[] },
    ) {
        dailyDate.value = opts?.dailySeed ?? null
        hostRng = dailyDate.value ? seededRng(`uno-daily-${dailyDate.value}`) : Math.random
        dealGeneration++
        closeCatchWindow()
        if (mode) setStackingMode(mode)
        spStartedAt = Date.now()
        track('sp_game_started', { rules: stackingMode.value })
        players.value = playerNames.map((name, index) => ({
            id: `p-${index}`,
            name,
            hand: [],
            isEliminated: false,
            isBot: index > 0,
            score: 0
        }))
        // The daily forces its opponent rather than accepting one, so no
        // caller — and no unlock state — can change who the world plays.
        botProfiles.value = Object.fromEntries(
            players.value.filter(p => p.isBot).map((p, i) => [
                p.id,
                dailyDate.value ? dailyBot() : botById(opts?.botIds?.[i] ?? BOT_LADDER[0]!.id),
            ]),
        )

        const rawDeck = generateFullDeck()
        deck.value = shuffleDeck(rawDeck, hostRng)
        discardPile.value = []

        // DON'T deal cards here - will be done incrementally via dealInitialCards()

        currentPlayerIndex.value = 0
        direction.value = 1
        drawStack.value = 0
        turnLog.value = []
        gameState.value = 'PLAYING'
        winnerId.value = null
        turnState.value = 'DEALING'
        rouletteTargetColor.value = null
        isDealing.value = true
        hasCalledUno.value = {}
        // GameView persists across rematches, so any in-flight flags from the
        // previous game must be cleared here or they leak into the new one.
        actionInProgress.value = false
        suppressDiscardSlam.value = false
        pendingDealCard.value = null
        pendingDrawnWildCard.value = null
        pendingDiscardAllCards.value = []
        swapInitiatorId.value = null
        gameStartTime.value = Date.now()

        // Initialize per-player stats
        const stats: typeof playerStats.value = {}
        for (const p of players.value) {
            stats[p.id] = {
                peakCards: 0, drawCardsPlayed: 0, wildCardsPlayed: 0,
                cardsPlayedTotal: 0, skipsDealt: 0, swapsMade: 0,
                drawsTaken: 0, biggestStackSurvived: 0, unoCalls: 0, unoPenalties: 0
            }
        }
        playerStats.value = stats
    }

    // Async function to deal initial cards one-by-one with animation support
    async function dealInitialCards(onCardDealt: (playerId: string, card: Card) => Promise<void>) {
        const CARDS_PER_PLAYER = 7
        const myGen = dealGeneration

        for (let round = 0; round < CARDS_PER_PLAYER; round++) {
            for (const player of players.value) {
                const card = drawCardFromDeck()
                if (!card) continue

                // Set pending card for animation
                pendingDealCard.value = { playerId: player.id, card }

                // Wait for animation callback. Animations are best-effort eye
                // candy — if one throws, the card is dealt instantly rather
                // than aborting the loop and stranding the game in DEALING.
                try {
                    await onCardDealt(player.id, card)
                } catch { /* animation failed — deal without it */ }

                // Deal became obsolete while awaiting (player left mid-deal,
                // rematch re-initialized) — stop before touching fresh state.
                // Clear the pending card so the stale entry can't render into
                // whatever view replaces this game.
                if (myGen !== dealGeneration) {
                    pendingDealCard.value = null
                    return
                }

                // Add card to hand after animation
                player.hand.push(card)
                pendingDealCard.value = null
            }
        }

        if (myGen !== dealGeneration) return

        // Deal the first discard and apply its effect per UNO rules
        const ev: EngineEvent[] = []
        engine.drawFirstDiscard(engineState, ev, hostRng)
        applyEvents(ev)

        // Dealing complete
        isDealing.value = false
        turnState.value = 'WAITING_FOR_ACTION'

    }

    function drawCardFromDeck(): Card | undefined {
        const ev: EngineEvent[] = []
        const card = engine.drawCardFromDeck(engineState, ev, hostRng)
        applyEvents(ev)
        return card
    }

    function drawCardToHand(player: Player): Card | undefined {
        const ev: EngineEvent[] = []
        const card = engine.drawCardToHand(engineState, player.id, ev, hostRng)
        applyEvents(ev)
        return card
    }

    function advanceTurn() {
        const ev: EngineEvent[] = []
        engine.advanceTurn(engineState, ev)
        applyEvents(ev)
    }

    function callUno(playerId: string) {
        hasCalledUno.value[playerId] = true
        // Calling UNO closes our own catch window — we're safe.
        if (catchableId.value === playerId) closeCatchWindow()
        const s = playerStats.value[playerId]
        if (s) s.unoCalls++
    }

    function clearCatchTimer() {
        if (catchTimer) { clearTimeout(catchTimer); catchTimer = null }
    }

    function closeCatchWindow() {
        catchableId.value = null
        clearCatchTimer()
    }

    // A player ended an action on exactly 1 card without calling UNO — open the
    // catch window. Bots forget ~30% of the time (existing), so this fires for
    // the human's exposure and for a bot that didn't auto-call.
    function openCatchWindow(player: Player) {
        closeCatchWindow()
        catchableId.value = player.id
        if (player.isBot) {
            // Bot forgot UNO — the human can catch it. Window auto-closes if missed.
            catchTimer = setTimeout(() => {
                if (catchableId.value === player.id) closeCatchWindow()
            }, 7000)
        } else {
            // Human is exposed — the UNO button derives from catchableId, and
            // a bot may pounce ~70% of the time before the window closes.
            const willCatch = hostRng() < 0.7
            catchTimer = setTimeout(() => {
                if (catchableId.value !== player.id) return
                if (willCatch) penalizeForgottenUno(player.id)
                else closeCatchWindow()
            }, 1800 + Math.random() * 1600)
        }
    }

    function penalizeForgottenUno(playerId: string) {
        const p = players.value.find(x => x.id === playerId)
        if (!p) { closeCatchWindow(); return }
        closeCatchWindow()
        const s = playerStats.value[p.id]
        if (s) s.unoPenalties++
        // Draw the penalty (mercy elimination is handled inside the engine).
        const ev: EngineEvent[] = []
        engine.penalizeUnoDraws(engineState, p.id, UNO_PENALTY, ev, hostRng)
        applyEvents(ev)
    }

    // Human catches an opponent (bot) who forgot UNO.
    function catchNoUno(targetId: string) {
        if (catchableId.value !== targetId) return
        penalizeForgottenUno(targetId)
    }

    function playCard(playerId: string, card: Card, selectedColor?: CardColor) {
        const player = players.value.find(p => p.id === playerId)
        if (!player) return

        // Host policy: a bot facing a multi-match Discard All picks its top
        // card at random; a human gets the picker (engine enters that state).
        let discardAllTopPickId: string | undefined
        if (card.type === 'discardAll' && player.isBot) {
            const matches = player.hand.filter(c => c.color === card.color)
            if (matches.length > 1) {
                discardAllTopPickId = matches[Math.floor(hostRng() * matches.length)]!.id
            }
        }

        const res = engine.playCard(engineState, playerId, card.id, { selectedColor, discardAllTopPickId, rng: hostRng })
        if (!res.ok) return

        if (!player.isBot) turnLog.value.push('p')

        // Apply events before setting lastPlay: its watcher is flush:'sync'
        // (GameView throw animation), so an exception there would unwind this
        // function — the action guard and UNO policy must already be settled.
        applyEvents(res.events)

        // Track card play stats
        const s = playerStats.value[playerId]
        if (s) {
            s.cardsPlayedTotal++
            if (card.color === 'wild') s.wildCardsPlayed++
            if (getDrawValue(card) > 0) s.drawCardsPlayed++
            if (card.type === 'skip' || card.type === 'skipEveryone') s.skipsDealt++
        }

        playCounter++
        lastPlay.value = { playerId, card, n: playCounter }

        // Sounds
        soundEffects.playCardLand()
        if (card.color === 'wild' || card.type.includes('draw') || card.type === 'skip' || card.type === 'reverse') {
            soundEffects.playSpecialCard()
        }
    }

    function applyCardEffect(card: Card) {
        const ev: EngineEvent[] = []
        engine.applyCardEffect(engineState, card, ev)
        applyEvents(ev)
    }

    function rotateHands() {
        engine.rotateActiveHands(engineState)
    }

    function drawCardsForCurrentPlayer() {
        const p = currentPlayer.value
        if (!p) return
        actionInProgress.value = true

        if (!p.isBot) turnLog.value.push(drawStack.value > 0 ? 'x' : 'd')

        if (drawStack.value > 0) {
            // Stacking Penalty Draw
            const cardsToDraw = drawStack.value
            const ps = playerStats.value[p.id]
            if (ps) {
                ps.drawsTaken++
                if (cardsToDraw > ps.biggestStackSurvived) {
                    ps.biggestStackSurvived = cardsToDraw
                }
            }
            drawStack.value = 0
            let drawnCount = 0
            function drawNext() {
                // If this player got eliminated mid-stack (crossed the mercy
                // threshold) or the game ended, stop shoveling cards into an
                // emptied hand and don't advance a finished game.
                if (p?.isEliminated || gameState.value === 'GAME_OVER') {
                    if (gameState.value !== 'GAME_OVER') advanceTurn()
                    return
                }
                if (drawnCount < cardsToDraw) {
                    if (p) drawCardToHand(p)
                    drawnCount++
                    setTimeout(drawNext, TIMINGS.drawStaggerPenalty)
                } else {
                    advanceTurn()
                }
            }
            drawNext()
        } else {
            // Standard Draw: Draw Until Playable
            // Creating a loop with delay for visual effect

            function drawUntilPlayable() {
                // Dead-end bails must release the turn — otherwise actionInProgress
                // stays true with no advanceTurn and the whole game soft-locks
                // (e.g. deck + discard both run dry mid-draw).
                if (!p || !topCard.value) { advanceTurn(); return }
                const ps = playerStats.value[p.id]
                if (ps) ps.drawsTaken++
                // Draw 1
                const card = drawCardToHand(p)
                if (!card) { advanceTurn(); return }

                // Check if playable
                if (canPlayCard(card, topCard.value, currentColor.value, 0, stackingMode.value)) {
                    // Playable! Rule: "then immediately play it"
                    setTimeout(() => {
                        // Color Roulette's colour is the victim's call, so it plays straight through.
                        if (card.color === 'wild' && card.type !== 'wildColorRoulette' && !p.isBot) {
                            // Human player needs to pick a color - show modal
                            pendingDrawnWildCard.value = card
                            turnState.value = 'CHOOSING_DRAWN_WILD_COLOR'
                            return
                        }
                        let colorToPick: CardColor | undefined
                        if (card.color === 'wild') {
                            colorToPick = chooseBotColor(p)
                        }
                        playerActionPlayCard(card, colorToPick)
                    }, TIMINGS.drawnPlayableAutoPlay)
                    return
                } else {
                    // Not playable, check mercy rule (handled in drawCardToHand).
                    if (p.isEliminated) {
                        advanceTurn()
                        return
                    }
                    // Draw again
                    setTimeout(drawUntilPlayable, TIMINGS.drawUntilPlayableRetry)
                }
            }
            drawUntilPlayable()
        }
    }

    // Execute Roulette Draw Logic — the engine does one draw per step, the
    // store owns the pacing stalls between steps.
    function executeRouletteDraw() {
        const ev: EngineEvent[] = []
        const outcome = engine.rouletteDrawStep(engineState, ev, hostRng)
        applyEvents(ev)

        if (outcome === 'match') {
            // Add a stall so the user can see the final card before turn jumps
            setTimeout(finishRouletteTurn, TIMINGS.rouletteSafeStall)
        } else if (outcome === 'eliminated') {
            // Mercy rule trigger — emotional landing needs to breathe.
            setTimeout(finishRouletteTurn, TIMINGS.rouletteEliminatedStall)
        } else if (outcome === 'continue') {
            setTimeout(executeRouletteDraw, TIMINGS.rouletteSpin)
        }
        // 'exhausted': the engine already ended the turn — nothing to schedule.
    }

    function finishRouletteTurn() {
        const ev: EngineEvent[] = []
        engine.finishRouletteTurn(engineState, ev)
        applyEvents(ev)
    }

    function executeBotRouletteChoice() {
        if (!currentPlayer.value?.isBot || turnState.value !== 'CHOOSING_ROULETTE_COLOR') return

        const bot = currentPlayer.value
        const color = chooseBotColor(bot)

        // Small delay for realism
        setTimeout(() => {
            if (turnState.value === 'CHOOSING_ROULETTE_COLOR') {
                setRouletteColor(color)
            }
        }, TIMINGS.botRouletteColorPick)
    }

    function swapHands(targetPlayerId: string) {
        if (turnState.value !== 'CHOOSING_PLAYER_TO_SWAP') return
        const initiatorId = swapInitiatorId.value
        const ev: EngineEvent[] = []
        const swapped = engine.swapHands(engineState, targetPlayerId, ev)
        if (swapped && initiatorId) {
            const s = playerStats.value[initiatorId]
            if (s) s.swapsMade++
        }
        applyEvents(ev)
    }

    function skipSwap() {
        if (turnState.value !== 'CHOOSING_PLAYER_TO_SWAP') return
        const ev: EngineEvent[] = []
        engine.skipSwap(engineState, ev)
        applyEvents(ev)
    }

    function returnToLobby() {
        dealGeneration++
        closeCatchWindow()
        gameState.value = 'LOBBY'
        players.value = []
        deck.value = []
        discardPile.value = []
    }

    function playerActionPlayCard(card: Card, selectedColor?: CardColor) {
        if (!currentPlayer.value) return
        actionInProgress.value = true
        playCard(currentPlayer.value.id, card, selectedColor)
    }

    // --- Bot AI Logic ---

    function executeBotTurn() {
        const bot = currentPlayer.value
        if (!bot || !bot.isBot || gameState.value !== 'PLAYING') return

        // Handle special states for Bot
        if (turnState.value === 'ROULETTE_DRAWING') {
            executeRouletteDraw()
            return
        }

        if (turnState.value !== 'WAITING_FOR_ACTION') return

        const top = topCard.value
        if (!top) return

        const playableCards = bot.hand.filter(c =>
            canPlayCard(c, top, currentColor.value, drawStack.value, stackingMode.value)
        )

        const cardToPlay = chooseCard(
            { playable: playableCards, drawStack: drawStack.value, opponents: [] },
            profileFor(bot),
            hostRng,
        )
        if (cardToPlay) {
            const colorToPick = cardToPlay.color === 'wild' ? chooseBotColor(bot) : undefined
            playerActionPlayCard(cardToPlay, colorToPick)
        } else {
            drawCardsForCurrentPlayer()
        }
    }

    function chooseBotColor(bot: Player): CardColor {
        return chooseWildColor(bot.hand, profileFor(bot), hostRng)
    }

    function executeBotSwap() {
        if (!currentPlayer.value?.isBot || turnState.value !== 'CHOOSING_PLAYER_TO_SWAP') return
        const bot = currentPlayer.value
        const otherPlayers = players.value.filter(p => p.id !== bot?.id && !p.isEliminated)
        const target = bot && chooseSwapTarget(
            { playable: [], drawStack: 0, opponents: otherPlayers },
            profileFor(bot),
            hostRng,
        )
        if (target) swapHands(target.id)
    }

    watch([currentPlayerIndex, gameState, turnState, topCard], () => {
        if (gameState.value !== 'PLAYING') return

        const player = currentPlayer.value
        // If it's a bot's turn OR bot is forced to act (Roulette)
        if (player?.isBot) {
            // Debounce slightly to prevent rapid-fire on same turn
            setTimeout(() => {
                // Re-check conditions after delay (game might have ended or state changed)
                if (gameState.value !== 'PLAYING') return
                if (currentPlayerIndex.value !== players.value.indexOf(player) &&
                    turnState.value !== 'ROULETTE_DRAWING' &&
                    turnState.value !== 'CHOOSING_ROULETTE_COLOR' &&
                    turnState.value !== 'CHOOSING_DISCARD_ALL_TOP') return

                if (turnState.value === 'CHOOSING_DISCARD_ALL_TOP') {
                    // Bot auto-selects a random top card
                    const cards = pendingDiscardAllCards.value
                    if (cards.length > 0) {
                        const pick = cards[Math.floor(hostRng() * cards.length)]!
                        selectDiscardAllTop(pick.id)
                    }
                } else if (turnState.value === 'CHOOSING_PLAYER_TO_SWAP') {
                    executeBotSwap()
                } else if (turnState.value === 'ROULETTE_DRAWING') {
                    executeRouletteDraw()
                } else if (turnState.value === 'CHOOSING_ROULETTE_COLOR') {
                    executeBotRouletteChoice()
                } else {
                    executeBotTurn()
                }
            }, turnState.value === 'ROULETTE_DRAWING' ? TIMINGS.botRoulette : TIMINGS.botThink)
        } else {
            // Human player logic:
            // The drawing loop is started by setRouletteColor once they choose.
            // No automated action needed here for WAITING_FOR_ACTION.
        }
    }, { immediate: true })

    // Auto-log results when game ends
    watch(gameState, (newState) => {
        if (newState === 'GAME_OVER') {
            const human = players.value.find(p => !p.isBot)
            track('sp_game_finished', {
                result: human && winnerId.value === human.id ? 'won' : 'lost',
                duration_seconds: spStartedAt ? Math.round((Date.now() - spStartedAt) / 1000) : undefined,
                rules: stackingMode.value,
            })
            // Ladder progress is solo-only and never from the daily: the daily
            // pins its own opponent, so clearing it would otherwise unlock the
            // hardest rung without ever facing the ones below it.
            if (!dailyDate.value && human && winnerId.value === human.id) {
                const beaten = players.value.find(pl => pl.isBot)
                if (beaten) {
                    const prof = botProfiles.value[beaten.id]
                    if (prof) {
                        recordBotWin(prof.id)
                        // Rung, not just id: the drop-off per rung is what says
                        // whether the ladder pulls people back or stalls them.
                        track('bot_defeated', {
                            bot_id: prof.id,
                            rung: BOT_LADDER.findIndex(b => b.id === prof.id) + 1,
                        })
                    }
                }
            }
            if (dailyDate.value) {
                const humanStats = human ? playerStats.value[human.id] : null
                const dailyResult = human && winnerId.value === human.id
                    ? 'won'
                    : (human?.isEliminated ? 'eliminated' : 'lost')
                const dailyTurns = humanStats ? humanStats.cardsPlayedTotal + humanStats.drawsTaken : 0
                markDailyDone({
                    date: dailyDate.value,
                    result: dailyResult,
                    turns: dailyTurns,
                    log: turnLog.value.join(''),
                })
                // Separate from sp_game_finished, which cannot distinguish the
                // daily from a practice game, and cannot see 'eliminated' at all.
                track('daily_finished', { result: dailyResult, turns: dailyTurns })
            }
            logGameResults()
        }
    })

    async function logGameResults() {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const humanPlayer = players.value.find(p => !p.isBot)
        if (!humanPlayer) return

        const s = playerStats.value[humanPlayer.id]
        if (!s) return

        const duration = Math.round((Date.now() - gameStartTime.value) / 1000)
        let result: 'won' | 'lost' | 'eliminated' = 'lost'
        if (winnerId.value === humanPlayer.id) result = 'won'
        else if (humanPlayer.isEliminated) result = 'eliminated'

        const gameId = dailyDate.value ? `daily-${dailyDate.value}` : `bot-${Date.now()}`

        await supabase.from('game_results').insert({
            game_id: gameId,
            user_id: user.id,
            opponent_count: players.value.length - 1,
            result,
            cards_remaining: humanPlayer.hand.length,
            peak_cards: s.peakCards,
            draw_cards_played: s.drawCardsPlayed,
            wild_cards_played: s.wildCardsPlayed,
            cards_played_total: s.cardsPlayedTotal,
            skips_dealt: s.skipsDealt,
            swaps_made: s.swapsMade,
            draws_taken: s.drawsTaken,
            biggest_stack_survived: s.biggestStackSurvived,
            uno_calls: s.unoCalls,
            uno_penalties: s.unoPenalties,
            game_duration_secs: duration,
            is_bot_game: true
        })
    }

    return {
        gameState,
        turnState,
        deck,
        discardPile,
        players,
        currentPlayerIndex,
        direction,
        drawStack,
        dailyDate,
        botProfiles,
        turnLog,
        currentColor,
        winnerId,
        currentPlayer,
        topCard,
        rouletteTargetColor,
        pendingDrawnWildCard,
        pendingDiscardAllCards,
        showUnoButton,
        catchableId,
        catchNoUno,
        hasCalledUno,
        actionInProgress,
        suppressDiscardSlam,
        lastPlay,
        stackingMode,
        playerStats,
        setStackingMode,
        initializeGame,
        drawCardFromDeck,
        drawCardToHand,
        playCard,
        applyCardEffect,
        rotateHands,
        drawCardsForCurrentPlayer,
        swapHands,
        skipSwap,
        playerActionPlayCard,
        executeRouletteDraw,
        setRouletteColor,
        playDrawnWildCard,
        selectDiscardAllTop,
        callUno,
        isDealing,
        pendingDealCard,
        dealInitialCards,
        returnToLobby
    }

    function setRouletteColor(color: CardColor) {
        if (engine.setRouletteColor(engineState, color)) {
            executeRouletteDraw()
        }
    }

    function playDrawnWildCard(color: CardColor) {
        if (turnState.value !== 'CHOOSING_DRAWN_WILD_COLOR') return
        const card = pendingDrawnWildCard.value
        if (!card) return
        pendingDrawnWildCard.value = null
        turnState.value = 'WAITING_FOR_ACTION'
        playerActionPlayCard(card, color)
    }

    function selectDiscardAllTop(topCardId: string) {
        const ev = engine.selectDiscardAllTop(engineState, topCardId, hostRng)
        applyEvents(ev)
    }
})
