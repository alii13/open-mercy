/**
 * Host-level 301s for the Open Mercy domain cutover. Pages' _redirects file
 * no longer accepts absolute-URL (host-matched) sources — the build log
 * rejects them with "Only relative URLs are allowed" — so the domain bridge
 * lives here instead.
 *
 * Redirected → https://open-mercy.com (path + query preserved):
 *   - uno-no-mercy.com, www.uno-no-mercy.com   (bridge, revisit 2027-08)
 *   - uno-no-mercy.pages.dev                   (bare project domain)
 *   - www.open-mercy.com                       (www → apex)
 *
 * Deliberately NOT redirected: <branch>.uno-no-mercy.pages.dev — branch
 * previews must stay browsable.
 */
const CANONICAL_ORIGIN = 'https://open-mercy.com'
const REDIRECT_HOSTS = new Set([
    'uno-no-mercy.com',
    'www.uno-no-mercy.com',
    'uno-no-mercy.pages.dev',
    'www.open-mercy.com',
])

export function onRequest({ request, next }) {
    const url = new URL(request.url)
    if (REDIRECT_HOSTS.has(url.hostname)) {
        return Response.redirect(CANONICAL_ORIGIN + url.pathname + url.search, 301)
    }
    if (url.pathname.startsWith('/.well-known/')) return wellKnown(next)
    return next()
}

// The SPA fallback answers every unknown path with index.html. Under
// /.well-known/ that reads as a broken manifest (Lighthouse flagged
// ai-catalog.json), so a file we don't ship is a plain 404.
async function wellKnown(next) {
    const res = await next()
    const type = res.headers.get('content-type') || ''
    return type.includes('text/html') ? new Response('Not found', { status: 404 }) : res
}
