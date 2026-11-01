/**
 * Profile pictures for every seat and row. `profiles` is readable by everyone,
 * so a photo is just `avatar_version` on the profile plus an object in the
 * public `avatars` bucket (supabase/avatars.sql).
 *
 * Every Avatar asks for its own player, and the asks made in the same tick go
 * out as one query, so a table of ten seats is one round trip. Feature-detects
 * like useBadges: until the column exists the first query fails, lookups stop
 * for the session, and every avatar shows its initial.
 */

import { reactive } from 'vue'
import { supabase } from '../lib/supabase'
import { avatarPath, avatarUrl } from '../utils/avatar'

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string

/** user id -> photo version; null means the player has no photo. */
const versions = reactive(new Map<string, number | null>())
const asked = new Set<string>()
const queued = new Set<string>()
let broken = false

// Bots and local seats carry ids like 'bot-1'. One of those in the batch makes
// Postgres reject the whole query, which would read as "column missing" and
// switch photos off for the session.
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
        broken = true
        return
    }
    const byId = new Map((data ?? []).map(r => [r.id as string, r.avatar_version as number | null]))
    for (const id of ids) versions.set(id, byId.get(id) ?? null)
}

export function avatarUrlFor(id: string | null | undefined): string | null {
    if (!id) return null
    return avatarUrl(SUPABASE_URL, id, versions.get(id) ?? null)
}

export async function uploadAvatar(userId: string, photo: Blob): Promise<{ error: string | null }> {
    const previous = versions.get(userId) ?? null
    const version = Date.now()
    const { error } = await supabase.storage
        .from('avatars')
        .upload(avatarPath(userId, version), photo, { contentType: photo.type, cacheControl: '31536000' })
    if (error) return { error: error.message }
    const { error: saveError } = await supabase.from('profiles').update({ avatar_version: version }).eq('id', userId)
    if (saveError) return { error: saveError.message }
    asked.add(userId)
    versions.set(userId, version)
    // ponytail: only the version we know about is cleaned up; an orphan from a
    // failed save stays in the bucket. List the folder if storage ever matters.
    if (previous != null) void supabase.storage.from('avatars').remove([avatarPath(userId, previous)])
    return { error: null }
}

export async function removeAvatar(userId: string): Promise<{ error: string | null }> {
    const current = versions.get(userId) ?? null
    const { error } = await supabase.from('profiles').update({ avatar_version: null }).eq('id', userId)
    if (error) return { error: error.message }
    versions.set(userId, null)
    if (current != null) await supabase.storage.from('avatars').remove([avatarPath(userId, current)])
    return { error: null }
}
