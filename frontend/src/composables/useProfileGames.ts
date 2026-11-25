/**
 * One player's games, a page at a time, from profile_games
 * (supabase/profile-games.sql). Pages run backwards by played_at.
 */

import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import type { ProfileGame } from './useProfileDossier'

export type GamesFilter = 'all' | 'won' | 'with_viewer' | 'daily'

export const GAMES_PAGE = 20

export function useProfileGames() {
    const games = ref<ProfileGame[]>([])
    const loading = ref(false)
    const failed = ref(false)
    const more = ref(false)
    /** Bumped per request, so an answer for an old filter or player is dropped. */
    let seq = 0

    async function load(code: string, filter: GamesFilter, append = false) {
        const mine = ++seq
        loading.value = true
        failed.value = false
        if (!append) games.value = []
        // ponytail: paging on played_at alone skips a game saved in the same
        // millisecond as a page's last row; add the row id as a tie-break if that bites.
        const before = append ? games.value[games.value.length - 1]?.played_at ?? null : null
        const { data, error } = await supabase.rpc('profile_games', {
            p_share_code: code,
            p_before: before,
            p_limit: GAMES_PAGE,
            p_filter: filter,
        })
        if (mine !== seq) return
        loading.value = false
        if (error) {
            failed.value = true
            return
        }
        const rows = (data as ProfileGame[] | null) ?? []
        games.value = append ? [...games.value, ...rows] : rows
        more.value = rows.length === GAMES_PAGE
    }

    return { games, loading, failed, more, load }
}
