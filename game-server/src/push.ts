/// <reference types="@cloudflare/workers-types" />

/**
 * Web push for the daily reminder: storing a browser's subscription, and the
 * hourly run that sends what nudge.ts decides. push_subscriptions has RLS on
 * and no policies, so only this worker, holding the service key, touches it.
 */

import { buildPushPayload } from '@block65/webcrypto-web-push'
import { cleanSubscription, localClock, nudgeFor, type DailyStats, type Nudge, type NudgeRow } from './nudge'

export interface PushEnv {
    SUPABASE_URL: string
    SUPABASE_SERVICE_KEY?: string
    /** Wrangler secrets, set once with scripts/vapid-keys.mjs. */
    VAPID_PUBLIC_KEY?: string
    VAPID_PRIVATE_KEY?: string
}

interface SubscriptionRow extends NudgeRow {
    endpoint: string
    p256dh: string
    auth: string
}

const VAPID_SUBJECT = 'https://open-mercy.com'

// ponytail: one run sends at most this many, about 520 a day across the
// 09:00-21:59 window; whoever is left over is still due next hour. The account
// is on Workers Paid (30 s CPU, 1000 subrequests a run), so 40 is far inside
// both. Raise it when the run log's "capped" flag shows up most hours.
export const MAX_SENDS_PER_RUN = 40

export function pushConfigured(env: PushEnv): boolean {
    return !!(env.SUPABASE_SERVICE_KEY && env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY)
}

function rest(env: PushEnv, path: string, init: RequestInit = {}): Promise<Response> {
    const key = env.SUPABASE_SERVICE_KEY!
    return fetch(`${env.SUPABASE_URL}/rest/v1/${path}`, {
        ...init,
        headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...init.headers },
    })
}

const UPSERT = { Prefer: 'resolution=merge-duplicates,return=minimal' }

/** Store or refresh a browser's subscription with the player's streak. Returns an HTTP status. */
export async function saveSubscription(env: PushEnv, userId: string, raw: unknown): Promise<number> {
    const row = cleanSubscription(raw)
    if (!row) return 400
    if (!env.SUPABASE_SERVICE_KEY) return 503
    // One subscription per player, on the device they last played on: one
    // reminder a day means one buzz, not one per device. It also stops a single
    // session from filling the sender's page with rows.
    const others = `user_id=eq.${encodeURIComponent(userId)}&endpoint=neq.${encodeURIComponent(row.endpoint)}`
    const del = await rest(env, `push_subscriptions?${others}`, { method: 'DELETE' })
    if (!del.ok) return 502
    const res = await rest(env, 'push_subscriptions?on_conflict=endpoint', {
        method: 'POST',
        headers: UPSERT,
        body: JSON.stringify({ ...row, user_id: userId, updated_at: new Date().toISOString() }),
    })
    if (!res.ok) {
        console.log('push subscribe failed', res.status, (await res.text()).slice(0, 200))
        return 502
    }
    return 204
}

export async function deleteSubscription(env: PushEnv, userId: string, endpoint: unknown): Promise<number> {
    if (typeof endpoint !== 'string' || endpoint.length > 1024) return 400
    if (!env.SUPABASE_SERVICE_KEY) return 503
    const q = `endpoint=eq.${encodeURIComponent(endpoint)}&user_id=eq.${encodeURIComponent(userId)}`
    const res = await rest(env, `push_subscriptions?${q}`, { method: 'DELETE' })
    return res.ok ? 204 : 502
}

/** Today's daily deal so far (supabase/push.sql), or null when it cannot be read. */
async function dailyStats(env: PushEnv, day: string): Promise<DailyStats | null> {
    const res = await rest(env, 'rpc/push_daily_stats', { method: 'POST', body: JSON.stringify({ p_game_id: `daily-${day}` }) })
    if (!res.ok) return null
    const [row] = await res.json<{ players: number; won: number }[]>()
    return row ? { players: Number(row.players), won: Number(row.won) } : null
}

