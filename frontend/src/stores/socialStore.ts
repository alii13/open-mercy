/**
 * Friends: the list, the two pending directions, and the people you blocked.
 *
 * A store rather than a composable because three unrelated screens read the
 * same state - the dashboard, a profile page, and the game-over modal, where
 * "add the person who just beat you" is the highest-intent moment in the app.
 *
 * Feature-detects like every other definer surface: until friends.sql runs,
 * `unavailable` is true and each screen hides its friends section rather than
 * showing a broken one.
 *
 * Live: a Realtime channel on friendships nudges a re-read, the same way
 * inviteStore treats room_invites - the payload is a trigger, not data. Each
 * read is compared with the last one to raise a `notice` for the toast: a
 * request nobody has seen yet, or a request you sent that is now a friendship.
 * Comparing reads rather than reading payloads also catches the request that
 * landed while the player was away, which is most of them.
 */

import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { useAuthStore } from './authStore'
import { isFatalSchemaError } from '../utils/supabaseErrors'
import { hasLiveSession } from '../utils/liveSession'

export interface FriendRow {
    user_id: string
    username: string
    share_code: string | null
    skin: string | null
    last_seen_at: string | null
    status: 'accepted' | 'pending' | 'blocked'
    /** True when they asked you. False when you asked them. */
    incoming: boolean
    created_at: string
}

/** What send_friend_request answers. Every one is a normal outcome, not an
 *  error: two people can press ADD at the same moment. */
export type SendResult =
    | 'sent' | 'accepted' | 'already' | 'blocked' | 'declined' | 'self'
    | 'rate_limited' | 'not_found' | 'unauthorized' | 'failed'

/** Someone you shared a multiplayer table with lately and are not yet
 *  connected to - the people a friend request is most likely to land with. */
export interface RecentOpponent {
    user_id: string
    username: string
    share_code: string | null
    last_seen_at: string | null
    games: number
    my_wins: number
    their_wins: number
    last_played: string
}

/** A friend asking to play while you were away. No room: it outlives any. */
export interface Ping {
    id: string
    from_user: string
    from_username: string
    created_at: string
}

export type FriendNotice =
    | { kind: 'request' | 'accepted', row: FriendRow }
    | { kind: 'ping', row: FriendRow, ping: Ping }

