/**
 * Two facts per tier on the badges screen. The first is about the part of its medal that makes it,
 * with a line from that part on the 3D medal; the second is how rare the tier is, built from the
 * live badge_holders counts so it never goes stale. `at` is a point in the badge SVG's own 96-unit box.
 */

import { BADGES, POINT_WEIGHTS } from './badges'

export interface BadgeFact { at?: [number, number]; title: string; big?: string; text: string }

const PART_FACTS: Record<number, Required<Pick<BadgeFact, 'at' | 'title' | 'text'>>> = {
    1: { at: [48, 46], title: 'IRON DIAMOND', text: 'Blank on purpose. Every player starts with nothing on the shield.' },
    2: { at: [48, 49], title: 'CROSSED BLADES', text: `Your first weapons. A win is worth ${POINT_WEIGHTS.win} points.` },
    3: { at: [48, 52], title: 'BLUE VISOR', text: 'The first enamel on the ladder.' },
    4: { at: [48, 40], title: 'THREE CLAW MARKS', text: `Scored deep into bronze. Every day you play adds ${POINT_WEIGHTS.dayPlayed} points.` },
    5: { at: [50, 52], title: 'EMBER STRIKE', text: 'The first metal on the ladder that still glows from the forge.' },
    6: { at: [48, 18], title: 'GOLD CROWN', text: 'Five points of gold. The first crown on the ladder.' },
    7: { at: [48, 48], title: 'THE EYE', text: 'Teal glass in a gold lid. It watches every hand.' },
    8: { at: [48, 25], title: 'VIOLET GEM', text: 'A cut stone set above the blade.' },
    9: { at: [48, 49], title: 'AMETHYST HEART', text: 'A crystal split down the middle by the blade.' },
    10: { at: [48, 19], title: 'THE CROWN PEARL', text: "A single pearl set in the king's crown." },
    11: { at: [48, 50], title: 'STEEL HELM', text: "A closed visor. Tyrants don't show their face." },
    12: { at: [34, 36], title: 'TWIN CLEAVERS', text: 'Two steel cleavers crossed over a red field.' },
    13: { at: [72, 25], title: 'BONE HORNS', text: 'Real horn, not metal. The first bone on the ladder.' },
    14: { at: [75, 31], title: 'STEEL WINGS', text: 'The helm grows wings.' },
    15: { at: [48, 50], title: 'IRON BALL', text: 'A spiked iron ball on a chain.' },
    16: { at: [48, 42], title: 'HOLLOW HELM', text: 'A ghost-white helm over a teal field.' },
    17: { at: [48, 52], title: 'THE SCYTHE', text: 'A steel blade, ground to an edge.' },
    18: { at: [34, 11], title: 'TWIN FLAMES', text: 'The only fire on the ladder. It still burns.' },
    19: { at: [48, 65], title: 'THREE STONES', text: 'Red, blue and red, set into the purple field.' },
    20: { at: [48, 29], title: 'BLOOD RUBY', text: 'A single ruby in a golden helm.' },
}

/** Where the rarity fact's line lands on each medal: the part of the art the lab placed it on. */
const RARITY_AT: Record<number, [number, number]> = {
    2: [58, 72], 3: [64, 24], 4: [48, 68], 5: [68, 30], 6: [60, 64], 7: [62, 66], 8: [60, 66], 9: [66, 30], 10: [48, 75],
    11: [69, 80], 12: [48, 70], 13: [48, 47], 14: [48, 72], 15: [64, 70], 16: [62, 70], 17: [64, 68], 18: [48, 50],
    19: [42, 43], 20: [85, 32],
}

export type Holders = { byTier: Record<number, number>; total: number } | null

export function badgeFacts(tier: number, holders: Holders): BadgeFact[] {
    const facts: BadgeFact[] = [PART_FACTS[tier]!]
    const badge = BADGES[tier - 1]
    if (!badge || tier === 1 || !holders?.total) return facts
    const n = holders.byTier[tier] ?? 0
    const points = `${badge.threshold.toLocaleString()} points`
    const title = `REACH ${badge.title.toUpperCase()}`
    const at = RARITY_AT[tier]
    if (n === 0) facts.push({ at, title, big: 'Nobody yet', text: `No player has reached ${points}.` })
    else if (n === 1) facts.push({ at, title, big: '1 player', text: `One player has reached ${points}.` })
    else {
        const ratio = Math.round(holders.total / n)
        facts.push(ratio <= 1
            ? { at, title, big: `${n.toLocaleString()} players`, text: `have reached ${points}.` }
            : { at, title, big: `1 in ${ratio.toLocaleString()}`, text: `players have reached ${points}.` })
    }
    return facts
}
