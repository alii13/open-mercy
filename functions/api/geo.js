/**
 * Country lookup for the client — Cloudflare already stamps every request
 * with its edge-detected country, so this is a zero-dependency mirror.
 * Consumed by src/utils/country.ts to store country on the profile.
 */

// The iOS and Android apps call this cross-origin: Capacitor serves their
// bundled web build from these origins.
const APP_ORIGINS = ['capacitor://localhost', 'https://localhost']

export function onRequestGet({ request }) {
    const headers = {
        'content-type': 'application/json',
        'cache-control': 'no-store',
    }
    const origin = request.headers.get('Origin')
    if (APP_ORIGINS.includes(origin)) headers['access-control-allow-origin'] = origin
    return new Response(JSON.stringify({ country: request.cf?.country ?? null }), { headers })
}
