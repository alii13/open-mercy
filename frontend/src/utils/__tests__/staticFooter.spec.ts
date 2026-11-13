import { describe, expect, it } from 'vitest'

// The static pages under public/ each carry a hand-copied footer. They drift
// one page at a time, so every page is checked against the first.
const pages = Object.entries(
    import.meta.glob<string>('../../../public/**/index.html', { query: '?raw', import: 'default', eager: true }),
).filter(([, html]) => html.includes('/rules/guide.css')) // the printable cheat sheet keeps its own

const footerOf = (html: string) => html.match(/<footer class="site-footer">[\s\S]*?<\/footer>/)?.[0] ?? null

describe('static page footer', () => {
    it('is the same on every page', () => {
        expect(pages.length).toBeGreaterThan(10)
        const first = footerOf(pages[0]?.[1] ?? '')
        expect(first).not.toBeNull()
        for (const [path, html] of pages) expect(footerOf(html), path).toBe(first)
    })

    it('opens Discord, Telegram and Instagram in a new tab', () => {
        const footer = footerOf(pages[0]?.[1] ?? '') ?? ''
        for (const url of ['https://discord.gg/4hwKGhJak9', 'https://t.me/openmercy', 'https://www.instagram.com/openmercyy']) {
            expect(footer).toContain(`href="${url}" target="_blank" rel="noopener noreferrer"`)
        }
    })
})
