/**
 * Regression tests for the auth store's guest/init robustness:
 *  - initialize() must release the `loading` gate even if getSession throws,
 *    or the whole app (gated on it) hangs on the splash forever.
 *  - signInAnonymously must reuse an existing session instead of minting a new
 *    anon user (which orphans the prior one's stats), and must ensure the
 *    profile row via an idempotent upsert.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import type { User } from '@supabase/supabase-js'
import type { UserProfile } from '../../lib/supabase'

const h = vi.hoisted(() => {
    const state = {
        getSession: async (): Promise<{ data: { session: unknown } }> => ({ data: { session: null } }),
        signInAnonymouslyCalls: 0,
        anonResult: { data: { user: { id: 'anon-1', is_anonymous: true } }, error: null } as unknown,
        signUpResult: { data: { user: { id: 'reg-1' }, session: null }, error: null } as unknown,
        profileRow: null as unknown,
        profileFetches: 0,
        upsertCalls: [] as { row: unknown; opts: unknown }[],
        rpcCalls: [] as { fn: string; args: unknown }[],
        rpcResult: { data: [] as unknown, error: null as unknown },
        upsertResults: [] as unknown[],
        updateUserCalls: [] as { attrs: unknown; opts: unknown }[],
        updateUserResult: { data: { user: null }, error: null } as unknown,
        resendCalls: [] as unknown[],
        authCallback: null as ((event: string, session: unknown) => void) | null,
        linkIdentityCalls: [] as unknown[],
        oauthCalls: [] as unknown[],
        oauthResult: {
            data: { provider: 'google', url: 'https://uno-supabase-proxy.workers.dev/auth/v1/authorize?provider=google' },
            error: null,
        } as unknown,
        navigations: [] as string[],
        replacedUrls: [] as string[],
        loc: { origin: 'https://uno-no-mercy.com', pathname: '/', search: '', hash: '' },
        reset() {
            state.getSession = async () => ({ data: { session: null } })
            state.signInAnonymouslyCalls = 0
            state.profileRow = null
            state.profileFetches = 0
            state.upsertCalls = []
            state.rpcCalls = []
            state.rpcResult = { data: [], error: null }
            state.upsertResults = []
            state.updateUserCalls = []
            state.updateUserResult = { data: { user: null }, error: null }
            state.resendCalls = []
            state.authCallback = null
            state.linkIdentityCalls = []
            state.oauthCalls = []
            state.oauthResult = {
                data: { provider: 'google', url: 'https://uno-supabase-proxy.workers.dev/auth/v1/authorize?provider=google' },
                error: null,
            }
            state.navigations = []
            state.replacedUrls = []
            state.loc.pathname = '/'
            state.loc.search = ''
            state.loc.hash = ''
        },
    }
    return { state }
})

vi.mock('../../lib/supabase', () => ({
    supabase: {
        auth: {
            getSession: () => h.state.getSession(),
            onAuthStateChange: (cb: (event: string, session: unknown) => void) => {
                h.state.authCallback = cb
                return { data: { subscription: { unsubscribe() {} } } }
            },
            signInAnonymously: async () => { h.state.signInAnonymouslyCalls++; return h.state.anonResult },
            signUp: async () => h.state.signUpResult,
            updateUser: async (attrs: unknown, opts: unknown) => {
                h.state.updateUserCalls.push({ attrs, opts })
                return h.state.updateUserResult
            },
            resend: async (opts: unknown) => { h.state.resendCalls.push(opts); return { error: null } },
            linkIdentity: async (creds: unknown) => { h.state.linkIdentityCalls.push(creds); return h.state.oauthResult },
            signInWithOAuth: async (creds: unknown) => { h.state.oauthCalls.push(creds); return h.state.oauthResult },
        },
        rpc: async (fn: string, args: unknown) => {
            h.state.rpcCalls.push({ fn, args })
            return h.state.rpcResult
        },
        from: () => {
            const b: Record<string, unknown> = {}
            b.select = () => b
            b.eq = () => b
            b.maybeSingle = async () => { h.state.profileFetches++; return { data: h.state.profileRow, error: null } }
            b.upsert = async (row: unknown, opts: unknown) => {
                h.state.upsertCalls.push({ row, opts })
                return (h.state.upsertResults.shift() ?? { error: null }) as { error: unknown }
            }
            return b
        },
    },
}))

const { track, setAnalyticsUser } = vi.hoisted(() => ({ track: vi.fn(), setAnalyticsUser: vi.fn() }))
vi.mock('../../utils/analytics', () => ({ track, setAnalyticsUser }))

vi.stubGlobal('window', {
    location: Object.assign(h.state.loc, {
        assign: (url: string) => { h.state.navigations.push(url) },
    }),
    history: {
        replaceState: (_s: unknown, _t: unknown, url: string) => { h.state.replacedUrls.push(url) },
    },
})

// The node test environment has no sessionStorage, and the Google claim marker
// depends on it surviving a navigation.
const session = new Map<string, string>()
vi.stubGlobal('sessionStorage', {
    getItem: (k: string) => session.get(k) ?? null,
    setItem: (k: string, v: string) => { session.set(k, v) },
    removeItem: (k: string) => { session.delete(k) },
})

import { useAuthStore } from '../authStore'

beforeEach(() => {
    setActivePinia(createPinia())
    h.state.reset()
    session.clear()
    track.mockClear()
})

describe('authStore init + guest robustness', () => {
    it('releases the loading gate even when getSession rejects', async () => {
        h.state.getSession = async () => { throw new Error('network down / expired token') }
        const auth = useAuthStore()

        await auth.initialize()

        // App.vue is gated on this — it must never stay true after init.
        expect(auth.loading).toBe(false)
    })

    // Without this GA4 falls back to its own cookie, which Safari caps at seven
    // days — every returning Safari player reads as a new one and D7/D30 cohort
    // retention is pinned near zero regardless of how the game actually does.
    it('gives GA4 the user id on an existing session, and clears it on sign-out', async () => {
        h.state.getSession = async () => ({ data: { session: { user: { id: 'u-123' }, access_token: 't' } } })
        const auth = useAuthStore()

        await auth.initialize()

        expect(setAnalyticsUser).toHaveBeenCalledWith('u-123')

        // Guests count too: anonymous sign-in mints an id and claiming keeps it.
        h.state.authCallback?.('SIGNED_OUT', null)
        expect(setAnalyticsUser).toHaveBeenLastCalledWith(null)
    })

    it('reuses an existing session instead of minting a new anonymous user', async () => {
        const auth = useAuthStore()
        // Simulate an already-signed-in (reused) session.
        auth.user = { id: 'existing' } as User
        auth.profile = { id: 'existing', username: 'KeepMe', created_at: '' } as UserProfile

        const res = await auth.signInAnonymously()

        expect(res.success).toBe(true)
        expect(h.state.signInAnonymouslyCalls).toBe(0) // no new anon user minted
        expect(auth.user?.id).toBe('existing')
    })

    it('ensures the guest profile via an idempotent upsert on a fresh sign-in', async () => {
        const auth = useAuthStore()

        const res = await auth.signInAnonymously('Bob')

        expect(res.success).toBe(true)
        expect(h.state.signInAnonymouslyCalls).toBe(1)
        expect(h.state.upsertCalls).toHaveLength(1)
        expect(h.state.upsertCalls[0]!.row).toMatchObject({ id: 'anon-1', username: 'Bob' })
        expect(h.state.upsertCalls[0]!.opts).toMatchObject({ onConflict: 'id', ignoreDuplicates: true })
    })
})

describe('claiming a guest account (in-place anonymous conversion)', () => {
    function seedGuest(auth: ReturnType<typeof useAuthStore>) {
        auth.user = { id: 'anon-1', is_anonymous: true } as unknown as User
        auth.profile = { id: 'anon-1', username: 'RecklessShark28', created_at: '' } as UserProfile
    }

    it('converts in place via updateUser, preserving the user id', async () => {
        const auth = useAuthStore()
        seedGuest(auth)
        h.state.updateUserResult = {
            data: { user: { id: 'anon-1', is_anonymous: true, new_email: 'a@b.com' } },
            error: null,
        }

        const res = await auth.claimAccount('a@b.com', 'secret123')

        expect(res).toMatchObject({ success: true, needsConfirmation: true })
        expect(h.state.updateUserCalls).toHaveLength(1)
        expect(h.state.updateUserCalls[0]!.attrs).toMatchObject({ email: 'a@b.com', password: 'secret123' })
        expect(h.state.updateUserCalls[0]!.opts).toMatchObject({ emailRedirectTo: 'https://uno-no-mercy.com' })
        expect(auth.user?.id).toBe('anon-1') // same identity — stats stay attached
        expect(auth.claimPending).toBe(true)
        expect(track).toHaveBeenCalledWith('guest_claim_email_sent', expect.anything())
    })

    it('refuses for non-guest sessions without calling the API', async () => {
        const auth = useAuthStore()
        auth.user = { id: 'reg-1', is_anonymous: false } as unknown as User

        const res = await auth.claimAccount('a@b.com', 'secret123')

        expect(res.success).toBe(false)
        expect(h.state.updateUserCalls).toHaveLength(0)
    })

    it('maps the email-already-registered collision to a distinct code', async () => {
        const auth = useAuthStore()
        seedGuest(auth)
        h.state.updateUserResult = {
            data: { user: null },
            error: { message: 'A user with this email address has already been registered', code: 'email_exists' },
        }

        const res = await auth.claimAccount('taken@b.com', 'secret123')

        expect(res.success).toBe(false)
        expect(res.code).toBe('email_exists')
        expect(auth.claimPending).toBe(false)
        expect(track).toHaveBeenCalledWith('guest_claim_email_exists', expect.anything())
    })

    it('claimPending derives from the pending email, and clears on conversion', async () => {
        const auth = useAuthStore()
        expect(auth.claimPending).toBe(false)
        auth.user = { id: 'anon-1', is_anonymous: true, new_email: 'a@b.com' } as unknown as User
        expect(auth.claimPending).toBe(true)
        auth.user = { id: 'anon-1', is_anonymous: false, email: 'a@b.com' } as unknown as User
        expect(auth.claimPending).toBe(false)
    })

    it('resends the pending confirmation email', async () => {
        const auth = useAuthStore()
        auth.user = { id: 'anon-1', is_anonymous: true, new_email: 'a@b.com' } as unknown as User

        const res = await auth.resendClaimEmail()

        expect(res.success).toBe(true)
        expect(h.state.resendCalls[0]).toMatchObject({ type: 'email_change', email: 'a@b.com' })
    })

    it('USER_UPDATED refreshes the profile through the auth listener', async () => {
        const auth = useAuthStore()
        // A present row keeps the missing-profile self-heal out of this test:
        // the assertion is about the listener firing exactly one fetch.
        h.state.profileRow = { id: 'anon-1', username: 'RecklessShark28', created_at: '' }
        await auth.initialize()
        const fetchesBefore = h.state.profileFetches

        h.state.authCallback!('USER_UPDATED', {
            user: { id: 'anon-1', is_anonymous: true, new_email: 'a@b.com' },
            access_token: 't',
        })
        await new Promise(r => setTimeout(r, 1))

        expect(h.state.profileFetches).toBe(fetchesBefore + 1)
        expect(auth.claimPending).toBe(true)
    })

    it('tracks completion when the confirmed session lands', async () => {
        const auth = useAuthStore()
        await auth.initialize()
        seedGuest(auth)
        h.state.updateUserResult = {
            data: { user: { id: 'anon-1', is_anonymous: true, new_email: 'a@b.com' } },
            error: null,
        }
        await auth.claimAccount('a@b.com', 'secret123')

        h.state.authCallback!('SIGNED_IN', {
            user: { id: 'anon-1', is_anonymous: false, email: 'a@b.com' },
            access_token: 't2',
        })

        expect(track).toHaveBeenCalledWith('guest_claim_completed', expect.anything())
        expect(auth.isAnonymous).toBe(false)
        expect(auth.user?.id).toBe('anon-1')
    })
})

describe('claiming a guest account with Google', () => {
    function seedGuest(auth: ReturnType<typeof useAuthStore>) {
        auth.user = { id: 'anon-1', is_anonymous: true } as unknown as User
        auth.profile = { id: 'anon-1', username: 'RecklessShark28', created_at: '' } as UserProfile
    }

    it('links the identity in place rather than starting a new session', async () => {
        const auth = useAuthStore()
        seedGuest(auth)

        const res = await auth.linkGoogleIdentity()

        expect(res.success).toBe(true)
        expect(h.state.linkIdentityCalls).toHaveLength(1)
        expect(h.state.linkIdentityCalls[0]).toMatchObject({
            provider: 'google',
            options: { redirectTo: 'https://uno-no-mercy.com' },
        })
        // The guarantee the whole feature rests on: the identity is added to the
        // existing user, so nothing is signed out and no new user is minted.
        expect(h.state.oauthCalls).toHaveLength(0)
        expect(h.state.signInAnonymouslyCalls).toBe(0)
        expect(auth.user?.id).toBe('anon-1')
        expect(auth.profile?.username).toBe('RecklessShark28')
        expect(track).toHaveBeenCalledWith('guest_claim_google_started', expect.anything())
    })

    /**
     * Regression guard for a real break. Passing skipBrowserRedirect makes us
     * responsible for the navigation, but linkIdentity resolves the provider URL
     * server-side, so the url it returns is Google's — and the origin rewrite we
     * used to apply turned it into <project>.supabase.co/o/oauth2/v2/auth, which
     * Supabase answers with "requested path is invalid".
     */
    it('leaves the navigation to the SDK and never rewrites the provider URL', async () => {
        const auth = useAuthStore()
        seedGuest(auth)

        await auth.linkGoogleIdentity()

        const opts = (h.state.linkIdentityCalls[0] as { options: Record<string, unknown> }).options
        expect(opts.skipBrowserRedirect).toBeUndefined()
        expect(h.state.navigations).toHaveLength(0)
    })

    it('refuses for a non-guest session without calling the API', async () => {
        const auth = useAuthStore()
        auth.user = { id: 'reg-1', is_anonymous: false } as unknown as User

        const res = await auth.linkGoogleIdentity()

        expect(res.success).toBe(false)
        expect(h.state.linkIdentityCalls).toHaveLength(0)
        expect(h.state.navigations).toHaveLength(0)
    })

    it('surfaces a link failure to the caller', async () => {
        const auth = useAuthStore()
        seedGuest(auth)
        h.state.oauthResult = {
            data: { provider: 'google', url: null },
            error: { message: 'Manual linking is disabled', code: 'manual_linking_disabled' },
        }

        const res = await auth.linkGoogleIdentity()

        expect(res.success).toBe(false)
        expect(res.error).toBe('Manual linking is disabled')
    })

    it('uses a plain OAuth sign-in when there is no guest to preserve', async () => {
        const auth = useAuthStore()

        const res = await auth.signInWithGoogle()

        expect(res.success).toBe(true)
        expect(h.state.oauthCalls).toHaveLength(1)
        expect(h.state.linkIdentityCalls).toHaveLength(0)
        expect((h.state.oauthCalls[0] as { options: Record<string, unknown> }).options.skipBrowserRedirect)
            .toBeUndefined()
    })
})

