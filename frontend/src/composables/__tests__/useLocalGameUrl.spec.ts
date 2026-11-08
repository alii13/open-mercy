import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { effectScope, nextTick, reactive, ref, type EffectScope } from 'vue'
import { router } from '../../utils/routes'
import { useLocalGameUrl } from '../useLocalGameUrl'

function fakeGame() {
    const game = reactive({
        gameState: 'LOBBY' as 'LOBBY' | 'PLAYING' | 'GAME_OVER',
        dailyDate: null as string | null,
        resumeDaily: vi.fn(() => false),
    })
    return game
}

const settle = async () => {
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
}
const path = () => router.currentRoute.value.fullPath

let scope: EffectScope | undefined
let game: ReturnType<typeof fakeGame>
let startBot: Mock<() => void>
const authReady = ref(true)

function install() {
    scope = effectScope()
    scope.run(() => useLocalGameUrl(game, startBot, () => authReady.value))
}

beforeEach(async () => {
    await router.push('/')
    game = fakeGame()
    startBot = vi.fn(() => { game.gameState = 'PLAYING' })
    authReady.value = true
})
afterEach(() => scope?.stop())

describe('the URL follows the local game', () => {
    beforeEach(install)

    it('names the daily while it is on screen', async () => {
        game.dailyDate = '2026-11-08'
        game.gameState = 'PLAYING'
        await settle()
        expect(path()).toBe('/daily')
    })

    it('names a game against the bot', async () => {
        game.gameState = 'PLAYING'
        await settle()
        expect(path()).toBe('/bot')
    })

    it('keeps the URL through game over and returns home with the lobby', async () => {
        game.gameState = 'PLAYING'
        await settle()
        game.gameState = 'GAME_OVER'
        await settle()
        expect(path()).toBe('/bot')
        game.gameState = 'LOBBY'
        await settle()
        expect(path()).toBe('/')
    })

    it('swaps /bot for /daily when the game-over nudge starts the daily, so back still goes home', async () => {
        game.gameState = 'PLAYING'
        await settle()
        game.gameState = 'GAME_OVER'
        await settle()
        game.dailyDate = '2026-11-08'
        game.gameState = 'PLAYING'
        await settle()
        expect(path()).toBe('/daily')
        router.back()
        await settle()
        expect(path()).toBe('/')
    })

    it("takes over a room's entry rather than stacking on it, so back never rejoins a room just left", async () => {
        await router.push('/r/XK7P2M')
        game.gameState = 'PLAYING'
        await settle()
        expect(path()).toBe('/bot')
        router.back()
        await settle()
        expect(path()).toBe('/')
    })
})

describe('opening /daily or /bot', () => {
    it('reopens today\'s run on /daily', async () => {
        game.resumeDaily.mockImplementation(() => { game.dailyDate = '2026-11-08'; game.gameState = 'PLAYING'; return true })
        await router.push('/daily')
        install()
        await settle()
        expect(game.resumeDaily).toHaveBeenCalledOnce()
        expect(path()).toBe('/daily')
    })

    it('goes home when there is no run to reopen', async () => {
        await router.push('/daily')
        install()
        await settle()
        expect(path()).toBe('/')
    })

    it('deals a new game against the bot on /bot', async () => {
        await router.push('/bot')
        install()
        await settle()
        expect(startBot).toHaveBeenCalledOnce()
        expect(path()).toBe('/bot')
    })

    it('waits for sign-in to settle, so a resumed daily never runs behind the loading screen', async () => {
        authReady.value = false
        await router.push('/daily')
        install()
        await settle()
        expect(game.resumeDaily).not.toHaveBeenCalled()
        authReady.value = true
        await settle()
        expect(game.resumeDaily).toHaveBeenCalledOnce()
    })

    it('leaves a game already on screen alone, such as a CONTINUE tapped while loading', async () => {
        game.dailyDate = '2026-11-08'
        game.gameState = 'PLAYING'
        await router.push('/daily')
        install()
        await settle()
        expect(game.resumeDaily).not.toHaveBeenCalled()
    })
})
