import { describe, expect, it, vi } from 'vitest'

describe('reminders in the iOS app', () => {
    // The app's web view has no web push and the app is already installed, so
    // telling its players to "tap Share, then Add to Home Screen" is wrong, and
    // App Review rejects an app that points people at its website's install path.
    it('never shows the iPhone home-screen note', async () => {
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
            'Mozilla/5.0 (iPhone; CPU iPhone OS 26_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
        )
        vi.resetModules()
        vi.doMock('@capacitor/core', () => ({ Capacitor: { isNativePlatform: () => true } }))
        vi.doMock('../../utils/analytics', () => ({ track: () => {} }))

        const { reminderNeedsHomeScreen } = await import('../useReminders')

        expect(reminderNeedsHomeScreen).toBe(false)
    })
})
