import { describe, expect, it } from 'vitest'
import guideHtml from '../../content/landingGuide.html?raw'
import sitemap from '../../../public/sitemap.xml?raw'

// Static pages are plain files under public/, so nothing else notices a link
// to one that was renamed, or a new page the sitemap never learned about.
const pages = Object.keys(import.meta.glob('../../../public/**/index.html', { query: '?raw' }))
    .map((file) => file.replace('../../../public', '').replace('index.html', ''))

describe('landing guide links', () => {
    it('point at static pages that exist', () => {
        const links = [...guideHtml.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1])
        expect(links.length).toBeGreaterThan(10)
        for (const link of links) expect(pages, link).toContain(link)
    })
})

describe('sitemap', () => {
    it('lists every static page', () => {
        for (const page of pages) expect(sitemap, page).toContain(`<loc>https://open-mercy.com${page}</loc>`)
    })
})
