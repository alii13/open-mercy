/**
 * Public rooms that are alive right now, for the lobby's public table card.
 *
 * Deliberately not on the landing page. The 78% spectate-to-play conversion
 * that motivated this is measured on players who were already in a game and
 * got knocked out — not on cold visitors — and at current traffic a landing
 * strip would be empty most of the time, which advertises the opposite of
 * what it intends. The card lives where players already are, and when nothing
 * is running it offers an open table instead of counting nobody.
 *
 * The payload carries no player names by design; see game-server/directory.ts.
 */

import { ref, computed, onUnmounted } from 'vue'

const GAME_SERVER = (import.meta.env.VITE_GAME_SERVER_URL as string | undefined)
    || 'https://uno-game-server.shekhaliul44.workers.dev'

export interface LiveTable {
    code: string
    /** Seats, including ones a closed tab still holds. */
    players: number
    /** Live sockets. Absent from an older Worker's payload - fall back to players. */
    connected?: number
    seatsFree: number
    inProgress: boolean
    mode: string
    skins: string[]
    /** Absent from an old Worker's payload — derive from inProgress then. */
    status?: 'lobby' | 'playing' | 'finished'
}

/** Refresh cadence. Rooms change on the order of tens of seconds. */
const POLL_MS = 15_000

export function useLiveTables() {
    const tables = ref<LiveTable[]>([])
    /** False until a fetch succeeds, so the surface never flashes in empty. */
    const loaded = ref(false)
    let timer: ReturnType<typeof setInterval> | null = null

    async function refresh() {
        try {
            const res = await fetch(`${GAME_SERVER}/live-tables`)
            if (!res.ok) return
            const data = await res.json()
            if (Array.isArray(data)) {
                tables.value = data as LiveTable[]
                loaded.value = true
            }
        } catch {
            // Old Worker (route not deployed yet), offline, blocked — leave the
            // surface hidden rather than showing a broken panel.
        }
    }

    /** Rooms someone can actually sit down in right now. Only a room still
     *  in its lobby qualifies — `!inProgress` alone also matched finished
     *  rooms, handing joiners someone else's game-over. */
    const joinable = computed(() =>
        tables.value.filter((t) => (t.status ?? (t.inProgress ? 'playing' : 'lobby')) === 'lobby' && t.seatsFree > 0),
    )

    /** Shown as context only — a running game has no seat to take. */
    const inProgressCount = computed(() =>
        tables.value.filter((t) => t.inProgress).length,
    )

    const waitingPlayers = computed(() =>
        joinable.value.reduce((n, t) => n + t.players, 0),
    )

    /** The whole surface is conditional on this. */
    const hasAnything = computed(() =>
        loaded.value && (joinable.value.length > 0 || inProgressCount.value > 0),
    )

    // A lobby in a background tab shows its rooms to nobody. Coming back reads
    // at once, since what is on screen is then at its most out of date.
    const visible = () => typeof document === 'undefined' || document.visibilityState === 'visible'
    const onVisibility = () => { if (visible()) void refresh() }

    function start() {
        void refresh()
        if (timer) return
        timer = setInterval(() => { if (visible()) void refresh() }, POLL_MS)
        if (typeof document !== 'undefined') document.addEventListener('visibilitychange', onVisibility)
    }

    function stop() {
        if (timer) clearInterval(timer)
        timer = null
        if (typeof document !== 'undefined') document.removeEventListener('visibilitychange', onVisibility)
    }

    onUnmounted(stop)

    return { tables, loaded, joinable, inProgressCount, waitingPlayers, hasAnything, refresh, start, stop }
}
