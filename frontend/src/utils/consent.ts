// Reopens Google's consent message (the AdSense Privacy & messaging CMP) so a
// visitor can change or withdraw consent. The callback queue lets this work
// even when the CMP script has not finished loading.
type FundingChoicesCallback = (() => void) | { CONSENT_DATA_READY: () => void }
type FundingChoicesWindow = {
    googlefc?: { callbackQueue?: FundingChoicesCallback[]; showRevocationMessage?: () => void }
}

export function openPrivacySettings(win: FundingChoicesWindow = window as FundingChoicesWindow): void {
    const fc = (win.googlefc = win.googlefc || {})
    fc.callbackQueue = fc.callbackQueue || []
    fc.callbackQueue.push(() => fc.showRevocationMessage?.())
}

// Google's script defines showRevocationMessage only where a consent message
// runs (EEA, UK, Switzerland). Elsewhere a "Privacy settings" button would
// call nothing, so the footer shows it only once this resolves true. If the
// script never loads, this never resolves and the button stays hidden.
export function privacySettingsAvailable(win: FundingChoicesWindow = window as FundingChoicesWindow): Promise<boolean> {
    return new Promise(resolve => {
        const fc = (win.googlefc = win.googlefc || {})
        fc.callbackQueue = fc.callbackQueue || []
        fc.callbackQueue.push({ CONSENT_DATA_READY: () => resolve(typeof fc.showRevocationMessage === 'function') })
    })
}
