/**
 * Leaderboard reads via the SECURITY DEFINER functions in
 * supabase/leaderboards.sql / leaderboards-v2.sql / leaderboards-alltime.sql
 * (game_results RLS is owner-select-only, so public boards go through a
 * definer read).
 *
 * Feature-detects: until the SQL has been run on the project, the rpc
 * errors and `available` stays false — callers hide the board entirely.
 * The v2 columns (share_code, country, skin, lifetime_wins) and the
 * my-rank context are optional the same way: absent until v2 is run.
 * The all-time board detects separately via `alltimeAvailable`, so a project
 * without leaderboards-alltime.sql still shows the daily and weekly tabs.
 */

import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { localDateString } from '../utils/seededRng'
import { getDailyRecord } from '../utils/dailyChallenge'
import { useAuthStore } from '../stores/authStore'

export interface DailyRow {
    rank: number
    user_id?: string | null
    username: string
    share_code?: string | null
    country?: string | null
    skin?: string | null
    lifetime_wins?: number
    result: 'won' | 'lost' | 'eliminated'
    effort: number
    duration_secs: number
    is_me: boolean
}

export interface WeeklyRow {
    rank: number
    user_id?: string | null
    username: string
    share_code?: string | null
    country?: string | null
    skin?: string | null
    lifetime_wins?: number
    wins: number
    games: number
    is_me: boolean
}

/** One row of the permanent board, ranked on badge points. */
export interface AlltimeRow {
    rank: number
    user_id?: string | null
    username: string
    share_code?: string | null
    country?: string | null
    skin?: string | null
    games: number
    wins: number
    points: number
    is_me: boolean
}

/** A country with at least one ranked player, for the board's filter. */
export interface CountryOption {
    country: string
    players: number
}

/** The hero slab's extra stats, read from the existing public_profile(). */
export interface Champion {
    user_id: string | null
    username: string
    country: string | null
    share_code: string | null
    member_since: string | null
    games: number
    wins: number
    points: number
}

/** The viewer's own position — even when they're far below the top rows. */
export interface BoardContext {
    my_rank: number | null
    total_players: number
}

/** The all-time board also returns the viewer's own totals, so the pinned
 *  row renders complete without a second query. */
export interface AlltimeContext extends BoardContext {
    games: number
    wins: number
    points: number
}

/** One weekly spotlight: a skill archetype's holder this week. */
export interface Spotlight {
    kind: 'fastest_win' | 'biggest_stack' | 'most_wins'
    username: string
    share_code: string | null
    country: string | null
    value: number
}

