import { readFileSync } from 'node:fs'
import { createContext, runInContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Runs index.html's own inline <script>s, in page order, against a stub window, so the
// consent and analytics loading order is tested exactly as it ships.
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8')
const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])

const CONSENT = 'https://fundingchoicesmessages.google.com/i/pub-5481263585202262?ers=1'
const GTAG = 'https://www.googletagmanager.com/gtag/js?id=G-HF9GCTVQ7J'
const ENGAGE = ['scroll', 'pointerdown', 'keydown', 'touchstart']

function openPage(hostname: string) {
    const listeners = new Map<string, Set<() => void>>()
    const requested: { src: string; async: boolean; queuedBefore: unknown[][] }[] = []
    const calls = () => (win.dataLayer ?? []).map((a: ArrayLike<unknown>) => Array.from(a))
    const win: Record<string, any> = {
        location: { hostname },
        frames: {},
        setTimeout: globalThis.setTimeout,
        addEventListener: (type: string, fn: () => void) => {
            if (!listeners.has(type)) listeners.set(type, new Set())
            listeners.get(type)!.add(fn)
        },
        removeEventListener: (type: string, fn: () => void) => listeners.get(type)?.delete(fn),
        document: {
            createElement: () => ({}),
            head: { appendChild: (el: any) => requested.push({ src: el.src, async: el.async, queuedBefore: calls() }) },
            body: { appendChild: (el: any) => { if (el.name) win.frames[el.name] = el } },
        },
    }
    win.window = win
    const context = createContext(win)
    for (const s of scripts) runInContext(s, context)
    return {
        win,
        calls,
        loads: (src: string) => requested.filter((r) => r.src === src),
        interact: (type: string) => [...(listeners.get(type) ?? [])].forEach((fn) => fn()),
    }
}

describe('index.html consent and analytics loading', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())

    it('requests the consent message on arrival, async, after the denied Consent Mode defaults', () => {
        const page = openPage('open-mercy.com')
        const consent = page.loads(CONSENT)
        expect(consent).toHaveLength(1)
        expect(consent[0].async).toBe(true)
        const defaults = consent[0].queuedBefore.find((c) => c[0] === 'consent' && c[1] === 'default')
        expect(defaults?.[2]).toMatchObject({
            ad_storage: 'denied',
            ad_user_data: 'denied',
            ad_personalization: 'denied',
            analytics_storage: 'denied',
            wait_for_update: 500,
        })
        expect((defaults?.[2] as { region: string[] }).region).toEqual(expect.arrayContaining(['DE', 'FR', 'GB', 'CH', 'NO']))
        expect(page.loads(GTAG)).toHaveLength(0)
    })

    it('keeps the googlefcPresent marker', () => {
        expect(openPage('open-mercy.com').win.frames.googlefcPresent).toBeDefined()
    })

    it('loads gtag.js once on the first interaction, never again after more interactions or the fallback', () => {
        const page = openPage('open-mercy.com')
        page.interact('pointerdown')
        expect(page.loads(GTAG)).toHaveLength(1)
        ENGAGE.forEach(page.interact)
        page.interact('pointerdown')
        vi.advanceTimersByTime(20_000)
        expect(page.loads(GTAG)).toHaveLength(1)
        expect(page.loads(CONSENT)).toHaveLength(1)
    })

    it('loads gtag.js after 15 s when the visitor never interacts', () => {
        const page = openPage('open-mercy.com')
        vi.advanceTimersByTime(14_999)
        expect(page.loads(GTAG)).toHaveLength(0)
        vi.advanceTimersByTime(1)
        expect(page.loads(GTAG)).toHaveLength(1)
        ENGAGE.forEach(page.interact)
        expect(page.loads(GTAG)).toHaveLength(1)
    })

    it('queues GA and Ads config on production and never grants consent by itself', () => {
        const page = openPage('open-mercy.com')
        ENGAGE.forEach(page.interact)
        vi.advanceTimersByTime(20_000)
        const configs = page.calls().filter((c: unknown[]) => c[0] === 'config').map((c: unknown[]) => c[1])
        expect(configs).toEqual(['G-HF9GCTVQ7J', 'AW-18192424425'])
        expect(page.calls().some((c: unknown[]) => c[0] === 'consent' && c[1] !== 'default')).toBe(false)
    })

    it.each(['localhost', '127.0.0.1', 'fix-consent-load-on-arrival.uno-no-mercy.pages.dev', '4f2a9c1e.uno-no-mercy.pages.dev'])(
        'keeps analytics off on %s while the consent message still loads',
        (host) => {
            const page = openPage(host)
            ENGAGE.forEach(page.interact)
            vi.advanceTimersByTime(20_000)
            expect(page.loads(GTAG)).toHaveLength(0)
            expect(page.loads(CONSENT)).toHaveLength(1)
            expect(page.calls().some((c: unknown[]) => c[0] === 'config' || c[0] === 'event')).toBe(false)
            expect(page.win.gtag_report_conversion('/play')).toBe(false)
            expect(page.win.location).toBe('/play')
            expect(page.calls().some((c: unknown[]) => c[0] === 'event')).toBe(false)
        },
    )
})
