<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div
        v-if="settings.isOpen"
        class="settings-overlay"
        @click.self="settings.close()"
      >
        <aside class="settings-panel" role="dialog" aria-label="Settings">
          <header class="settings-header">
            <h2>SETTINGS</h2>
            <button
              class="close-btn"
              type="button"
              @click="settings.close()"
              aria-label="Close settings"
            ><X :size="16" :stroke-width="2" aria-hidden="true" /></button>
          </header>

          <div class="settings-body">
            <!-- Audio -->
            <section class="settings-section">
              <h3 class="section-title">AUDIO</h3>

              <div class="row">
                <label class="row-label">SFX</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="sfx.volume.value"
                  @input="onSfxVolume"
                  :disabled="sfx.isMuted.value"
                  aria-label="SFX volume"
                />
                <button
                  class="mute-btn"
                  type="button"
                  :class="{ muted: sfx.isMuted.value }"
                  @click="settings.toggleSfxMute()"
                  :aria-pressed="sfx.isMuted.value"
                  aria-label="Mute SFX"
                >
                  {{ sfx.isMuted.value ? 'OFF' : 'ON' }}
                </button>
              </div>

              <div class="row">
                <label class="row-label">MUSIC</label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  :value="music.volume.value"
                  @input="onMusicVolume"
                  :disabled="music.isMuted.value"
                  aria-label="Music volume"
                />
                <button
                  class="mute-btn"
                  type="button"
                  :class="{ muted: music.isMuted.value }"
                  @click="settings.toggleMusicMute()"
                  :aria-pressed="music.isMuted.value"
                  aria-label="Mute music"
                >
                  {{ music.isMuted.value ? 'OFF' : 'ON' }}
                </button>
              </div>
            </section>

            <!-- Motion -->
            <section class="settings-section">
              <h3 class="section-title">MOTION</h3>
              <div class="segmented" role="radiogroup" aria-label="Motion preference">
                <button
                  type="button"
                  class="seg"
                  :class="{ active: settings.motionOverride === 'auto' }"
                  @click="settings.setMotionOverride('auto')"
                  role="radio"
                  :aria-checked="settings.motionOverride === 'auto'"
                >Auto</button>
                <button
                  type="button"
                  class="seg"
                  :class="{ active: settings.motionOverride === 'reduce' }"
                  @click="settings.setMotionOverride('reduce')"
                  role="radio"
                  :aria-checked="settings.motionOverride === 'reduce'"
                >Reduced</button>
              </div>
              <p class="hint">
                {{ settings.motionOverride === 'auto'
                  ? settings.osPrefersReduced
                    ? 'Following your system setting (currently: reduced).'
                    : 'Following your system setting.'
                  : 'Forced — animations and screen effects disabled.' }}
              </p>
            </section>

            <!-- Help -->
            <section class="settings-section">
              <h3 class="section-title">HELP</h3>
              <button class="help-btn" type="button" @click="showRules = true">
                HOW TO PLAY
              </button>
            </section>

            <!-- About -->
            <section class="settings-section">
              <h3 class="section-title">ABOUT</h3>
              <p class="about-line">
                Built by
                <a href="https://github.com/alii13" target="_blank" rel="noopener noreferrer">alii13</a>
              </p>
              <p class="about-line subtle">
                Music: <a href="https://incompetech.com/" target="_blank" rel="noopener noreferrer">Kevin MacLeod</a>
                · SFX: <a href="https://kenney.nl/assets/casino-audio" target="_blank" rel="noopener noreferrer">Kenney</a>
              </p>
              <p class="about-line subtle">
                <a href="/rules/" target="_blank">Rules guide</a>
                · <a href="https://github.com/alii13/Uno-no-mercy" target="_blank" rel="noopener noreferrer">Source</a>
              </p>
            </section>
          </div>
        </aside>
      </div>
    </Transition>
  </Teleport>

  <RulesModal v-if="showRules" @close="showRules = false" />
</template>

<script setup lang="ts">
import { X } from 'lucide-vue-next'
import { ref } from 'vue'
import { useSettingsStore } from '../stores/settingsStore'
import { soundEffects } from '../composables/useSoundEffects'
import { music as musicComposable } from '../composables/useMusic'
import RulesModal from './RulesModal.vue'

const settings = useSettingsStore()
const showRules = ref(false)
const sfx = soundEffects
const music = musicComposable

function onSfxVolume(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value)
    settings.setSfxVolume(v)
}

function onMusicVolume(e: Event) {
    const v = parseFloat((e.target as HTMLInputElement).value)
    settings.setMusicVolume(v)
}
</script>

