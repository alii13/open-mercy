import { describe, expect, it, vi } from 'vitest'

vi.mock('../../stores/multiplayerStore', () => ({
    useMultiplayerStore: () => ({
        roomCode: null,
        createGame: vi.fn(async () => 'ROOM01'),
        sendInvite: vi.fn(async () => 'sent'),
    }),
}))

import { usePlayWithFriend } from '../usePlayWithFriend'

describe('usePlayWithFriend', () => {
    it('stays busy across a remount, from the guest sign-in until the invite is out', async () => {
        let signedIn!: (ok: boolean) => void
        const first = usePlayWithFriend()
        const done = first.playWith('them', () => new Promise<boolean>(r => { signedIn = r }))

        // The page redraws while the guest account is made: a new instance
        // must see the invite already in flight and refuse a second room.
        const redrawn = usePlayWithFriend()
        expect(redrawn.busy.value).toBe('them')
        expect(await redrawn.playWith('them')).toBe(false)

        signedIn(true)
        expect(await done).toBe(true)
        expect(redrawn.busy.value).toBeNull()
    })
})
