/**
 * The day the signed-in player reached each tier, via my_badge_dates (supabase/badge-dates.sql).
 * Feature-detects like useBadgeHolders: until the SQL is installed, or for a signed-out visitor,
 * there are no dates and the shelf plaques just say "Earned". Read once per user per session.
 */

import { ref } from 'vue'
import { supabase } from '../lib/supabase'
import { BADGES } from '../utils/badges'
import { isFatalSchemaError } from '../utils/supabaseErrors'

/** tier (1-20) -> "Sep 21", for tiers the player has reached. */
const dates = ref<Record<number, string>>({})
let askedFor: string | null = null

const short = (iso: string) => new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })

export function useBadgeDates() {
    async function fetchDates(userId: string) {
        if (askedFor === userId) return
        askedFor = userId
        dates.value = {}
        const { data, error } = await supabase.rpc('my_badge_dates', { thresholds: BADGES.map(b => b.threshold) })
        if (error) {
            if (!isFatalSchemaError(error)) askedFor = null
            return
        }
        const out: Record<number, string> = {}
        for (const row of (data ?? []) as { threshold: number; reached_on: string | null }[]) {
            const badge = BADGES.find(b => b.threshold === Number(row.threshold))
            if (badge && row.reached_on) out[badge.tier] = short(row.reached_on)
        }
        dates.value = out
    }
    return { dates, fetchDates }
}
