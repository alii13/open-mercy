import { describe, expect, it } from 'vitest'
import alltimeTotals from '../../../../supabase/alltime-score-totals.sql?raw'
import badges from '../../../../supabase/badges.sql?raw'
import badgeHolders from '../../../../supabase/badge-holders.sql?raw'
import badgeDates from '../../../../supabase/badge-dates.sql?raw'
import dossier from '../../../../supabase/profile-dossier.sql?raw'
import prestige from '../../../../supabase/badges-prestige.sql?raw'
import announcements from '../../../../supabase/announcements.sql?raw'

// A game saved during a points announcement carries points_multiplier. Every
// statement that turns games into points has to multiply by it, or a rebuild
// or a badge read quietly drops the bonus the player was promised.
const files = {
    'alltime-score-totals.sql': alltimeTotals,
    'badges.sql': badges,
    'badge-holders.sql': badgeHolders,
    'badge-dates.sql': badgeDates,
    'profile-dossier.sql': dossier,
    'badges-prestige.sql': prestige,
    'announcements.sql': announcements,
}

const withoutComments = (sql: string) => sql.replace(/--.*$/gm, '')
const statements = (sql: string) => withoutComments(sql).split(/\n(?=create or replace function|insert into)/)
const scoresGames = (statement: string) => /(\* 100\b|then 100\b)/.test(statement)

describe('the SQL points multiplier', () => {
    it.each(Object.entries(files))('is applied by every points statement in %s', (_, sql) => {
        const scoring = statements(sql).filter(scoresGames)
        expect(scoring.length).toBeGreaterThan(0)
        for (const statement of scoring) expect(statement).toContain('points_multiplier')
    })
})
