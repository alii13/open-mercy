/**
 * Shared game-stat shapes: one game_results row, and the one-row aggregate the
 * public_profile() SECURITY DEFINER function returns. Kept separate from any UI
 * so the badge/points code and the profile page can share them.
 */

export interface ResultRow {
    result: 'won' | 'lost' | 'eliminated' | 'abandoned'
    game_id: string
    cards_remaining: number
    peak_cards: number
    draw_cards_played: number
    wild_cards_played: number
    cards_played_total: number
    skips_dealt: number
    swaps_made: number
    draws_taken: number
    biggest_stack_survived: number
    uno_calls: number
    uno_penalties: number
    game_duration_secs: number
    is_bot_game: boolean
    played_at: string
}

/** One row of profile aggregates — the shape public_profile() returns. */
export interface ProfileAggregates {
    games: number
    wins: number
    /** Missing until supabase/profile-pages.sql is re-run. */
    eliminations?: number
    best_win_streak: number
    max_stack_survived: number
    max_peak_cards: number
    max_peak_cards_won: number
    min_cards_won: number | null
    min_duration_won: number | null
    max_duration: number
    sum_skips: number
    sum_draw_cards: number
    sum_wild_cards: number
    sum_uno_calls: number
    sum_swaps: number
    daily_played: number
}
