/**
 * Daily reminders: which one a player gets, and when. Pure; push.ts sends.
 *
 * One a day at most, at the hour the player usually plays, never in quiet
 * hours, and only while there is something true to say: today's deal, or a
 * streak that is still alive. Three days away and they stop.
 *
 * Every situation has more than one wording, and the pick rotates by day: a
 * reminder that reads the same every day stops being read (Duolingo's
 * notification bandit paper, KDD 2020). Each wording has a `variant` id that
 * rides the link and the send count, so the winners can be kept.
 */

import { daysBetween, liveStreak, shieldReady } from '../../shared/streak'

/** The send window, local time: 09:00 to 21:59. */
export const FIRST_HOUR = 9
export const LAST_HOUR = 21
const MAX_DAYS_AWAY = 3

/** A push_subscriptions row, as far as the rules care. */
export interface NudgeRow {
    endpoint: string
    tz: string
    play_hour: number
    streak: number
    last_played: string | null
    shield_used_on: string | null
    last_sent_on: string | null
}

/** How today's daily deal is going, for the challenge wording. */
export interface DailyStats {
    players: number
    won: number
}

export interface Nudge {
    variant: string
    title: string
    body: string
    url: string
    /** The player's local day, written back as last_sent_on. */
    day: string
}

export function localClock(tz: string, now: Date): { day: string; hour: number } {
    const parts = Object.fromEntries(
        new Intl.DateTimeFormat('en-CA', {
            timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
        }).formatToParts(now).map(p => [p.type, p.value]),
    )
    return { day: `${parts.year}-${parts.month}-${parts.day}`, hour: Number(parts.hour) }
}

type Wording = Pick<Nudge, 'variant' | 'title' | 'body'>

/** Streak lengths that get their own day instead of the rotation. */
const MILESTONES = [7, 10, 14, 21, 30, 50, 100, 200, 365, 500, 1000]

/** "Only 12 of 52 beat today's deal": a dare only when the numbers make it one. */
const isDare = (st: DailyStats | null): st is DailyStats => !!st && st.players >= 20 && st.won * 2 <= st.players

/** Wordings built on today's real numbers. */
function fromStats(st: DailyStats | null): Wording[] {
    if (!st) return []
    const out: Wording[] = []
    if (st.won === 0 && st.players >= 10) {
        out.push({ variant: 'none-beat', title: 'Nobody has beaten today\'s deal yet', body: `${st.players} players tried. Be the first.` })
    } else if (isDare(st)) {
        out.push({ variant: 'beat-rate', title: `Only ${st.won} of ${st.players} beat today's deal`, body: 'Can you? One scored attempt.' })
    }
    if (st.players >= 30) {
        out.push({ variant: 'crowd', title: `${st.players} players took on today's deal`, body: 'Your turn. One scored attempt.' })
    }
    return out
}

function wordings(n: number, gap: number, holding: boolean, shield: boolean, st: DailyStats | null): Wording[] {
    const dare = isDare(st) ? `Only ${st.won} of ${st.players} beat today's deal so far. Can you?` : null
    if (holding) {
        return [
            { variant: 'shield-holding', title: `🛡️ Shield is holding your ${n}-day streak`, body: 'It breaks at midnight unless you play today.' },
            { variant: 'shield-last', title: `🛡️ Last chance for your ${n}-day streak`, body: 'Your shield bought you a day. Play today or it resets.' },
        ]
    }
    if (n >= 2 && MILESTONES.includes(n + 1)) {
        return [{
            variant: 'milestone',
            title: `🏆 One game to a ${n + 1}-day streak`,
            body: shield ? 'Today\'s deal is ready.' : 'Miss today and it resets at midnight.',
        }]
    }
    if (n >= 2 && shield) {
        // The shield would carry a missed day, so nothing here may say the streak is ending.
        return [
            { variant: 'streak-next', title: `🔥 Day ${n + 1} is waiting`, body: `Keep your ${n}-day streak going. Today's deal is ready.` },
            { variant: 'streak-row', title: `Make it ${n + 1} days in a row`, body: 'Today\'s deal is ready.' },
            { variant: 'streak-alive', title: `Keep your ${n}-day streak alive`, body: 'One game today does it.' },
            { variant: 'streak-count', title: `🔥 ${n} days and counting`, body: `Play today's deal to make it ${n + 1}.` },
            ...(dare ? [{ variant: 'streak-dare', title: `🔥 Day ${n + 1} is waiting`, body: dare }] : []),
        ]
    }
    if (n >= 2) {
        return [
            { variant: 'streak-ends', title: `🔥 Your ${n}-day streak ends at midnight`, body: 'One game keeps it alive.' },
            { variant: 'streak-lose', title: `Don't lose your ${n}-day streak`, body: 'One game before midnight keeps it.' },
            { variant: 'streak-saves', title: `One game saves your ${n}-day streak`, body: 'Today\'s deal is ready. The clock runs out at midnight.' },
            { variant: 'streak-reset', title: '⏳ Your streak resets at midnight', body: `Keep all ${n} days with one game.` },
            ...(dare ? [{ variant: 'streak-dare', title: `Your ${n}-day streak is on the line`, body: dare }] : []),
        ]
    }
    if (gap === 1) {
        return [
            { variant: 'two-row', title: 'Make it 2 days in a row', body: 'Today\'s deal is ready. One game starts a streak.' },
            { variant: 'two-back', title: 'Back for day 2?', body: 'New shuffle today. One game starts your streak.' },
            { variant: 'two-start', title: '🔥 Start a streak today', body: 'You played yesterday. One game today makes it 2 days.' },
            ...fromStats(st),
        ]
    }
    return [
        ...fromStats(st),
        { variant: 'new-shuffle', title: 'Today\'s deal is live', body: 'Same shuffle for every player in the world. One shot.' },
        { variant: 'terminator', title: 'Terminator is waiting at today\'s deal', body: 'One scored attempt. Make it count.' },
        { variant: 'fresh', title: 'Fresh shuffle, one shot', body: 'Today\'s deal is ready. Can you win it first try?' },
    ]
}

