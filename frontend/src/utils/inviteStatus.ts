/**
 * Where an invite the host sent stands, as the waiting room shows it.
 *
 * Built from what the database actually records - when it went out and when
 * the receiver answered it - plus who is sitting at the table. There is no
 * "seen": nothing records the toast merely being displayed, and a status that
 * guesses is worse than none.
 */

export interface SentInvite {
    created_at: string
    /** Set when the receiver joins or waves the toast away. */
    seen_at: string | null
}

export type InviteStatus = 'none' | 'waiting' | 'joined' | 'declined' | 'missed'

/** my_invites stops showing a toast after this - see supabase/invites.sql. */
const TOAST_LIFE_MS = 10 * 60_000
/** send_room_invite refuses a second invite to the same player inside this. */
const COOLDOWN_MS = 5 * 60_000

export function inviteStatus(invite: SentInvite | undefined, now: number, seated: boolean): InviteStatus {
    if (seated) return 'joined'
    if (!invite) return 'none'
    if (invite.seen_at) return 'declined'
    if (now - Date.parse(invite.created_at) >= TOAST_LIFE_MS) return 'missed'
    return 'waiting'
}

/** Offered only when the server would accept it, so the button never lies. */
export function canInviteAgain(invite: SentInvite | undefined, now: number): boolean {
    return !invite || now - Date.parse(invite.created_at) >= COOLDOWN_MS
}
