// Reopens Google's consent message (the AdSense Privacy & messaging CMP) so a
// visitor can change or withdraw consent. The callback queue lets this work
// even when the CMP script has not finished loading.
export function openPrivacySettings(win: any = window): void {
    win.googlefc = win.googlefc || {}
    win.googlefc.callbackQueue = win.googlefc.callbackQueue || []
    win.googlefc.callbackQueue.push(() => win.googlefc.showRevocationMessage())
}
