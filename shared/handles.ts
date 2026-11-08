/**
 * A distinct, on-theme handle so blank-nickname guests don't all read as
 * "Player". Shared with the game server, whose house players take their names
 * from the same words so they read like any other guest at the table.
 */
const ADJECTIVES = ['Red', 'Toxic', 'Savage', 'Brutal', 'Wild', 'Rogue', 'Feral', 'Grim', 'Vicious', 'Reckless', 'Ruthless', 'Lethal']
const NOUNS = ['Fox', 'Wolf', 'Viper', 'Hawk', 'Shark', 'Raven', 'Cobra', 'Jackal', 'Reaper', 'Bandit', 'Phantom', 'Joker']

export function randomHandle(rng: () => number = Math.random): string {
    const a = ADJECTIVES[Math.floor(rng() * ADJECTIVES.length)]
    const n = NOUNS[Math.floor(rng() * NOUNS.length)]
    return `${a}${n}${Math.floor(rng() * 9000 + 1000)}`
}
