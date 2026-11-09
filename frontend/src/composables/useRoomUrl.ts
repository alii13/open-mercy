import { onScopeDispose, watch } from 'vue'
import { router, routePath, toRoute, type Route } from '../utils/routes'
import { PUBLIC_TABLE_RULES } from '../utils/publicTable'

interface RoomStore {
    currentGame: { room_code: string; status: string } | null
    isPublicRoom: boolean
    loading: boolean
    leaveGame(): unknown
    restoreActiveGame(urlCode?: string): Promise<boolean>
    joinGame(code: string, via: 'link'): Promise<unknown>
    quickMatch(mode: typeof PUBLIC_TABLE_RULES): Promise<unknown>
}

const isRoomRoute = (r: Route) => r.name === 'public' || r.name === 'room'

// Leaving clears the room at once, but the trip home is a navigation that
// lands a moment later. Leaving a hand swaps the game view for the lobby, which
// mounts in between and would read the stale /public as "take a seat".
let headingHome = false

/** The URL of the room you are in, or null. */
function roomPath(mp: RoomStore): string | null {
    const g = mp.currentGame
    if (!g) return null
    return routePath(mp.isPublicRoom ? { name: 'public' } : { name: 'room', code: g.room_code })
}

/**
 * The URL names the room you are in, so a reload returns there and `/` never
 * rejoins. Joining pushes the room's URL and leaving returns to `/`. Back out of
 * the room leaves it the way LEAVE does, except mid-game, where back is refused.
 */
export function useRoomUrl(mp: RoomStore) {
    watch(() => roomPath(mp), (path) => {
        const here = toRoute(router.currentRoute.value)
        if (path && router.currentRoute.value.path !== path) {
            void (isRoomRoute(here) ? router.replace(path) : router.push(path))
        } else if (!path && isRoomRoute(here)) {
            headingHome = true
            void router.replace('/').finally(() => { headingHome = false })
        }
    })

    const offGuard = router.beforeEach((to, from) =>
        !(to.name === 'home' && from.path === roomPath(mp) && mp.currentGame?.status === 'playing'))

    const offAfter = router.afterEach((to, from, failure) => {
        const path = roomPath(mp)
        if (failure || to.name !== 'home' || !path) return
        if (from.path === path) void mp.leaveGame()
        // A page's home link while seated: you are still in the room, so say so.
        else void router.replace(path)
    })

    onScopeDispose(() => {
        offGuard()
        offAfter()
    })
}

/**
 * Enter the room the URL names: the stored room after a reload, else the room
 * from an invite link, or a seat at the public table. Home when that fails.
 */
export async function enterRoomUrl(r: Route, mp: RoomStore): Promise<void> {
    // `loading` covers a join still in flight: quickMatch backing out of a dealt
    // room remounts the lobby on /public, and a second entry would race it.
    if (headingHome || !isRoomRoute(r) || mp.currentGame || mp.loading) return
    const code = r.name === 'room' ? r.code : undefined
    if (!(await mp.restoreActiveGame(code))) {
        await (code ? mp.joinGame(code, 'link') : mp.quickMatch(PUBLIC_TABLE_RULES))
    }
    if (!mp.currentGame && router.currentRoute.value.path === routePath(r)) void router.replace('/')
}
