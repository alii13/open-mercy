import { ref } from 'vue'
import { useMultiplayerStore } from '../stores/multiplayerStore'

/**
 * The invite in flight, shared by every caller. Signing a visitor in as a
 * guest redraws the whole screen, so the page that asked may be a new copy by
 * the time the room opens; it must still see that one is on its way.
 */
const busy = ref<string | null>(null)

/**
 * Sitting in a room already? Just ask them in. Otherwise make one first -
 * "create a game, wait, find the strip, invite" was four steps for the thing
 * a friends list exists to do. Shared by the Friends page, the "accepted"
 * toast and a player's profile, which all end in the same PLAY.
 */
export function usePlayWithFriend() {
    const mpStore = useMultiplayerStore()
    const asked = ref<Record<string, string>>({})

    /**
     * True once the invite is out and the room is open behind the caller.
     * `signIn` runs first, inside the busy window, for a visitor who has no
     * account yet.
     */
    async function playWith(userId: string, signIn?: () => Promise<boolean>): Promise<boolean> {
        if (busy.value) return false
        busy.value = userId
        try {
            if (signIn && !(await signIn())) {
                asked.value = { ...asked.value, [userId]: 'TRY AGAIN' }
                return false
            }
            if (!mpStore.roomCode) {
                const code = await mpStore.createGame()
                if (!code) { asked.value = { ...asked.value, [userId]: 'TRY AGAIN' }; return false }
            }
            const result = await mpStore.sendInvite(userId)
            asked.value = {
                ...asked.value,
                [userId]: result === 'sent' ? 'INVITED'
                    : result === 'too_soon' ? 'ALREADY ASKED'
                    : result === 'rate_limited' ? 'TOO MANY'
                    : result === 'blocked' ? 'BLOCKED'
                    : 'TRY AGAIN',
            }
            return result === 'sent'
        } finally {
            busy.value = null
            if (asked.value[userId] === 'TRY AGAIN') {
                setTimeout(() => {
                    const next = { ...asked.value }
                    delete next[userId]
                    asked.value = next
                }, 2500)
            }
        }
    }

    return { busy, asked, playWith }
}
