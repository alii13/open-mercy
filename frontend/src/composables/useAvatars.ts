/**
 * Profile pictures for every seat and row. `profiles` is readable by everyone,
 * so a photo is just `avatar_version` on the profile plus an object in the
 * public `avatars` bucket (supabase/avatars.sql).
 *
 * Every Avatar asks for its own player, and the asks made in the same tick go
 * out as one query, so a table of ten seats is one round trip. Feature-detects
 * like useBadges: when the column is missing, lookups stop for the session,
 * every avatar shows its initial and `avatarsAvailable` hides the upload
 * entry points. A dropped connection is not that - those ids are asked again.
 */

import { reactive, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { avatarPath } from '../utils/avatar'
import { isFatalSchemaError } from '../utils/supabaseErrors'

/** user id -> photo version; null means the player has no photo. */
const versions = reactive(new Map<string, number | null>())
/** Ids the lookup found a profile row for. */
const profiled = reactive(new Set<string>())
const asked = new Set<string>()
const queued = new Set<string>()
let broken = false

/** False once the database says photos are not installed. */
export const avatarsAvailable = ref(true)

// Bots and local seats carry ids like 'bot-1'. One of those in the batch makes
// Postgres reject the whole query, so they never join it.
const USER_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function requestAvatars(ids: readonly (string | null | undefined)[]): void {
    if (broken) return
    const idle = queued.size === 0
    for (const id of ids) {
        if (id && USER_ID.test(id) && !asked.has(id)) {
            asked.add(id)
            queued.add(id)
        }
    }
    if (idle && queued.size) queueMicrotask(flush)
}

async function flush() {
    const ids = [...queued]
    queued.clear()
    const { data, error } = await supabase.from('profiles').select('id, avatar_version').in('id', ids)
    if (error) {
        if (isFatalSchemaError(error)) {
            broken = true
            avatarsAvailable.value = false
        }
        // Forget them so the next mount asks again.
        for (const id of ids) asked.delete(id)
        return
    }
    const byId = new Map((data ?? []).map(r => [r.id as string, r.avatar_version as number | null]))
    for (const id of byId.keys()) profiled.add(id)
    for (const id of ids) versions.set(id, byId.get(id) ?? null)
}

/** Whether the player has a profile to add as a friend; undefined until the lookup answers. */
export function hasProfile(id: string): boolean | undefined {
    return versions.has(id) ? profiled.has(id) : undefined
}

export function avatarUrlFor(id: string | null | undefined): string | null {
    const version = id ? versions.get(id) ?? null : null
    if (!id || version == null) return null
    // From the client, so photos follow it if it is ever pointed at the proxy.
    return supabase.storage.from('avatars').getPublicUrl(avatarPath(id, version)).data.publicUrl
}

/** Deletes every object in the player's folder except `keep`. Listing rather
 *  than trusting this tab's cache catches photos saved from another device. */
async function clearFolder(userId: string, keep: string | null) {
    const { data } = await supabase.storage.from('avatars').list(userId)
    const stale = (data ?? []).map(f => `${userId}/${f.name}`).filter(p => p !== keep)
    if (stale.length) await supabase.storage.from('avatars').remove(stale)
}

export async function uploadAvatar(userId: string, photo: Blob): Promise<{ error: string | null }> {
    const version = Date.now()
    const path = avatarPath(userId, version)
    const { error } = await supabase.storage
        .from('avatars')
        .upload(path, photo, { contentType: photo.type, cacheControl: '31536000' })
    if (error) return { error: error.message }
    const { error: saveError } = await supabase.from('profiles').update({ avatar_version: version }).eq('id', userId)
    if (saveError) {
        // Nothing points at the new object, so it goes rather than lingering.
        void supabase.storage.from('avatars').remove([path])
        return { error: saveError.message }
    }
    asked.add(userId)
    versions.set(userId, version)
    void clearFolder(userId, path)
    return { error: null }
}

export async function removeAvatar(userId: string): Promise<{ error: string | null }> {
    const { error } = await supabase.from('profiles').update({ avatar_version: null }).eq('id', userId)
    if (error) return { error: error.message }
    asked.add(userId)
    versions.set(userId, null)
    await clearFolder(userId, null)
    return { error: null }
}
