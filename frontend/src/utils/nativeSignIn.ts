import { Capacitor } from '@capacitor/core'
import { SocialLogin } from '@capgo/capacitor-social-login'

/**
 * Google and Apple sign-in inside the iOS and Android apps. Google refuses its
 * sign-in page inside an app's web view, so the apps use the system sign-in
 * sheets and hand Supabase the ID token they return (signInWithIdToken, or
 * linkIdentity for a guest keeping their account).
 *
 * The OAuth client IDs are not secrets: they ship inside every app binary.
 * The web client is the one Supabase's Google provider uses; the iOS client is
 * bound to the bundle id com.openmercy.app.
 */
const GOOGLE_WEB_CLIENT_ID = '639479560095-2pcnvq8uq3ofqsvrvn9kbbulhrtdg5rj.apps.googleusercontent.com'
const GOOGLE_IOS_CLIENT_ID = '639479560095-aniv3nddf3etr8idr8h0s7ngm83upnf8.apps.googleusercontent.com'

const GAME_SERVER = (import.meta.env.VITE_GAME_SERVER_URL as string | undefined) || 'https://uno-game-server.shekhaliul44.workers.dev'

export const isNativeApp = Capacitor.isNativePlatform()
/** Apple requires Sign in with Apple beside Google on iOS. The web and Android keep Google and email. */
export const canSignInWithApple = Capacitor.getPlatform() === 'ios'

export type NativeProvider = 'google' | 'apple'

/** The player closed the Google or Apple sheet. Not an error to show. */
export class SignInCancelled extends Error {}

let initialized: Promise<void> | null = null

function initialize(): Promise<void> {
    initialized ??= SocialLogin.initialize({
        google: {
            webClientId: GOOGLE_WEB_CLIENT_ID,
            iOSClientId: GOOGLE_IOS_CLIENT_ID,
            iOSServerClientId: GOOGLE_WEB_CLIENT_ID,
            mode: 'online',
        },
        // iOS only. On Android an Apple block without a redirectUrl makes the
        // plugin reject before it sets up Google.
        ...(canSignInWithApple && { apple: { clientId: 'com.openmercy.app' } }),
    }).catch((err: unknown) => {
        initialized = null
        throw err
    })
    return initialized
}

// Apple's cancel (error 1001) never says "cancel"; the plugin's code does.
function isCancel(err: unknown): boolean {
    const e = err as { code?: string; message?: string }
    return e?.code === 'USER_CANCELLED' || /cancel/i.test(String(e?.message ?? err))
}

/** A random nonce, and its SHA-256 hex. The provider puts the hash in the ID
 *  token; Supabase is given the raw value and hashes it to compare. */
async function makeNonce(): Promise<{ raw: string; hashed: string }> {
    const raw = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('')
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(raw))
    const hashed = Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
    return { raw, hashed }
}

/** Opens the provider's sign-in sheet and returns its ID token with the raw nonce for Supabase. */
export async function nativeIdToken(provider: NativeProvider): Promise<{ token: string; nonce: string }> {
    await initialize()
    const { raw, hashed } = await makeNonce()
    let response
    try {
        response = provider === 'apple'
            ? await SocialLogin.login({ provider: 'apple', options: { scopes: ['email', 'name'], nonce: hashed } })
            : await SocialLogin.login({ provider: 'google', options: { nonce: hashed } })
    } catch (err) {
        if (isCancel(err)) throw new SignInCancelled()
        throw err
    }
    const token = 'idToken' in response.result ? response.result.idToken : null
    if (!token) throw new Error(`${provider} returned no ID token`)
    return { token, nonce: raw }
}

/**
 * Revokes the player's Sign in with Apple tokens before their account is
 * deleted, as Apple requires. Apple revokes only a token it is shown and
 * Supabase keeps none, so the Apple sheet opens once more for a one-time
 * code, which the game server exchanges and revokes (game-server/src/appleRevoke.ts).
 */
export async function revokeAppleSignIn(accessToken: string): Promise<void> {
    await initialize()
    let response
    try {
        response = await SocialLogin.login({ provider: 'apple', options: { scopes: ['email'] } })
    } catch (err) {
        if (isCancel(err)) throw new SignInCancelled()
        throw err
    }
    // Without useProperTokenExchange the plugin returns the authorization code as accessToken.token.
    const code = 'accessToken' in response.result ? response.result.accessToken?.token : undefined
    if (!code) throw new Error('Apple returned no authorization code')
    const res = await fetch(`${GAME_SERVER}/account/apple-revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ code }),
    })
    if (!res.ok) throw new Error(`Apple revoke failed: ${res.status}`)
}
