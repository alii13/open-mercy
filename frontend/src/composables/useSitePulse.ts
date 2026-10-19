/**
 * The weekly crowd for the landing page - "733 PLAYERS · 5,544 GAMES THIS
 * WEEK" - read from site_pulse() in supabase/pulse.sql.
 *
 * A week, not a live count. The lobby's online_now is honest about a quiet
 * hour, and that honesty is exactly what sends a first-time visitor away
 * (see useOnlineCount). Seven days is always a big number, and it is true.
 *
 * Fetched once per page view, no polling: the figure moves by the hour, not
 * the minute. Hidden below PULSE_FLOOR for the same reason as the online
 * count, and hidden until the SQL has been run: the rpc errors and nothing
 * renders.
 */

import { ref, computed } from 'vue'

/** Below this the number advertises an empty game. */
export const PULSE_FLOOR = 100

interface PulseRow {
    players_7d?: number
    games_7d?: number
}

export function useSitePulse() {
    const players = ref(0)
    const games = ref(0)

    void (async () => {
        try {
            const { supabase } = await import('../lib/supabase')
            const { data, error } = await supabase.rpc('site_pulse')
            if (error) return
            const row = (Array.isArray(data) ? data[0] : data) as PulseRow | null
            players.value = row?.players_7d ?? 0
            games.value = row?.games_7d ?? 0
        } catch {
            /* transient - the line stays hidden */
        }
    })()

    return {
        players,
        games,
        show: computed(() => players.value >= PULSE_FLOOR),
    }
}
