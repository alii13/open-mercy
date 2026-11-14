/**
 * How many players have reached each tier, via badge_holders (supabase/badge-holders.sql).
 * Feature-detects like useBadges: until the SQL is installed the counts stay empty and
 * the badges screen simply leaves the "held by" line out. Read once per session.
 */

import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { BADGES } from '../utils/badges'
import { isFatalSchemaError } from '../utils/supabaseErrors'

/** tier (1-20) -> players who have reached it; total is everyone with a game. */
const holders = ref<{ byTier: Record<number, number>; total: number } | null>(null)
let asked = false

export function useBadgeHolders() {
    async function fetchHolders() {
        if (asked) return
        asked = true
        const { data, error } = await supabase.rpc('badge_holders', { thresholds: BADGES.map(b => b.threshold) })
        if (error) {
            // Not installed yet (or a dropped request): no counts this session, nothing breaks.
            if (!isFatalSchemaError(error)) asked = false
            return
        }
        const rows = (data ?? []) as { threshold: number; players: number; total: number }[]
        const byTier: Record<number, number> = {}
        for (const b of BADGES) byTier[b.tier] = Number(rows.find(r => Number(r.threshold) === b.threshold)?.players ?? 0)
        holders.value = { byTier, total: Number(rows[0]?.total ?? 0) }
    }
    return { holders, fetchHolders }
}
