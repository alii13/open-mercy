<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { siDiscord, siGithub, siInstagram, siTelegram } from 'simple-icons'
import { openPrivacySettings, privacySettingsAvailable } from '../utils/consent'

const privacySettings = ref(false)
onMounted(() => { void privacySettingsAvailable().then(v => { privacySettings.value = v }) })
</script>

<template>
  <!-- The static pages under public/ carry this footer as plain HTML, styled
       in public/rules/guide.css. A change here goes there too. -->
  <footer class="site-footer">
    <nav class="sf-links" aria-label="Site">
      <a href="https://github.com/alii13/open-mercy" target="_blank" rel="noopener noreferrer" class="sf-link sf-oss">
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path :d="siGithub.path" /></svg>
        Open source
      </a>
      <!-- Crawlable links into the guides: the rules guide was once reachable
           only from the settings drawer, which left it orphaned for search. -->
      <a href="/how-to-play/" class="sf-link">How to play</a>
      <a href="/rules/" class="sf-link">Rules guide</a>
      <a href="/about/" class="sf-link">About</a>
      <a href="/contact/" class="sf-link">Contact</a>
      <a href="/privacy/" class="sf-link">Privacy</a>
      <a href="/terms/" class="sf-link">Terms</a>
      <button v-if="privacySettings" type="button" class="sf-link sf-button" @click="openPrivacySettings()">Privacy settings</button>
    </nav>

    <div class="sf-socials">
      <a href="https://discord.gg/4hwKGhJak9" target="_blank" rel="noopener noreferrer" class="sf-social" aria-label="Open Mercy on Discord">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" class="sf-discord"><path :d="siDiscord.path" /></svg>
      </a>
      <a href="https://t.me/openmercy" target="_blank" rel="noopener noreferrer" class="sf-social" aria-label="Open Mercy on Telegram">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" class="sf-telegram"><path :d="siTelegram.path" /></svg>
      </a>
      <a href="https://www.instagram.com/openmercyy" target="_blank" rel="noopener noreferrer" class="sf-social" aria-label="Open Mercy on Instagram">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <defs>
            <linearGradient id="sf-instagram" x1="0" y1="1" x2="1" y2="0">
              <stop offset="0" stop-color="#feda75" />
              <stop offset="0.35" stop-color="#fa7e1e" />
              <stop offset="0.6" stop-color="#d62976" />
              <stop offset="0.85" stop-color="#962fbf" />
              <stop offset="1" stop-color="#4f5bd5" />
            </linearGradient>
          </defs>
          <path fill="url(#sf-instagram)" :d="siInstagram.path" />
        </svg>
      </a>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  position: relative;
  z-index: 5;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  column-gap: var(--spacing-8);
  row-gap: var(--spacing-2);
  /* No vertical padding: each link is already a 44px tap target, so the
     footer is one 44px row and the lobby above it fits a laptop screen. */
  padding: 0 var(--spacing-6);
  background: var(--bg-concrete);
  border-top: 1px solid var(--bg-concrete-light);
  font-family: var(--font-body);
}

.sf-links {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
  column-gap: var(--spacing-6);
}

.sf-link {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  min-height: 44px;
  font-size: var(--text-sm);
  font-weight: 500;
  text-decoration: none;
  color: var(--text-secondary);
  transition: color var(--duration-snap) var(--ease-snap);
}

.sf-oss { color: var(--text-primary); }
.sf-oss svg { fill: currentColor; }

.sf-button {
  padding: 0;
  background: none;
  border: 0;
  font-family: inherit;
  cursor: pointer;
}

.sf-socials {
  display: flex;
  align-items: center;
}

.sf-social {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: var(--radius-pill);
  transition: background-color var(--duration-snap) var(--ease-snap);
}

.sf-discord { fill: #5865f2; }
.sf-telegram { fill: #26a5e4; }

/* Mouse only: on a phone a tapped link keeps its hover colour after the tap. */
@media (hover: hover) {
  .sf-link:hover { color: var(--text-primary); }
  .sf-social:hover { background: var(--bg-concrete-light); }
}
</style>
