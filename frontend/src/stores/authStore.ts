import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { supabase, type UserProfile } from '../lib/supabase'
import { track, setAnalyticsUser } from '../utils/analytics'
import { isFirstEmailChangeLink, readOAuthError, rememberReturnPath, takeReturnPath, urlWithoutOAuthError, type OAuthRedirectError } from '../utils/oauthRedirect'
import { router } from '../utils/routes'
import { randomHandle } from '@handles'
import { deleteAvatarFolder } from '../composables/useAvatars'
import type { OAuthResponse, User } from '@supabase/supabase-js'
import { siteOrigin } from '../utils/siteOrigin'
import { canSignInWithApple, isNativeApp, nativeIdToken, revokeAppleSignIn, SignInCancelled, type NativeProvider } from '../utils/nativeSignIn'

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
                noticeEmailChangeLanded(session.user)
                await fetchProfile()
            }

            // After getSession, so the SDK has already had its look at the URL.
            consumeOAuthError()
            consumeEmailChangeLink()

            // Listen for auth changes
            // IMPORTANT: Per Supabase docs, avoid await inside this callback!
            // Use setTimeout to defer Supabase calls to avoid deadlocks
            supabase.auth.onAuthStateChange((event, session) => {
                // auth-js reports SIGNED_IN again every time the tab comes back
                // into view, and TOKEN_REFRESHED about hourly. For the same
                // player, still a guest or still claimed, only another device
                // can have changed the row, so a recent read is good enough.
                const samePlayer = !!session?.user && session.user.id === user.value?.id
                    && session.user.is_anonymous === user.value?.is_anonymous

                // Always sync user and token state immediately (non-async)
                user.value = session?.user || null
                if (session?.user) noticeEmailChangeLanded(session.user)
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

                // The claim's confirmation link opens in another browser (Safari,
                // from the apps), so this page learns the claim landed only from
                // a fresh token, up to an hour away. auth-js sends SIGNED_IN each
                // time the page comes back into view, which is when players look.
                if (event === 'SIGNED_IN' && session?.user?.is_anonymous && session.user.new_email) {
                    setTimeout(() => { void supabase.auth.refreshSession() }, 0)
                }

                // Handle specific events. USER_UPDATED fires on in-place
                // updateUser calls (e.g. a guest claiming their account) —
                // without it the profile would never refresh mid-session.
                if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
                    // Defer profile fetch to avoid blocking. A profile that never
                    // loaded gets another go.
                    const stale = Date.now() - profileReadAt > PROFILE_FRESH_MS
                    if (session?.user && (event === 'USER_UPDATED' || !samePlayer || !profile.value || stale)) {
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
        profileReadAt = Date.now()

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

    // One repair attempt per session: set by ensureProfile so a sign-in that
    // just ran it does not immediately re-run it from fetchProfile.
    let profileHealed = false
    /** When profiles was last read, for the tab-return re-read below. */
    let profileReadAt = 0
    /** Another device can change the row (card back, name, country). */
    const PROFILE_FRESH_MS = 15 * 60_000

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
    /** Email + password accounts can move to another address; Google ones use Google's. */
    const canChangeEmail = computed(() => !isAnonymous.value && (user.value?.app_metadata?.providers ?? []).includes('email'))
    const emailChangePending = computed(() => !isAnonymous.value && !!user.value?.new_email)

    /** One line for the player about their account, shown as a toast. */
    const authNotice = ref<string | null>(null)
    function clearAuthNotice() { authNotice.value = null }

    // The last confirmation link usually opens a new tab, which never saw the
    // old address. The requested one rides localStorage so whichever tab sees
    // it land can say so.
    const EMAIL_CHANGE_KEY = 'om_email_change_to'

    /** Move an email account to a new address. Supabase mails a link to both
     *  the old and the new address; the change lands when both are clicked. */
    async function changeEmail(email: string):
        Promise<{ success: true } | { success: false; error: 'same_email' | 'email_exists' | 'rate_limited' | 'failed' }> {
        const clean = email.trim().toLowerCase()
        if (!canChangeEmail.value) return { success: false, error: 'failed' }
        if (clean === user.value?.email?.toLowerCase()) return { success: false, error: 'same_email' }
        try {
            const { data, error: updateError } = await supabase.auth.updateUser(
                { email: clean },
                { emailRedirectTo: siteOrigin() },
            )
            if (updateError) throw updateError
            if (data.user) user.value = data.user // carries new_email -> emailChangePending
            try { localStorage.setItem(EMAIL_CHANGE_KEY, clean) } catch { /* private mode */ }
            track('email_change_sent', {})
            return { success: true }
        } catch (err: any) {
            if (err?.code === 'email_exists' || /already.*registered/i.test(err?.message ?? '')) return { success: false, error: 'email_exists' }
            if (err?.code === 'over_email_send_rate_limit' || err?.status === 429) return { success: false, error: 'rate_limited' }
            return { success: false, error: 'failed' }
        }
    }

    function noticeEmailChangeLanded(u: User) {
        let wanted: string | null = null
        try { wanted = localStorage.getItem(EMAIL_CHANGE_KEY) } catch { return }
        if (!wanted || u.is_anonymous || u.email?.toLowerCase() !== wanted) return
        try { localStorage.removeItem(EMAIL_CHANGE_KEY) } catch { /* private mode */ }
        authNotice.value = `Your email is now ${u.email}.`
        track('email_change_completed', {})
    }

    function consumeEmailChangeLink() {
        if (!isFirstEmailChangeLink(window.location.hash)) return
        authNotice.value = 'Link accepted. Now click the link we sent to your other address.'
        void router.replace(urlWithoutOAuthError(window.location))
    }

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
    type ClaimMethod = 'email' | 'google' | 'apple'
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
                { emailRedirectTo: siteOrigin() },
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
        // Every old or already-used email link comes back as otp_expired: sign-up,
        // password reset and email change alike. A signed-in account has no use
        // for the auth screen, so it gets a notice; guests and signed-out
        // visitors keep the screen, where they can sign in or ask again.
        if (found.code === 'otp_expired' && user.value && !isAnonymous.value) {
            authNotice.value = canChangeEmail.value
                ? 'That link has expired or was already used. Send a new one from Change email in the menu at the top right.'
                : 'That link has expired or was already used.'
            void router.replace(urlWithoutOAuthError(window.location))
            return
        }
        oauthError.value = found
        if (found.code === 'identity_already_exists') track('guest_claim_google_taken', {})
        // The claim died here. Leaving the marker set would attribute the next
        // successful Google sign-in in this tab to a claim that never completed.
        clearPendingClaim()
        void router.replace(urlWithoutOAuthError(window.location))
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
        rememberReturnPath(router.currentRoute.value.fullPath)
        try {
            const { error: oauthErr } = await call()
            if (oauthErr) throw oauthErr
            return { success: true }
        } catch (err: any) {
            takeReturnPath()
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
        if (isNativeApp) return linkNativeIdentity('google')
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
        if (isNativeApp) return signInWithNative('google')
        return startGoogleRedirect(() => supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: window.location.origin },
        }))
    }

    /** Sign in with Apple. iOS app only (nativeSignIn.canSignInWithApple). */
    async function signInWithApple() {
        return signInWithNative('apple')
    }

    /** A guest keeps their account with Apple. iOS app only, like signInWithApple. */
    async function linkAppleIdentity() {
        if (!user.value || !isAnonymous.value) {
            return { success: false, error: 'Not a guest session' }
        }
        return linkNativeIdentity('apple')
    }

    type ProviderResult = { success: boolean; error?: string; cancelled?: boolean }

    function providerFailure(err: unknown): ProviderResult {
        if (err instanceof SignInCancelled) return { success: false, cancelled: true }
        // identity_already_exists: this Google or Apple sign-in is another
        // player's. email_exists: the email it shares is another player's.
        const e = err as { code?: string; message?: string }
        const taken = e?.code === 'identity_already_exists' || e?.code === 'email_exists'
        return { success: false, error: taken ? e.code : (e?.message ?? 'failed') }
    }

    /**
     * The apps' sign-in: the system Google or Apple sheet returns an ID token,
     * and Supabase starts the session from it. Nothing navigates, so success
     * and failure both come back to the caller.
     */
    async function signInWithNative(provider: NativeProvider): Promise<ProviderResult> {
        try {
            const { token, nonce } = await nativeIdToken(provider)
            const { error: signInError } = await supabase.auth.signInWithIdToken({ provider, token, nonce })
            if (signInError) throw signInError
            return { success: true }
        } catch (err) {
            return providerFailure(err)
        }
    }

    /**
     * The apps' guest claim: the same in-place conversion as the web's
     * linkIdentity redirect, from an ID token instead. The user id stays, so
     * the profile, share code and game_results stay attached.
     */
    async function linkNativeIdentity(provider: NativeProvider): Promise<ProviderResult> {
        markClaimPending(provider)
        try {
            const { token, nonce } = await nativeIdToken(provider)
            const { data, error: linkError } = await supabase.auth.linkIdentity({ provider, token, nonce })
            if (linkError) throw linkError
            if (data.user) user.value = data.user
            return { success: true }
        } catch (err) {
            clearPendingClaim()
            const result = providerFailure(err)
            const taken = result.error === 'identity_already_exists' || result.error === 'email_exists'
            if (taken && provider === 'google') track('guest_claim_google_taken', {})
            return result
        }
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
                redirectTo: siteOrigin(),
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

    /** Deletes the account and everything tied to it (supabase/delete-account.sql).
     *  The dry run comes first, so a project without the function loses nothing,
     *  and the photo goes while the account still owns it. */
    async function deleteAccount(): Promise<{ success: boolean }> {
        const id = user.value?.id
        if (!id) return { success: false }
        try {
            const probe = await supabase.rpc('delete_my_account', { dry_run: true })
            if (probe.error) throw probe.error
            // Apple requires its tokens revoked with the account. Only the iOS
            // app has Apple sign-in, and the revoke needs the live session.
            if (canSignInWithApple && user.value?.identities?.some(i => i.provider === 'apple')) {
                const { data: { session } } = await supabase.auth.getSession()
                await revokeAppleSignIn(session?.access_token ?? '')
            }
            const photoError = await deleteAvatarFolder(id)
            if (photoError) throw new Error(photoError)
            const { error: deleteError } = await supabase.rpc('delete_my_account')
            if (deleteError) throw deleteError
        } catch (err) {
            // Closing the Apple sheet is a change of mind, not an error.
            if (err instanceof SignInCancelled) return { success: false }
            console.error('deleteAccount error:', err)
            authNotice.value = "We couldn't delete your account. Try again in a minute."
            return { success: false }
        }
        track('account_deleted', {})
        // Deleting the user ended its sessions on the server. Its logout call
        // answers "not found", which supabase-js ignores before clearing this
        // device's stored session.
        await supabase.auth.signOut({ scope: 'local' })
        user.value = null
        profile.value = null
        authNotice.value = 'Your account and everything in it are deleted.'
        return { success: true }
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
        canChangeEmail,
        emailChangePending,
        authNotice,
        clearAuthNotice,
        changeEmail,
        username,
        oauthError,
        initialize,
        signUp,
        signIn,
        signInAnonymously,
        claimAccount,
        deleteAccount,
        linkGoogleIdentity,
        signInWithGoogle,
        signInWithApple,
        linkAppleIdentity,
        clearOAuthError,
        resendClaimEmail,
        updateUsername,
        suggestUsernames,
        signOut,
        sendPasswordReset,
        updatePassword
    }
})
