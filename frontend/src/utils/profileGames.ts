export interface GameOpponent {
    name: string
    code: string
    /** The person looking at the profile. */
    you: boolean
}

export interface OpponentFields {
    is_bot_game: boolean
    is_daily: boolean
    opponent_count: number
    opponents: GameOpponent[]
}

export interface HeadToHeadLast {
    last_played_at: string
    last_my_result: string
    last_my_cards: number
    last_my_peak: number
    last_their_result: string
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** "vs Rook, Sana and 1 more", split so the page can colour "you". */
export function opponentSegments(g: OpponentFields): { text: string; you?: boolean }[] {
    if (g.is_bot_game) return [{ text: g.is_daily ? 'Daily challenge' : `vs ${plural(g.opponent_count, 'bot')}` }]
    const named = g.opponents.slice(0, 2)
    if (!named.length) return [{ text: `vs ${plural(g.opponent_count, 'player')}` }]
    const more = Math.max(0, g.opponent_count - named.length)
    const segments: { text: string; you?: boolean }[] = [{ text: 'vs ' }]
    named.forEach((o, i) => {
        if (i > 0) segments.push({ text: more ? ', ' : ' and ' })
        segments.push(o.you ? { text: 'you', you: true } : { text: o.name })
    })
    if (more) segments.push({ text: ` and ${more} more` })
    return segments
}

export function opponentLine(g: OpponentFields): string {
    return opponentSegments(g).map(s => s.text).join('')
}

/** "today", "yesterday", or "Nov 12", in the reader's own calendar. */
export function dayLabel(iso: string, nowMs: number): string {
    const d = new Date(iso)
    const now = new Date(nowMs)
    const startOf = (x: Date) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
    const days = Math.round((startOf(now) - startOf(d)) / 86_400_000)
    if (days === 0) return 'today'
    if (days === 1) return 'yesterday'
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

export function headToHeadLine(h: HeadToHeadLast, nowMs: number): string {
    const day = dayLabel(h.last_played_at, nowMs)
    const when = day === 'today' || day === 'yesterday' ? day : `on ${day}`
    const winner = h.last_my_result === 'won' ? 'You' : h.last_their_result === 'won' ? 'They' : 'Someone else'
    const you = h.last_my_result === 'eliminated' ? ` You were eliminated at ${h.last_my_peak} cards.`
        : h.last_my_result === 'lost' ? ` You held ${h.last_my_cards} cards at the end.`
        : ''
    return `${winner} won your last game ${when}.${you}`
}
