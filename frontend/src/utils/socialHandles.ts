export type SocialNetwork = 'x' | 'instagram'

const PROFILE_LINK: Record<SocialNetwork, RegExp> = {
    x: /^(?:https?:\/\/)?(?:www\.|mobile\.)?(?:x|twitter)\.com\/([^/?#]+)/i,
    instagram: /^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)/i,
}

// The same rules as the CHECK constraints in supabase/profile-socials.sql.
const VALID: Record<SocialNetwork, RegExp> = {
    x: /^[A-Za-z0-9_]{1,15}$/,
    instagram: /^(?!.*\.\.)[A-Za-z0-9_](?:[A-Za-z0-9._]{0,28}[A-Za-z0-9_])?$/,
}

const HINT: Record<SocialNetwork, string> = {
    x: 'Use your X handle: up to 15 letters, numbers or underscores.',
    instagram: 'Use your Instagram handle: up to 30 letters, numbers, dots or underscores.',
}

/** A typed handle or a pasted profile link, reduced to the bare handle. Empty clears it. */
export function parseHandle(network: SocialNetwork, raw: string): { handle: string | null } | { error: string } {
    let value = raw.trim()
    const link = value.match(PROFILE_LINK[network])
    if (link) value = link[1] ?? ''
    else if (/[/:]/.test(value)) return { error: HINT[network] }
    value = value.replace(/^@/, '')
    if (!value) return { handle: null }
    return VALID[network].test(value) ? { handle: value } : { error: HINT[network] }
}

export function socialUrl(network: SocialNetwork, handle: string): string {
    const h = encodeURIComponent(handle)
    return network === 'x' ? `https://x.com/${h}` : `https://www.instagram.com/${h}/`
}