export function useLeaderboard() {
    // Guilty until proven installed: the link renders only after a probe
    // succeeds, so there's no flash of a dead feature.
    const available = ref(false)
    const alltimeAvailable = ref(false)
    const loading = ref(false)
    const alltimeLoading = ref(false)
    const daily = ref<DailyRow[]>([])
    const weekly = ref<WeeklyRow[]>([])
    const alltime = ref<AlltimeRow[]>([])
    const dailyContext = ref<BoardContext | null>(null)
    const weeklyContext = ref<BoardContext | null>(null)
    const alltimeContext = ref<AlltimeContext | null>(null)
    const spotlights = ref<Spotlight[]>([])
    const countries = ref<CountryOption[]>([])
    const champion = ref<Champion | null>(null)
    /** null = global. The all-time board and its self row share this slice. */
    const country = ref<string | null>(null)

    async function fetchBoards() {
        loading.value = true
        try {
            const [d, w, dc, wc, sp] = await Promise.all([
                supabase.rpc('daily_leaderboard', { challenge_date: localDateString() }),
                supabase.rpc('weekly_wins_leaderboard'),
                supabase.rpc('daily_my_rank', { challenge_date: localDateString() }),
                supabase.rpc('weekly_my_rank'),
                supabase.rpc('weekly_spotlights'),
            ])
            if (d.error && w.error) {
                // Functions not installed yet — hide the feature.
                available.value = false
                return
            }
            available.value = true
            daily.value = (d.data || []) as DailyRow[]
            weekly.value = (w.data || []) as WeeklyRow[]
            // v2-only context functions: errors just mean v2 isn't installed.
            dailyContext.value = dc.error ? null : ((dc.data as BoardContext[] | null)?.[0] ?? null)
            weeklyContext.value = wc.error ? null : ((wc.data as BoardContext[] | null)?.[0] ?? null)
            spotlights.value = sp.error ? [] : ((sp.data || []) as Spotlight[])
        } catch {
            available.value = false
        } finally {
            loading.value = false
        }
    }

    /** Also the country-change path: the filter reranks the whole board. */
    async function fetchAlltime() {
        alltimeLoading.value = true
        try {
            const [a, ctx, c] = await Promise.all([
                supabase.rpc('alltime_leaderboard', { p_country: country.value }),
                supabase.rpc('alltime_my_rank', { p_country: country.value }),
                supabase.rpc('alltime_countries'),
            ])
            if (a.error) {
                // leaderboards-alltime.sql not run — hide only this tab.
                alltimeAvailable.value = false
                return
            }
            alltimeAvailable.value = true
            alltime.value = (a.data || []) as AlltimeRow[]
            alltimeContext.value = ctx.error ? null : ((ctx.data as AlltimeContext[] | null)?.[0] ?? null)
            countries.value = c.error ? [] : ((c.data || []) as CountryOption[])
            await fetchChampion()
        } catch {
            alltimeAvailable.value = false
        } finally {
            alltimeLoading.value = false
        }
    }

    /**
     * Everything the slab shows comes from the board row itself, except how
     * long they have been playing — that is read from the existing
     * public_profile(), keyed on the leader's share code, rather than adding
     * a fourth definer function for one column. A leader with no share code
     * still renders, just without the date.
     */
    async function fetchChampion() {
        const top = alltime.value[0]
        if (!top) {
            champion.value = null
            return
        }
        const base: Champion = {
            user_id: top.user_id ?? null,
            username: top.username,
            country: top.country ?? null,
            share_code: top.share_code ?? null,
            member_since: null,
            games: top.games,
            wins: top.wins,
            points: top.points,
        }
        if (!top.share_code) {
            champion.value = base
            return
        }
        const { data, error } = await supabase.rpc('public_profile', { p_share_code: top.share_code })
        const row = error ? null : (data as Record<string, unknown>[] | null)?.[0]
        champion.value = row
            ? { ...base, member_since: (row.member_since as string) ?? null }
            : base
    }

    /** Reslice the permanent board. null is global. */
    async function setCountry(next: string | null) {
        if (country.value === next) return
        country.value = next
        await fetchAlltime()
    }

    return {
        available,
        alltimeAvailable,
        loading,
        alltimeLoading,
        daily,
        weekly,
        alltime,
        dailyContext,
        weeklyContext,
        alltimeContext,
        spotlights,
        countries,
        champion,
        country,
        fetchBoards,
        fetchAlltime,
        setCountry,
    }
}

/** "Today's top" draws five rows. */
const LOBBY_ROWS = 5
/** The lobby unmounts for every game and every page, and most players come
 *  back to it a few minutes later. Their own place only moves when they play
 *  the daily, which changes the key below and reads at once. */
const LOBBY_FRESH_MS = 5 * 60_000

const lobbyAvailable = ref(false)
const lobbyDaily = ref<DailyRow[]>([])
const lobbyContext = ref<BoardContext | null>(null)
let lobbyKey = ''
let lobbyReadAt = 0

/**
 * The lobby's board: today's top five and the viewer's place, nothing the
 * lobby does not draw. Held at module level so a return to the lobby shows
 * the same board without asking again.
 */
export function useLobbyBoard() {
    const auth = useAuthStore()

    async function fetchDaily() {
        const date = localDateString()
        // The viewer is in the key: my_rank and is_me belong to whoever is signed in.
        const key = `${auth.user?.id ?? ''}:${date}:${getDailyRecord()?.result ?? ''}`
        if (key === lobbyKey && Date.now() - lobbyReadAt < LOBBY_FRESH_MS) return
        // Not the last player's rank on the next player's screen while this loads.
        if (!lobbyKey.startsWith(`${auth.user?.id ?? ''}:`)) {
            lobbyDaily.value = []
            lobbyContext.value = null
        }
        try {
            const [d, dc] = await Promise.all([
                supabase.rpc('daily_leaderboard', { challenge_date: date, max_rows: LOBBY_ROWS }),
                supabase.rpc('daily_my_rank', { challenge_date: date }),
            ])
            if (d.error) {
                // Functions not installed yet: hide the board.
                lobbyAvailable.value = false
                return
            }
            lobbyAvailable.value = true
            lobbyDaily.value = (d.data || []) as DailyRow[]
            lobbyContext.value = dc.error ? null : ((dc.data as BoardContext[] | null)?.[0] ?? null)
            lobbyKey = key
            lobbyReadAt = Date.now()
        } catch {
            lobbyAvailable.value = false
        }
    }

    return { available: lobbyAvailable, daily: lobbyDaily, dailyContext: lobbyContext, fetchDaily }
}