describe('attributing a completed claim to how it happened', () => {
    it('reports an email claim as email', async () => {
        const auth = useAuthStore()
        await auth.initialize()
        auth.user = { id: 'anon-1', is_anonymous: true } as unknown as User
        h.state.updateUserResult = {
            data: { user: { id: 'anon-1', is_anonymous: true, new_email: 'a@b.com' } },
            error: null,
        }
        await auth.claimAccount('a@b.com', 'secret123')

        h.state.authCallback!('SIGNED_IN', {
            user: { id: 'anon-1', is_anonymous: false, email: 'a@b.com' },
            access_token: 't',
        })

        expect(track).toHaveBeenCalledWith('guest_claim_completed', { method: 'email' })
    })

    /**
     * The regression this whole change exists for. linkIdentity leaves the page,
     * so the completion is observed by a *fresh* store on the return trip. An
     * in-memory flag cannot survive that, and the previous latch was only ever
     * set by the email path, so Google conversions recorded a start and no finish.
     */
    it('reports a Google claim as google, across the page navigation', async () => {
        const first = useAuthStore()
        first.user = { id: 'anon-1', is_anonymous: true } as unknown as User
        await first.linkGoogleIdentity()

        // The redirect: everything in memory is gone, only sessionStorage remains.
        setActivePinia(createPinia())
        track.mockClear()
        const returned = useAuthStore()
        h.state.getSession = async () => ({
            data: { session: { user: { id: 'anon-1', is_anonymous: false }, access_token: 't' } },
        })

        await returned.initialize()
        h.state.authCallback!('SIGNED_IN', {
            user: { id: 'anon-1', is_anonymous: false },
            access_token: 't',
        })

        expect(track).toHaveBeenCalledWith('guest_claim_completed', { method: 'google' })
    })

    it('does not report a completion while the guest is still anonymous', async () => {
        const auth = useAuthStore()
        auth.user = { id: 'anon-1', is_anonymous: true } as unknown as User
        await auth.linkGoogleIdentity()
        track.mockClear()

        h.state.authCallback = null
        await auth.initialize()
        h.state.authCallback!('SIGNED_IN', {
            user: { id: 'anon-1', is_anonymous: true },
            access_token: 't',
        })

        expect(track).not.toHaveBeenCalledWith('guest_claim_completed', expect.anything())
    })

    /**
     * A collision leaves the marker behind. Without clearing it, the next
     * successful Google sign-in in the same tab would be counted as a guest
     * conversion that never happened.
     */
    it('drops the marker when the link came back failed, so nothing is misattributed', async () => {
        const first = useAuthStore()
        first.user = { id: 'anon-1', is_anonymous: true } as unknown as User
        await first.linkGoogleIdentity()

        setActivePinia(createPinia())
        track.mockClear()
        h.state.loc.search = '?error_code=identity_already_exists'
        const returned = useAuthStore()
        await returned.initialize()

        // Later in the same tab: a real sign-in, not a claim.
        h.state.authCallback!('SIGNED_IN', {
            user: { id: 'someone-else', is_anonymous: false },
            access_token: 't',
        })

        expect(track).not.toHaveBeenCalledWith('guest_claim_completed', expect.anything())
    })
})

