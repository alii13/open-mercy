import { watch } from 'vue'
import { currentRoute, router, routePath, toRoute } from '../utils/routes'

interface LocalGame {
    gameState: 'LOBBY' | 'PLAYING' | 'GAME_OVER'
    dailyDate: string | null
    resumeDaily(): boolean
}

const isGameRoute = (name: string) => name === 'daily' || name === 'bot'

/** The URL of the local game on screen, or null in the lobby. */
export function localGamePath(game: LocalGame): string | null {
    if (game.gameState === 'LOBBY') return null
    return routePath({ name: game.dailyDate ? 'daily' : 'bot' })
}

/**
 * The URL names the local game on screen, through to its game over, and `/`
 * never reopens one. A reload, or forward, onto /daily reopens today's run (home
 * when there is none), and onto /bot deals a new game against the next bot.
 */
export function useLocalGameUrl(game: LocalGame, startBot: () => void) {
    watch(() => localGamePath(game), (path) => {
        const here = toRoute(router.currentRoute.value).name
        if (path && router.currentRoute.value.path !== path) {
            void (isGameRoute(here) ? router.replace(path) : router.push(path))
        } else if (!path && isGameRoute(here)) {
            void router.replace('/')
        }
    })

    watch(currentRoute, (r) => {
        if (game.gameState !== 'LOBBY') return
        if (r.name === 'daily' && !game.resumeDaily()) void router.replace('/')
        if (r.name === 'bot') startBot()
    }, { immediate: true })
}
