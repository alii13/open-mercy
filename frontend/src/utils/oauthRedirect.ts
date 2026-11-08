/**
 * Reading an OAuth failure off the URL we were redirected back to.
 *
 * Pure so it can be tested without touching the Supabase client (which throws at
 * import time when env is unset — see CLAUDE.md "Tests").
 */

export interface OAuthRedirectError {
    /** `identity_already_exists` is the one we act on: that Google account is already a player. */
    code: string
    message: string
}

/**
 * Read an OAuth failure off the URL we were sent back to.
 *
 * `linkIdentity()` navigates away, so a collision never surfaces as a rejected
 * promise at the call site — it comes back as error params on the return trip.
 * GoTrue puts them in the query string for the PKCE flow and in the fragment for
 * the implicit one, so check both.
 */
export function readOAuthError(search: string, hash: string): OAuthRedirectError | null {
    for (const raw of [search, hash]) {
        const params = new URLSearchParams(raw.replace(/^[?#]/, ''))
        const code = params.get('error_code') || params.get('error')
        if (!code) continue
        return { code, message: params.get('error_description') || code }
    }
    return null
}

const ERROR_PARAMS = ['error', 'error_code', 'error_description']

/**
 * The same URL with only the OAuth error params removed.
 *
 * Deliberately surgical rather than resetting to `/`: the path and the rest of
 * the query are other state, such as the room a `/r/CODE` invite names, so
 * blanking them to tidy up an error would silently eat someone's invite link.
 */
export function urlWithoutOAuthError(loc: { pathname: string; search: string }): string {
    const params = new URLSearchParams(loc.search.replace(/^\?/, ''))
    for (const key of ERROR_PARAMS) params.delete(key)
    const query = params.toString()
    return query ? `${loc.pathname}?${query}` : loc.pathname
}

// Google always returns to the site root (`redirectTo` is the origin), so the
// page it left rides the tab's sessionStorage across the round trip.
const RETURN_PATH_KEY = 'om_oauth_return'

export function rememberReturnPath(path: string): void {
    try { sessionStorage.setItem(RETURN_PATH_KEY, path) } catch { /* private mode */ }
}

/** The page Google was opened from, once; null when there is none. */
export function takeReturnPath(): string | null {
    try {
        const path = sessionStorage.getItem(RETURN_PATH_KEY)
        sessionStorage.removeItem(RETURN_PATH_KEY)
        return path
    } catch {
        return null
    }
}
