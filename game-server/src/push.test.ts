import { afterEach, describe, expect, it, vi } from 'vitest'
import { MAX_SENDS_PER_RUN, saveSubscription, sendNudges } from './push'

// CI installs only the frontend's packages, so the push library is stubbed.
// These tests are about the run's own logic; encryption is the library's job.
vi.mock('@block65/webcrypto-web-push', () => ({
    buildPushPayload: async () => ({ method: 'POST', headers: {}, body: new Uint8Array(0) }),
}))

const NOW = new Date('2026-07-24T12:00:00Z')

async function setup(rowCount: number, statusFor: (i: number) => number) {
    const env = { SUPABASE_URL: 'https://db.test', SUPABASE_SERVICE_KEY: 'service', VAPID_PUBLIC_KEY: 'pub', VAPID_PRIVATE_KEY: 'priv' }
    const rows = Array.from({ length: rowCount }, (_, i) => ({
        endpoint: `https://fcm.googleapis.com/fcm/send/e${i}`, p256dh: 'B'.repeat(87), auth: 'a'.repeat(22),
        tz: 'UTC', play_hour: 0, streak: 4, last_played: '2026-07-23', shield_used_on: '2026-07-20', last_sent_on: null, last_variant: null,
    }))
    const calls: { kind: string; url: string; body?: unknown }[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit = {}) => {
        const body = typeof init.body === 'string' ? JSON.parse(init.body) : undefined
        if (url.startsWith('https://fcm.googleapis.com/')) {
            calls.push({ kind: 'push', url })
            return new Response(null, { status: statusFor(Number(url.split('/e').pop())) })
        }
        const kind = url.includes('rpc/push_daily_stats') ? 'stats'
            : url.includes('rpc/push_count_sends') ? 'count'
            : init.method === 'DELETE' ? 'delete'
            : init.method === 'POST' ? 'write' : 'read'
        calls.push({ kind, url, body })
        if (kind === 'read') return Response.json(rows)
        if (kind === 'stats') return Response.json([{ players: 52, won: 12 }])
        return new Response(null, { status: 204 })
    }))
    return { env, calls }
}

afterEach(() => vi.unstubAllGlobals())

describe('sendNudges', () => {
    it('marks everyone it is about to remind before sending, so a run cut short never repeats a reminder', async () => {
        const { env, calls } = await setup(3, () => 201)
        await sendNudges(env, NOW)
        const firstPush = calls.findIndex(c => c.kind === 'push')
        const claim = calls.findIndex(c => c.kind === 'write')
        expect(claim).toBeGreaterThanOrEqual(0)
        expect(claim).toBeLessThan(firstPush)
        const claimed = calls[claim]!.body as { last_sent_on: string; last_variant: string }[]
        expect(claimed).toHaveLength(3)
        expect(claimed.every(r => r.last_sent_on === '2026-07-24' && r.last_variant)).toBe(true)
    })

    it('stops at the cap however many sends fail', async () => {
        const { env, calls } = await setup(60, i => (i % 3 === 0 ? 403 : 201))
        await sendNudges(env, NOW)
        expect(calls.filter(c => c.kind === 'push')).toHaveLength(MAX_SENDS_PER_RUN)
        expect(calls.length).toBeLessThanOrEqual(50)
    })

    it('deletes subscriptions the browser dropped and counts them', async () => {
        const { env, calls } = await setup(4, i => (i === 1 ? 410 : 201))
        await sendNudges(env, NOW)
        expect(decodeURIComponent(calls.find(c => c.kind === 'delete')!.url)).toContain('fcm/send/e1')
        const counts = (calls.find(c => c.kind === 'count')!.body as { p_counts: Record<string, number> }).p_counts
        expect(counts.unsubscribed).toBe(1)
        expect(Object.values(counts).reduce((a, b) => a + b, 0)).toBe(4)
    })
})

describe('saveSubscription', () => {
    it('keeps one subscription per player: the device they last played on', async () => {
        const { env, calls } = await setup(0, () => 201)
        const status = await saveSubscription(env, 'user-1', {
            subscription: { endpoint: 'https://fcm.googleapis.com/fcm/send/new', keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) } },
            tz: 'UTC', hour: 19, streak: 2, lastPlayed: '2026-07-23', shieldUsedOn: null,
        })
        expect(status).toBe(204)
        const del = calls.find(c => c.kind === 'delete')!
        expect(decodeURIComponent(del.url)).toContain('user_id=eq.user-1')
        expect(decodeURIComponent(del.url)).toContain('endpoint=neq.https://fcm.googleapis.com/fcm/send/new')
        expect(calls.findIndex(c => c.kind === 'delete')).toBeLessThan(calls.findIndex(c => c.kind === 'write'))
    })
})
