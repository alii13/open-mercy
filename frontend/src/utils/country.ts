/**
 * Country capture + flag rendering. The CDN already knows every request's
 * country — a tiny Pages Function (/api/geo) exposes it, and the value is
 * mirrored onto the signed-in profile once per session. No geo API, no IP
 * handling, country-level only.
 */

import { siteOrigin } from './siteOrigin'

/** ISO-3166 alpha-2 → flag emoji via regional indicators; '' when unknown. */
export function flagEmoji(iso: string | null | undefined): string {
    if (!iso || !/^[A-Za-z]{2}$/.test(iso)) return ''
    return String.fromCodePoint(
        ...[...iso.toUpperCase()].map(c => 0x1f1e6 + (c.charCodeAt(0) - 65)),
    )
}

/** Normalize a CDN country header to a storable code, or null.
 *  XX (unknown) and T1 (Tor) are Cloudflare sentinels, not countries. */
export function usableCountry(raw: string | null | undefined): string | null {
    if (!raw || !/^[A-Za-z]{2}$/.test(raw)) return null
    const up = raw.toUpperCase()
    if (up === 'XX' || up === 'T1') return null
    return up
}

let detected: Promise<string | null> | null = null

/** The CDN-detected country, fetched once per session; null when unknown. */
export function detectedCountry(): Promise<string | null> {
    detected ??= fetch(`${siteOrigin()}/api/geo`)
        .then(async res => {
            // A misrouted function serves the SPA shell with a 200 — only JSON counts.
            if (!res.ok || !res.headers.get('content-type')?.includes('json')) return null
            const body = await res.json() as { country?: string | null }
            return usableCountry(body.country)
        })
        .catch(() => null)
    return detected
}

let attempted = false

/** Mirror the CDN-detected country onto the profile — once per session,
 *  cosmetic, never blocks. Silently a no-op in local dev (no /api/geo)
 *  and until the country column exists. */
export async function syncCountryToProfile(current: string | null | undefined): Promise<void> {
    if (attempted) return
    attempted = true
    try {
        const country = await detectedCountry()
        if (!country || country === current) return
        const { supabase } = await import('../lib/supabase')
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return
        await supabase.from('profiles').update({ country }).eq('id', session.user.id)
    } catch { /* cosmetic — never breaks the game */ }
}
