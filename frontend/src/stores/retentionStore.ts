/**
 * Lifetime stats + daily streak — localStorage-backed.
 *
 * UNO sessions are short (5-15 min). Without a retention hook, players bounce.
 * This store accumulates a running record of what each player has done across
 * sessions, displays it on the landing page so they see growth, and tracks a
 * daily streak that rewards coming back.
 *
 * Schema is versioned (uno_retention_v1) so we can migrate later.
 *
 * The store DOES NOT track per-game in-flight stats — those live in
 * gameStore.playerStats and multiplayerStore.mpStats. This store is fed once
 * per finished game via recordGameResult(), and that's the only mutation point.
 */

import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import { afterGame, liveStreak, shieldReady as shieldIsReady, type StreakState } from '@streak'

const STORAGE_KEY = 'uno_retention_v1'

export interface GameResult {
    won: boolean
    cardsPlayed: number
    biggestStackSurvived: number
    unoCalls: number
    peakHand: number
    mode: 'sp' | 'mp'
}

interface PersistedRetention {
    gamesPlayed: number
    gamesWon: number
    totalCardsPlayed: number
    totalUnos: number
    biggestStackEver: number
    peakHandEver: number
    currentStreak: number
    longestStreak: number
    lastPlayedDate: string | null  // YYYY-MM-DD in local tz
    /** The day the weekly shield last carried the streak over a missed day. */
    shieldUsedOn: string | null
    /** Local hours of the last few finished games; the reminder goes out at the usual one. */
    playHours: number[]
}

const PLAY_HOURS_KEPT = 10

function emptyState(): PersistedRetention {
    return {
        gamesPlayed: 0,
        gamesWon: 0,
        totalCardsPlayed: 0,
        totalUnos: 0,
        biggestStackEver: 0,
        peakHandEver: 0,
        currentStreak: 0,
        longestStreak: 0,
        lastPlayedDate: null,
        shieldUsedOn: null,
        playHours: [],
    }
}

function loadState(): PersistedRetention {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return emptyState()
        const parsed = JSON.parse(raw) as Partial<PersistedRetention>
        return { ...emptyState(), ...parsed }
    } catch {
        return emptyState()
    }
}

function saveState(s: PersistedRetention): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch { /* localStorage disabled or quota */ }
}

function todayDate(): string {
    // YYYY-MM-DD in local timezone so streaks line up with the player's day.
    const d = new Date()
    const y = d.getFullYear()
    const m = String(d.getMonth() + 1).padStart(2, '0')
    const day = String(d.getDate()).padStart(2, '0')
    return `${y}-${m}-${day}`
}

/** The most frequent hour; a tie goes to the most recent. */
function mostCommonHour(hours: number[]): number | null {
    let best: number | null = null
    let bestCount = 0
    for (let i = hours.length - 1; i >= 0; i--) {
        const count = hours.filter(h => h === hours[i]).length
        if (count > bestCount) { best = hours[i]!; bestCount = count }
    }
    return best
}

export const useRetentionStore = defineStore('retention', () => {
    const initial = loadState()
    const gamesPlayed = ref(initial.gamesPlayed)
    const gamesWon = ref(initial.gamesWon)
    const totalCardsPlayed = ref(initial.totalCardsPlayed)
    const totalUnos = ref(initial.totalUnos)
    const biggestStackEver = ref(initial.biggestStackEver)
    const peakHandEver = ref(initial.peakHandEver)
    const currentStreak = ref(initial.currentStreak)
    const longestStreak = ref(initial.longestStreak)
    const lastPlayedDate = ref<string | null>(initial.lastPlayedDate)
    const shieldUsedOn = ref<string | null>(initial.shieldUsedOn)
    const playHours = ref<number[]>(initial.playHours)

    const streakState = (): StreakState => ({
        streak: currentStreak.value, lastPlayed: lastPlayedDate.value, shieldUsedOn: shieldUsedOn.value,
    })

    const winRate = computed(() => {
        if (gamesPlayed.value === 0) return 0
        return Math.round((gamesWon.value / gamesPlayed.value) * 100)
    })

    // Re-evaluate the streak on read — covers the "checked the page but didn't
    // play" case where the user opens the landing but never finishes a game.
    // Older than yesterday is broken, unless the weekly shield is holding it.
    const effectiveStreak = computed(() => liveStreak(streakState(), todayDate()).streak)
    const shieldHolding = computed(() => liveStreak(streakState(), todayDate()).holding)
    const shieldReady = computed(() => shieldIsReady(streakState(), todayDate()))
    const usualHour = computed(() => mostCommonHour(playHours.value))

    // Drives the lobby nudge: a live streak that hasn't been fed today is at
    // risk, and saying so is the whole retention mechanic.
    const playedToday = computed(() => lastPlayedDate.value === todayDate())

    // Persist on any change.
    watch(
        [gamesPlayed, gamesWon, totalCardsPlayed, totalUnos, biggestStackEver,
            peakHandEver, currentStreak, longestStreak, lastPlayedDate, shieldUsedOn, playHours],
        () => {
            saveState({
                gamesPlayed: gamesPlayed.value,
                gamesWon: gamesWon.value,
                totalCardsPlayed: totalCardsPlayed.value,
                totalUnos: totalUnos.value,
                biggestStackEver: biggestStackEver.value,
                peakHandEver: peakHandEver.value,
                currentStreak: currentStreak.value,
                longestStreak: longestStreak.value,
                lastPlayedDate: lastPlayedDate.value,
                shieldUsedOn: shieldUsedOn.value,
                playHours: playHours.value,
            })
        }
    )

    function recordGameResult(result: GameResult): void {
        gamesPlayed.value += 1
        if (result.won) gamesWon.value += 1
        totalCardsPlayed.value += result.cardsPlayed
        totalUnos.value += result.unoCalls
        if (result.biggestStackSurvived > biggestStackEver.value) {
            biggestStackEver.value = result.biggestStackSurvived
        }
        if (result.peakHand > peakHandEver.value) {
            peakHandEver.value = result.peakHand
        }

        // Streak logic. The "play" counts when a game finishes, not when
        // it starts — so quitting mid-game doesn't pad the streak.
        const next = afterGame(streakState(), todayDate())
        currentStreak.value = next.streak
        lastPlayedDate.value = next.lastPlayed
        shieldUsedOn.value = next.shieldUsedOn
        playHours.value = [...playHours.value, new Date().getHours()].slice(-PLAY_HOURS_KEPT)
        if (currentStreak.value > longestStreak.value) {
            longestStreak.value = currentStreak.value
        }
    }

    function reset(): void {
        const e = emptyState()
        gamesPlayed.value = e.gamesPlayed
        gamesWon.value = e.gamesWon
        totalCardsPlayed.value = e.totalCardsPlayed
        totalUnos.value = e.totalUnos
        biggestStackEver.value = e.biggestStackEver
        peakHandEver.value = e.peakHandEver
        currentStreak.value = e.currentStreak
        longestStreak.value = e.longestStreak
        lastPlayedDate.value = e.lastPlayedDate
        shieldUsedOn.value = e.shieldUsedOn
        playHours.value = e.playHours
    }

    return {
        gamesPlayed,
        gamesWon,
        totalCardsPlayed,
        totalUnos,
        biggestStackEver,
        peakHandEver,
        currentStreak,
        longestStreak,
        lastPlayedDate,
        shieldUsedOn,
        winRate,
        effectiveStreak,
        shieldHolding,
        shieldReady,
        usualHour,
        playedToday,
        recordGameResult,
        reset,
    }
})
