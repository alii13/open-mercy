import { beforeEach, describe, expect, it, vi } from 'vitest'

const fakeStorage = {
    store: {} as Record<string, string>,
    getItem(k: string) { return this.store[k] ?? null },
    setItem(k: string, v: string) { this.store[k] = v },
    removeItem(k: string) { delete this.store[k] },
}
vi.stubGlobal('localStorage', fakeStorage)

import { markReminderAnswered, markReminderAsked, needsHomeScreen, reminderAskKind, shouldAskReminder } from '../reminderAsk'

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

const IPHONE_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
const IPHONE_15 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 15_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1'
const IPAD_DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36'

describe('needsHomeScreen', () => {
    it('is true for an iPhone or iPad tab on iOS 16.4 or later', () => {
        expect(needsHomeScreen({ userAgent: IPHONE_17, maxTouchPoints: 5 })).toBe(true)
        expect(needsHomeScreen({ userAgent: IPAD_DESKTOP, maxTouchPoints: 5 })).toBe(true)
    })

    it('is false where adding to the home screen would not help, or already happened', () => {
        expect(needsHomeScreen({ userAgent: IPHONE_15, maxTouchPoints: 5 })).toBe(false)
        expect(needsHomeScreen({ userAgent: IPAD_DESKTOP, maxTouchPoints: 0 })).toBe(false)
        expect(needsHomeScreen({ userAgent: ANDROID, maxTouchPoints: 5 })).toBe(false)
        expect(needsHomeScreen({ userAgent: IPHONE_17, maxTouchPoints: 5, standalone: true })).toBe(false)
    })

    it('is false inside an app\'s own browser, which has no Add to Home Screen', () => {
        for (const app of ['Instagram 312.0.0', 'FBAN/FBIOS;FBAV/450.0', 'musical_ly_34.1 BytedanceWebview', 'Line/13.0.0']) {
            expect(needsHomeScreen({ userAgent: `${IPHONE_17} ${app}`, maxTouchPoints: 5 })).toBe(false)
        }
    })
})

describe('reminderAskKind', () => {
    it('asks where push works, explains the home screen on an iPhone tab, and says nothing elsewhere', () => {
        expect(reminderAskKind('default', false)).toBe('ask')
        expect(reminderAskKind(null, true)).toBe('ios')
        expect(reminderAskKind(null, false)).toBeNull()
        expect(reminderAskKind('denied', false)).toBeNull()
    })

    it('shares the three-asks budget and the answered flag', () => {
        markReminderAnswered()
        expect(reminderAskKind(null, true)).toBeNull()
    })
})