describe('the OAuth return trip', () => {
    it('surfaces the collision that linkIdentity could not report at the call site', async () => {
        h.state.loc.search = '?error=server_error&error_code=identity_already_exists&error_description=Identity+is+already+linked'
        const auth = useAuthStore()

        await auth.initialize()

        expect(auth.oauthError?.code).toBe('identity_already_exists')
        expect(track).toHaveBeenCalledWith('guest_claim_google_taken', expect.anything())
    })

    it('clears the error from the URL so a refresh does not resurrect it', async () => {
        h.state.loc.search = '?error_code=identity_already_exists'
        const auth = useAuthStore()

        await auth.initialize()

        expect(h.state.replacedUrls).toEqual(['/'])
    })

    it('leaves a clean return trip alone', async () => {
        const auth = useAuthStore()

        await auth.initialize()

        expect(auth.oauthError).toBeNull()
        expect(h.state.replacedUrls).toHaveLength(0)
    })
})

describe('signUp with email confirmation pending', () => {
    it('does not authenticate a user who has no session yet', async () => {
        const auth = useAuthStore()
        h.state.signUpResult = { data: { user: { id: 'reg-1' }, session: null }, error: null }

        const res = await auth.signUp('a@b.com', 'password1', 'NewPlayer')

        expect(res.success).toBe(true)
        expect(res.needsConfirmation).toBe(true)
        // The whole app gates on this — a session-less signup must not flip it,
        // or games silently stop recording and a refresh logs the user out.
        expect(auth.isAuthenticated).toBe(false)
        expect(auth.user).toBeNull()
    })

    it('authenticates immediately when signUp returns a session', async () => {
        const auth = useAuthStore()
        h.state.signUpResult = { data: { user: { id: 'reg-2' }, session: { access_token: 't' } }, error: null }

        const res = await auth.signUp('a@b.com', 'password1', 'NewPlayer')

        expect(res.success).toBe(true)
        expect(res.needsConfirmation).toBe(false)
        expect(auth.isAuthenticated).toBe(true)
        expect(auth.user?.id).toBe('reg-2')
    })
})

