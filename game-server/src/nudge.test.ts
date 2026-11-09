import { describe, expect, it } from 'vitest'
import { cleanSubscription, localClock, nudgeFor, type NudgeRow } from './nudge'

// 2026-07-24 14:00 UTC is 19:30 in Kolkata and 10:00 in New York.
const NOW = new Date('2026-07-24T14:00:00Z')

const row = (over: Partial<NudgeRow> = {}): NudgeRow => ({
    endpoint: 'https://fcm.googleapis.com/fcm/send/player-a',
    tz: 'Asia/Kolkata', play_hour: 19, streak: 4, last_played: '2026-07-23', shield_used_on: '2026-07-20', last_sent_on: null, ...over,
})

describe('localClock', () => {
    it('reads the day and hour in the player\'s time zone', () => {
        expect(localClock('Asia/Kolkata', NOW)).toEqual({ day: '2026-07-24', hour: 19 })
        expect(localClock('America/New_York', NOW)).toEqual({ day: '2026-07-24', hour: 10 })
        expect(localClock('Pacific/Auckland', NOW)).toEqual({ day: '2026-07-25', hour: 2 })
    })
})

describe('nudgeFor', () => {
    // Day k at 19:30 in Kolkata, inside the evening send window.
    const at = (k: number) => new Date(Date.UTC(2026, 6, 24 + k, 14, 0))
    const dayOf = (k: number) => new Date(Date.UTC(2026, 6, 24 + k)).toISOString().slice(0, 10)
    // The same situation on each of `days` consecutive days: last game `gap` days before.
    const run = (over: Partial<NudgeRow>, gap: number, days: number, stats: { players: number; won: number } | null = null) =>
        Array.from({ length: days }, (_, k) => nudgeFor(row({ ...over, last_played: dayOf(k - gap) }), at(k), stats)!)
    const variants = (ns: { variant: string }[]) => ns.map(n => n.variant)

    it('never sends the same wording two days running', () => {
        const situations = [
            run({}, 1, 8),
            run({ shield_used_on: null }, 1, 8),
            run({ streak: 1 }, 1, 8),
            run({ streak: 1 }, 2, 8, { players: 52, won: 12 }),
        ]
        for (const seq of situations) {
            const v = variants(seq)
            for (let i = 1; i < v.length; i++) expect(v[i]).not.toBe(v[i - 1])
            expect(new Set(v).size).toBeGreaterThanOrEqual(3)
        }
    })

    it('starts each player at a different point, so one day does not send everyone the same words', () => {
        const seen = new Set(Array.from({ length: 8 }, (_, i) =>
            nudgeFor(row({ endpoint: `https://fcm.googleapis.com/fcm/send/p${i}` }), NOW)!.variant))
        expect(seen.size).toBeGreaterThanOrEqual(3)
    })

    it('has a deep pool for every situation, and runs through all of it before repeating', () => {
        const pool = (seq: { variant: string }[]) => new Set(variants(seq)).size
        expect(pool(run({ shield_used_on: '2026-07-24' }, 1, 6))).toBe(6)
        expect(pool(run({ shield_used_on: null }, 1, 9))).toBe(9)
        expect(pool(run({ streak: 1 }, 1, 8))).toBe(8)
        expect(pool(run({ streak: 1 }, 2, 8))).toBe(8)
        expect(pool(run({ shield_used_on: null }, 2, 5))).toBe(5)
    })

    it('warns a streak with no shield left that it ends tonight, every way it says it', () => {
        // Spent on day 0, so the shield stays away for the whole run.
        for (const n of run({ shield_used_on: '2026-07-24' }, 1, 6)) {
            expect(n.variant).toMatch(/^end-/)
            expect(`${n.title} ${n.body}`).toContain('4')
            expect(`${n.title} ${n.body}`).toMatch(/midnight|tonight/)
        }
    })

    it('never says the streak is ending while the shield would save it', () => {
        for (const n of run({ shield_used_on: null }, 1, 12, { players: 52, won: 12 })) {
            expect(n.variant).toMatch(/^keep-/)
            expect(`${n.title} ${n.body}`).not.toMatch(/midnight|tonight|reset|save|lose|break|line|ends/i)
        }
    })

    it('asks whether the shield would save a miss tomorrow, not whether it is ready today', () => {
        // Spent 6 days ago: not ready today, ready tomorrow, so missing today is covered.
        const n = nudgeFor(row({ shield_used_on: '2026-07-18' }), NOW)!
        expect(n.variant).toMatch(/^keep-/)
        expect(nudgeFor(row({ shield_used_on: '2026-07-19' }), NOW)!.variant).toMatch(/^end-/)
    })

    it('never repeats yesterday\'s wording, even when the pool changes size', () => {
        for (let i = 0; i < 40; i++) {
            const endpoint = `https://fcm.googleapis.com/fcm/send/q${i}`
            const yesterday = nudgeFor(row({ endpoint, streak: 1, last_played: '2026-07-22' }), NOW, { players: 52, won: 12 })!
            const today = nudgeFor(row({ endpoint, streak: 1, last_played: '2026-07-22', last_variant: yesterday.variant }), at(1), null)!
            expect(today.variant).not.toBe(yesterday.variant)
        }
    })

    it('marks a milestone day instead of the usual rotation', () => {
        for (const n of run({ streak: 6, shield_used_on: '2026-07-24' }, 1, 3)) {
            expect(n.variant).toMatch(/^milestone-/)
            expect(n.title).toContain('7')
            expect(n.body).toContain('midnight')
        }
        for (const n of run({ streak: 6, shield_used_on: null }, 1, 3)) expect(n.body).not.toContain('midnight')
    })

    it('says so when the shield is holding the streak over a missed day', () => {
        for (const n of run({ shield_used_on: null }, 2, 5)) {
            expect(n.variant).toMatch(/^shield-/)
            expect(`${n.title} ${n.body}`).toMatch(/shield/i)
        }
    })

    it('dares players with the real share who beat today\'s deal', () => {
        const seq = run({ streak: 1 }, 2, 16, { players: 52, won: 12 })
        expect(seq.find(n => n.variant === 'beat-rate')?.title).toBe('Only 12 of 52 beat today\'s deal')
        expect(seq.find(n => n.variant === 'crowd')?.title).toBe('52 players took on today\'s deal')
    })

    it('mixes today\'s numbers into a streak reminder\'s body', () => {
        const bodies = run({ shield_used_on: null }, 1, 12, { players: 52, won: 12 }).map(n => n.body)
        expect(bodies.some(b => b.includes('Only 12 of 52'))).toBe(true)
    })

    it('says nobody has won yet only when that is true and enough have tried', () => {
        expect(variants(run({ streak: 1 }, 2, 12, { players: 14, won: 0 }))).toContain('none-beat')
        for (const v of variants(run({ streak: 1 }, 2, 12, { players: 6, won: 0 }))) expect(v).not.toMatch(/none|beat|crowd/)
    })

    it('does not say "only" or "beating most" when most players win', () => {
        for (const v of variants(run({ streak: 1 }, 2, 16, { players: 40, won: 30 }))) expect(v).not.toMatch(/^beat-/)
    })

    it('asks a one-day player for a second day in a row', () => {
        for (const n of run({ streak: 1 }, 1, 8)) expect(n.variant).toMatch(/^two-/)
    })

    it('keeps titles short enough not to be cut off', () => {
        const all = [
            ...run({ streak: 999, shield_used_on: '2026-07-24' }, 1, 7, { players: 999, won: 499 }),
            ...run({ streak: 999, shield_used_on: null }, 1, 10, { players: 999, won: 499 }),
            ...run({ streak: 999, shield_used_on: null }, 2, 5), ...run({ streak: 1 }, 2, 16, { players: 999, won: 0 }),
            ...run({ streak: 1 }, 1, 16, { players: 999, won: 400 }), ...run({ streak: 99 }, 1, 3),
        ]
        for (const n of all) expect(n.title.length).toBeLessThanOrEqual(45)
    })

    it('sends nothing to someone who already played today', () => {
        expect(nudgeFor(row({ last_played: '2026-07-24' }), NOW)).toBeNull()
    })

    it('stops after three days away', () => {
        expect(nudgeFor(row({ last_played: '2026-07-20' }), NOW)).toBeNull()
    })

    it('sends at most one a day', () => {
        expect(nudgeFor(row({ last_sent_on: '2026-07-24' }), NOW)).toBeNull()
    })

    it('waits for the hour the player usually plays', () => {
        expect(nudgeFor(row({ play_hour: 20 }), NOW)).toBeNull()
    })

    it('never sends in quiet hours, and moves a late player\'s nudge into the evening', () => {
        expect(nudgeFor(row({ tz: 'Pacific/Auckland', play_hour: 1 }), NOW)).toBeNull()
        expect(nudgeFor(row({ play_hour: 23 }), new Date('2026-07-24T15:40:00Z'))).not.toBeNull()
    })

    it('links home with the wording that brought the player back; the app opens today\'s deal', () => {
        const n = nudgeFor(row(), NOW)!
        expect(n.url).toBe(`/?src=push&v=${n.variant}`)
    })
})

