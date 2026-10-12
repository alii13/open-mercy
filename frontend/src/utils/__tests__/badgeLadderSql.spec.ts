import { describe, expect, it } from 'vitest'
import { BADGES } from '../badges'
import dossier from '../../../../supabase/profile-dossier.sql?raw'
import prestige from '../../../../supabase/badges-prestige.sql?raw'

// profile_promotions carries the only copy of the ladder outside TypeScript.
// It needs a database to run, so nothing else would notice it falling behind.
function sqlLadder(sql: string): { tier: number, threshold: number }[] {
    const block = sql.slice(sql.indexOf('tiers (tier, threshold) as ('))
    const values = block.slice(0, block.indexOf(')\n    select'))
    return [...values.matchAll(/\((\d+), (\d+)::bigint\)/g)].map(m => ({ tier: Number(m[1]), threshold: Number(m[2]) }))
}

describe('the SQL copy of the badge ladder', () => {
    const ladder = BADGES.map(b => ({ tier: b.tier, threshold: b.threshold }))

    it.each([['profile-dossier.sql', dossier], ['badges-prestige.sql', prestige]])('matches BADGES in %s', (_, sql) => {
        expect(sqlLadder(sql)).toEqual(ladder)
    })
})
