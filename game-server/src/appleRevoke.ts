/// <reference types="@cloudflare/workers-types" />

// Sign in with Apple token revocation. Apple requires an app that offers Sign
// in with Apple to revoke the user's Apple tokens when they delete their
// account. Supabase keeps no Apple token, so the iOS app opens the Apple sheet
// once more at deletion and sends the one-time authorization code here; the
// code is exchanged for a token and that token is revoked.

export interface AppleEnv {
    /** Key ID of the "Sign in with Apple" key (Apple Developer, Keys). */
    APPLE_KEY_ID?: string
    /** That key's .p8 contents, set with `wrangler secret put`. Never in code. */
    APPLE_PRIVATE_KEY?: string
}

const TEAM_ID = '5UGJTAJ8TL'
const CLIENT_ID = 'com.openmercy.app'
const APPLE = 'https://appleid.apple.com'

export function appleRevokeConfigured(env: AppleEnv): boolean {
    return !!env.APPLE_KEY_ID && !!env.APPLE_PRIVATE_KEY
}

function base64url(data: ArrayBuffer | string): string {
    const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : new Uint8Array(data)
    let binary = ''
    for (const b of bytes) binary += String.fromCharCode(b)
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function pemToDer(pem: string): ArrayBuffer {
    const body = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '')
    const binary = atob(body)
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    return bytes.buffer
}

/**
 * The client_secret Apple's token endpoints expect: an ES256 JWT signed with
 * the Sign in with Apple key. WebCrypto's ECDSA signature is already the raw
 * r||s form a JWT needs, so no DER conversion. Valid for five minutes, which
 * covers the two calls it is minted for.
 */
export async function appleClientSecret(env: Required<AppleEnv>, nowSeconds = Math.floor(Date.now() / 1000)): Promise<string> {
    const key = await crypto.subtle.importKey(
        'pkcs8', pemToDer(env.APPLE_PRIVATE_KEY), { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign'],
    )
    const header = base64url(JSON.stringify({ alg: 'ES256', kid: env.APPLE_KEY_ID }))
    const payload = base64url(JSON.stringify({ iss: TEAM_ID, iat: nowSeconds, exp: nowSeconds + 300, aud: APPLE, sub: CLIENT_ID }))
    const signature = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${header}.${payload}`))
    return `${header}.${payload}.${base64url(signature)}`
}

/** Exchanges the authorization code and revokes the token it yields. Returns the HTTP status to send back. */
export async function revokeAppleTokens(code: string, env: Required<AppleEnv>): Promise<number> {
    const clientSecret = await appleClientSecret(env)
    const form = (fields: Record<string, string>) => ({
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({ client_id: CLIENT_ID, client_secret: clientSecret, ...fields }),
    })
    const exchanged = await fetch(`${APPLE}/auth/token`, form({ grant_type: 'authorization_code', code }))
    if (!exchanged.ok) return 502
    const tokens = await exchanged.json<{ refresh_token?: string; access_token?: string }>()
    const token = tokens.refresh_token ?? tokens.access_token
    if (!token) return 502
    const revoked = await fetch(`${APPLE}/auth/revoke`, form({
        token,
        token_type_hint: tokens.refresh_token ? 'refresh_token' : 'access_token',
    }))
    return revoked.ok ? 204 : 502
}
