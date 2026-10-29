import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, type UserProfile } from '../lib/supabase'
import { track, setAnalyticsUser } from '../utils/analytics'
import { readOAuthError, urlWithoutOAuthError, type OAuthRedirectError } from '../utils/oauthRedirect'
import type { OAuthResponse, User } from '@supabase/supabase-js'

export const useAuthStore = defineStore('auth', () => {
    const user = ref<User | null>(null)
    const profile = ref<UserProfile | null>(null)
    const accessToken = ref<string | null>(null)
    const loading = ref(true)
    const error = ref<string | null>(null)

    const isAuthenticated = computed(() => !!user.value)
    const username = computed(() => profile.value?.username || 'Player')

    // Initialize auth state
    async function initialize() {
        loading.value = true

        // The whole app is gated behind `loading` (App.vue), so a throw here —
        // an expired refresh token, or a slow/blocked proxy on the India/UAE
        // path — must never leave loading stuck true, or the app hangs on the
        // splash forever. try/finally guarantees we release the gate.
        try {
            // Get current session
            const { data: { session } } = await supabase.auth.getSession()
            if (session?.user) {
                user.value = session.user
                accessToken.value = session.access_token
                setAnalyticsUser(session.user.id)
                // Resume a claim that was pending before a refresh, so its
                // completion still gets counted when the confirmation lands.
                if (session.user.is_anonymous && session.user.new_email) markClaimPending('email')
                await fetchProfile()
            }

            // After getSession, so the SDK has already had its look at the URL.
            consumeOAuthError()

            // Listen for auth changes
            // IMPORTANT: Per Supabase docs, avoid await inside this callback!
            // Use setTimeout to defer Supabase calls to avoid deadlocks
            supabase.auth.onAuthStateChange((event, session) => {

                // Always sync user and token state immediately (non-async)
                user.value = session?.user || null
                accessToken.value = session?.access_token || null
                setAnalyticsUser(session?.user?.id ?? null)

                // A pending claim completing = the confirmed session arriving
                // with is_anonymous off. Analytics-only latch; UI state derives
                // from the user object itself (claimPending).
                const claimMethod = pendingClaimMethod()
                if (claimMethod && session?.user && session.user.is_anonymous === false) {
                    clearPendingClaim()
                    track('guest_claim_completed', { method: claimMethod })
                }

                // Handle specific events. USER_UPDATED fires on in-place
                // updateUser calls (e.g. a guest claiming their account) —
                // without it the profile would never refresh mid-session.
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                    // Defer profile fetch to avoid blocking
                    if (session?.user) {
                        setTimeout(async () => {
                            await fetchProfile()
                        }, 0)
                    }
                } else if (event === 'SIGNED_OUT') {
                    profile.value = null
                }
                // INITIAL_SESSION is handled by initialize() directly
            })
        } catch (err) {
            console.error('auth initialize failed:', err)
        } finally {
            loading.value = false
        }
    }

    async function fetchProfile() {
        if (!user.value) return

        // maybeSingle, not single: a missing profile row (a reused anon session,
        // or a signed-up account before email confirmation) returns null data
        // with no error, instead of a 406/PGRST116 the caller has to special-case.
        const { data, error: err } = await supabase
            .from('profiles')
            .select('*')
            .eq('id', user.value.id)
            .maybeSingle()

        if (err) {
            console.error('Error fetching profile:', err)
            profile.value = data
            return
        }

        // A guest (or confirmed account) with no row hit the username
        // collision before this fix - recreate the row instead of leaving
        // them as "Player" forever. Unconfirmed email signups are skipped:
        // their row belongs to the confirmation trigger.
        const u = user.value
        if (!data && !profileHealed && u && (u.is_anonymous || u.email_confirmed_at)) {
            const wanted = String(u.user_metadata?.username ?? '') || randomHandle()
            await ensureProfile(u.id, wanted)
            const { data: healed } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', u.id)
                .maybeSingle()
            profile.value = healed
            return
        }

        profile.value = data
    }

    async function signUp(email: string, password: string, username: string) {
        loading.value = true
        error.value = null

        try {
            // Sign up the user - pass username in metadata
            // The database trigger will create the profile when email is confirmed
            const { data: authData, error: authError } = await supabase.auth.signUp({
                email,
                password,
                options: {
                    data: {
                        username: username
                    }
                }
            })

            if (authError) throw authError
            if (!authData.user) throw new Error('No user returned')

            // No session = email confirmation pending. Setting user here would
            // fake a signed-in state with no token behind it: games silently
            // stop recording and a refresh logs the user out. The session
            // arrives via onAuthStateChange when the confirmation link lands.
            if (authData.session) {
                user.value = authData.user
                await fetchProfile()
            }

            return { success: true, needsConfirmation: !authData.session }
        } catch (err: any) {
            error.value = err.message
            return { success: false, error: err.message }
        } finally {
            loading.value = false
        }
    }

    async function signIn(email: string, password: string) {
        loading.value = true
        error.value = null

        try {
            const { data, error: authError } = await supabase.auth.signInWithPassword({
                email,
                password
            })

            if (authError) throw authError

            user.value = data.user
            await fetchProfile()

            return { success: true }
        } catch (err: any) {
            error.value = err.message
            return { success: false, error: err.message }
        } finally {
            loading.value = false
        }
    }

    function sanitizeName(name: string): string {
        return name.trim().replace(/\s+/g, ' ').slice(0, 20)
    }

    // A distinct, on-theme handle so blank-nickname guests don't all read as
    // "Player" — every seat at the table feels like a real person.
    function randomHandle(): string {
        const adjectives = ['Red', 'Toxic', 'Savage', 'Brutal', 'Wild', 'Rogue', 'Feral', 'Grim', 'Vicious', 'Reckless', 'Ruthless', 'Lethal']
        const nouns = ['Fox', 'Wolf', 'Viper', 'Hawk', 'Shark', 'Raven', 'Cobra', 'Jackal', 'Reaper', 'Bandit', 'Phantom', 'Joker']
        const a = adjectives[Math.floor(Math.random() * adjectives.length)]
        const n = nouns[Math.floor(Math.random() * nouns.length)]
        return `${a}${n}${Math.floor(Math.random() * 9000 + 1000)}`
    }

    // One repair attempt per session: set by ensureProfile so a sign-in that
    // just ran it does not immediately re-run it from fetchProfile.
    let profileHealed = false

    /**
     * Create the profile row, riding out username collisions. The handle
     * namespace is shared by every guest ever, so profiles_username_key
     * collisions (23505) are routine as it fills - retry with a fresh suffix
     * instead of leaving the player with no row (no stats, no share code,
     * no rank). upsert on id is idempotent against the auth trigger;
     * ignoreDuplicates keeps an existing username.
     */
    async function ensureProfile(id: string, firstChoice: string) {
        profileHealed = true
        let name = firstChoice
        for (let attempt = 0; attempt < 3; attempt++) {
            const { error: upErr } = await supabase
                .from('profiles')
                .upsert({ id, username: name }, { onConflict: 'id', ignoreDuplicates: true })
            if (!upErr) return
            if (upErr.code !== '23505') {
                console.error('profile upsert failed:', upErr)
                return
            }
            name = `${name.replace(/\d+$/, '').slice(0, 15)}${Math.floor(Math.random() * 9000 + 1000)}`
        }
        console.error('profile upsert failed: no free username after retries')
    }

    async function signInAnonymously(nickname?: string) {
        // Already signed in (a double-click, or "Play as guest" on a session
        // that already has a user)? Reuse that identity. Minting a fresh anon
        // user here orphans the previous one and its stats.
        if (user.value) {
            if (!profile.value) await fetchProfile()
            return { success: true }
        }

        loading.value = true
        error.value = null

        try {
            const cleaned = nickname ? sanitizeName(nickname) : ''
            const guestName = cleaned || randomHandle()

            const { data, error: authError } = await supabase.auth.signInAnonymously({
                options: {
                    data: {
                        username: guestName
                    }
                }
            })

            if (authError) throw authError
            if (!data.user) throw new Error('Anonymous sign-in failed')

            user.value = data.user

            // Ensure a profile row exists, riding out username collisions -
            // upsert semantics and the retry live in ensureProfile.
            await ensureProfile(data.user.id, guestName)

            await fetchProfile()
            return { success: true }
        } catch (err: any) {
            error.value = err.message
            return { success: false, error: err.message }
        } finally {
            loading.value = false
        }
    }

    const isAnonymous = computed(() => user.value?.is_anonymous === true)

    // A claim is pending while the guest's confirmation email is unclicked.
    // Derived from the user object (survives refreshes), never latched.
    const claimPending = computed(() => isAnonymous.value && !!user.value?.new_email)

    /**
     * Which claim is in flight, so the completion event can say how it happened.
     *
     * Analytics-only. It records the method because email and Google converge on
     * the same completion, and without it the two paths are indistinguishable —
     * which is the one comparison the Google work exists to settle.
     *
     * Google needs more than a variable: linking leaves the page entirely, so an
     * in-memory flag cannot survive the round-trip. The method parks in
     * sessionStorage (same tab, gone when it closes) and is picked up on return.
     * Email keeps working off user.new_email, which survives the confirmation
     * link being opened in a different tab or browser altogether.
     */
    type ClaimMethod = 'email' | 'google'
    const CLAIM_METHOD_KEY = 'om_claim_method'
    let pendingClaim: ClaimMethod | null = null

    function markClaimPending(method: ClaimMethod) {
        pendingClaim = method
        // Only Google crosses a navigation, so only Google needs to persist.
        if (method !== 'google') return
        try { sessionStorage.setItem(CLAIM_METHOD_KEY, method) } catch { /* private mode */ }
    }

    function pendingClaimMethod(): ClaimMethod | null {
        if (pendingClaim) return pendingClaim
        try {
            return sessionStorage.getItem(CLAIM_METHOD_KEY) === 'google' ? 'google' : null
        } catch { return null }
    }

    function clearPendingClaim() {
        pendingClaim = null
        try { sessionStorage.removeItem(CLAIM_METHOD_KEY) } catch { /* private mode */ }
    }

    /** Convert the guest to a permanent account IN PLACE — same user id, so
     *  the profile row, share code, and every game_results row stay attached.
     *  The email needs a confirmation click; the password applies immediately. */
    async function claimAccount(email: string, password: string):
        Promise<{ success: boolean; needsConfirmation?: boolean; error?: string; code?: 'email_exists' }> {
        if (!user.value || !isAnonymous.value) {
            return { success: false, error: 'Not a guest session' }
        }
        track('guest_claim_started', {})
        try {
            const { data, error: updateError } = await supabase.auth.updateUser(
                { email, password },
                { emailRedirectTo: window.location.origin },
            )
            if (updateError) throw updateError
            if (data.user) user.value = data.user // carries new_email → claimPending
            markClaimPending('email')
            track('guest_claim_email_sent', {})
            return { success: true, needsConfirmation: true }
        } catch (err: any) {
            const exists = err?.code === 'email_exists' || /already.*registered/i.test(err?.message ?? '')
            if (exists) track('guest_claim_email_exists', {})
            return { success: false, error: err.message, ...(exists ? { code: 'email_exists' as const } : {}) }
        }
    }

    /** An OAuth failure read off the URL we were redirected back to. */
    const oauthError = ref<OAuthRedirectError | null>(null)

    /**
     * Pick up an OAuth failure from the return trip and clear it from the URL.
     *
     * `linkIdentity()` navigates away, so its failures can't be caught at the
     * call site — the only place a collision shows up is here. Clearing matters
     * because the params would otherwise re-trigger the error on every refresh.
     */
    function consumeOAuthError() {
        const found = readOAuthError(window.location.search, window.location.hash)
        if (!found) return
        oauthError.value = found
        if (found.code === 'identity_already_exists') track('guest_claim_google_taken', {})
        // The claim died here. Leaving the marker set would attribute the next
        // successful Google sign-in in this tab to a claim that never completed.
        clearPendingClaim()
        window.history.replaceState({}, '', urlWithoutOAuthError(window.location))
    }

    function clearOAuthError() {
        oauthError.value = null
    }

    /**
     * Hand the browser to Google. Returns only on failure — success navigates away.
     *
     * The SDK owns the navigation, deliberately. Passing skipBrowserRedirect to
     * take it over ourselves looks harmless and is not: linkIdentity fetches the
     * provider URL server-side (it hardcodes skip_http_redirect on that request),
     * so the url it hands back is *Google's*, not Supabase's. Rewriting its origin
     * produced https://<project>.supabase.co/o/oauth2/v2/auth, which answers
     * "requested path is invalid".
     */
    async function startGoogleRedirect(call: () => Promise<OAuthResponse>) {
        try {
            const { error: oauthErr } = await call()
            if (oauthErr) throw oauthErr
            return { success: true }
        } catch (err: any) {
            error.value = err.message
            return { success: false, error: err.message }
        }
    }

    /**
     * Convert the guest to a permanent account with a Google identity — the
     * OAuth twin of claimAccount(). Attaching an identity to the existing user
     * keeps the same user id, so the profile row, share code and every
     * game_results row stay attached, and it skips the confirmation email that
     * loses most of the people who start the email claim.
     *
     * Requires "manual linking" enabled on the Supabase project; without it this
     * fails with manual_linking_disabled.
     */
    async function linkGoogleIdentity() {
        if (!user.value || !isAnonymous.value) {
            return { success: false, error: 'Not a guest session' }
        }
        track('guest_claim_google_started', {})
        markClaimPending('google')
        return startGoogleRedirect(() => supabase.auth.linkIdentity({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        }))
    }

    /**
     * Google sign-in for a visitor with no guest session to preserve.
     *
     * Unlike linkIdentity, this navigates to Supabase's own /authorize, which
     * answers with a 302 to Google — so it only works while the proxy passes
     * redirects through instead of following them (supabase-proxy/src/index.ts).
     */
    async function signInWithGoogle() {
        return startGoogleRedirect(() => supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        }))
    }

    /** Re-send the claim confirmation to the pending address. */
    async function resendClaimEmail() {
        const email = user.value?.new_email
        if (!email) return { success: false, error: 'No claim pending' }
        try {
            const { error: resendError } = await supabase.auth.resend({ type: 'email_change', email })
            if (resendError) throw resendError
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    // Rename the current player (used via the editable lobby chip).
    async function updateUsername(name: string) {
        const clean = sanitizeName(name)
        if (!clean || !user.value) return { success: false, error: 'Invalid name' }
        try {
            // The store can outlive the SDK's session. Without one the write
            // goes out as anon, which has no grant on profiles, and the player
            // sees a raw Postgres error.
            const { data: { session } } = await supabase.auth.getSession()
            if (!session) return { success: false, error: 'You were signed out. Reload the page and try again.' }
            // upsert, not update: a guest whose profile row is missing (see the
            // trigger race in signInAnonymously) would get a silent 0-row update
            // and a rename that never persists. upsert creates the row if absent.
            const { error: upErr } = await supabase
                .from('profiles')
                .upsert({ id: user.value.id, username: clean }, { onConflict: 'id' })
            if (upErr) throw upErr.code === '23505' ? new Error('That name is already taken') : upErr
            await supabase.auth.updateUser({ data: { username: clean } })
            if (profile.value) profile.value.username = clean
            else profile.value = { id: user.value.id, username: clean, created_at: new Date().toISOString() }
            return { success: true }
        } catch (err: any) {
            error.value = err.message
            return { success: false, error: err.message }
        }
    }

    /**
     * Names like the one they wanted, that are actually free.
     *
     * Feature-detected like every definer surface: an empty array until
     * username-suggestions.sql runs, and the caller renders nothing. A rejected
     * rename still shows its reason either way.
     */
    async function suggestUsernames(base: string): Promise<string[]> {
        try {
            const { data, error: rpcErr } = await supabase.rpc('username_suggestions', {
                // Sanitised only. The `|| base` this replaced fired exactly when
                // sanitizeName() emptied the string, so its one job was to forward
                // raw input - and the function already falls back to 'Player'.
                p_base: sanitizeName(base),
                p_count: 3,
            })
            if (rpcErr || !Array.isArray(data)) return []
            return (data as unknown[]).filter((n): n is string => typeof n === 'string' && n.length > 0)
        } catch {
            return []
        }
    }

    async function sendPasswordReset(email: string) {
        try {
            const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin,
            })
            if (resetError) throw resetError
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function updatePassword(newPassword: string) {
        try {
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword
            })
            if (updateError) throw updateError
            return { success: true }
        } catch (err: any) {
            return { success: false, error: err.message }
        }
    }

    async function signOut() {
        try {
            await supabase.auth.signOut()
            user.value = null
            profile.value = null
        } catch (err: any) {
            console.error('signOut error:', err)
        }
    }

    return {
        user,
        profile,
        accessToken,
        loading,
        error,
        isAuthenticated,
        isAnonymous,
        claimPending,
        username,
        oauthError,
        initialize,
        signUp,
        signIn,
        signInAnonymously,
        claimAccount,
        linkGoogleIdentity,
        signInWithGoogle,
        clearOAuthError,
        resendClaimEmail,
        updateUsername,
        suggestUsernames,
        signOut,
        sendPasswordReset,
        updatePassword
    }
})
