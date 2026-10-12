/**
 * Tier (1-20) → emblem SVG asset URL. The SVGs are self-contained (each with
 * its own gradients/filters), so they're used as isolated background images
 * rather than inlined - that sidesteps the id collisions that inlining many of
 * them on one page would cause.
 */

import t1 from '../assets/badges/01-recruit.svg'
import t2 from '../assets/badges/02-scrapper.svg'
import t3 from '../assets/badges/03-enforcer.svg'
import t4 from '../assets/badges/04-savage.svg'
import t5 from '../assets/badges/05-brute.svg'
import t6 from '../assets/badges/06-warlord.svg'
import t7 from '../assets/badges/07-overlord.svg'
import t8 from '../assets/badges/08-executioner.svg'
import t9 from '../assets/badges/09-merciless.svg'
import t10 from '../assets/badges/10-no-mercy-king.svg'
import t11 from '../assets/badges/11-tyrant.svg'
import t12 from '../assets/badges/12-butcher.svg'
import t13 from '../assets/badges/13-dreadlord.svg'
import t14 from '../assets/badges/14-harbinger.svg'
import t15 from '../assets/badges/15-annihilator.svg'
import t16 from '../assets/badges/16-wraith.svg'
import t17 from '../assets/badges/17-reaper.svg'
import t18 from '../assets/badges/18-doombringer.svg'
import t19 from '../assets/badges/19-apocalypse.svg'
import t20 from '../assets/badges/20-god-of-no-mercy.svg'

export const BADGE_ART: Record<number, string> = {
    1: t1, 2: t2, 3: t3, 4: t4, 5: t5, 6: t6, 7: t7, 8: t8, 9: t9, 10: t10,
    11: t11, 12: t12, 13: t13, 14: t14, 15: t15, 16: t16, 17: t17, 18: t18, 19: t19, 20: t20,
}
