import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { effectScope, nextTick, reactive, type EffectScope } from 'vue'
import { router } from '../../utils/routes'
import { useRoomUrl, enterRoomUrl } from '../useRoomUrl'

type Game = { room_code: string; status: 'waiting' | 'playing' | 'finished' }

function fakeStore() {
    const mp = reactive({
        currentGame: null as Game | null,
        isPublicRoom: false,
        loading: false,
        leaveGame: vi.fn(() => { mp.currentGame = null }),
        restoreActiveGame: vi.fn(async (_code?: string) => false),
        joinGame: vi.fn(async (code: string): Promise<Game | null> => { mp.currentGame = { room_code: code, status: 'waiting' }; return mp.currentGame }),
        quickMatch: vi.fn(async () => { mp.isPublicRoom = true; mp.currentGame = { room_code: 'PUBRM', status: 'waiting' }; return 'PUBRM' }),
    })
    return mp
}

const settle = async () => {
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
}
const path = () => router.currentRoute.value.fullPath

let scope: EffectScope
let mp: ReturnType<typeof fakeStore>

beforeEach(async () => {
    await router.push('/')
    mp = fakeStore()
    scope = effectScope()
    scope.run(() => useRoomUrl(mp))
})
afterEach(() => scope.stop())

describe('the URL follows the room', () => {
    it('names a private room once you are in it', async () => {
        mp.currentGame = { room_code: 'XK7P2M', status: 'waiting' }
        await settle()
        expect(path()).toBe('/r/XK7P2M')
    })

    it('names the public table without a code', async () => {
        mp.isPublicRoom = true
        mp.currentGame = { room_code: 'PUBRM', status: 'waiting' }
        await settle()
        expect(path()).toBe('/public')
    })

    it('returns home when you leave', async () => {
        mp.currentGame = { room_code: 'XK7P2M', status: 'waiting' }
        await settle()
        mp.currentGame = null
        await settle()
        expect(path()).toBe('/')
    })
})

describe('the back button', () => {
    it('leaves a waiting room the way LEAVE does', async () => {
        mp.currentGame = { room_code: 'XK7P2M', status: 'waiting' }
        await settle()
        router.back()
        await settle()
        expect(mp.leaveGame).toHaveBeenCalledOnce()
        expect(path()).toBe('/')
    })

    it('does nothing mid-game', async () => {
        mp.currentGame = { room_code: 'XK7P2M', status: 'playing' }
        await settle()
        router.back()
        await settle()
        expect(mp.leaveGame).not.toHaveBeenCalled()
        expect(path()).toBe('/r/XK7P2M')
    })

    it('leaves a finished game', async () => {
        mp.currentGame = { room_code: 'XK7P2M', status: 'finished' }
        await settle()
        router.back()
        await settle()
        expect(mp.leaveGame).toHaveBeenCalledOnce()
    })
})

it("a page's home link keeps you seated and puts the room back in the URL", async () => {
    mp.currentGame = { room_code: 'XK7P2M', status: 'waiting' }
    await settle()
    await router.push('/p/Ab12Cd34')
    await router.push('/')
    await settle()
    expect(mp.leaveGame).not.toHaveBeenCalled()
    expect(path()).toBe('/r/XK7P2M')
})

describe('entering the room the URL names', () => {
    it('restores the stored room on a reload, without joining again', async () => {
        mp.restoreActiveGame.mockImplementation(async () => { mp.currentGame = { room_code: 'XK7P2M', status: 'playing' }; return true })
        await enterRoomUrl({ name: 'room', code: 'XK7P2M' }, mp)
        expect(mp.restoreActiveGame).toHaveBeenCalledWith('XK7P2M')
        expect(mp.joinGame).not.toHaveBeenCalled()
    })

    it('joins the named room from an invite link', async () => {
        await enterRoomUrl({ name: 'room', code: 'XK7P2M' }, mp)
        expect(mp.joinGame).toHaveBeenCalledWith('XK7P2M', 'link')
    })

    it('takes a seat at the public table', async () => {
        await enterRoomUrl({ name: 'public' }, mp)
        expect(mp.restoreActiveGame).toHaveBeenCalledWith(undefined)
        expect(mp.quickMatch).toHaveBeenCalledOnce()
    })

    it('stays put when already in a room', async () => {
        mp.currentGame = { room_code: 'XK7P2M', status: 'waiting' }
        await enterRoomUrl({ name: 'room', code: 'XK7P2M' }, mp)
        expect(mp.restoreActiveGame).not.toHaveBeenCalled()
        expect(mp.joinGame).not.toHaveBeenCalled()
    })

    it('stays put while a join is already in flight, so one tap is one quick match', async () => {
        mp.loading = true
        await enterRoomUrl({ name: 'public' }, mp)
        expect(mp.restoreActiveGame).not.toHaveBeenCalled()
        expect(mp.quickMatch).not.toHaveBeenCalled()
    })

    it('goes home when the room cannot be entered', async () => {
        mp.joinGame.mockResolvedValue(null)
        await router.push('/r/XK7P2M')
        await enterRoomUrl({ name: 'room', code: 'XK7P2M' }, mp)
        await settle()
        expect(path()).toBe('/')
    })

    it('ignores every other URL', async () => {
        await enterRoomUrl({ name: 'leaderboard' }, mp)
        expect(mp.restoreActiveGame).not.toHaveBeenCalled()
    })
})