/** The hourly run: everyone whose reminder is due gets it, at most once a day. */
export async function sendNudges(env: PushEnv, now = new Date()): Promise<void> {
    if (!pushConfigured(env)) return
    // Only rows nudge.ts could still pick: the last game within a few days.
    const since = new Date(now.getTime() - 5 * 86_400_000).toISOString().slice(0, 10)
    // ponytail: one page of 500, least recently reminded first; page through once subscribers outgrow it.
    const res = await rest(env, `push_subscriptions?select=*&last_played=gte.${since}&order=last_sent_on.asc.nullsfirst&limit=500`)
    if (!res.ok) {
        console.log('push read failed', res.status, (await res.text()).slice(0, 200))
        return
    }
    const rows = await res.json<SubscriptionRow[]>()
    const vapid = { subject: VAPID_SUBJECT, publicKey: env.VAPID_PUBLIC_KEY!, privateKey: env.VAPID_PRIVATE_KEY! }
    // One stats read per local day in play, usually one or two a run.
    const statsByDay = new Map<string, Promise<DailyStats | null>>()
    const due: { row: SubscriptionRow; nudge: Nudge }[] = []
    for (const row of rows) {
        if (due.length >= MAX_SENDS_PER_RUN) break
        if (!nudgeFor(row, now)) continue
        const { day } = localClock(row.tz, now)
        if (!statsByDay.has(day)) statsByDay.set(day, dailyStats(env, day))
        const nudge = nudgeFor(row, now, await statsByDay.get(day)!)
        if (nudge) due.push({ row, nudge })
    }
    if (!due.length) return

    // Claim first. A run the platform cuts short (CPU or subrequests) then
    // skips a player's reminder for the day instead of sending it every hour.
    // Full rows, because an upsert's insert half must satisfy NOT NULL.
    // ponytail: a game synced between the read above and this write loses its
    // streak update until the next one; that window is a few hundred ms.
    const claim = await rest(env, 'push_subscriptions?on_conflict=endpoint', {
        method: 'POST', headers: UPSERT,
        body: JSON.stringify(due.map(d => ({ ...d.row, last_sent_on: d.nudge.day, last_variant: d.nudge.variant }))),
    })
    if (!claim.ok) {
        console.log('push claim failed', claim.status, (await claim.text()).slice(0, 200))
        return
    }

    const gone: string[] = []
    const perVariant: Record<string, number> = {}
    for (const { row, nudge } of due) {
        try {
            const payload = await buildPushPayload(
                // A day's reminder is stale by evening; `topic` replaces an unread one instead of stacking.
                { data: { title: nudge.title, body: nudge.body, url: nudge.url }, options: { ttl: 4 * 3600, topic: 'daily' } },
                { endpoint: row.endpoint, expirationTime: null, keys: { p256dh: row.p256dh, auth: row.auth } },
                vapid,
            )
            const sendRes = await fetch(row.endpoint, payload)
            if (sendRes.status === 404 || sendRes.status === 410) gone.push(row.endpoint)
            else if (sendRes.ok) perVariant[nudge.variant] = (perVariant[nudge.variant] ?? 0) + 1
            else console.log('push send failed', sendRes.status, new URL(row.endpoint).hostname)
        } catch (err) {
            console.error('push send threw:', err)
        }
    }

    // The browser dropped these subscriptions (unsubscribed, cleared data, expired).
    if (gone.length) {
        const list = encodeURIComponent(`(${gone.map(e => `"${e}"`).join(',')})`)
        const d = await rest(env, `push_subscriptions?endpoint=in.${list}`, { method: 'DELETE' })
        if (!d.ok) console.log('push prune failed', d.status)
    }
    // Sends per wording, so taps per wording (reminder_opened in GA) can become
    // a click rate; 'unsubscribed' counts browsers that turned reminders off.
    if (gone.length) perVariant.unsubscribed = gone.length
    if (Object.keys(perVariant).length) {
        const c = await rest(env, 'rpc/push_count_sends', {
            method: 'POST', body: JSON.stringify({ p_day: now.toISOString().slice(0, 10), p_counts: perVariant }),
        })
        if (!c.ok) console.log('push count failed', c.status)
    }
    console.log('push run', { due: due.length, capped: due.length >= MAX_SENDS_PER_RUN, perVariant })
}
