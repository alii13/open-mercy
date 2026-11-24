/** One shown announcement, as live_announcement() returns it (supabase/announcements.sql).
 *  It can show before its points start. startsAt and endsAt are in this
 *  device's clock, already corrected by the server's. */
export interface Announcement {
    id: string
    eyebrow: string | null
    hero: string | null
    heroTitle: string | null
    heroNote: string | null
    body: string
    imagePath: string | null
    imageCaption: string | null
    buttonLabel: string
    pointsMultiplier: number | null
    startsAt: number
    endsAt: number
    joined: boolean
    skips: number
}

/** The modal is offered at most twice; the server refuses a join after two skips too. */
export const MAX_SKIPS = 2

export function shouldOffer(a: Announcement | null, answeredThisVisit: boolean): boolean {
    return !!a && !a.joined && a.skips < MAX_SKIPS && !answeredThisVisit
}

/** The multiplier the server will stamp on a game this player finishes now.
 *  Only drives the post-game badge check; the server decides the real points. */
export function pointsBoost(a: Announcement | null, now: number): number {
    if (!a?.joined || !a.pointsMultiplier || now < a.startsAt || now >= a.endsAt) return 1
    return a.pointsMultiplier
}

/** "14:22:08" for the countdown; never negative. */
export function countdownText(msLeft: number): string {
    const s = Math.max(0, Math.floor(msLeft / 1000))
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`
}