<style scoped>
.settings-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.55);
  z-index: 200;
  display: flex;
  justify-content: flex-end;
}

.settings-panel {
  width: 100%;
  max-width: 360px;
  height: 100%;
  background: linear-gradient(180deg, #18191b 0%, #0a0a0b 100%);
  border-left: 1px solid rgba(255, 204, 0, 0.15);
  display: flex;
  flex-direction: column;
  font-family: var(--font-body);
  color: #e6e6e6;
}

.settings-header {
  padding: 1.25rem 1.5rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.settings-header h2 {
  font-family: var(--font-display);
  font-size: 1.5rem;
  letter-spacing: 0.18em;
  margin: 0;
  color: #ffcc00;
}

.close-btn {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-1);
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #e6e6e6;
  width: 32px;
  height: 32px;
  border-radius: 4px;
  font-size: 1.4rem;
  line-height: 1;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.close-btn:hover { border-color: #ff2a2a; color: #ff2a2a; }

.settings-body {
  padding: 1rem 1.5rem 2rem;
  overflow-y: auto;
  flex: 1;
}

.settings-section + .settings-section {
  margin-top: 2rem;
}

.section-title {
  font-size: 0.72rem;
  letter-spacing: 0.35em;
  color: rgba(255, 204, 0, 0.7);
  margin: 0 0 0.75rem;
  text-transform: uppercase;
  font-weight: 500;
  border-bottom: 1px dashed rgba(255, 204, 0, 0.18);
  padding-bottom: 0.4rem;
}

.row {
  display: grid;
  grid-template-columns: 64px 1fr 60px;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

.row-label {
  font-size: 0.72rem;
  letter-spacing: 0.22em;
  color: #a1a1aa;
  text-transform: uppercase;
}

input[type="range"] {
  width: 100%;
  accent-color: #ffcc00;
}
input[type="range"]:disabled { opacity: 0.4; }

.mute-btn {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #e6e6e6;
  font-family: var(--font-body);
  font-size: 0.7rem;
  letter-spacing: 0.18em;
  padding: 0.4rem 0;
  cursor: pointer;
  border-radius: 3px;
  transition: border-color 0.15s, color 0.15s, background 0.15s;
}
.mute-btn:hover { border-color: #ffcc00; color: #ffcc00; }

.help-btn {
  width: 100%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.18);
  color: #e6e6e6;
  font-family: var(--font-body);
  font-size: 0.75rem;
  letter-spacing: 0.18em;
  padding: 0.65rem 0;
  cursor: pointer;
  border-radius: 3px;
  transition: border-color 0.15s, color 0.15s;
}
.help-btn:hover { border-color: #ffcc00; color: #ffcc00; }
.mute-btn.muted {
  border-color: #ff2a2a;
  color: #ff2a2a;
  background: rgba(255, 42, 42, 0.08);
}

.segmented {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.4rem;
}

.seg {
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #a1a1aa;
  padding: 0.55rem 0;
  cursor: pointer;
  font-family: var(--font-body);
  font-size: 0.78rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  border-radius: 3px;
  transition: all 0.15s;
}
.seg:hover { border-color: rgba(255, 204, 0, 0.4); color: #e6e6e6; }
.seg.active {
  border-color: #ffcc00;
  color: #0a0a0b;
  background: #ffcc00;
  font-weight: 600;
}

.hint {
  margin-top: 0.6rem;
  font-size: 0.74rem;
  color: #52525b;
  letter-spacing: 0.04em;
  line-height: 1.5;
}

.about-line {
  font-size: 0.78rem;
  color: #a1a1aa;
  margin: 0 0 0.35rem;
}
.about-line.subtle {
  color: #52525b;
  font-size: 0.72rem;
}
.about-line a {
  color: #00f3ff;
  text-decoration: none;
  border-bottom: 1px dashed rgba(0, 243, 255, 0.4);
}
.about-line a:hover { border-bottom-style: solid; }

/* --- enter / leave --- */
.drawer-enter-active, .drawer-leave-active {
  transition: opacity 0.2s ease;
}
.drawer-enter-active .settings-panel,
.drawer-leave-active .settings-panel {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.drawer-enter-from, .drawer-leave-to {
  opacity: 0;
}
.drawer-enter-from .settings-panel,
.drawer-leave-to .settings-panel {
  transform: translateX(100%);
}

@media (prefers-reduced-motion: reduce) {
  .drawer-enter-active, .drawer-leave-active,
  .drawer-enter-active .settings-panel,
  .drawer-leave-active .settings-panel {
    transition-duration: 0.01s;
  }
}

@media (max-width: 480px) {
  .settings-panel { max-width: 100%; }
}
</style>
