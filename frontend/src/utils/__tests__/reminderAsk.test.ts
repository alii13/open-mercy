import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakeStorage = {
    store: {} as Record<string, string>,
    getItem(k: string) { return this.store[k] ?? null },
    setItem(k: string, v: string) { this.store[k] = v },
    removeItem(k: string) { delete this.store[k] },
}
vi.stubGlobal('localStorage', fakeStorage)

import { markReminderAnswered, markReminderAsked, shouldAskReminder } from '../reminderAsk'

beforeEach(() => { fakeStorage.store = {} })

describe('shouldAskReminder', () => {
    it('asks a browser that can take reminders and has not been asked', () => {
        expect(shouldAskReminder('default')).toBe(true)
    })

    it('never asks where push is missing, or once the browser has an answer', () => {
        expect(shouldAskReminder(null)).toBe(false)
        expect(shouldAskReminder('granted')).toBe(false)
        expect(shouldAskReminder('denied')).toBe(false)
    })

    it('gives up after three game-overs without an answer', () => {
        markReminderAsked()
        markReminderAsked()
        expect(shouldAskReminder('default')).toBe(true)
        markReminderAsked()
        expect(shouldAskReminder('default')).toBe(false)
    })

    it('stops for good once the player answers', () => {
        markReminderAnswered()
        expect(shouldAskReminder('default')).toBe(false)
    })
})
