/**
 * Pure helpers for profile pictures: the no-photo fallback, the rank pip's
 * size, the crop the photo sheet saves, and the public url of a saved photo.
 */

export interface AvatarTint {
    bg: string
    fg: string
}

/** The four deck colours, darkened for the disc and kept bright for the letter. */
export const AVATAR_TINTS: readonly AvatarTint[] = [
    { bg: '#3a1212', fg: '#ff5a5a' },
    { bg: '#332a05', fg: '#ffcc00' },
    { bg: '#0b2e1a', fg: '#3ddc84' },
    { bg: '#0c2140', fg: '#4da3ff' },
]

export function avatarTint(id: string): AvatarTint {
    let h = 0
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0
    return AVATAR_TINTS[h % AVATAR_TINTS.length]!
}

export function initialOf(name: string): string {
    const first = name.trim().charAt(0)
    return first ? first.toUpperCase() : '?'
}

/**
 * The square of the source photo that shows inside a `viewport`-wide circle.
 * At zoom 1 the photo's short side fills the circle; `offset` is the drag in
 * screen px, clamped so the photo always covers the circle.
 */
export function cropRect(
    photo: { width: number; height: number },
    viewport: number,
    zoom: number,
    offset: { x: number; y: number },
): { sx: number; sy: number; size: number } {
    const scale = (viewport / Math.min(photo.width, photo.height)) * zoom
    const spareX = (photo.width * scale - viewport) / 2
    const spareY = (photo.height * scale - viewport) / 2
    const x = Math.max(-spareX, Math.min(spareX, offset.x))
    const y = Math.max(-spareY, Math.min(spareY, offset.y))
    return { sx: (spareX - x) / scale, sy: (spareY - y) / scale, size: viewport / scale }
}

/** Each save is a new object, so the url changes with the photo and caches forever. */
export function avatarPath(userId: string, version: number): string {
    return `${userId}/${version}`
}

export function avatarUrl(supabaseUrl: string, userId: string, version: number | null): string | null {
    if (version == null) return null
    return `${supabaseUrl}/storage/v1/object/public/avatars/${avatarPath(userId, version)}`
}
