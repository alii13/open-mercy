import { createApp } from 'vue'
import { createPinia } from 'pinia'
import gsap from 'gsap'
import { CSSPlugin } from 'gsap/CSSPlugin'
import './style.css'
import App from './App.vue'
import { vFocusRing } from './directives/focusRing'
import { registerMcpTools } from './mcp/registerTools'

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

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.directive('focus-ring', vFocusRing)
app.mount('#app')

// Expose the game as WebMCP tools so a visiting agent can play a real seat.
registerMcpTools(pinia)
