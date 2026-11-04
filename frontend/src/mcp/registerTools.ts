/**
 * WebMCP tool layer for UNO No Mercy.
 *
 * Exposes the live game as MCP tools so a visiting agent can play a real seat
 * through the actual Pinia stores. No game rules are reimplemented here — every
 * move tool is a thin wrapper over `multiplayerStore` (online) or `gameStore`
 * (single-player), which remain the single source of truth. The only logic that
 * lives here is read-shaping, legal-move computation (via the exported
 * `canPlayCard`), and dynamic tool registration that mirrors the current legal
 * actions so the agent can infer what to do at each step.
 *
 * Two surfaces are populated:
 *   - `window.__unoMcp` — always present; the reliable contract for the headless
 *     driver and any non-standard client. `{ version, listTools, callTool }`.
 *   - `navigator.modelContext` — best-effort registration against the emerging
 *     WebMCP standard so a standards-capable agentic browser auto-discovers the
 *     tools just by visiting the site. Absent in most browsers today; guarded.
 */
import { watch } from 'vue'
import type { Pinia } from 'pinia'
import { useMultiplayerStore } from '../stores/multiplayerStore'
import { useGameStore } from '../stores/gameStore'
import { useAuthStore } from '../stores/authStore'
import { canPlayCard } from '../utils/gameRules'
import type { Card, CardColor } from '../types/card'

type Mode = 'lobby' | 'single' | 'multi'

const COLORS: CardColor[] = ['red', 'blue', 'green', 'yellow']
const HUMAN_ID = 'p-0'

interface JsonSchema {
    type: 'object'
    properties?: Record<string, unknown>
    required?: string[]
}

interface ToolDef {
    name: string
    description: string
    inputSchema: JsonSchema
    handler: (args: Record<string, any>) => Promise<unknown>
}

interface ToolInfo {
    name: string
    description: string
    inputSchema: JsonSchema
}

const HOW_TO_PLAY = `RUNE RIOT — how to play (you only need this to play *well*; you can play
*legally* just by picking from \`legal_moves\` in get_state).

Goal: be the first to empty your hand. If your hand ever reaches 25 cards you are
ELIMINATED (the Ruin Rule) — avoid getting buried under draw stacks.

A card is playable if it matches the current color, or matches the top card's
number/symbol, or is a wild. When a draw card is on top and a draw stack is
active you may only respond with another draw card (stacking rules vary by mode).

Card types beyond the classic deck:
  - draw2 / draw4 / draw6 / draw10: stack penalties onto the next player.
  - skipEveryone: everyone is skipped, you play again.
  - reverse: flips direction (acts as skip in a 2-player game).
  - discardAll: discard every card of the chosen color at once.
  - number 0: all hands rotate in the direction of play.
  - number 7: swap your entire hand with a chosen opponent.
  - wildColorRoulette: the next player draws until they hit the chosen color.

Tactics: dump big draw cards when an opponent is low; hold a 7-swap to offload a
huge hand; keep a wild as an escape; and CALL RIOT the moment you are about to be
left with one card or you take a penalty.

The play loop: call wait_for_turn, then get_state, then choose one of the actions
in \`legal_moves\`, then repeat until the game is finished.`

