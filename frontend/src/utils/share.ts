/**
 * Profile sharing — native share sheet on mobile, clipboard on desktop.
 * The share text leads with the brag (wins, stack survived) because that's
 * what makes someone tap the link.
 */

export interface ShareInputs {
    username: string
    wins: number
    max_stack_survived: number
    isOwn: boolean
    url: string
}

export function buildShareText(p: ShareInputs): string {
    const brags: string[] = []
    if (p.wins > 0) brags.push(`${p.wins} wins`)
    if (p.max_stack_survived > 0) brags.push(`survived a +${p.max_stack_survived} stack 💀`)
    const brag = brags.length ? `${brags.join(' · ')} — ` : ''
    const challenge = p.isOwn
        ? 'Think you can beat me at RUNE RIOT?'
        : `Think you can beat ${p.username} at RUNE RIOT?`
    return `${brag}${challenge} ${p.url}`
}

/** Share via the native sheet when available, else copy to clipboard.
 *  Returns how it went out so the button can confirm. */
export async function shareProfile(p: ShareInputs): Promise<'shared' | 'copied' | 'failed'> {
    const text = buildShareText(p)
    if (navigator.share) {
        try {
            await navigator.share({ text })
            return 'shared'
        } catch {
            // user dismissed the sheet — fall through to clipboard
        }
    }
    try {
        await navigator.clipboard.writeText(text)
        return 'copied'
    } catch {
        return 'failed'
    }
}
