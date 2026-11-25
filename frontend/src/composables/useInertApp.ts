/**
 * While a modal or sheet is open, the page behind it is inert: Tab, clicks
 * and screen readers stay inside the overlay. Overlays are teleported to
 * <body>, outside #app, so marking #app inert never freezes the overlay
 * itself. Do not use this from an overlay that renders inside #app.
 *
 * Counted, because overlays stack (a confirm over the account modal): the
 * page wakes only when the last one closes.
 */

import { onBeforeUnmount, watch } from 'vue'

let holds = 0

function setAppInert(on: boolean): void {
    const app = document.getElementById('app')
    if (app) app.inert = on
}

/** Make the page behind inert; call the returned function once to let go. */
export function holdAppInert(): () => void {
    holds++
    setAppInert(true)
    let released = false
    return () => {
        if (released) return
        released = true
        holds = Math.max(0, holds - 1)
        if (holds === 0) setAppInert(false)
    }
}

/**
 * For an overlay component: holds the page inert while `active()` is true and
 * the component is mounted. Call it before the component's own unmount hooks,
 * so the page is awake again by the time focus goes back to the opener.
 */
export function useInertApp(active: () => boolean = () => true): void {
    let release: (() => void) | null = null
    watch(active, (on) => {
        if (on && !release) release = holdAppInert()
        else if (!on && release) { release(); release = null }
    }, { immediate: true })
    onBeforeUnmount(() => { release?.(); release = null })
}