describe('cleanSubscription', () => {
    const body = (over: Record<string, unknown> = {}) => ({
        subscription: {
            endpoint: 'https://fcm.googleapis.com/fcm/send/abc123',
            keys: { p256dh: 'B'.repeat(87), auth: 'a'.repeat(22) },
        },
        tz: 'Asia/Kolkata', hour: 19, streak: 4, lastPlayed: '2026-07-23', shieldUsedOn: null,
        ...over,
    })

    it('keeps a well-formed subscription', () => {
        expect(cleanSubscription(body())).toMatchObject({
            endpoint: 'https://fcm.googleapis.com/fcm/send/abc123', tz: 'Asia/Kolkata', play_hour: 19, streak: 4,
        })
    })

    it('accepts the browsers\' push services and nothing else', () => {
        const at = (endpoint: string) => cleanSubscription(body({ subscription: { ...body().subscription, endpoint } }))
        expect(at('https://updates.push.services.mozilla.com/wpush/v2/x')).not.toBeNull()
        expect(at('https://wns2-par02p.notify.windows.com/w/?token=x')).not.toBeNull()
        expect(at('https://web.push.apple.com/x')).not.toBeNull()
        expect(at('https://evil.example.com/fcm.googleapis.com')).toBeNull()
        expect(at('http://fcm.googleapis.com/fcm/send/x')).toBeNull()
        expect(at('https://fcm.googleapis.com.evil.com/x')).toBeNull()
        expect(at('https://fcm.googleapis.com/fcm/send/a",b')).toBeNull()
    })

    it('refuses a bad time zone, hour or key', () => {
        expect(cleanSubscription(body({ tz: 'Mars/Olympus' }))).toBeNull()
        expect(cleanSubscription(body({ hour: 24 }))).toBeNull()
        expect(cleanSubscription(body({ subscription: { endpoint: 'https://fcm.googleapis.com/x', keys: { p256dh: 'x', auth: 'y' } } }))).toBeNull()
        expect(cleanSubscription(null)).toBeNull()
    })

    it('drops malformed dates rather than storing them', () => {
        expect(cleanSubscription(body({ lastPlayed: 'yesterday', shieldUsedOn: 5 }))).toMatchObject({ last_played: null, shield_used_on: null })
    })
})
