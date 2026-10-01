// Reopens Google's consent message (the AdSense Privacy & messaging CMP) so a
// visitor can change or withdraw consent. The callback queue lets this work
// even when the CMP script has not finished loading.
type FundingChoicesWindow = {
    googlefc?: { callbackQueue?: Array<() => void>; showRevocationMessage?: () => void }
}

export function openPrivacySettings(win: FundingChoicesWindow = window as FundingChoicesWindow): void {
    const fc = (win.googlefc = win.googlefc || {})
    fc.callbackQueue = fc.callbackQueue || []
    fc.callbackQueue.push(() => fc.showRevocationMessage?.())
}
