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
    /** Yesterday's wording, never sent twice in a row. */
    last_variant?: string | null
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
        out.push(
            { variant: 'none-beat', title: 'Nobody has beaten today\'s deal yet', body: `${st.players} players tried. Be the first.` },
            { variant: 'none-first', title: '🏆 Be the first to beat today\'s deal', body: `${st.players} players tried. Nobody has won yet.` },
        )
    } else if (isDare(st)) {
        out.push(
            { variant: 'beat-rate', title: `Only ${st.won} of ${st.players} beat today's deal`, body: 'Can you? One scored attempt.' },
            { variant: 'beat-most', title: 'Today\'s deal is beating most players', body: `${st.won} wins out of ${st.players} so far. Want a shot?` },
        )
    }
    if (st.players >= 30) {
        out.push(
            { variant: 'crowd', title: `${st.players} players took on today's deal`, body: 'Your turn. One scored attempt.' },
            { variant: 'crowd-join', title: `Join ${st.players} players on today's deal`, body: 'Same shuffle, one scored attempt.' },
        )
    }
    return out
}

/**
 * The pool, by situation. Every line must stay true for anyone who can get
 * it, and the shield set may never suggest the streak is ending tonight.
 */
function wordings(n: number, gap: number, holding: boolean, shield: boolean, st: DailyStats | null): Wording[] {
    const dare = isDare(st) ? `Only ${st.won} of ${st.players} beat today's deal so far.` : null
    if (holding) {
        return [
            { variant: 'shield-holding', title: `🛡️ Shield is holding your ${n}-day streak`, body: 'It breaks at midnight unless you play today.' },
            { variant: 'shield-last', title: `🛡️ Last chance for your ${n}-day streak`, body: 'Your shield bought you a day. Play today or it resets.' },
            { variant: 'shield-covering', title: 'Your shield is covering yesterday', body: `Play today and your ${n}-day streak lives. Skip it and it resets.` },
            { variant: 'shield-oneday', title: '🛡️ Your shield gave you one more day', body: `Use it: one game today keeps your ${n}-day streak.` },
            { variant: 'shield-waste', title: 'Don\'t waste your streak shield', body: `It's holding your ${n}-day streak until midnight.` },
        ]
    }
    if (n >= 2 && MILESTONES.includes(n + 1)) {
        const m = n + 1
        const body = shield ? 'Today\'s deal is ready.' : 'Miss today and it resets at midnight.'
        return [
            { variant: 'milestone-one', title: `🏆 One game to a ${m}-day streak`, body },
            { variant: 'milestone-away', title: `🏆 A ${m}-day streak is one game away`, body },
            { variant: 'milestone-big', title: `Day ${m} is a big one`, body: shield ? 'One game today gets you there.' : 'One game today gets you there. Miss it and the streak resets at midnight.' },
        ]
    }
    if (n >= 2 && shield) {
        // The shield would carry a missed day, so nothing here may say the streak is ending.
        return [
            { variant: 'keep-next', title: `🔥 Day ${n + 1} is waiting`, body: `Keep your ${n}-day streak going. Today's deal is ready.` },
            { variant: 'keep-row', title: `Make it ${n + 1} days in a row`, body: 'Today\'s deal is ready.' },
            { variant: 'keep-alive', title: `Keep your ${n}-day streak alive`, body: 'One game today does it.' },
            { variant: 'keep-count', title: `🔥 ${n} days and counting`, body: `Play today's deal to make it ${n + 1}.` },
            { variant: 'keep-roll', title: `You're on a ${n}-day roll`, body: `Today's deal is ready for day ${n + 1}.` },
            { variant: 'keep-starts', title: `Day ${n + 1} starts with one game`, body: 'Today\'s deal is shuffled and ready.' },
            { variant: 'keep-grow', title: `🔥 Grow your streak to ${n + 1}`, body: 'Today\'s deal is ready when you are.' },
            { variant: 'keep-terminator', title: `Terminator is shuffling for day ${n + 1}`, body: `Your ${n}-day streak vs today's deal. Play when you're ready.` },
            { variant: 'keep-board', title: `Day ${n + 1}, and a fresh leaderboard`, body: `Today's deal is ready. Keep the ${n}-day run going.` },
            ...(dare ? [{ variant: 'keep-dare', title: `🔥 Day ${n + 1} is waiting`, body: `${dare} Can you?` }] : []),
        ]
    }
    if (n >= 2) {
        return [
            { variant: 'end-midnight', title: `🔥 Your ${n}-day streak ends at midnight`, body: 'One game keeps it alive.' },
            { variant: 'end-lose', title: `Don't lose your ${n}-day streak`, body: 'One game before midnight keeps it.' },
            { variant: 'end-save', title: `One game saves your ${n}-day streak`, body: 'Today\'s deal is ready. The clock runs out at midnight.' },
            { variant: 'end-reset', title: '⏳ Your streak resets at midnight', body: `Keep all ${n} days with one game.` },
            { variant: 'end-tonight', title: `${n} days, gone tonight?`, body: 'Not if you play one game before midnight.' },
            { variant: 'end-hours', title: `⏳ Hours left on your ${n}-day streak`, body: 'It resets at midnight. One game saves it.' },
            { variant: 'end-break', title: `Don't break a ${n}-day streak now`, body: 'One game before midnight keeps it going.' },
            { variant: 'end-line', title: `🔥 ${n} days on the line tonight`, body: 'Play today\'s deal before midnight.' },
            { variant: 'end-quick', title: `Quick game? Your ${n}-day streak needs one`, body: 'It resets at midnight otherwise.' },
            ...(dare ? [{ variant: 'end-dare', title: `Your ${n}-day streak is on the line`, body: `${dare} Play before midnight.` }] : []),
        ]
    }
    if (gap === 1) {
        return [
            { variant: 'two-row', title: 'Make it 2 days in a row', body: 'Today\'s deal is ready. One game starts a streak.' },
            { variant: 'two-back', title: 'Back for day 2?', body: 'New shuffle today. One game starts your streak.' },
            { variant: 'two-start', title: '🔥 Start a streak today', body: 'You played yesterday. One game today makes it 2 days.' },
            { variant: 'two-day1', title: 'Yesterday was day 1', body: 'Today\'s deal makes it a streak.' },
            { variant: 'two-new', title: 'New day, new shuffle', body: 'Play today\'s deal and your streak begins.' },
            { variant: 'two-terminator', title: 'Terminator is back with a new shuffle', body: 'One game today makes it 2 days in a row.' },
            { variant: 'two-board', title: '🏆 Today\'s leaderboard is open', body: 'One scored attempt, and day 2 of your streak.' },
            { variant: 'two-one', title: 'One game, day 2', body: 'Today\'s deal is ready when you are.' },
            ...fromStats(st),
        ]
    }
    return [
        ...fromStats(st),
        { variant: 'back-live', title: 'Today\'s deal is live', body: 'Same shuffle for every player in the world. One shot.' },
        { variant: 'back-terminator', title: 'Terminator is waiting at today\'s deal', body: 'One scored attempt. Make it count.' },
        { variant: 'back-fresh', title: 'Fresh shuffle, one shot', body: 'Today\'s deal is ready. Can you win it first try?' },
        { variant: 'back-streak', title: 'Start a new streak today', body: 'One game is day 1. Today\'s deal is ready.' },
        { variant: 'back-miss', title: 'The cards miss you', body: 'Today\'s deal is shuffled and waiting.' },
        { variant: 'back-board', title: '🏆 A fresh leaderboard every day', body: 'Today\'s is open. One scored attempt.' },
        { variant: 'back-nomercy', title: 'No mercy today?', body: 'Today\'s deal is ready, and so is Terminator.' },
        { variant: 'back-world', title: 'Same deal for the whole world', body: 'Play it once and see where you rank.' },
    ]
}

function nextDay(day: string): string {
    return new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8, 10) + 1)).toISOString().slice(0, 10)
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
    // Missing today means tomorrow's game spends the shield, so ask about tomorrow.
    const shield = shieldReady(s, nextDay(day))
    const options = wordings(live.streak, gap, live.holding, shield, stats)
    // Rotate by day from a per-player start, and step past yesterday's wording
    // in case the pool changed size overnight.
    let i = (daysBetween('1970-01-01', day) + seedOf(row.endpoint)) % options.length
    if (options.length > 1 && options[i]!.variant === row.last_variant) i = (i + 1) % options.length
    const pick = options[i]!
    // Home, not /daily: /daily only resumes a run in progress. The app starts today's deal on arrival (App.vue).
    return { ...pick, url: `/?src=push&v=${pick.variant}`, day }
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
