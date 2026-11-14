/**
 * Two facts per tier on the badges screen. The first is about the part of its medal that makes it,
 * with a line from that part on the 3D medal; the second is how rare the tier is, built from the
 * live badge_holders counts so it never goes stale. `at` is a point in the badge SVG's own 96-unit box.
 */

import { BADGES, POINT_WEIGHTS } from './badges'

export interface BadgeFact { at?: [number, number]; title: string; big?: string; text: string }

const PART_FACTS: Record<number, Required<Pick<BadgeFact, 'at' | 'title' | 'text'>>> = {
    1: { at: [48, 46], title: 'BARE SHIELD', text: "Everyone starts here, with nothing on the shield. What goes on it next is up to you." },
    2: { at: [48, 49], title: 'CROSSED BLADES', text: `Your first weapons. A win is worth ${POINT_WEIGHTS.win} points, so these come quick.` },
    3: { at: [48, 52], title: 'BLUE VISOR', text: 'The first splash of colour on the ladder. People start to notice you at the table.' },
    4: { at: [48, 40], title: 'THREE CLAW MARKS', text: `Clawed into bronze. Just showing up to play adds ${POINT_WEIGHTS.dayPlayed} points a day.` },
    5: { at: [50, 52], title: 'EMBER STRIKE', text: 'Still glowing from the forge. The first medal on the ladder that runs hot.' },
    6: { at: [48, 18], title: 'GOLD CROWN', text: 'Five spikes of gold. This is where the crowns start.' },
    7: { at: [48, 48], title: 'THE EYE', text: 'Teal glass in a gold lid. It sees every card you hold.' },
    8: { at: [48, 25], title: 'VIOLET GEM', text: 'A cut stone above the blade. Most players never get close enough to see it.' },
    9: { at: [48, 49], title: 'AMETHYST HEART', text: "A crystal split clean down the middle. That's all the mercy left in it." },
    10: { at: [48, 19], title: 'THE CROWN PEARL', text: "One pearl in the king's crown. Kings don't share." },
    11: { at: [48, 50], title: 'STEEL HELM', text: "A closed visor. Tyrants don't show their face at the table." },
    12: { at: [34, 36], title: 'TWIN CLEAVERS', text: 'Two cleavers crossed over a red field. Not a subtle badge.' },
    13: { at: [72, 25], title: 'BONE HORNS', text: 'Real horn, not metal. From here up, the medals stop looking polite.' },
    14: { at: [75, 31], title: 'STEEL WINGS', text: "The helm grows wings. Everyone at the table knows what's coming." },
    15: { at: [48, 50], title: 'IRON BALL', text: 'A spiked iron ball on a chain. It does exactly what it looks like.' },
    16: { at: [48, 42], title: 'HOLLOW HELM', text: "A ghost-white helm over a teal field, and nobody inside it." },
    17: { at: [48, 52], title: 'THE SCYTHE', text: 'A steel blade ground to a fine edge. It comes for every hand.' },
    18: { at: [34, 11], title: 'TWIN FLAMES', text: 'The only fire on the whole ladder, and it never goes out.' },
    19: { at: [48, 65], title: 'THREE STONES', text: 'Red, blue and red, set into purple. The last thing your opponents see.' },
    20: { at: [48, 29], title: 'BLOOD RUBY', text: 'One ruby in a golden helm, at the very top of the ladder.' },
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
    const title = 'WHO HAS IT'
    const at = RARITY_AT[tier]
    if (n === 0) facts.push({ at, title, big: 'Nobody yet', text: 'No one has made it this far. The first one gets the bragging rights.' })
    else if (n === 1) facts.push({ at, title, big: '1 player', text: 'Just one player in the whole game has this.' })
    else {
        const ratio = Math.round(holders.total / n)
        facts.push(ratio <= 1
            ? { at, title, big: `${n.toLocaleString()} players`, text: 'have made it this far.' }
            : { at, title, big: `1 in ${ratio.toLocaleString()}`, text: 'players ever get this far.' })
    }
    return facts
}
