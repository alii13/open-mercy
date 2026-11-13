import { describe, expect, it, vi } from 'vitest'

async function appAnalyticsIn(country: string | null) {
    const setConsent = vi.fn(() => Promise.resolve())
    vi.resetModules()
    vi.doMock('@capacitor/core', () => ({
        Capacitor: { isNativePlatform: () => true },
        registerPlugin: () => ({ setConsent }),
    }))
    vi.doMock('../country', () => ({ detectedCountry: () => Promise.resolve(country) }))
    await import('../analytics')
    await new Promise(r => setTimeout(r, 0))
    return setConsent
}

describe('analytics consent in the iOS and Android apps', () => {
    // The website keeps analytics cookieless in the EEA, UK and Switzerland and
    // asks nobody. The apps start with analytics storage denied, so they must
    // grant it outside those regions and nowhere else.
    it('grants analytics storage only outside the EEA, UK and Switzerland', async () => {
        expect(await appAnalyticsIn('IN')).toHaveBeenCalledWith({ type: 'ANALYTICS_STORAGE', status: 'GRANTED' })
        expect(await appAnalyticsIn('DE')).not.toHaveBeenCalled()
        expect(await appAnalyticsIn(null)).not.toHaveBeenCalled()
    })
})
