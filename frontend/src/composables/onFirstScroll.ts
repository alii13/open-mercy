const EVENTS = ['scroll', 'wheel', 'touchstart', 'keydown'] as const

/**
 * Runs `fn` once, on the visitor's first scroll, wheel, touch or key press,
 * or right away if the page is already scrolled. Below-the-fold animation
 * setup waits for this so it stays out of the page's startup work. Returns a
 * function that cancels the wait.
 */
export function onFirstScroll(fn: () => void): () => void {
    const stop = () => EVENTS.forEach((e) => window.removeEventListener(e, run))
    function run() {
        stop()
        fn()
    }
    if (window.scrollY > 0) {
        fn()
        return () => {}
    }
    EVENTS.forEach((e) => window.addEventListener(e, run, { passive: true }))
    return stop
}
