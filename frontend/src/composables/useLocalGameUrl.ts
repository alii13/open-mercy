import { watch } from 'vue'
import { currentRoute, router, routePath, toRoute } from '../utils/routes'

interface LocalGame {
    gameState: 'LOBBY' | 'PLAYING' | 'GAME_OVER'
    dailyDate: string | null
    resumeDaily(): boolean
}

const isGameRoute = (name: string) => name === 'daily' || name === 'bot'
// A room's entry is taken over too: PLAY VS BOT INSTEAD leaves the room and starts
// the game in one tick, and pushing would keep the room in back-history.
const replacesEntry = (name: string) => isGameRoute(name) || name === 'room' || name === 'public'

/** The URL of the local game on screen, or null in the lobby. */
export function localGamePath(game: LocalGame): string | null {
    if (game.gameState === 'LOBBY') return null
    return routePath({ name: game.dailyDate ? 'daily' : 'bot' })
}

/**
 * The URL names the local game on screen, through to its game over, and `/`
 * never reopens one. A reload, or forward, onto /daily reopens today's run (home
 * when there is none), and onto /bot deals a new game against the next bot. Both
 * wait for `ready` (sign-in settled), so no game clock runs behind the loading screen.
 */
export function useLocalGameUrl(game: LocalGame, startBot: () => void, ready: () => boolean) {
    watch(() => localGamePath(game), (path) => {
        const here = toRoute(router.currentRoute.value).name
        if (path && router.currentRoute.value.path !== path) {
            void (replacesEntry(here) ? router.replace(path) : router.push(path))
        } else if (!path && isGameRoute(here)) {
            void router.replace('/')
        }
    })

    watch(() => (ready() ? currentRoute.value : null), (r) => {
        if (!r || game.gameState !== 'LOBBY') return
        if (r.name === 'daily' && !game.resumeDaily()) void router.replace('/')
        if (r.name === 'bot') startBot()
    }, { immediate: true })
}
