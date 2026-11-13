/**
 * GA4 gameplay events, sent through the gtag loaded in index.html.
 * No-op when gtag is absent (ad blockers, dev, tests) — analytics must
 * never break or slow the game.
 *
 * Event dictionary (all custom, snake_case, params are GA4-safe):
 *   page_view          { page_title, page_path }  — virtual, per screen
 *   mp_room_created    { rules, visibility }
 *   mp_room_joined     { method: created|code|link|quick_match|restore|live }
 *   mp_join_failed     { reason: <server message>|ws_closed_<code>|timeout|unknown, attempt: 1|2 }
 *   mp_restore_expired {}  — a stored room was gone on reload. Expected, not a
 *                            failure: rooms are GC'd once empty. Kept out of
 *                            mp_join_failed so that metric means "a join the
 *                            player asked for did not work".
 *   mp_game_started    { players, rules, rematch }
 *   mp_game_load_failed {}  — the game screen still failed to load after 3
 *                            retries, so the player got the Reload screen
 *                            (sp_game_load_failed: the same for a bot game)
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
 *   daily_started      { entry_point: lobby|game_over|reminder }
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
 *   avatar_saved       {}  - a claimed player saved a profile photo
 *   avatar_removed     {}  - and removed it
 *
 * Daily reminders (web push, game-server/src/push.ts). Shown over asked is the
 * opt-in rate; opened per `variant` over push_sends.sent per variant is the
 * click rate of each wording, and push_sends 'unsubscribed' is the turn-off
 * count. `variant` must be a registered custom dimension to split by wording.
 *   reminder_ask_shown { mode: sp|mp }  - the game-over card asked
 *   reminder_ios_shown { mode: sp|mp }  - an iPhone tab was told to Add to Home
 *                        Screen instead (kept apart: it can never become reminder_on)
 *   reminder_ios_noted {}               - "Got it" on the iPhone note
 *   reminder_on        {}               - subscribed (card or settings)
 *   reminder_denied    {}               - the browser prompt was refused
 *   reminder_skipped   {}               - "No thanks" on the card
 *   reminder_off       {}               - switched off in settings
 *   reminder_opened    { variant }      - a reminder was tapped
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
 *   guest_claim_completed      { method: email|google|apple }  — apple: iOS app only
 *
 * Moving an email account to a new address (settings drawer):
 *   email_change_sent          {}                  — links mailed to the old and new address
 *   email_change_completed     {}                  — the new address landed in this browser
 *
 * Deleting an account (account menu):
 *   account_deleted            {}                  — sent after the server delete succeeds
 */

import { Capacitor, registerPlugin } from '@capacitor/core'
import type { ConsentStatus, ConsentType, FirebaseAnalyticsPlugin } from '@capacitor-firebase/analytics'
import { detectedCountry } from './country'

/**
 * GA4 reads these parameter names as attribution, whatever event carries them,
 * and rewrites the session's traffic source with the value. `daily_started`
 * shipped with `source: 'lobby'` and filed 309 sessions in one week under a
 * referrer called "lobby" - about a fifth of all traffic, with the real
 * referrer lost. Name a parameter `entry_point`, `origin_surface`, anything
 * but these.
 */
type Params = Record<string, string | number | boolean | undefined>

/*
 * The iOS and Android apps send through Firebase Analytics, which reports into
 * the same GA4 property with the app's platform: gtag sends nothing from the
 * iOS app's capacitor:// page. The plugin is registered here by name rather
 * than imported, because its own entry bundles a web build that needs the
 * Firebase web SDK, which the site does not use.
 */
const firebase = Capacitor.isNativePlatform() ? registerPlugin<FirebaseAnalyticsPlugin>('FirebaseAnalytics') : null

/*
 * The website keeps analytics cookieless in the EEA, UK and Switzerland (the
 * Consent Mode default in index.html, same list) and asks nobody. The apps
 * start with analytics storage denied (Info.plist, AndroidManifest.xml) and
 * grant it only once the player's country is known to be outside them.
 */
const CONSENT_REGIONS = new Set(['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'])
if (firebase) {
    void detectedCountry()
        .then(country => {
            if (!country || CONSENT_REGIONS.has(country)) return
            return firebase.setConsent({ type: 'ANALYTICS_STORAGE' as ConsentType, status: 'GRANTED' as ConsentStatus })
        })
        .catch(() => { /* analytics never breaks the game */ })
}

// Booleans become "true"/"false", as gtag sends them: Firebase on Android takes
// no booleans, and on iOS they would arrive as 1/0.
function definedOnly(params?: Params): Record<string, string | number> {
    const out: Record<string, string | number> = {}
    for (const [k, v] of Object.entries(params ?? {})) if (v !== undefined) out[k] = typeof v === 'boolean' ? String(v) : v
    return out
}

export function track(event: string, params?: Params): void {
    if (firebase) {
        void firebase.logEvent({ name: event, params: definedOnly(params) }).catch(() => { /* analytics never breaks the game */ })
        return
    }
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
    if (firebase) {
        void firebase.setUserId({ userId }).catch(() => { /* analytics never breaks the game */ })
        return
    }
    if (typeof window === 'undefined') return
    const g = (window as unknown as { gtag?: (...args: unknown[]) => void }).gtag
    if (typeof g !== 'function') return
    try {
        g('set', { user_id: userId })
    } catch { /* analytics never breaks the game */ }
}

/** Virtual page view for a screen change (this SPA has no router). */
export function trackScreen(screen: string): void {
    // Apps report screens as screen_view, the GA4 app event, not page_view.
    if (firebase) {
        void firebase.setCurrentScreen({ screenName: screen }).catch(() => { /* analytics never breaks the game */ })
        return
    }
    track('page_view', { page_title: screen, page_path: `/${screen}` })
}