/** A stable number per browser, so players start the rotation at different points. */
function seedOf(s: string): number {
    let h = 0
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0
    return h
}

/** `stats`: today's daily deal so far, for the player's local day. */
export function nudgeFor(row: NudgeRow, now: Date, stats: DailyStats | null = null): Nudge | null {
    if (!row.last_played) return null
    const { day, hour } = localClock(row.tz, now)
    if (row.last_sent_on === day) return null
    const from = Math.min(Math.max(row.play_hour, FIRST_HOUR), LAST_HOUR)
    if (hour < from || hour > LAST_HOUR) return null
    const gap = daysBetween(row.last_played, day)
    if (gap < 1 || gap > MAX_DAYS_AWAY) return null

    const s = { streak: row.streak, lastPlayed: row.last_played, shieldUsedOn: row.shield_used_on }
    const live = liveStreak(s, day)
    const options = wordings(live.streak, gap, live.holding, shieldReady(s, day), stats)
    // Next day, next wording: a list of two or more never repeats on consecutive days.
    const pick = options[(daysBetween('1970-01-01', day) + seedOf(row.endpoint)) % options.length]!
    return { ...pick, url: `/daily?src=push&v=${pick.variant}`, day }
}

/**
 * The browsers' own push services. The hourly sender POSTs to whatever
 * endpoint a row holds, so anything else is refused at the door.
 */
function isPushService(host: string): boolean {
    return host === 'fcm.googleapis.com'
        || host === 'updates.push.services.mozilla.com'
        || host === 'web.push.apple.com'
        || host.endsWith('.notify.windows.com')
}

const B64URL = /^[A-Za-z0-9_-]+$/
const DAY = /^\d{4}-\d{2}-\d{2}$/

function validTz(tz: unknown): tz is string {
    if (typeof tz !== 'string' || tz.length > 64) return false
    try {
        new Intl.DateTimeFormat('en', { timeZone: tz })
        return true
    } catch {
        return false
    }
}

/** What the browser sends to /push/subscribe, checked and shaped as a row. */
export function cleanSubscription(raw: unknown) {
    const b = (raw && typeof raw === 'object' ? raw : {}) as Record<string, any>
    const sub = b.subscription ?? {}
    const endpoint = sub.endpoint
    const p256dh = sub.keys?.p256dh
    const auth = sub.keys?.auth
    // No quotes, commas, brackets or spaces: push.ts lists endpoints in one PostgREST in.() filter.
    if (typeof endpoint !== 'string' || endpoint.length > 1024 || /["(),\s]/.test(endpoint)) return null
    let url: URL
    try { url = new URL(endpoint) } catch { return null }
    if (url.protocol !== 'https:' || !isPushService(url.hostname)) return null
    // p256dh is a 65-byte point (87 chars), auth 16 bytes (22 chars).
    if (typeof p256dh !== 'string' || !B64URL.test(p256dh) || p256dh.length < 80 || p256dh.length > 100) return null
    if (typeof auth !== 'string' || !B64URL.test(auth) || auth.length < 16 || auth.length > 32) return null
    if (!validTz(b.tz)) return null
    if (!Number.isInteger(b.hour) || b.hour < 0 || b.hour > 23) return null
    const day = (v: unknown) => (typeof v === 'string' && DAY.test(v) ? v : null)
    return {
        endpoint,
        p256dh,
        auth,
        tz: b.tz,
        play_hour: b.hour as number,
        streak: Number.isInteger(b.streak) ? Math.max(0, Math.min(10_000, b.streak)) : 0,
        last_played: day(b.lastPlayed),
        shield_used_on: day(b.shieldUsedOn),
    }
}
