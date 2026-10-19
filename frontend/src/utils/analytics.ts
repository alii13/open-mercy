/**
 * GA4 gameplay events, sent through the gtag loaded in index.html.
 * No-op when gtag is absent (ad blockers, dev, tests) — analytics must
 * never break or slow the game.
 *
 * Event dictionary (all custom, snake_case, params are GA4-safe):
 *   page_view          { page_title, page_path }  — virtual, per screen
 *   mp_room_created    { rules, visibility }
 *   mp_room_joined     { method: created|code|link|quick_match|restore }
 *   mp_join_failed     { reason: <server message>|ws_closed_<code>|timeout|unknown, attempt: 1|2 }
 *   mp_restore_expired {}  — a stored room was gone on reload. Expected, not a
 *                            failure: rooms are GC'd once empty. Kept out of
 *                            mp_join_failed so that metric means "a join the
 *                            player asked for did not work".
 *   mp_game_started    { players, rules, rematch }
 *   mp_game_finished   { players, result: won|lost, duration_seconds, rules }
 *   mp_room_left       { phase: lobby|playing|finished, seconds_in_room }
 *   mp_lobby_rescue_taken { players }  — a solo waiter moved to a room that
 *                            already had company, instead of leaving
 *   mp_spectate_start  {}
 *   mp_spectate_end    { seconds }
 *   mp_spectate_rematch_joined {}
 *   sp_game_started    { rules, warm_up }  — warm_up: a newcomer's first few
 *                            games, played against loosened dials (engine/bot.ts)
 *   sp_game_finished   { result: won|lost, duration_seconds, rules, warm_up }
 *   voice_joined       {}
 *   voice_left         { duration_seconds }
 *   share              { method: whatsapp|x|image|native|clipboard,
 *                        content_type: sp_win|mp_win|daily }
 *   profile_shared     {}
 *   daily_started      { entry_point: lobby|game_over }
 *   daily_finished     { result: won|lost|eliminated, turns }
 *   bot_defeated       { bot_id, rung: 1..8 }
 *   play_clicked       { method: guest }
 *   rename_suggestions_shown { count }  — a rename was refused and free names
 *                            were offered. Pairs with the next one: the
 *                            tap-through rate is the only verdict on whether
 *                            suggesting names beat just reporting the refusal.
 *   rename_suggestion_taken  {}  — one of them was tapped
 *   signin_failed      { message }
 *   signin_retry       {}
 *   leaderboard_tab_viewed { tab: daily|weekly|alltime }
 *   leaderboard_filtered   { country: <ISO-3166 alpha-2>|global }
 *
 * What's New. The card trio is the whole evidence base for the loud-or-quiet
 * call that every release has to make (see "Shipping updates to players" in
 * CLAUDE.md): shown is the denominator, taken over shown is whether the card
 * earned the interruption, dismissed over shown is whether it annoyed people.
 * Without them "at most one loud card per quarter" is a guess, not a rule.
 *   whatsnew_opened        { unread }        — panel opened, unread at that moment
 *   whatsnew_entry_clicked { entry_id }      — an entry's deep link was taken
 *   whatsnew_changelog_opened {}             — "see everything that changed"
 *   release_card_shown     { entry_id }      — a loud card became visible
 *   release_card_taken     { entry_id }      — its CTA was pressed
 *   release_card_dismissed { entry_id }      — X or "not now"
 *
 * The same card asking a question. `poll_shown` is the denominator: an answer
 * rate is the only way to tell a poll people ignored from one nobody was
 * shown, and the vote table cannot tell them apart on its own.
 *   poll_shown    { poll_id }          — a question became visible
 *   poll_answered { poll_id, choice }  — an option was pressed
 *   poll_skipped  { poll_id }          — X, with no answer
 *   poll_vote_failed { poll_id }       — the answer never reached the table. An
 *                            insert that fails silently reads in the tally as
 *                            nobody answering, which is the one reading that
 *                            must never be a guess.
 *
 * Guest claim funnel. `method` on the completion is what makes the email and
 * Google paths comparable — the whole point of instrumenting them:
 *   guest_claim_started        {}                  — email form opened
 *   guest_claim_email_sent     {}                  — confirmation dispatched
 *   guest_claim_email_exists   {}                  — email belongs to someone else
 *   guest_claim_google_started {}                  — handed off to Google
 *   guest_claim_google_taken   {}                  — that Google account is taken
 *   guest_claim_completed      { method: email|google }
 */

/**
 * GA4 reads these parameter names as attribution, whatever event carries them,
 * and rewrites the session's traffic source with the value. `daily_started`
 * shipped with `source: 'lobby'` and filed 309 sessions in one week under a
 * referrer called "lobby" - about a fifth of all traffic, with the real
 * referrer lost. Name a parameter `entry_point`, `origin_surface`, anything
 * but these.
 */
type Params = Record<string, string | number | boolean | undefined>

export function track(event: string, params?: Params): void {
    if (typeof window === 'undefined') return
    const g = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    if (typeof g !== 'function') return
    try {
        g('event', event, params)
    } catch { /* analytics never breaks the game */ }
}

/**
 * Attach the Supabase user id to every subsequent event.
 *
 * Without this GA4 identifies people by its own cookie, which Safari caps at
 * seven days — a returning Safari player is counted as a brand new one, so
 * D7 and D30 cohort retention read near zero no matter how the game performs.
 * Guests get an id too: anonymous sign-in mints one and claiming an account
 * keeps it, so a player's history survives the conversion.
 *
 * Pass null on sign-out, or GA keeps stitching the next player to the last one.
 */
export function setAnalyticsUser(userId: string | null): void {
    if (typeof window === 'undefined') return
    const g = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    if (typeof g !== 'function') return
    try {
        g('set', { user_id: userId })
    } catch { /* analytics never breaks the game */ }
}

/** Virtual page view for a screen change (this SPA has no router). */
export function trackScreen(screen: string): void {
    track('page_view', { page_title: screen, page_path: `/${screen}` })
}
