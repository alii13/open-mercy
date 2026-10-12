/**
 * What's New — the single source for the top-bar panel, the release card, and
 * /changelog. Shipped in the bundle rather than a table: every announcement is
 * a deploy anyway, so a table would only add a fetch, a policy, and a way for
 * the copy to drift from the code it describes.
 *
 * Newest first. Ids are ISO dates and must sort — the unread dot compares them
 * as strings. Never add an entry for a change that has not deployed; adding one
 * is what makes the dot appear.
 *
 * `level` is a per-entry decision the human makes at ship time, not a default
 * you pick. See "Shipping updates to players" in CLAUDE.md.
 *   quiet — panel entry and a dot. Almost everything.
 *   loud  — also fires a one-time card. Roughly one per quarter, for a change
 *           that alters what a player does. Needs `bodySignedOut` too.
 */

import type { Route } from '../utils/routes'

export type ChangelogLevel = 'quiet' | 'loud'
export type ChangelogTag = 'NEW' | 'IMPROVED' | 'FIXED'

export interface ChangelogEntry {
    /** ISO date, sortable. */
    id: string
    level: ChangelogLevel
    tag: ChangelogTag
    /** Verb first, under 50 characters. */
    title: string
    body: string
    /**
     * Only needed when `body` speaks to the reader about themselves — a rank,
     * a streak, "your". Most updates describe a feature and read the same
     * signed in or out, and those need nothing here: the card falls back to
     * `body`.
     */
    bodySignedOut?: string
    /** Optional. No link beats a link to the home page. */
    cta?: { label: string; route: Route }
    /**
     * Overrides the CTA label for a signed-out reader. Same rule as
     * `bodySignedOut`: only when the normal label assumes an account
     * ("SEE YOUR RANK" means nothing without one).
     */
    ctaSignedOut?: string
    /**
     * A live number the card fetches for itself, so the announcement can name
     * the reader's own standing instead of a figure that goes stale in the
     * bundle. Declared by the entry because only the entry knows what number
     * makes its point.
     */
    stat?: 'alltime_rank'
}

export const CHANGELOG: ChangelogEntry[] = [
    {
        id: '2026-10-12T21:00Z',
        level: 'loud',
        tag: 'NEW',
        title: 'Climb 10 new ranks above No Mercy King',
        body: "No Mercy King isn't the top anymore. There are 10 new ranks above it, from Tyrant to God of No Mercy. Already a King? Check your badge - you may have moved up.",
        cta: { label: 'SEE THE RANKS', route: { name: 'badges' } },
    },
    {
        id: '2026-10-12T20:00Z',
        level: 'quiet',
        tag: 'NEW',
        title: 'Ping a friend who is offline',
        body: 'Tap Ping on an offline friend and they see you want to play when they next open the game, any time that day. An invite that arrives during a game now shows in a small chip instead of disappearing.',
    },
    {
        id: '2026-10-12T19:00Z',
        level: 'quiet',
        tag: 'IMPROVED',
        title: 'See how your invites went',
        body: 'Your waiting room now shows which friends are still deciding, which ones did not join, and whose invite ran out, with Invite again once it is allowed.',
    },
    {
        // A second entry on the same day: a full UTC timestamp keeps the id a
        // valid, sortable date that the page still formats as Oct 12.
        id: '2026-10-12T18:00Z',
        level: 'quiet',
        tag: 'IMPROVED',
        title: 'Add the people you just played',
        body: 'Your Friends page now lists who you played lately, with your head-to-head. Share your friend link on WhatsApp, and anyone who opens it can add you straight from your profile.',
    },
    {
        id: '2026-10-12',
        level: 'loud',
        tag: 'NEW',
        title: 'Friend requests reach you live',
        body: 'A request now pops up as it arrives, with ACCEPT right on it, and you hear the moment someone accepts yours. Your Friends page shows who is online and the requests still waiting.',
        bodySignedOut: 'Friend requests now pop up live, with ACCEPT right on them, and senders hear the moment they are accepted.',
    },
    {
        id: '2026-08-29',
        level: 'loud',
        tag: 'NEW',
        title: 'Your stats page is now your dossier',
        body: 'Your badge leads the page, with the full ten-tier ladder beside it and the date you took every tier you hold. Your rank, your personal bests, and your last ten games sit next to it.',
        bodySignedOut: 'Every player has a dossier: the badge they hold, the date they earned each tier, their rank, and their personal bests.',
        cta: { label: 'HOW BADGES WORK', route: { name: 'badges' } },
    },
    {
        id: '2026-08-28',
        level: 'loud',
        tag: 'NEW',
        title: 'All-time leaderboard is live',
        body: 'Every game you have ever played now counts toward one permanent rank, built on the same points that drive your badge. Filter the board by country, and see the players directly above you.',
        bodySignedOut: 'The all-time board ranks every game a player has ever finished, not just this week. Filter it by country.',
        cta: { label: 'SEE YOUR RANK', route: { name: 'leaderboard', tab: 'alltime' } },
        ctaSignedOut: 'SEE THE BOARD',
        stat: 'alltime_rank',
    },
    {
        id: '2026-08-21',
        level: 'quiet',
        tag: 'IMPROVED',
        title: "Discard-all applies the top card's effect",
        body: 'Dumping a whole hand of one colour fires the last card you drop, so a discard-all can skip, reverse, or stack a draw. Calling UNO late now costs you a penalty.',
    },
    {
        id: '2026-08-14',
        level: 'quiet',
        tag: 'FIXED',
        title: 'Leaving a solo game actually leaves it',
        body: 'The exit button in the top bar works from every screen, and the rules modal no longer traps you behind it.',
    },
    {
        id: '2026-08-06',
        level: 'quiet',
        tag: 'IMPROVED',
        title: 'Renaming and invites in the lobby',
        body: 'Renaming a seat tells you when a name is taken and offers ones you can actually have. The invite link copies in one tap.',
    },
]
