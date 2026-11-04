/**
 * The quick-chat catalog, shared verbatim by client and server. Chat is
 * id-only on the wire: the client sends a phrase id, the server relays only
 * ids it finds here, and every client renders from its own copy. No free
 * text ever crosses the socket, so there is nothing to moderate.
 */

export type QuickChatGroup = 'greet' | 'react' | 'nudge' | 'sorry' | 'emoji'

export interface QuickChatPhrase {
    id: string
    text: string
    group: QuickChatGroup
}

export const QUICK_CHAT: readonly QuickChatPhrase[] = [
    { id: 'hi', text: 'Hi!', group: 'greet' },
    { id: 'gl', text: 'Good luck!', group: 'greet' },
    { id: 'gg', text: 'gg', group: 'greet' },
    // Keep the stable wire id for protocol compatibility; only the rendered copy changes.
    { id: 'mercy', text: 'Riot!', group: 'react' },
    { id: 'nooo', text: 'Nooo!', group: 'react' },
    { id: 'wow', text: 'Wow!', group: 'react' },
    { id: 'close', text: 'Close one!', group: 'react' },
    { id: 'hurry', text: 'Hurry up!', group: 'nudge' },
    { id: 'yourturn', text: 'Your turn!', group: 'nudge' },
    { id: 'sorry', text: 'Sorry!', group: 'sorry' },
    { id: 'mybad', text: 'My bad', group: 'sorry' },
    { id: 'gotme', text: 'You got me', group: 'sorry' },
    { id: 'e-cry', text: '😭', group: 'emoji' },
    { id: 'e-laugh', text: '😂', group: 'emoji' },
    { id: 'e-fire', text: '🔥', group: 'emoji' },
    { id: 'e-skull', text: '💀', group: 'emoji' },
    { id: 'e-clap', text: '👏', group: 'emoji' },
    { id: 'e-shock', text: '😱', group: 'emoji' },
]

const BY_ID = new Map(QUICK_CHAT.map(p => [p.id, p]))

export function quickChatPhrase(id: string): QuickChatPhrase | null {
    return BY_ID.get(id) ?? null
}
