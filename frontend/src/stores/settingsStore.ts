/**
 * Single source of truth for user preferences that span the whole app.
 *
 * Keeps SFX / music settings in step with their existing composables (which
 * also persist independently — this store mirrors what's authoritative there
 * so the settings drawer can show consistent state). Adds a manual motion
 * override so users can opt INTO reduced motion even if the OS isn't.
 *
 * Persisted under `uno_settings_v1` in localStorage.
 */

import { defineStore } from 'pinia'
import { ref, watch, computed } from 'vue'
import { soundEffects } from '../composables/useSoundEffects'
import { music } from '../composables/useMusic'

const STORAGE_KEY = 'uno_settings_v1'

interface PersistedSettings {
    motionOverride: 'auto' | 'reduce'  // 'auto' = follow OS, 'reduce' = force reduce
}

function loadSettings(): PersistedSettings {
    try {
        const raw = localStorage.getItem(STORAGE_KEY)
        if (!raw) return { motionOverride: 'auto' }
        const parsed = JSON.parse(raw) as Partial<PersistedSettings>
        return {
            motionOverride: parsed.motionOverride === 'reduce' ? 'reduce' : 'auto',
        }
    } catch {
        return { motionOverride: 'auto' }
    }
}

function saveSettings(s: PersistedSettings): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
    } catch { /* noop */ }
}

export const useSettingsStore = defineStore('settings', () => {
    const isOpen = ref(false)
    const initial = loadSettings()
    const motionOverride = ref<'auto' | 'reduce'>(initial.motionOverride)

    // Effective reduced-motion state: respects OS unless the user has
    // forced 'reduce' in our drawer. One MediaQueryList for both the initial
    // read and the listener, so the handle stays removable.
    const motionQuery = typeof window !== 'undefined'
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : null
    const osPrefersReduced = ref(motionQuery?.matches ?? false)
    motionQuery?.addEventListener?.('change', (e) => {
        osPrefersReduced.value = e.matches
    })

    const reducedMotion = computed(() => motionOverride.value === 'reduce' || osPrefersReduced.value)

    // Propagate the effective preference to GSAP via the global listener
    // wired in main.ts.
    watch(reducedMotion, (reduced) => {
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('uno:motion-override', { detail: { reduced } }))
        }
    }, { immediate: true })

    watch(motionOverride, (v) => {
        saveSettings({ motionOverride: v })
    })

    function open() {
        isOpen.value = true
    }

    function close() {
        isOpen.value = false
    }

    function toggle() {
        isOpen.value = !isOpen.value
    }

    function setMotionOverride(v: 'auto' | 'reduce') {
        motionOverride.value = v
    }

    // Convenience proxies — the settings UI binds to these instead of
    // having to import every individual composable.
    function setSfxVolume(v: number) { soundEffects.setVolume(v) }
    function setMusicVolume(v: number) { music.setVolume(v) }
    function toggleSfxMute() { soundEffects.toggleMute() }
    function toggleMusicMute() { music.toggleMute() }

    return {
        isOpen,
        motionOverride,
        reducedMotion,
        osPrefersReduced,
        open,
        close,
        toggle,
        setMotionOverride,
        setSfxVolume,
        setMusicVolume,
        toggleSfxMute,
        toggleMusicMute,
    }
})
