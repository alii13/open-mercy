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

/** Which board /leaderboard opens on. Absent means the daily deal. */
export type LeaderboardTab = 'daily' | 'weekly' | 'alltime'

export type Route =
    | { name: 'home' }
    | { name: 'leaderboard'; tab?: LeaderboardTab }
    | { name: 'badges' }
    | { name: 'changelog' }
    | { name: 'profile'; code: string }

// ponytail: every route renders nothing. App.vue draws the screen from the route's name.
const Screen = { render: () => null }

export const router = createRouter({
    // No window under the unit tests.
    history: typeof window === 'undefined' ? createMemoryHistory() : createWebHistory(),
    routes: [
        { path: '/', name: 'home', component: Screen },
        // /leaderboard/alltime, so a deep link can name the board it means.
        { path: '/leaderboard/:tab(daily|weekly|alltime)?', name: 'leaderboard', component: Screen },
        { path: '/badges', name: 'badges', component: Screen },
        { path: '/changelog', name: 'changelog', component: Screen },
        { path: '/p/:code([A-Za-z0-9]{4,32})', name: 'profile', component: Screen },
        // Keeps the query and hash, where invite codes and auth redirects ride.
        { path: '/:rest(.*)*', redirect: '/' },
    ],
})

export function toRoute(r: Pick<RouteLocationGeneric, 'name' | 'params'>): Route {
    const p = r.params as Record<string, string | undefined>
    if (r.name === 'leaderboard') return p.tab ? { name: 'leaderboard', tab: p.tab as LeaderboardTab } : { name: 'leaderboard' }
    if (r.name === 'badges') return { name: 'badges' }
    if (r.name === 'changelog') return { name: 'changelog' }
    if (r.name === 'profile') return { name: 'profile', code: p.code! }
    return { name: 'home' }
}

export function routePath(route: Route): string {
    // 'daily' is the default, so it stays on the bare path.
    if (route.name === 'leaderboard') {
        return route.tab && route.tab !== 'daily' ? `/leaderboard/${route.tab}` : '/leaderboard'
    }
    if (route.name === 'badges') return '/badges'
    if (route.name === 'changelog') return '/changelog'
    if (route.name === 'profile') return `/p/${route.code}`
    return '/'
}

export const currentRoute = computed(() => toRoute(router.currentRoute.value))

/** Navigate to a route, preserving the query string (invite links ride on it). */
export function navigate(route: Route): Promise<unknown> {
    return router.push({ path: routePath(route), query: router.currentRoute.value.query })
}
