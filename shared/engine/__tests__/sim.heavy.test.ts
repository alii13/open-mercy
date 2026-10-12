/**
 * Bot difficulty measurement: the fixed reference player (sim.ts) against
 * every rung. Skipped in CI — the lookahead rungs make it minutes of CPU.
 * Run from frontend/:
 *
 *   BOT_SIM=1 npx vitest run --disableConsoleIntercept ../shared/engine/__tests__/sim.heavy.test.ts
 *
 * Optional env: BOT_SIM_GAMES (default 4000 per bot), BOT_SIM_BOTS (comma
 * ids), BOT_SIM_SEED (first seed, default 1 — split a big run across
 * processes with disjoint seed ranges).
 */
import { describe, it } from 'vitest'
import { BOT_LADDER } from '../bot'
import { simulateMatchup } from '../sim'

/**
 * Reference win rate against each rung before the sharp policy and lookahead
 * (20,000 games per bot, seeds 1..20000, official stacking).
 */
const BASELINE_P: Record<string, number> = {
    scrap: 0.6750, pilot: 0.6683, vera: 0.6643, rook: 0.6453,
    marla: 0.6318, kobra: 0.6200, zenith: 0.6286, terminator: 0.6117,
}

const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {}
const odds = (p: number) => p / (1 - p)

describe.skipIf(!env.BOT_SIM)('bot difficulty (reference player vs each rung)', () => {
    it('prints reference win rate and odds ratio per bot', () => {
        const games = Number(env.BOT_SIM_GAMES ?? 4000)
        const seed = Number(env.BOT_SIM_SEED ?? 1)
        const only = env.BOT_SIM_BOTS?.split(',')
        const rows: string[] = []
        for (const bot of BOT_LADDER) {
            if (only && !only.includes(bot.id)) continue
            const r = simulateMatchup(bot, games, seed)
            const base = BASELINE_P[bot.id]
            const ratio = base ? (odds(base) / odds(r.p)).toFixed(2) : '-'
            rows.push(`${bot.id.padEnd(11)} p=${r.p.toFixed(4)} ±${r.ci95.toFixed(4)} p_old=${base?.toFixed(4) ?? '-'} oddsRatio=${ratio} refWins=${r.referenceWins} botWins=${r.botWins} unfinished=${r.unfinished}`)
        }
        console.log(`\nSIMRESULT\n${rows.join('\n')}`)
    }, 24 * 3600_000)
})
