import { describe, it, expect, vi } from 'vitest'
import { openPrivacySettings } from '../consent'

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
