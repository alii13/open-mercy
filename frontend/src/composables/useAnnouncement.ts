/**
 * The live announcement (supabase/announcements.sql), shared by the modal,
 * the lobby's countdown chip and the post-game badge check.
 *
 * Read once per signed-in visit. A project without the SQL, or a failed read,
 * leaves `checked` true and `current` null, so nothing shows.
 */

import { computed, ref } from 'vue'
import { supabase } from '../lib/supabase'
import { pointsBoost, shouldOffer, type Announcement } from '../utils/announcement'

interface LiveRow {
    id: string
    eyebrow: string | null
    hero: string | null
    hero_title: string | null
    hero_note: string | null
    body: string
    image_path: string | null
    image_caption: string | null
    button_label: string
    points_multiplier: number | null
    ends_at: string
    server_now: string
    joined: boolean
    skips: number
}

const current = ref<Announcement | null>(null)
const checked = ref(false)
/** Set once the modal has shown this visit: the release card and polls wait for the next one. */
const tookVisit = ref(false)
const answeredThisVisit = ref(false)
/** Decided once at load, so the modal stays open through its "You're in" beat. */
const offerThisVisit = ref(false)
let loadedFor: string | null = null
let lastRead = 0
/** While nothing is live, read again at most this often: a row inserted ahead
 *  of time starts while tabs are already open. */
const RECHECK_MS = 60_000

/** Reads the live announcement for a newly signed-in player, from a clean slate. */
export async function loadAnnouncement(userId: string): Promise<void> {
    if (loadedFor === userId) return
    loadedFor = userId
    current.value = null
    checked.value = false
    tookVisit.value = false
    answeredThisVisit.value = false
    offerThisVisit.value = false
    await read(userId)
}

/** Reads again when nothing is live, at most once a minute. */
export async function refreshAnnouncement(): Promise<void> {
    const userId = loadedFor
    const live = current.value && Date.now() < current.value.endsAt
    if (!userId || live || Date.now() - lastRead < RECHECK_MS) return
    await read(userId)
}

async function read(userId: string): Promise<void> {
    lastRead = Date.now()
    let row: LiveRow | null = null
    try {
        const { data, error } = await supabase.rpc('live_announcement')
        row = (error ? null : (data as LiveRow[] | null)?.[0]) ?? null
    } catch {
        row = null
    }
    // Signed into another account while this was in flight: that read wins.
    if (loadedFor !== userId) return
    current.value = row ? fromRow(row) : null
    offerThisVisit.value = !answeredThisVisit.value && shouldOffer(current.value, false)
    checked.value = true
}

function fromRow(r: LiveRow): Announcement {
    const skew = Date.parse(r.server_now) - Date.now()
    return {
        id: r.id,
        eyebrow: r.eyebrow,
        hero: r.hero,
        heroTitle: r.hero_title,
        heroNote: r.hero_note,
        body: r.body,
        imagePath: r.image_path,
        imageCaption: r.image_caption,
        buttonLabel: r.button_label,
        pointsMultiplier: r.points_multiplier,
        endsAt: Date.parse(r.ends_at) - skew,
        joined: r.joined,
        skips: r.skips,
    }
}

export type AnswerResult = 'joined' | 'skipped' | 'closed' | 'error'

/** Records the answer on the server; the local copy follows what the server said. */
async function answer(join: boolean): Promise<AnswerResult> {
    const a = current.value
    if (!a) return 'closed'
    try {
        const { data, error } = await supabase.rpc('answer_announcement', { p_id: a.id, p_join: join })
        if (error) return 'error'
        if (data === 'joined') current.value = { ...a, joined: true }
        else if (data === 'skipped') current.value = { ...a, skips: a.skips + 1 }
        return data as AnswerResult
    } catch {
        return 'error'
    }
}

/** The modal is done for this visit, whatever the answer was. */
function close(): void {
    answeredThisVisit.value = true
}

/** Multiplier for a game finishing now, for the post-game badge check only. */
export function currentPointsBoost(): number {
    return pointsBoost(current.value, Date.now())
}

export function useAnnouncement() {
    const offered = computed(() => offerThisVisit.value && !answeredThisVisit.value)
    return { current, checked, offered, tookVisit, answer, close }
}
