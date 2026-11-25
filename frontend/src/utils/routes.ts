/**
 * The app's URLs. vue-router owns the address bar and history; App.vue's v-if
 * chain still picks the screen, because a game in progress must cover any URL.
 */

import { computed } from 'vue'
import {
    createMemoryHistory,
    createRouter,
    createWebHistory,
    type RouteLocationGeneric,
} from 'vue-router'
import { isRoomCode, normalizeRoomCode, ROOM_CODE_ALPHABET, ROOM_CODE_MAX, ROOM_CODE_MIN } from '@roomCode'

/** Which board /leaderboard opens on. Absent means the daily deal. */
export type LeaderboardTab = 'daily' | 'weekly' | 'alltime'

export type Route =
    | { name: 'home' }
    | { name: 'leaderboard'; tab?: LeaderboardTab }
    | { name: 'badges'; badge?: string }
    | { name: 'changelog' }
    | { name: 'profile'; code: string }
    | { name: 'profileGames'; code: string }
    | { name: 'public' }
    | { name: 'room'; code: string }
    | { name: 'daily' }
    | { name: 'bot' }
    | { name: 'friends' }

// ponytail: every route renders nothing. App.vue draws the screen from the route's name.
const Screen = { render: () => null }

export const router = createRouter({
    // No window under the unit tests.
    history: typeof window === 'undefined' ? createMemoryHistory() : createWebHistory(),
    routes: [
        {
            path: '/',
            name: 'home',
            component: Screen,
            // Invite links from before /r/CODE.
            beforeEnter: (to) => {
                const code = normalizeRoomCode(String(to.query.join ?? ''))
                if (!isRoomCode(code)) return true
                const { join: _, ...query } = to.query
                return { path: `/r/${code}`, query, hash: to.hash }
            },
        },
        { path: '/public', name: 'public', component: Screen },
        { path: '/daily', name: 'daily', component: Screen },
        { path: '/bot', name: 'bot', component: Screen },
        { path: '/friends', name: 'friends', component: Screen },
        // Matching ignores case, so a hand-typed /r/xk7p2m lands too.
        { path: `/r/:code([${ROOM_CODE_ALPHABET}]{${ROOM_CODE_MIN},${ROOM_CODE_MAX}})`, name: 'room', component: Screen },
        // /leaderboard/alltime, so a deep link can name the board it means.
        { path: '/leaderboard/:tab(daily|weekly|alltime)?', name: 'leaderboard', component: Screen },
        // /badges/god-of-no-mercy opens on that badge; the page checks the slug is a real one.
        { path: '/badges/:badge([a-z-]+)?', name: 'badges', component: Screen },
        { path: '/changelog', name: 'changelog', component: Screen },
        { path: '/p/:code([A-Za-z0-9]{4,32})', name: 'profile', component: Screen },
        { path: '/p/:code([A-Za-z0-9]{4,32})/games', name: 'profileGames', component: Screen },
        // Keeps the query and hash, where invite codes and auth redirects ride.
        { path: '/:rest(.*)*', redirect: '/' },
    ],
})

export function toRoute(r: Pick<RouteLocationGeneric, 'name' | 'params'>): Route {
    const p = r.params as Record<string, string | undefined>
    if (r.name === 'leaderboard') return p.tab ? { name: 'leaderboard', tab: p.tab as LeaderboardTab } : { name: 'leaderboard' }
    if (r.name === 'badges') return p.badge ? { name: 'badges', badge: p.badge.toLowerCase() } : { name: 'badges' }
    if (r.name === 'changelog') return { name: 'changelog' }
    if (r.name === 'profile') return { name: 'profile', code: p.code! }
    if (r.name === 'profileGames') return { name: 'profileGames', code: p.code! }
    if (r.name === 'public' || r.name === 'daily' || r.name === 'bot' || r.name === 'friends') return { name: r.name }
    if (r.name === 'room') return { name: 'room', code: normalizeRoomCode(p.code!) }
    return { name: 'home' }
}

export function routePath(route: Route): string {
    // 'daily' is the default, so it stays on the bare path.
    if (route.name === 'leaderboard') {
        return route.tab && route.tab !== 'daily' ? `/leaderboard/${route.tab}` : '/leaderboard'
    }
    if (route.name === 'profile') return `/p/${route.code}`
    if (route.name === 'profileGames') return `/p/${route.code}/games`
    if (route.name === 'room') return `/r/${route.code}`
    if (route.name === 'badges' && route.badge) return `/badges/${route.badge}`
    if (route.name === 'home') return '/'
    return `/${route.name}`
}

export const currentRoute = computed(() => toRoute(router.currentRoute.value))

/** Navigate to a route, preserving the query string (invite links ride on it). */
export function navigate(route: Route): Promise<unknown> {
    return router.push({ path: routePath(route), query: router.currentRoute.value.query })
}

// Pages BACK may return to. Never a room or a game: stepping back into /r/CODE
// or /daily would rejoin or restart it.
const BROWSING = new Set(['home', 'leaderboard', 'badges', 'changelog', 'profile', 'profileGames', 'friends'])

/** The in-app page BACK should return to, or null to go home instead. */
export function backTarget(previous: string | null | undefined): string | null {
    if (!previous) return null
    return BROWSING.has(String(router.resolve(previous).name)) ? previous : null
}

/** BACK: the page you came from, or home when this page was opened from a link. */
export function goBack(): Promise<unknown> {
    // vue-router keeps the previous in-app path in history.state.back.
    const previous = (window.history.state as { back?: string | null } | null)?.back
    if (backTarget(previous)) {
        router.back()
        return Promise.resolve()
    }
    return navigate({ name: 'home' })
}
