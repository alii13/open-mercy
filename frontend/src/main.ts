import { createApp } from 'vue'
import { createPinia } from 'pinia'
import gsap from 'gsap'
import { CSSPlugin } from 'gsap/CSSPlugin'
import './style.css'
import App from './App.vue'
import { vFocusRing } from './directives/focusRing'
import { router } from './utils/routes'

// CSSPlugin must be explicitly registered under Vite tree-shaking — without it
// every x/y/opacity/scale tween logs "Missing plugin?" warnings and no-ops.
// Flip and MotionPath register where the game uses them, so the landing
// page doesn't download them.
gsap.registerPlugin(CSSPlugin)

// Global reduced-motion guard. When prefers-reduced-motion: reduce is set
// (or the user toggles motion off in our settings drawer), shrink every
// GSAP duration to ~0 so animations effectively jump-cut instead of moving.
// This avoids having to wrap every individual gsap.to() call in code.
const motionMatcher = window.matchMedia('(prefers-reduced-motion: reduce)')
function applyMotionPreference(reduced: boolean) {
    gsap.defaults({ duration: reduced ? 0.001 : undefined })
}
applyMotionPreference(motionMatcher.matches)
motionMatcher.addEventListener?.('change', (e) => applyMotionPreference(e.matches))
// Also listen for our own manual override (set by the settings drawer).
window.addEventListener('uno:motion-override', ((e: CustomEvent<{ reduced: boolean }>) => {
    applyMotionPreference(e.detail.reduced)
}) as EventListener)

// The manifest (public/manifest.webmanifest) exists so iPhones can get push
// from a home-screen app. It also makes Chrome offer its own install banner;
// that is a separate decision, so it stays off.
window.addEventListener('beforeinstallprompt', (e) => e.preventDefault())

// A tab opened before a deploy asks for chunk names the new deploy no longer
// has. Reload only when the server now has a different build: a chunk broken
// in this build stays broken after a reload, so it is left to fail, never loop.
window.addEventListener('vite:preloadError', () => {
    const entry = document.querySelector('script[type="module"][src]')?.getAttribute('src')
    void fetch('/', { cache: 'no-store' })
        .then((r) => r.text())
        .then((html) => { if (entry && !html.includes(entry)) location.reload() })
        .catch(() => { /* offline: no newer build to reach */ })
})

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.directive('focus-ring', vFocusRing)
// Mount on the resolved first route, so App.vue never reads the placeholder start location.
void router.isReady().then(() => app.mount('#app'))

// Expose the game as WebMCP tools so a visiting agent can play a real seat.
void import('./mcp/registerTools')
    .then(({ registerMcpTools }) => registerMcpTools(pinia))
    .catch((err) => console.warn('agent tools failed to load', err))
