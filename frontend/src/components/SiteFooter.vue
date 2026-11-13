<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { siDiscord, siGithub, siInstagram, siTelegram } from 'simple-icons'
import { openPrivacySettings, privacySettingsAvailable } from '../utils/consent'
import { useAuthStore } from '../stores/authStore'

const authStore = useAuthStore()
const privacySettings = ref(false)
onMounted(() => { void privacySettingsAvailable().then(v => { privacySettings.value = v }) })
</script>

<template>
  <!-- The static pages under public/ carry this footer as plain HTML, styled
       in public/rules/guide.css. A change here goes there too. -->
  <footer class="site-footer">
    <div class="sf-inner">
      <div class="sf-top">
        <section class="sf-community">
          <h2 class="sf-title">The game ends.<br>The table <span class="sf-alert">doesn't.</span></h2>
          <p class="sf-lead">Find people to play with, call a rematch, and hear about new rules before anyone else.</p>
          <div class="sf-socials">
            <a class="sf-pill sf-discord" href="https://discord.gg/4hwKGhJak9" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><path :d="siDiscord.path" /></svg>
              Join the Discord
            </a>
            <a class="sf-pill" href="https://t.me/openmercy" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" class="sf-telegram"><path :d="siTelegram.path" /></svg>
              Telegram
            </a>
            <a class="sf-pill" href="https://www.instagram.com/openmercyy" target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
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
              Instagram
            </a>
          </div>
        </section>

        <nav class="sf-links" aria-label="Site">
          <div class="sf-col">
            <h3 class="sf-col-label">Play</h3>
            <!-- Players only. Signed out, /public has nothing to seat and /bot
                 deals a game that is never saved; the landing page's PLAY
                 signs a visitor in first. -->
            <template v-if="authStore.isAuthenticated">
              <a href="/public" class="sf-link">Public table</a>
              <a href="/bot" class="sf-link">Vs bot</a>
            </template>
            <a href="/leaderboard" class="sf-link">Leaderboard</a>
          </div>
          <!-- Crawlable links into the guides: the rules guide was once reachable
               only from the settings drawer, which left it orphaned for search. -->
          <div class="sf-col">
            <h3 class="sf-col-label">Learn</h3>
            <a href="/how-to-play/" class="sf-link">How to play</a>
            <a href="/rules/" class="sf-link">Rules guide</a>
            <a href="/strategy/" class="sf-link">Strategy</a>
            <a href="/faq/" class="sf-link">FAQ</a>
          </div>
          <div class="sf-col">
            <h3 class="sf-col-label">Open Mercy</h3>
            <a href="/about/" class="sf-link">About</a>
            <a href="/contact/" class="sf-link">Contact</a>
            <a href="/privacy/" class="sf-link">Privacy</a>
            <a href="/terms/" class="sf-link">Terms</a>
          </div>
        </nav>
      </div>

      <div class="sf-bottom">
        <p class="sf-oss">
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path :d="siGithub.path" /></svg>
          <span>Open Mercy is <a href="https://github.com/alii13/open-mercy" target="_blank" rel="noopener noreferrer" class="sf-oss-link">open source</a>.</span>
        </p>
        <button v-if="privacySettings" type="button" class="sf-privacy" @click="openPrivacySettings()">Privacy settings</button>
      </div>
    </div>
  </footer>
</template>

<style scoped>
.site-footer {
  --discord: #5865f2;
  --discord-hover: #4752c4;
  position: relative;
  z-index: 5;
  background: var(--bg-concrete);
  border-top: 1px solid var(--bg-concrete-light);
  font-family: var(--font-body);
}

.sf-inner {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-16);
  max-width: 1200px;
  margin: 0 auto;
  padding: var(--spacing-24) var(--spacing-6) var(--spacing-8);
}

.sf-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: var(--spacing-16);
}

.sf-community {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-4);
}

