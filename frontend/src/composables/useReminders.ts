/**
 * The daily reminder in the browser: one push a day from the game server at
 * the hour this player usually plays (game-server/src/push.ts picks it).
 *
 * The browser keeps the streak, so every finished game sends the server a
 * fresh copy along with the subscription; that is how tonight's message can
 * say "your 4-day streak" truthfully.
 */
import { ref } from 'vue'
import { Capacitor } from '@capacitor/core'
import { useRetentionStore } from '../stores/retentionStore'
import { track } from '../utils/analytics'
import { needsHomeScreen } from '../utils/reminderAsk'

const GAME_SERVER = (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) || 'https://uno-game-server.shekhaliul44.workers.dev'

/** iPhone Safari only exposes push inside a home-screen app, so a plain tab reads as unsupported. */
export function remindersSupported(): boolean {
    return typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window
}

/** An iPhone or iPad tab, where reminders need Add to Home Screen first. Never
 *  the iOS app: it is installed already, and its web view has no web push. */
export const reminderNeedsHomeScreen = !Capacitor.isNativePlatform() && typeof navigator !== 'undefined' && needsHomeScreen({
    userAgent: navigator.userAgent,
    maxTouchPoints: navigator.maxTouchPoints,
    standalone: (navigator as Navigator & { standalone?: boolean }).standalone,
})

/** null where push is unsupported. */
export const reminderPermission = ref<NotificationPermission | null>(remindersSupported() ? Notification.permission : null)
/** This browser holds a subscription the server has. */
export const remindersOn = ref(false)

let keyRequest: Promise<string | null> | null = null

/** The server's public key, or null when this deploy has reminders off. Fetched once per page. */
export function reminderKey(): Promise<string | null> {
    keyRequest ??= fetch(`${GAME_SERVER}/push/key`)
        .then(r => (r.ok ? r.json() : null))
        .then((j: { key?: string | null } | null) => j?.key ?? null)
        .catch(() => null)
    return keyRequest
}

function keyBytes(b64url: string): Uint8Array<ArrayBuffer> {
    const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    return Uint8Array.from(raw, c => c.charCodeAt(0))
}

async function post(path: string, body: unknown): Promise<boolean> {
    // Imported here, not at the top: lib/supabase throws at import without env, and specs reach this file.
    const { supabase } = await import('../lib/supabase')
    const { data } = await supabase.auth.getSession()
    const token = data.session?.access_token
    if (!token) return false
    const res = await fetch(`${GAME_SERVER}${path}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(body),
    })
    return res.ok
}

function report(sub: PushSubscription) {
    const r = useRetentionStore()
    return {
        subscription: sub.toJSON(),
        tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
        hour: r.usualHour ?? new Date().getHours(),
        streak: r.currentStreak,
        lastPlayed: r.lastPlayedDate,
        shieldUsedOn: r.shieldUsedOn,
    }
}

async function currentSubscription(): Promise<PushSubscription | null> {
    const reg = await navigator.serviceWorker.getRegistration('/')
    return (await reg?.pushManager.getSubscription()) ?? null
}

/**
 * Ask, subscribe, and tell the server. Call straight from the tap: the
 * browser prompt needs the click's user activation, so it goes first.
 */
export async function enableReminders(): Promise<'on' | 'denied' | 'failed'> {
    try {
        const permission = await Notification.requestPermission()
        reminderPermission.value = permission
        if (permission !== 'granted') {
            track('reminder_denied', {})
            return 'denied'
        }
        const key = await reminderKey()
        if (!key) return 'failed'
        const reg = await navigator.serviceWorker.register('/sw.js')
        await navigator.serviceWorker.ready
        const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(key) })
        if (!(await post('/push/subscribe', report(sub)))) return 'failed'
        remindersOn.value = true
        track('reminder_on', {})
        return 'on'
    } catch (err) {
        console.warn('reminders: enable failed', err)
        return 'failed'
    }
}

export async function disableReminders(): Promise<void> {
    try {
        const sub = await currentSubscription()
        if (sub) {
            await post('/push/unsubscribe', { endpoint: sub.endpoint }).catch(() => false)
            await sub.unsubscribe()
        }
    } catch (err) {
        console.warn('reminders: disable failed', err)
    }
    remindersOn.value = false
    track('reminder_off', {})
}

/**
 * Send the server the latest streak. A no-op unless reminders are on. On page
 * load (`checkKey`), also re-subscribe if the server's key was rotated.
 */
export async function syncReminders(opts: { checkKey?: boolean } = {}): Promise<void> {
    if (!remindersSupported() || Notification.permission !== 'granted') return
    try {
        let sub = await currentSubscription()
        if (!sub) return
        if (opts.checkKey) {
            const key = await reminderKey()
            if (!key) return
            const held = sub.options.applicationServerKey
            const want = keyBytes(key)
            if (!held || !new Uint8Array(held).every((b, i) => b === want[i]) || held.byteLength !== want.length) {
                await sub.unsubscribe()
                const reg = await navigator.serviceWorker.ready
                sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: want })
            }
        }
        remindersOn.value = await post('/push/subscribe', report(sub))
    } catch (err) {
        console.warn('reminders: sync failed', err)
    }
}
