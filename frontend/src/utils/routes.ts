/**
 * Minimal URL routing for the two shareable screens (leaderboard, profiles).
 * The app is a screen state machine in App.vue, not a router SPA — this shim
 * only translates between location.pathname and a reactive route so shared
 * links land on the right screen and browser back works.
 */

import { ref, readonly } from 'vue'
import { isRoomCode, normalizeRoomCode } from '@roomCode'

/** Which board /leaderboard opens on. Absent means the daily deal. */
export type LeaderboardTab = 'daily' | 'weekly' | 'alltime'

const LEADERBOARD_TABS: LeaderboardTab[] = ['daily', 'weekly', 'alltime']

export type Route =
    | { name: 'home' }
    | { name: 'couch' }
    | { name: 'couch-join'; roomCode: string }
    | { name: 'leaderboard'; tab?: LeaderboardTab }
    | { name: 'badges' }
    | { name: 'changelog' }
    | { name: 'profile'; code: string }

const SHARE_CODE = /^[A-Za-z0-9]{4,32}$/

export function parseRoute(pathname: string): Route {
    if (pathname === '/couch') return { name: 'couch' }
    if (pathname.startsWith('/join/')) {
        const roomCode = normalizeRoomCode(pathname.slice('/join/'.length))
        if (isRoomCode(roomCode)) return { name: 'couch-join', roomCode }
    }
    if (pathname === '/leaderboard') return { name: 'leaderboard' }
    // /leaderboard/alltime — so a deep link can name the board it means, and
    // so a board is shareable rather than always opening on today's deal.
    if (pathname.startsWith('/leaderboard/')) {
        const tab = pathname.slice('/leaderboard/'.length) as LeaderboardTab
        if (LEADERBOARD_TABS.includes(tab)) return { name: 'leaderboard', tab }
    }
    if (pathname === '/badges') return { name: 'badges' }
    if (pathname === '/changelog') return { name: 'changelog' }
    if (pathname.startsWith('/p/')) {
        const code = pathname.slice(3)
        if (SHARE_CODE.test(code)) return { name: 'profile', code }
    }
    return { name: 'home' }
}

export function routePath(route: Route): string {
    if (route.name === 'couch') return '/couch'
    if (route.name === 'couch-join') return `/join/${route.roomCode}`
    // 'daily' is the default, so it stays on the bare path.
    if (route.name === 'leaderboard') {
        return route.tab && route.tab !== 'daily' ? `/leaderboard/${route.tab}` : '/leaderboard'
    }
    if (route.name === 'badges') return '/badges'
    if (route.name === 'changelog') return '/changelog'
    if (route.name === 'profile') return `/p/${route.code}`
    return '/'
}

const current = ref<Route>(
    typeof window === 'undefined' ? { name: 'home' } : parseRoute(window.location.pathname),
)

if (typeof window !== 'undefined') {
    window.addEventListener('popstate', () => {
        current.value = parseRoute(window.location.pathname)
    })
}

export const currentRoute = readonly(current)

/** Navigate to a route, preserving the query string (invite links ride on it). */
export function navigate(route: Route): void {
    current.value = route
    const path = routePath(route) + window.location.search
    if (window.location.pathname !== routePath(route)) {
        window.history.pushState({}, '', path)
    }
}
