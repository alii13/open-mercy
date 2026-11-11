import { describe, expect, it } from 'vitest'
import alltime from '../../../../supabase/leaderboards-alltime.sql?raw'
import alltimeRanks from '../../../../supabase/alltime-ranks.sql?raw'
import badges from '../../../../supabase/badges.sql?raw'
import dossier from '../../../../supabase/profile-dossier.sql?raw'
import prestige from '../../../../supabase/badges-prestige.sql?raw'
import pages from '../../../../supabase/profile-pages.sql?raw'

// The walkover guard exists because a multiplayer game everyone left records a
// near-zero card count. A bot never leaves, so every copy of the guard has to
// let bot games through, or a quick win against a bot scores nothing.
const files = {
    'leaderboards-alltime.sql': alltime,
    'alltime-ranks.sql': alltimeRanks,
    'badges.sql': badges,
    'profile-dossier.sql': dossier,
    'badges-prestige.sql': prestige,
    'profile-pages.sql': pages,
}

describe('the SQL walkover guard', () => {
    it.each(Object.entries(files))('lets every bot game count in %s', (_, sql) => {
        const guards = sql.match(/cards_played_total >= 5/g) ?? []
        const botAware = sql.match(/\((\w+\.)?is_bot_game or \1cards_played_total >= 5\)/g) ?? []
        expect(guards.length).toBeGreaterThan(0)
        expect(botAware.length).toBe(guards.length)
    })
})