describe('username collision resilience', () => {
    const collision = { error: { code: '23505', message: 'duplicate key value violates unique constraint "profiles_username_key"' } }

    it('retries the guest profile upsert with a fresh handle on a 23505 collision', async () => {
        h.state.upsertResults = [collision, { error: null }]
        const auth = useAuthStore()

        const res = await auth.signInAnonymously()

        expect(res.success).toBe(true)
        expect(h.state.upsertCalls).toHaveLength(2)
        const first = (h.state.upsertCalls[0]!.row as { username: string }).username
        const second = (h.state.upsertCalls[1]!.row as { username: string }).username
        expect(second).not.toBe(first)
        expect(second).toMatch(/\d{4}$/)
    })

    it('does not retry on a non-collision error', async () => {
        h.state.upsertResults = [{ error: { code: '42501', message: 'permission denied' } }]
        const auth = useAuthStore()

        const res = await auth.signInAnonymously()

        expect(res.success).toBe(true) // a profile failure never blocks play
        expect(h.state.upsertCalls).toHaveLength(1)
    })

    it('self-heals a missing profile row for a returning guest', async () => {
        h.state.getSession = async () => ({
            data: { session: { user: { id: 'anon-9', is_anonymous: true, user_metadata: { username: 'GrimViper12' } }, access_token: 't' } },
        })
        h.state.profileRow = null
        const auth = useAuthStore()

        await auth.initialize()

        expect(h.state.upsertCalls).toHaveLength(1)
        expect(h.state.upsertCalls[0]!.row).toMatchObject({ id: 'anon-9', username: 'GrimViper12' })
    })

    it('leaves an unconfirmed email signup for the confirmation trigger', async () => {
        h.state.getSession = async () => ({
            data: { session: { user: { id: 'reg-9', is_anonymous: false }, access_token: 't' } },
        })
        h.state.profileRow = null
        const auth = useAuthStore()

        await auth.initialize()

        expect(h.state.upsertCalls).toHaveLength(0)
    })

    it('reports a taken name as taken on rename', async () => {
        const auth = useAuthStore()
        await auth.signInAnonymously('Bob')
        h.state.getSession = async () => ({ data: { session: { user: { id: 'anon-1' }, access_token: 't' } } })
        h.state.upsertResults = [collision]

        const res = await auth.updateUsername('Ali')

        expect(res.success).toBe(false)
        expect(res.error).toBe('That name is already taken')
    })

    // The store can still hold a player after the SDK has lost the session.
    // The write then goes out as anon and Postgres answers 42501, which the
    // player used to see verbatim and retried for minutes.
    it('asks a signed-out player to reload instead of renaming as anon', async () => {
        const auth = useAuthStore()
        await auth.signInAnonymously('Bob')
        const upsertsBefore = h.state.upsertCalls.length
        h.state.getSession = async () => ({ data: { session: null } })

        const res = await auth.updateUsername('Ali')

        expect(res.success).toBe(false)
        expect(res.error).toBe('You were signed out. Reload the page and try again.')
        expect(h.state.upsertCalls).toHaveLength(upsertsBefore)
    })

    describe('suggestUsernames', () => {
        it('asks for three names built on the rejected one', async () => {
            h.state.rpcResult = { data: ['Rahul4821', 'Rahul7390', 'Rahul1122'], error: null }
            const auth = useAuthStore()

            const out = await auth.suggestUsernames('Rahul')

            expect(out).toEqual(['Rahul4821', 'Rahul7390', 'Rahul1122'])
            expect(h.state.rpcCalls).toEqual([
                { fn: 'username_suggestions', args: { p_base: 'Rahul', p_count: 3 } },
            ])
        })

        it('returns nothing when the SQL has not been run, so the surface just stays hidden', async () => {
            h.state.rpcResult = { data: null, error: { code: '42883', message: 'no function' } }
            const auth = useAuthStore()
            expect(await auth.suggestUsernames('Rahul')).toEqual([])
        })

        it('drops anything in the payload that is not a usable name', async () => {
            h.state.rpcResult = { data: ['Rahul4821', '', null, 7, 'Rahul9'], error: null }
            const auth = useAuthStore()
            expect(await auth.suggestUsernames('Rahul')).toEqual(['Rahul4821', 'Rahul9'])
        })

        it('returns nothing rather than throwing when the call itself fails', async () => {
            h.state.rpcResult = { data: undefined, error: null }
            const auth = useAuthStore()
            expect(await auth.suggestUsernames('Rahul')).toEqual([])
        })
    })
})
