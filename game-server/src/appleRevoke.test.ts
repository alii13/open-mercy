import { describe, expect, it } from 'vitest'
import { appleClientSecret } from './appleRevoke'

const fromBase64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0))
const json = (s: string) => JSON.parse(new TextDecoder().decode(fromBase64url(s)))

describe('Sign in with Apple client secret', () => {
    // Apple rejects the revoke unless this is an ES256 JWT with a raw 64-byte
    // r||s signature and exactly these claims. Nothing else checks that before
    // a real player deletes a real account, so it is checked with a throwaway key.
    it('is an ES256 JWT, signed by the key, issued by the team for the app', async () => {
        const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])
        const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', pair.privateKey))
        const pem = `-----BEGIN PRIVATE KEY-----\n${btoa(String.fromCharCode(...pkcs8))}\n-----END PRIVATE KEY-----\n`

        const jwt = await appleClientSecret({ APPLE_KEY_ID: 'KEY1234567', APPLE_PRIVATE_KEY: pem }, 1_800_000_000)
        const [header, payload, signature] = jwt.split('.')

        expect(json(header!)).toEqual({ alg: 'ES256', kid: 'KEY1234567' })
        expect(json(payload!)).toEqual({
            iss: '5UGJTAJ8TL', iat: 1_800_000_000, exp: 1_800_000_300, aud: 'https://appleid.apple.com', sub: 'com.openmercy.app',
        })
        const sig = fromBase64url(signature!)
        expect(sig).toHaveLength(64)
        const valid = await crypto.subtle.verify(
            { name: 'ECDSA', hash: 'SHA-256' }, pair.publicKey, sig, new TextEncoder().encode(`${header}.${payload}`),
        )
        expect(valid).toBe(true)
    })
})