export const useSocialStore = defineStore('social', () => {
    const rows = ref<FriendRow[]>([])
    const loading = ref(false)
    /** True once the SQL is known to be missing - hides every friends surface. */
    const unavailable = ref(false)
    /** User ids with a request in flight, so a button can disable itself. */
    const pendingIds = ref<Set<string>>(new Set())
    const recentRows = ref<RecentOpponent[]>([])
    /** Separate from `unavailable`: a missing extra must not hide the list. */
    let recentUnavailable = false
    /** The one thing the toast shows. */
    const notice = ref<FriendNotice | null>(null)
    /** Requests already shown once this session, so a dismissed one stays
     *  dismissed. Keyed on the request, not the person: someone unfriended who
     *  asks again has sent a new request. */
    let announced = new Set<string>()
    const requestKey = (r: FriendRow) => `${r.user_id}:${r.created_at}`
    let channel: { unsubscribe: () => void } | null = null

    const pings = ref<Ping[]>([])
    /** Friends you pinged inside the server's six-hour window. */
    const pinged = ref<Set<string>>(new Set())
    /** Separate from `unavailable`, like the recent list. */
    const pingsUnavailable = ref(false)
    let announcedPings = new Set<string>()
    let pingChannel: { unsubscribe: () => void } | null = null
    /** Bumped only on an account change. Pings are not ordered against the
     *  friends read, so readSeq would drop them for no reason. */
    let accountSeq = 0

    const friends = computed(() => rows.value.filter(r => r.status === 'accepted'))
    const incoming = computed(() => rows.value.filter(r => r.status === 'pending' && r.incoming))
    const outgoing = computed(() => rows.value.filter(r => r.status === 'pending' && !r.incoming))
    const blocked = computed(() => rows.value.filter(r => r.status === 'blocked'))

    /** Everyone already connected to you in some way - one lookup for the
     *  buttons that must not offer ADD twice. */
    const knownIds = computed(() => new Set(rows.value.map(r => r.user_id)))

    /** Read on open, but the friends list moves live: someone who asked you
     *  since is a request now, not a suggestion. */
    const recent = computed(() => recentRows.value.filter(r => !knownIds.value.has(r.user_id)))

    /** Bumped by every read and every account change. A read answers only if
     *  it is still the latest - a slow one landing after a newer one would
     *  roll a friendship back to pending, and one landing after a sign-out
     *  would put the last account's requests on the next account's screen. */
    let readSeq = 0

    async function refresh(): Promise<void> {
        if (unavailable.value) return
        const seq = ++readSeq
        loading.value = true
        try {
            if (!(await hasLiveSession())) return
            const { data, error } = await supabase.rpc('my_friends')
            if (seq !== readSeq) return
            if (error) {
                if (isFatalSchemaError(error)) {
                    unavailable.value = true
                    stop()
                }
                return
            }
            const next = (data ?? []) as FriendRow[]
            raiseNotice(rows.value, next)
            rows.value = next
            // A ping that arrived before the list did waits for it.
            raisePing()
        } catch {
            /* transient - keep whatever list is on screen */
        } finally {
            loading.value = false
        }
    }

    function raiseNotice(prev: FriendRow[], next: FriendRow[]): void {
        const wasPendingOut = new Set(prev.filter(r => r.status === 'pending' && !r.incoming).map(r => r.user_id))
        const accepted = next.find(r => r.status === 'accepted' && wasPendingOut.has(r.user_id))
        if (accepted) {
            // A request on screen gives way, but is not spent: it comes back
            // on the next read.
            if (notice.value?.kind === 'request') announced.delete(requestKey(notice.value.row))
            if (notice.value?.kind === 'ping') announcedPings.delete(notice.value.ping.id)
            notice.value = { kind: 'accepted', row: accepted }
            return
        }
        const fresh = next
            .filter(r => r.status === 'pending' && r.incoming && !announced.has(requestKey(r)))
            .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
        if (!fresh) return
        // A ping on screen gives way to a request, and comes back after it.
        if (notice.value?.kind === 'ping') announcedPings.delete(notice.value.ping.id)
        announced.add(requestKey(fresh))
        notice.value = { kind: 'request', row: fresh }
    }

    /** Only into an empty slot: a request needs an answer, a ping can wait
     *  for the next read. Only from someone who is still a friend. */
    function raisePing(): void {
        if (notice.value) return
        for (const p of pings.value) {
            if (announcedPings.has(p.id)) continue
            const friend = rows.value.find(r => r.user_id === p.from_user && r.status === 'accepted')
            if (!friend) continue
            announcedPings.add(p.id)
            notice.value = { kind: 'ping', row: friend, ping: p }
            return
        }
    }

    async function fetchPings(): Promise<void> {
        if (unavailable.value || pingsUnavailable.value) return
        const seq = accountSeq
        try {
            if (!(await hasLiveSession())) return
            const [got, sent] = await Promise.all([
                supabase.rpc('my_pings'),
                supabase.rpc('my_sent_pings'),
            ])
            if (seq !== accountSeq) return
            const error = got.error ?? sent.error
            if (error) {
                if (isFatalSchemaError(error)) {
                    pingsUnavailable.value = true
                    stopPings()
                }
                return
            }
            pings.value = (got.data ?? []) as Ping[]
            pinged.value = new Set(((sent.data ?? []) as { to_user: string }[]).map(r => r.to_user))
            raisePing()
        } catch { /* transient - a ping keeps for a day */ }
    }

    async function sendPing(userId: string): Promise<string> {
        if (pingsUnavailable.value) return 'failed'
        const seq = accountSeq
        try {
            if (!(await hasLiveSession())) return 'failed'
            const { data, error } = await supabase.rpc('send_ping', { p_user: userId })
            if (seq !== accountSeq) return 'failed'
            if (error) {
                if (isFatalSchemaError(error)) pingsUnavailable.value = true
                return 'failed'
            }
            // too_soon means one already went out - from another tab, say.
            if (data === 'sent' || data === 'too_soon') pinged.value = new Set(pinged.value).add(userId)
            return typeof data === 'string' ? data : 'failed'
        } catch {
            return 'failed'
        }
    }

    /** Answered or waved away: either way it must not come back tomorrow. */
    async function answerPing(id: string): Promise<void> {
        pings.value = pings.value.filter(p => p.id !== id)
        if (notice.value?.kind === 'ping' && notice.value.ping.id === id) {
            notice.value = null
            raisePing()
        }
        try {
            if (!(await hasLiveSession())) return
            await supabase.rpc('dismiss_ping', { p_id: id })
        } catch { /* already off screen */ }
    }

    function dismissNotice(): void {
        notice.value = null
        raisePing()
    }

    async function call(fn: string, args: Record<string, unknown>): Promise<string> {
        // Same guard as the read. The point is not the log line: on a stale
        // token this refreshes first, so the click succeeds rather than showing
        // a generic failure for something that would have worked a moment later.
        if (!(await hasLiveSession())) return 'failed'
        const { data, error } = await supabase.rpc(fn, args)
        if (error) {
            if (isFatalSchemaError(error)) unavailable.value = true
            return 'failed'
        }
        return typeof data === 'string' ? data : 'failed'
    }

    async function fetchRecent(): Promise<void> {
        if (unavailable.value || recentUnavailable) return
        const seq = readSeq
        try {
            if (!(await hasLiveSession())) return
            const { data, error } = await supabase.rpc('recent_opponents')
            // Asked for by an account that has since signed out.
            if (seq !== readSeq) return
            if (error) {
                if (isFatalSchemaError(error)) recentUnavailable = true
                return
            }
            recentRows.value = (data ?? []) as RecentOpponent[]
        } catch { /* transient - keep the list on screen */ }
    }

    async function sendRequest(userId: string): Promise<SendResult> {
        if (unavailable.value || pendingIds.value.has(userId)) return 'failed'
        pendingIds.value = new Set(pendingIds.value).add(userId)
        try {
            const result = await call('send_friend_request', { p_user: userId }) as SendResult
            // Only a request that went out takes them off the list; a rate
            // limit or a refusal leaves them there for the caller to explain.
            if (result === 'sent' || result === 'accepted' || result === 'already') {
                recentRows.value = recentRows.value.filter(r => r.user_id !== userId)
            }
            // The server decides the outcome - a simultaneous ADD from the
            // other side comes back as 'accepted', not 'sent' - so re-read
            // rather than guessing the new row.
            if (result === 'sent' || result === 'accepted') await refresh()
            return result
        } finally {
            const next = new Set(pendingIds.value)
            next.delete(userId)
            pendingIds.value = next
        }
    }

    async function respond(userId: string, accept: boolean): Promise<void> {
        // Drop the row first: an answered request must leave the screen at
        // once, and the refresh below settles the truth.
        rows.value = rows.value.filter(r => !(r.user_id === userId && r.status === 'pending'))
        await call('respond_friend_request', { p_user: userId, p_accept: accept })
        await refresh()
    }

    /** Unfriend. Blocking was the only exit, and it says something much
     *  stronger than "we do not play any more". */
    async function remove(userId: string): Promise<void> {
        rows.value = rows.value.filter(r => r.user_id !== userId)
        await call('remove_friend', { p_user: userId })
        await refresh()
    }

    async function block(userId: string): Promise<void> {
        await call('block_player', { p_user: userId })
        await refresh()
    }

    async function unblock(userId: string): Promise<void> {
        await call('unblock_player', { p_user: userId })
        await refresh()
    }

    function stopPings(): void {
        pingChannel?.unsubscribe()
        pingChannel = null
    }

    function stop(): void {
        channel?.unsubscribe()
        channel = null
        stopPings()
    }

    function start(userId: string): void {
        stop()
        if (unavailable.value) return
        const nudge = () => { void refresh() }
        channel = supabase
            .channel(`friendships:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${userId}` }, nudge)
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `requester_id=eq.${userId}` }, nudge)
            // A request re-sent after a decline turns the existing row around
            // rather than inserting one.
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'friendships', filter: `addressee_id=eq.${userId}` }, nudge)
            // A row written while the socket was down is never replayed.
            .subscribe((status: string) => { if (status === 'SUBSCRIBED') nudge() })

        // Its own channel: until friends-ping.sql runs the table does not
        // exist, and that must not take the friend requests down with it.
        if (pingsUnavailable.value) return
        const pingNudge = () => { void fetchPings() }
        pingChannel = supabase
            .channel(`pings:${userId}`)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'pings', filter: `to_user=eq.${userId}` }, pingNudge)
            .subscribe((status: string) => { if (status === 'SUBSCRIBED') pingNudge() })
    }

    function reset(): void {
        readSeq++
        rows.value = []
        recentRows.value = []
        pendingIds.value = new Set()
        notice.value = null
        announced = new Set()
        accountSeq++
        pings.value = []
        pinged.value = new Set()
        announcedPings = new Set()
    }

    // A Pinia store outlives a sign-out, because nothing reloads the page.
    // Without this, signing in as someone else on the same device shows the
    // previous account's friends, requests and block list until a read
    // returns - another person's social graph on a stranger's screen.
    watch(() => useAuthStore().user?.id, (id) => {
        reset()
        if (id) start(id)
        else stop()
    }, { immediate: true })

    return {
        rows, loading, unavailable, pendingIds, notice, recent, pinged, pingsUnavailable,
        friends, incoming, outgoing, blocked, knownIds,
        refresh, fetchRecent, sendRequest, respond, remove, block, unblock, reset, dismissNotice,
        fetchPings, sendPing, answerPing,
    }
})