export function registerMcpTools(pinia: Pinia): void {
    const mp = useMultiplayerStore(pinia)
    const sp = useGameStore(pinia)
    const auth = useAuthStore(pinia)

    // Multiplayer needs a session. A visiting agent never clicks PLAY NOW, so
    // provision the same guest session the button would.
    const ensureSession = async () => {
        if (!auth.user) await auth.signInAnonymously()
    }

    const mode = (): Mode => {
        if (mp.currentGame) return 'multi'
        if (sp.gameState !== 'LOBBY') return 'single'
        return 'lobby'
    }

    // ---- read model ----------------------------------------------------------

    const myHand = (): Card[] => {
        if (mode() === 'multi') return (mp.myPlayer?.hand as Card[]) ?? []
        if (mode() === 'single') return (sp.players[0]?.hand as Card[]) ?? []
        return []
    }

    const topCard = (): Card | undefined => {
        if (mode() === 'multi') {
            const pile = (mp.currentGame?.discard_pile as Card[]) ?? []
            return pile[pile.length - 1]
        }
        return sp.topCard as Card | undefined
    }

    const ruleContext = () => {
        if (mode() === 'multi') {
            return {
                color: (mp.currentGame?.current_color as CardColor) ?? 'red',
                drawStack: mp.currentGame?.draw_stack ?? 0,
                stackingMode: mp.stackingMode,
            }
        }
        return { color: sp.currentColor, drawStack: sp.drawStack, stackingMode: sp.stackingMode }
    }

    const turnStateOf = (): string => {
        if (mode() === 'multi') return mp.currentGame?.turn_state ?? 'WAITING_FOR_ACTION'
        return sp.turnState
    }

    const isMyTurn = (): boolean => {
        if (mode() === 'multi') return mp.isMyTurn
        if (mode() === 'single') return sp.gameState === 'PLAYING' && sp.currentPlayerIndex === 0
        return false
    }

    const pendingDrawnWild = (): Card | null => {
        if (mode() === 'multi') return (mp.pendingDrawnWildCard as Card | null) ?? null
        return (sp.pendingDrawnWildCard as Card | null) ?? null
    }

    const pendingDiscardAll = (): Card[] => {
        if (mode() === 'multi') return (mp.pendingDiscardAllCards as Card[]) ?? []
        return (sp.pendingDiscardAllCards as Card[]) ?? []
    }

    const legalPlays = (): Card[] => {
        const top = topCard()
        if (!top) return []
        const { color, drawStack, stackingMode } = ruleContext()
        return myHand().filter((c) => canPlayCard(c, top, color, drawStack, stackingMode))
    }

    const opponents = (): Array<{ id: string; name: string; card_count: number | null }> => {
        if (mode() === 'multi') {
            const meId = mp.myPlayer?.user_id
            return mp.gamePlayers
                .filter((p) => p.user_id !== meId)
                .map((p) => ({
                    id: p.user_id,
                    name: p.name,
                    card_count: Array.isArray(p.hand) ? (p.hand as Card[]).length : null,
                }))
        }
        if (mode() === 'single') {
            return sp.players
                .filter((p) => p.id !== HUMAN_ID)
                .map((p) => ({ id: p.id, name: p.name, card_count: p.hand.length }))
        }
        return []
    }

    // Mirror legal_moves: what the agent can legally do right now and how.
    const requiredAction = (): { action: string; options: unknown } => {
        const ts = turnStateOf()
        if (mode() === 'lobby') {
            return { action: 'start_or_join', options: null }
        }
        if (!isMyTurn()) return { action: 'wait_for_turn', options: null }
        if (pendingDrawnWild()) {
            return { action: 'choose_wild_color', options: { colors: COLORS } }
        }
        switch (ts) {
            case 'CHOOSING_PLAYER_TO_SWAP':
                return { action: 'choose_swap_target', options: { players: opponents(), may_skip: true } }
            case 'CHOOSING_ROULETTE_COLOR':
                return { action: 'choose_roulette_color', options: { colors: COLORS } }
            case 'CHOOSING_DISCARD_ALL_TOP':
                return {
                    action: 'choose_discard_all_top',
                    options: { cards: pendingDiscardAll().map((c) => c.id) },
                }
            case 'DEALING':
            case 'ROULETTE_DRAWING':
                return { action: 'wait', options: null }
            default:
                return {
                    action: 'play_or_draw',
                    options: {
                        playable: legalPlays().map((c) => ({
                            id: c.id,
                            color: c.color,
                            type: c.type,
                            value: c.value,
                            needs_color: c.color === 'wild',
                        })),
                        can_draw: true,
                    },
                }
        }
    }

    const shouldCallUno = (): boolean => myHand().length <= 2 && isMyTurn()

    const buildState = () => {
        const m = mode()
        const top = topCard()
        const { color, drawStack } = ruleContext()
        const whoseTurn = (() => {
            if (m === 'multi') {
                if (mp.isMyTurn) return 'you'
                const cur = mp.gamePlayers.find((p) => p.user_id === mp.currentGame?.current_player_id)
                return cur?.name ?? 'unknown'
            }
            if (m === 'single') {
                if (sp.currentPlayerIndex === 0) return 'you'
                return sp.players[sp.currentPlayerIndex]?.name ?? 'unknown'
            }
            return null
        })()

        return {
            mode: m,
            status:
                m === 'multi'
                    ? mp.currentGame?.status
                    : m === 'single'
                      ? sp.gameState
                      : 'lobby',
            room_code: m === 'multi' ? mp.roomCode : null,
            whose_turn: whoseTurn,
            your_hand: myHand().map((c) => ({ id: c.id, color: c.color, type: c.type, value: c.value })),
            top_card: top ? { color: top.color, type: top.type, value: top.value } : null,
            current_color: m === 'lobby' ? null : color,
            direction: m === 'multi' ? mp.currentGame?.direction : m === 'single' ? sp.direction : null,
            draw_stack: m === 'lobby' ? 0 : drawStack,
            opponents: opponents(),
            required_action: requiredAction(),
            should_call_uno: shouldCallUno(),
        }
    }

    // ---- guards & helpers ----------------------------------------------------

    const requireInGame = () => {
        if (mode() === 'lobby') throw new Error('No active game. Start single-player or create/join a multiplayer game first.')
    }

    const requireMyTurn = () => {
        requireInGame()
        if (!isMyTurn()) throw new Error('It is not your turn. Call wait_for_turn first.')
    }

    const findInHand = (cardId: string): Card => {
        const card = myHand().find((c) => c.id === cardId)
        if (!card) throw new Error(`Card "${cardId}" is not in your hand. See get_state.your_hand.`)
        return card
    }

    const requireColor = (color: unknown): CardColor => {
        if (typeof color !== 'string' || !COLORS.includes(color as CardColor)) {
            throw new Error(`color must be one of: ${COLORS.join(', ')}`)
        }
        return color as CardColor
    }

    // Resolve when the agent has an action to take, or after timeout.
    const waitForTurn = (timeoutMs: number): Promise<unknown> => {
        const actionable = () => mode() !== 'lobby' && isMyTurn() && !['DEALING', 'ROULETTE_DRAWING'].includes(turnStateOf())
        if (actionable()) return Promise.resolve(buildState())
        return new Promise((resolve) => {
            let settled = false
            const stop = watch(
                () => [mode(), isMyTurn(), turnStateOf(), pendingDrawnWild()?.id],
                () => {
                    if (!settled && actionable()) {
                        settled = true
                        stop()
                        resolve(buildState())
                    }
                },
            )
            setTimeout(() => {
                if (!settled) {
                    settled = true
                    stop()
                    resolve({ timed_out: true, ...(buildState() as object) })
                }
            }, timeoutMs)
        })
    }

    // ---- tool catalog --------------------------------------------------------

    const noArgs: JsonSchema = { type: 'object', properties: {} }

    const all: ToolDef[] = [
        {
            name: 'how_to_play',
            description: 'Return a primer on RUNE RIOT rules, card types, and basic tactics.',
            inputSchema: noArgs,
            handler: async () => ({ guide: HOW_TO_PLAY }),
        },
        {
            name: 'get_state',
            description:
                'Snapshot of the current game from your seat: your hand, the public table state, whose turn it is, what action is required of you now, and the exact legal moves. Opponent hands are never revealed. Read this before every move.',
            inputSchema: noArgs,
            handler: async () => buildState(),
        },
        {
            name: 'wait_for_turn',
            description:
                'Block until it is your turn or an action is required of you, then return the fresh state. Use this instead of polling. Resolves immediately if you can already act.',
            inputSchema: {
                type: 'object',
                properties: { timeout_ms: { type: 'number', description: 'Max wait in ms (default 60000).' } },
            },
            handler: async (args) => waitForTurn(typeof args.timeout_ms === 'number' ? args.timeout_ms : 60000),
        },
        {
            name: 'start_single_player',
            description: 'Start an offline game against the bot, exactly like the in-app vs-bot game: you versus one bot ("Terminator"). Deals hands and begins play.',
            inputSchema: {
                type: 'object',
                properties: {
                    stacking_mode: { type: 'string', enum: ['official', 'house', 'casual'] },
                },
            },
            handler: async (args) => {
                // Mirror startLocalGame (App.vue): you vs one bot, "Terminator".
                // Only initialize — the mounted GameView deals the hands when it
                // sees `isDealing` flip true; dealing here too would double-deal.
                // The agent calls wait_for_turn to wait out the deal.
                sp.initializeGame(['You', 'Terminator'], args.stacking_mode)
                return buildState()
            },
        },
        {
            name: 'create_multiplayer_game',
            description: 'Create an online room and become the host. Returns the room code to share.',
            inputSchema: {
                type: 'object',
                properties: { stacking_mode: { type: 'string', enum: ['official', 'house', 'casual'] } },
            },
            handler: async (args) => {
                await ensureSession()
                const game = await mp.createGame(args.stacking_mode)
                return { room_code: game?.room_code ?? null, ...(buildState() as object) }
            },
        },
        {
            name: 'join_multiplayer_game',
            description: 'Join an online room by its 6-character room code.',
            inputSchema: {
                type: 'object',
                properties: { room_code: { type: 'string' } },
                required: ['room_code'],
            },
            handler: async (args) => {
                if (typeof args.room_code !== 'string') throw new Error('room_code is required.')
                await ensureSession()
                await mp.joinGame(args.room_code)
                return buildState()
            },
        },
        {
            name: 'start_multiplayer_game',
            description: 'Start the multiplayer game you host. Requires at least 2 players.',
            inputSchema: noArgs,
            handler: async () => {
                await mp.startGame()
                return buildState()
            },
        },
        {
            name: 'play_card',
            description:
                'Play a card from your hand by id. For wild cards you must also pass a color. The move is rejected if it is not in your current legal moves.',
            inputSchema: {
                type: 'object',
                properties: {
                    card_id: { type: 'string' },
                    color: { type: 'string', enum: COLORS, description: 'Required for wild cards.' },
                },
                required: ['card_id'],
            },
            handler: async (args) => {
                requireMyTurn()
                const card = findInHand(String(args.card_id))
                const top = topCard()
                const { color, drawStack, stackingMode } = ruleContext()
                if (!top || !canPlayCard(card, top, color, drawStack, stackingMode)) {
                    throw new Error('That card is not a legal play right now. See get_state.required_action.')
                }
                let chosen: CardColor | undefined
                if (card.color === 'wild') chosen = requireColor(args.color)
                if (mode() === 'multi') await mp.playCard(card, chosen)
                else sp.playerActionPlayCard(card, chosen)
                return buildState()
            },
        },
        {
            name: 'draw_card',
            description:
                'Draw from the deck. If a draw stack is active you take the penalty; otherwise you draw until you find a playable card.',
            inputSchema: noArgs,
            handler: async () => {
                requireMyTurn()
                if (mode() === 'multi') await mp.drawCard()
                else sp.drawCardsForCurrentPlayer()
                return buildState()
            },
        },
        {
            name: 'pick_wild_color',
            description: 'Choose the color for a wild card you just drew and are about to play.',
            inputSchema: {
                type: 'object',
                properties: { color: { type: 'string', enum: COLORS } },
                required: ['color'],
            },
            handler: async (args) => {
                requireMyTurn()
                if (!pendingDrawnWild()) throw new Error('No drawn wild card is waiting for a color.')
                const c = requireColor(args.color)
                if (mode() === 'multi') await mp.playDrawnWildCard(c)
                else sp.playDrawnWildCard(c)
                return buildState()
            },
        },
        {
            name: 'call_uno',
            description: 'Call MERCY (the last-card call). Do this when you are about to be left with one card to avoid a penalty.',
            inputSchema: noArgs,
            handler: async () => {
                requireInGame()
                // Mirror the UI's gating: callable on your own turn at <=2 cards,
                // or while you're exposed in a catch window. Anything else would
                // let an agent mutate UNO state at arbitrary moments.
                const exposedSelf =
                    (mode() === 'single' && sp.catchableId === HUMAN_ID) ||
                    (mode() === 'multi' && !!mp.catchableUserId && mp.catchableUserId === mp.myPlayer?.user_id)
                if (!shouldCallUno() && !exposedSelf) {
                    throw new Error('Calling MERCY is not available right now.')
                }
                if (mode() === 'multi') await mp.callUno()
                else sp.callUno(HUMAN_ID)
                return buildState()
            },
        },
        {
            name: 'swap_hands',
            description: 'After playing a number 7, swap your entire hand with the chosen opponent.',
            inputSchema: {
                type: 'object',
                properties: { target_player_id: { type: 'string' } },
                required: ['target_player_id'],
            },
            handler: async (args) => {
                requireMyTurn()
                if (typeof args.target_player_id !== 'string') throw new Error('target_player_id is required.')
                if (mode() === 'multi') await mp.swapHands(args.target_player_id)
                else sp.swapHands(args.target_player_id)
                return buildState()
            },
        },
        {
            name: 'skip_swap',
            description: 'Decline the number 7 swap and pass your turn.',
            inputSchema: noArgs,
            handler: async () => {
                requireMyTurn()
                if (mode() === 'multi') await mp.skipSwap()
                else sp.skipSwap()
                return buildState()
            },
        },
        {
            name: 'set_roulette_color',
            description: 'Choose the target color when you are the victim of a wild color roulette.',
            inputSchema: {
                type: 'object',
                properties: { color: { type: 'string', enum: COLORS } },
                required: ['color'],
            },
            handler: async (args) => {
                requireMyTurn()
                const c = requireColor(args.color)
                if (mode() === 'multi') await mp.setRouletteColor(c)
                else sp.setRouletteColor(c)
                return buildState()
            },
        },
        {
            name: 'select_discard_all_top',
            description: 'After a discard-all, choose which of the discarded cards lands on top of the pile.',
            inputSchema: {
                type: 'object',
                properties: { card_id: { type: 'string' } },
                required: ['card_id'],
            },
            handler: async (args) => {
                requireMyTurn()
                if (typeof args.card_id !== 'string') throw new Error('card_id is required.')
                if (mode() === 'multi') await mp.selectDiscardAllTop(args.card_id)
                else sp.selectDiscardAllTop(args.card_id)
                return buildState()
            },
        },
        {
            name: 'leave_game',
            description: 'Leave the current game and return to the lobby.',
            inputSchema: noArgs,
            handler: async () => {
                requireInGame()
                if (mode() === 'multi') await mp.leaveGame()
                else sp.returnToLobby()
                return buildState()
            },
        },
    ]

    const byName = new Map(all.map((t) => [t.name, t]))

    // Tools available right now, given mode and required action. Always-available
    // tools plus the ones that make sense in the current state.
    const activeToolNames = (): string[] => {
        const m = mode()
        const base = ['how_to_play', 'get_state']
        if (m === 'lobby') {
            return [...base, 'start_single_player', 'create_multiplayer_game', 'join_multiplayer_game']
        }
        const names = [...base, 'wait_for_turn', 'leave_game']
        if (m === 'multi' && mp.currentGame?.status === 'waiting') names.push('start_multiplayer_game')
        const { action } = requiredAction()
        switch (action) {
            case 'play_or_draw':
                names.push('play_card', 'draw_card')
                if (shouldCallUno()) names.push('call_uno')
                break
            case 'choose_wild_color':
                names.push('pick_wild_color')
                break
            case 'choose_swap_target':
                names.push('swap_hands', 'skip_swap')
                break
            case 'choose_roulette_color':
                names.push('set_roulette_color')
                break
            case 'choose_discard_all_top':
                names.push('select_discard_all_top')
                break
        }
        return names
    }

    const callTool = async (name: string, args: Record<string, any> = {}) => {
        const tool = byName.get(name)
        if (!tool) throw new Error(`Unknown tool: ${name}`)
        return tool.handler(args ?? {})
    }

    const listTools = (): ToolInfo[] =>
        activeToolNames()
            .map((n) => byName.get(n))
            .filter((t): t is ToolDef => Boolean(t))
            .map(({ name, description, inputSchema }) => ({ name, description, inputSchema }))

    // ---- surfaces ------------------------------------------------------------

    // Reliable contract for the headless driver and non-standard clients. Always
    // present, no dependencies. `listTools` reflects the currently-legal subset;
    // `callTool` reaches every tool regardless (handlers guard themselves).
    ;(window as any).__unoMcp = { version: 1, listTools, callTool }

    // WebMCP standard surface (navigator.modelContext via the mcp-b polyfill +
    // TabServerTransport) so a visiting agent auto-discovers the tools. Loaded
    // lazily so zod + the MCP SDK code-split out of the main bundle that every
    // human visitor downloads. Best-effort: never block or break the app.
    const catalog: ToolCatalog = {
        serverName: 'open-mercy',
        serverVersion: '1.0.0',
        tools: all.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
        callTool,
    }
    // Defer the transport fetch to idle time. It's a separate chunk, but firing
    // the import eagerly still made every human visitor download + parse the MCP
    // SDK while the app was booting. An agent connects via postMessage after the
    // page settles, so idle is soon enough; humans get a lighter first load.
    const loadWebMcp = () => {
        void import('./webmcpServer')
            .then((m) => m.connectWebMcp(catalog))
            .catch((err) => console.warn('[uno-mcp] WebMCP transport unavailable:', err))
    }
    const ric = (window as any).requestIdleCallback as
        | ((cb: () => void, opts?: { timeout: number }) => number)
        | undefined
    if (ric) ric(loadWebMcp, { timeout: 3000 })
    else setTimeout(loadWebMcp, 1200)
}

export interface ToolCatalog {
    serverName: string
    serverVersion: string
    tools: Array<{ name: string; description: string; inputSchema: JsonSchema }>
    callTool: (name: string, args: Record<string, any>) => Promise<unknown>
}
