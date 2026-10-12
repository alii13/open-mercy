/**
 * Questions asked from the loud card — the same card a `loud` changelog entry
 * fires, borrowed to ask instead of to announce. See "Asking players a
 * question" in CLAUDE.md.
 *
 * In the bundle rather than a table for the same reason the changelog is:
 * asking is a deploy anyway, and a table would add a fetch and a policy to
 * carry four lines of copy.
 *
 * One question at a time. The card shows the first entry this player has not
 * closed, so a second entry here waits behind the first.
 */

export interface Poll {
    /** Stable. It is the vote's `poll_id` and the local answered flag. */
    id: string
    /** The card's headline. A question, verb-first, under 50 characters. */
    question: string
    /** One or two sentences of context. Say what the answer decides. */
    body: string
    /**
     * Stored verbatim as the vote's `choice`. Editing an option after votes
     * land splits the tally, because the rows already written keep the old
     * wording. Add a new poll instead.
     *
     * Two or three. The first renders as the primary button.
     */
    options: string[]
}

// Closed: 2026-08-29-mobile-app ("Would you play this as a phone app?").
// Its votes stay in poll_votes; never reuse the id.
export const POLLS: Poll[] = []

/**
 * The first question this player has not closed, or null.
 *
 * In list order, one at a time: a second question waits behind the first
 * rather than stacking on the same card.
 */
export function nextPoll(polls: readonly Poll[], answeredIds: readonly string[]): Poll | null {
    return polls.find(p => !answeredIds.includes(p.id)) ?? null
}
