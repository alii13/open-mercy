/**
 * The profile sections public_profile() cannot derive for itself.
 *
 * public_profile() returns one row of aggregates, which covers the badge and
 * the personal bests. Standing, the games list and head-to-head all need data
 * that owner-only RLS keeps out of the client, so they come from the definer
 * functions in supabase/profile-dossier.sql and supabase/profile-games.sql.
 *
 * Each is feature-detected independently: a profile missing one section is far
 * better than a profile that fails to render because one function has not been
 * created yet. Running the SQL and shipping the frontend can happen in either
 * order.
 */

import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import type { GameOpponent, HeadToHeadLast } from '../utils/profileGames'

export interface ProfileStanding {
    globalRank: number | null
    globalTotal: number
    countryRank: number | null
    countryTotal: number
}

export interface ProfileGame {
    played_at: string
    result: 'won' | 'lost' | 'eliminated' | 'abandoned'
    is_bot_game: boolean
    opponent_count: number
    cards_played_total: number
    cards_remaining: number
    peak_cards: number
    biggest_stack_survived: number
    points: number
    is_daily: boolean
    opponents: GameOpponent[]
}

export interface HeadToHead extends HeadToHeadLast {
    games: number
    my_wins: number
    their_wins: number
}

interface RankRow {
    global_rank: number | null
    global_total: number
    country_rank: number | null
    country_total: number
}

export function useProfileDossier() {
    const standing = ref<ProfileStanding | null>(null)
    const games = ref<ProfileGame[]>([])
    const headToHead = ref<HeadToHead | null>(null)
    const loading = ref(false)

    function reset() {
        standing.value = null
        games.value = []
        headToHead.value = null
    }

    /** Bumped per fetch, so a slow answer for the last profile never lands on this one. */
    let seq = 0

    async function fetchDossier(shareCode: string) {
        if (!shareCode) return
        const mine = ++seq
        loading.value = true
        reset()
        try {
            const [r, g, h] = await Promise.all([
                supabase.rpc('profile_rank', { p_share_code: shareCode }),
                supabase.rpc('profile_games', { p_share_code: shareCode, p_limit: 3 }),
                supabase.rpc('profile_head_to_head', { p_share_code: shareCode }),
            ])
            if (mine !== seq) return

            if (!r.error) {
                const row = (r.data as RankRow[] | null)?.[0]
                // A player with no games ranks nowhere; that is a hidden panel,
                // not an error.
                if (row?.global_rank != null) {
                    standing.value = {
                        globalRank: row.global_rank,
                        globalTotal: row.global_total ?? 0,
                        countryRank: row.country_rank ?? null,
                        countryTotal: row.country_total ?? 0,
                    }
                }
            }

            if (!g.error) games.value = (g.data as ProfileGame[] | null) ?? []

            if (!h.error) headToHead.value = (h.data as HeadToHead[] | null)?.[0] ?? null
        } catch {
            // Offline, or the SQL has not been run — the page still renders
            // everything public_profile already gave it.
            if (mine === seq) reset()
        } finally {
            if (mine === seq) loading.value = false
        }
    }

    return { standing, games, headToHead, loading, fetchDossier }
}
