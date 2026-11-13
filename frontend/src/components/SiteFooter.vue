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

    <span class="sf-divider" aria-hidden="true"></span>

    <div class="sf-socials">
      <a href="https://discord.gg/4hwKGhJak9" target="_blank" rel="noopener noreferrer" class="sf-social sf-discord" aria-label="Open Mercy on Discord">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path :d="siDiscord.path" /></svg>
      </a>
      <a href="https://t.me/openmercy" target="_blank" rel="noopener noreferrer" class="sf-social sf-telegram" aria-label="Open Mercy on Telegram">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path :d="siTelegram.path" /></svg>
      </a>
      <a href="https://www.instagram.com/openmercyy" target="_blank" rel="noopener noreferrer" class="sf-social sf-instagram" aria-label="Open Mercy on Instagram">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path :d="siInstagram.path" /></svg>
      </a>
      <a href="https://github.com/alii13/open-mercy" target="_blank" rel="noopener noreferrer" class="sf-social sf-github" aria-label="Open Mercy's code on GitHub">
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path :d="siGithub.path" /></svg>
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
  column-gap: var(--spacing-6);
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
  color: var(--text-secondary);
  transition: background var(--duration-snap) var(--ease-snap), color var(--duration-snap) var(--ease-snap);
}

/* Grey like the links until hovered, so the icons do not outshout the page. */
.sf-social svg { fill: currentColor; }

/* Splits the page links from the social icons while they share one row. */
.sf-divider {
  width: 1px;
  height: var(--spacing-6);
  background: color-mix(in srgb, var(--text-muted) 45%, transparent);
}

/* Mouse only: on a phone a tapped link keeps its hover colour after the tap. */
@media (hover: hover) {
  .sf-link:hover { color: var(--text-primary); }
  .sf-social:hover { color: #fff; }
  .sf-discord:hover { background: #5865f2; }
  .sf-telegram:hover { background: #26a5e4; }
  .sf-instagram:hover { background: linear-gradient(45deg, #feda75, #fa7e1e 35%, #d62976 60%, #962fbf 85%, #4f5bd5); }
  .sf-github:hover { background: var(--text-primary); color: #181717; }
}

/* Once the icons wrap below the links there is nothing beside them to split. */
@media (max-width: 960px) {
  .sf-divider { display: none; }
}
</style>
