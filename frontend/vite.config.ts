import { defineConfig } from 'vitest/config'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'
import { readFileSync } from 'node:fs'
import type { Plugin } from 'vite'
import { LANDING_FAQS } from './src/data/landingFaqs'
import { LANDING_TAGLINE } from './src/data/landingTagline'

const escapeHtml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/**
 * Writes the landing guide and FAQ into index.html, so a crawler that does not
 * run JavaScript reads the same text a visitor sees. The FAQPage JSON-LD comes
 * from the same list, because structured data must match the visible answers.
 */
function landingPrerender(): Plugin {
  return {
    name: 'landing-prerender',
    // 'pre' runs on the file as written, before Vite touches it.
    transformIndexHtml: { order: 'pre', handler(html) {
      const guide = readFileSync(path.resolve(__dirname, 'src/content/landingGuide.html'), 'utf8')
      const faq = [
        '<h2>Your questions, answered</h2>',
        ...LANDING_FAQS.map(({ q, a }) => `<h3>${escapeHtml(q)}</h3>\n<p>${escapeHtml(a)}</p>`),
      ].join('\n')
      const jsonLd = JSON.stringify({
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: LANDING_FAQS.map(({ q, a }) => ({
          '@type': 'Question',
          name: q,
          acceptedAnswer: { '@type': 'Answer', text: a },
        })),
      }, null, 2).replace(/</g, '\\u003c')

      const fills: Record<string, string> = {
        '<!--landing:h1-->': `<h1>${escapeHtml(LANDING_TAGLINE)}</h1>`,
        '<!--landing:guide-->': guide,
        '<!--landing:faq-->': faq,
        '<!--landing:faq-jsonld-->': `<script type="application/ld+json">\n${jsonLd}\n</script>`,
      }
      for (const [marker, value] of Object.entries(fills)) {
        // A missing marker would drop the text from search without any other sign.
        if (!html.includes(marker)) throw new Error(`index.html lost its ${marker} marker`)
        html = html.replace(marker, () => value)
      }
      return html
    } },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue(), tailwindcss(), landingPrerender()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@engine': path.resolve(__dirname, '../shared/engine'),
      '@protocol': path.resolve(__dirname, '../shared/protocol.ts'),
      '@roomCode': path.resolve(__dirname, '../shared/roomCode.ts'),
      '@quickChat': path.resolve(__dirname, '../shared/quickChat.ts'),
      '@lounge': path.resolve(__dirname, '../shared/lounge.ts'),
      '@handles': path.resolve(__dirname, '../shared/handles.ts'),
      '@streak': path.resolve(__dirname, '../shared/streak.ts'),
    },
  },
  assetsInclude: ['**/*.png', '**/*.jpg', '**/*.jpeg'],
  test: {
    include: [
      '**/*.{test,spec}.?(c|m)[jt]s?(x)',
      '../shared/engine/**/*.test.ts',
      '../shared/__tests__/**/*.test.ts',
      '../game-server/src/**/*.test.ts',
    ],
  },
})
