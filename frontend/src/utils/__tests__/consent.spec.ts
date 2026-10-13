import { describe, it, expect, vi } from 'vitest'
import { openPrivacySettings, privacySettingsAvailable } from '../consent'

describe('openPrivacySettings', () => {
    it('opens the consent message once the CMP has loaded', () => {
        const showRevocationMessage = vi.fn()
        const win: any = { googlefc: { callbackQueue: [], showRevocationMessage } }

        openPrivacySettings(win)
        win.googlefc.callbackQueue.forEach((cb: () => void) => cb())

        expect(showRevocationMessage).toHaveBeenCalledOnce()
    })

    it('queues the request when the CMP script has not loaded yet', () => {
        const win: any = {}

        openPrivacySettings(win)

        expect(win.googlefc.callbackQueue).toHaveLength(1)
        const showRevocationMessage = vi.fn()
        win.googlefc.showRevocationMessage = showRevocationMessage
        win.googlefc.callbackQueue[0]()
        expect(showRevocationMessage).toHaveBeenCalledOnce()
    })
})

describe('privacySettingsAvailable', () => {
    // Google's script defines showRevocationMessage only where a consent
    // message runs (EEA, UK, Switzerland). Elsewhere the footer button would
    // call nothing, so it must not be shown.
    it('is true once the CMP reports it can show its message here', async () => {
        const win: any = { googlefc: { callbackQueue: [], showRevocationMessage: vi.fn() } }
        const p = privacySettingsAvailable(win)
        win.googlefc.callbackQueue[0].CONSENT_DATA_READY()
        expect(await p).toBe(true)
    })

    it('is false where no consent message applies', async () => {
        const win: any = { googlefc: { callbackQueue: [] } }
        const p = privacySettingsAvailable(win)
        win.googlefc.callbackQueue[0].CONSENT_DATA_READY()
        expect(await p).toBe(false)
    })

    it('queues safely before the CMP script has loaded', async () => {
        const win: any = {}
        const p = privacySettingsAvailable(win)
        win.googlefc.showRevocationMessage = vi.fn()
        win.googlefc.callbackQueue[0].CONSENT_DATA_READY()
        expect(await p).toBe(true)
    })
})