.sf-title {
  margin: 0;
  font-family: var(--font-display);
  font-weight: 400;
  font-size: var(--text-display);
  line-height: 1.12;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: var(--text-primary);
}

.sf-alert { color: var(--color-alert); }

.sf-lead {
  margin: 0;
  max-width: 34ch;
  font-size: var(--text-lg);
  line-height: 1.55;
  color: var(--text-secondary);
}

.sf-socials {
  display: flex;
  flex-wrap: wrap;
  gap: var(--spacing-3);
  padding-top: var(--spacing-4);
}

.sf-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-3);
  min-height: 56px;
  padding: 0 var(--spacing-6) 0 var(--spacing-4);
  border-radius: var(--radius-pill);
  background: var(--bg-concrete-light);
  font-size: var(--text-base);
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-decoration: none;
  color: var(--text-primary);
  transition: background-color var(--duration-snap) var(--ease-snap);
}

.sf-pill svg { flex-shrink: 0; }

.sf-discord {
  padding-left: var(--spacing-6);
  background: var(--discord);
  color: #fff;
}

.sf-discord svg { fill: #fff; }
.sf-telegram { fill: #26a5e4; }

.sf-links {
  display: flex;
  gap: var(--spacing-12);
}

.sf-col {
  display: flex;
  flex-direction: column;
  min-width: 7.5rem;
}

.sf-col-label {
  margin: 0 0 var(--spacing-2);
  font-size: var(--text-xs);
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-muted);
}

/* 28px of line plus 8px above and below: a 44px tap target per link. */
.sf-link {
  padding: var(--spacing-2) 0;
  font-size: var(--text-base);
  font-weight: 500;
  line-height: 1.75;
  text-decoration: none;
  color: var(--text-primary);
  transition: color var(--duration-snap) var(--ease-snap);
}

.sf-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: var(--spacing-4);
}

.sf-oss {
  display: flex;
  align-items: center;
  gap: var(--spacing-2);
  margin: 0;
  font-size: var(--text-sm);
  color: var(--text-secondary);
}

.sf-oss svg {
  flex-shrink: 0;
  fill: var(--text-primary);
}

.sf-oss-link {
  font-weight: 600;
  color: var(--text-primary);
  text-decoration: underline;
  text-decoration-color: var(--text-muted);
  text-underline-offset: 3px;
}

.sf-privacy {
  min-height: 44px;
  padding: 0;
  background: none;
  border: 0;
  font: inherit;
  font-size: var(--text-sm);
  font-weight: 500;
  color: var(--text-secondary);
  cursor: pointer;
}

/* Mouse only: on a phone a tapped link keeps its hover colour after the tap. */
@media (hover: hover) {
  .sf-pill:hover { background: var(--surface-metal); }
  .sf-discord:hover { background: var(--discord-hover); }
  .sf-link:hover { color: var(--color-hazard); }
  .sf-oss-link:hover { text-decoration-color: var(--text-primary); }
  .sf-privacy:hover { color: var(--text-primary); }
}

@media (max-width: 960px) {
  .sf-top {
    flex-direction: column;
    gap: var(--spacing-12);
  }
}

@media (max-width: 640px) {
  .sf-inner {
    gap: var(--spacing-12);
    padding-top: var(--spacing-16);
  }

  .sf-title { font-size: var(--text-3xl); }
  .sf-lead { font-size: var(--text-base); }

  /* Discord takes the row; Telegram and Instagram share the one below it. */
  .sf-discord { flex-basis: 100%; }
  .sf-pill:not(.sf-discord) {
    flex: 1 1 0;
    padding: 0 var(--spacing-4) 0 var(--spacing-3);
    font-size: var(--text-sm);
    letter-spacing: 0.12em;
  }

  .sf-links {
    flex-wrap: wrap;
    column-gap: var(--spacing-12);
    row-gap: var(--spacing-8);
  }

  .sf-col { flex: 0 0 calc(50% - var(--spacing-6)); }
}
</style>
