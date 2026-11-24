/**
 * Detects when the local player crosses into a new badge on a finished game,
 * without a post-game server round-trip.
 *
 * Signed-in: snapshot the server points at game start, add this game's
 * contribution at game end. Guest: reverse this game out of the local retention
 * tally to get the "before". Either way the check uses the same source the
 * player's displayed badge uses, so the celebration can't disagree with it.
 */

import { useAuthStore } from '../stores/authStore'
import { useRetentionStore } from '../stores/retentionStore'
import { supabase } from '../lib/supabase'
import { badgeFor, pointsFromRetention, gameContribution, type GameContribution, type Badge } from '../utils/badges'
import { currentPointsBoost } from './useAnnouncement'

export function useBadgeUp() {
    const authStore = useAuthStore()
    const retention = useRetentionStore()
    let baselineServer: number | null = null

    /** Call at game start (signed-in only fetches; guests read retention live). */
    async function snapshotBaseline(): Promise<void> {
        baselineServer = null
        const id = authStore.user?.id
        if (!id) return
        try {
            const { data, error } = await supabase.rpc('player_points', { ids: [id] })
            if (error) return
            const row = (data ?? [])[0] as { points: number } | undefined
            baselineServer = row ? Number(row.points) : 0
        } catch {
            // Offline or function not installed — no self badge-up this game.
        }
    }

    /** The new Badge if this finished game crossed a tier, else null. For guests
     *  call AFTER retention.recordGameResult (it reads the updated tally). */
    function crossed(g: GameContribution): Badge | null {
        let before: number
        let after: number
        if (authStore.user?.id) {
            if (baselineServer === null) return null
            before = baselineServer
            // A points announcement the player joined multiplies this game, as the server does.
            after = before + gameContribution(g) * currentPointsBoost()
            baselineServer = after
        } else {
            const now = { gamesPlayed: retention.gamesPlayed, gamesWon: retention.gamesWon, unoCalls: retention.totalUnos }
            after = pointsFromRetention(now)
            before = pointsFromRetention({
                gamesPlayed: now.gamesPlayed - 1,
                gamesWon: now.gamesWon - (g.won ? 1 : 0),
                unoCalls: now.unoCalls - g.unoCalls,
            })
        }
        const a = badgeFor(after)
        return a.tier > badgeFor(before).tier ? a : null
    }

    return { snapshotBaseline, crossed }
}
