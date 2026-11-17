<template>
  <!-- Static on purpose: no scroll-in animation, so crawlers and slow phones
       always get the text that explains the game and links into the guides.
       The text lives in content/landingGuide.html because the build also writes
       it into index.html (vite.config.ts) for crawlers that do not run JavaScript. -->
  <section class="guide-section" :class="{ 'is-native': isNative }" aria-labelledby="guide-heading" v-html="html"></section>
</template>

<script setup lang="ts">
import { Capacitor } from '@capacitor/core'
import guideHtml from '../content/landingGuide.html?raw'

const isNative = Capacitor.isNativePlatform()

// App review is strict about another company's game name, so the store apps get a plain heading.
const html = isNative
  ? guideHtml.replace(/<h2 id="guide-heading"[^]*?<\/h2>/, '<h2 id="guide-heading" class="guide-heading">WHAT IS <span class="accent-yellow">OPEN MERCY?</span></h2>')
  : guideHtml
</script>

<style scoped>
.guide-section {
  position: relative;
  z-index: 5;
  padding: 6rem 2rem;
}

.guide-section :deep(.guide-inner) {
  max-width: 960px;
  margin: 0 auto;
}

.guide-section :deep(.guide-heading) {
  font-family: var(--font-display);
  font-size: 3.2rem;
  margin: 0 0 1.5rem;
  color: var(--text-primary);
  line-height: 1;
  text-align: center;
  /* Keeps a two-line heading from leaving one word alone on the second line. */
  text-wrap: balance;
}

.guide-section :deep(.accent-yellow) {
  color: var(--color-hazard);
}

.guide-section :deep(.guide-intro) {
  color: var(--text-secondary);
  font-size: 1.1rem;
  line-height: 1.7;
  max-width: 640px;
  margin: 0 auto 1rem;
  text-align: center;
}

/* The store apps leave out the parts written for search visitors: they name
   another company's game and the other phone platform, which app review rejects. */
.guide-section.is-native :deep(.guide-web) {
  display: none;
}

/* Topics are grouped by space alone: more room between them than inside one. */
.guide-section :deep(.guide-topics) {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  column-gap: var(--spacing-12);
  row-gap: var(--spacing-12);
  margin-top: var(--spacing-12);
}

.guide-section :deep(.guide-topic-title) {
  margin: 0 0 var(--spacing-2);
  font-family: var(--font-body);
  font-size: var(--text-xl);
  font-weight: 700;
  line-height: 1.3;
  color: var(--text-primary);
}

.guide-section :deep(.guide-topic p) {
  margin: 0 0 var(--spacing-2);
  font-size: var(--text-base);
  line-height: 1.7;
  color: var(--text-secondary);
}

/* Mixed toward white: saturated cyan under 24px vibrates on the dark floor. */
.guide-section :deep(.guide-topic a) {
  color: color-mix(in srgb, var(--color-neon-blue) 85%, white);
  text-decoration: underline;
  text-underline-offset: 3px;
}

/* The link that closes a topic is its own line, so it gets a full tap target. */
.guide-section :deep(.guide-topic > a) {
  display: inline-flex;
  align-items: center;
  min-height: 44px;
  font-weight: 600;
}

.guide-section :deep(.guide-topic a:hover) {
  color: var(--text-primary);
}

.guide-section :deep(.guide-legal) {
  max-width: 640px;
  margin: var(--spacing-8) auto 0;
  font-size: var(--text-xs);
  line-height: 1.6;
  color: var(--text-muted);
  text-align: center;
}

.guide-section :deep(.guide-links) {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 2rem;
}

.guide-section :deep(.guide-links a) {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 1px;
  color: var(--text-primary);
  text-decoration: none;
  border: 1px solid rgba(0, 243, 255, 0.3);
  border-radius: 999px;
  padding: 0.5rem 0.9rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  transition: border-color 0.2s, color 0.2s;
}

.guide-section :deep(.guide-links a:hover) {
  border-color: var(--color-neon-blue);
  color: var(--color-neon-blue);
}

@media (max-width: 768px) {
  .guide-section {
    padding: 4rem 1.5rem;
  }
  .guide-section :deep(.guide-heading) {
    font-size: 2.4rem;
  }
  .guide-section :deep(.guide-topics) {
    grid-template-columns: minmax(0, 1fr);
    row-gap: var(--spacing-8);
  }
}

@media (max-width: 480px) {
  .guide-section {
    padding: 3rem 1rem;
  }
  .guide-section :deep(.guide-heading) {
    font-size: 1.9rem;
  }
  .guide-section :deep(.guide-intro) {
    font-size: 1rem;
  }
}
</style>
