<template>
  <footer class="site-footer">
    <span class="footer-text">Built by</span>
    <a href="https://github.com/alii13" target="_blank" rel="noopener noreferrer" class="footer-link">
      <svg viewBox="0 0 24 24" fill="currentColor" width="14" height="14"><path d="M12 .297c-6.63 0-12 5.373-12 12 0 5.303 3.438 9.8 8.205 11.385.6.113.82-.258.82-.577 0-.285-.01-1.04-.015-2.04-3.338.724-4.042-1.61-4.042-1.61C4.422 18.07 3.633 17.7 3.633 17.7c-1.087-.744.084-.729.084-.729 1.205.084 1.838 1.236 1.838 1.236 1.07 1.835 2.809 1.305 3.495.998.108-.776.417-1.305.76-1.605-2.665-.3-5.466-1.332-5.466-5.93 0-1.31.465-2.38 1.235-3.22-.135-.303-.54-1.523.105-3.176 0 0 1.005-.322 3.3 1.23.96-.267 1.98-.4 3-.405 1.02.005 2.04.138 3 .405 2.28-1.552 3.285-1.23 3.285-1.23.645 1.653.24 2.873.12 3.176.765.84 1.23 1.91 1.23 3.22 0 4.61-2.805 5.625-5.475 5.92.42.36.81 1.096.81 2.22 0 1.606-.015 2.896-.015 3.286 0 .315.21.69.825.57C20.565 22.092 24 17.592 24 12.297c0-6.627-5.373-12-12-12"/></svg>
      alii13
    </a>
    <span class="footer-sep">·</span>
    <!-- Sitewide crawlable link into the rules guide. It was reachable only
         from the settings drawer, which left a 1,800-word page effectively
         orphaned for search. -->
    <a href="/rules/" class="footer-link">Rules guide</a>
    <span class="footer-sep">·</span>
    <a href="/privacy/" class="footer-link">Privacy</a>
    <span class="footer-sep">·</span>
    <a href="/terms/" class="footer-link">Terms</a>
    <span class="footer-sep">·</span>
    <a href="/refunds/" class="footer-link">Refunds</a>
    <span class="footer-sep">·</span>
    <span class="footer-attribution">
      Music: <a href="https://incompetech.com/" target="_blank" rel="noopener noreferrer" class="footer-attribution-link">Kevin MacLeod</a>
      (<a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer" class="footer-attribution-link">CC BY 4.0</a>)
      ·
      SFX: <a href="https://kenney.nl/assets/casino-audio" target="_blank" rel="noopener noreferrer" class="footer-attribution-link">Kenney</a>
      (CC0)
    </span>
  </footer>
</template>

<style scoped>
.site-footer {
  background: rgba(0, 0, 0, 0.7);
  border-top: 1px solid #2a2a2a;
  padding: 0.75rem 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  font-family: var(--font-mono);
  font-size: 0.75rem;
  color: var(--text-muted);
  letter-spacing: 1px;
  position: relative;
  z-index: 5;
}

.footer-text {
  line-height: 1;
}

.footer-link {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--text-primary);
  text-decoration: none;
  font-weight: bold;
  transition: color 0.2s;
}

.footer-link:hover {
  color: var(--color-hazard);
}

.footer-sep {
  color: #2a2a2a;
  margin: 0 0.25rem;
}

.footer-attribution {
  font-size: 0.68rem;
  color: var(--text-muted);
  opacity: 0.7;
  letter-spacing: 0.5px;
}

.footer-attribution-link {
  color: var(--text-muted);
  text-decoration: none;
  border-bottom: 1px dotted rgba(255, 255, 255, 0.15);
}

.footer-attribution-link:hover {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}

@media (max-width: 640px) {
  .site-footer {
    flex-wrap: wrap;
    row-gap: 0.4rem;
  }
  .footer-attribution {
    flex-basis: 100%;
    text-align: center;
    margin-top: 0;
  }
  .footer-sep {
    display: none;
  }
}
</style>
