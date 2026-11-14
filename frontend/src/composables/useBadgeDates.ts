/**
 * The day the signed-in player reached each tier, via my_badge_dates (supabase/badge-dates.sql).
 * Feature-detects like useBadgeHolders: until the SQL is installed, or for a signed-out visitor,
 * there are no dates and the shelf plaques just say "Earned". Per page, so every visit reads
 * fresh dates and a signed-out visitor never sees the last account's.
 */

import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { BADGES } from '../utils/badges'

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function useBadgeDates() {
    /** tier (1-20) -> "Sep 21", for tiers the player has reached. */
    const dates = ref<Record<number, string>>({})
    let askedFor: string | null = null

    async function fetchDates(userId: string | null) {
        askedFor = userId
        dates.value = {}
        if (!userId) return
        const { data, error } = await supabase.rpc('my_badge_dates', { thresholds: BADGES.map(b => b.threshold) })
        // A response for an account that is no longer signed in is dropped.
        if (error || askedFor !== userId) return
        const out: Record<number, string> = {}
        for (const row of (data ?? []) as { threshold: number; reached_on: string | null }[]) {
            const badge = BADGES.find(b => b.threshold === Number(row.threshold))
            if (badge && row.reached_on) out[badge.tier] = short(row.reached_on)
        }
        dates.value = out
    }
    return { dates, fetchDates }
}
