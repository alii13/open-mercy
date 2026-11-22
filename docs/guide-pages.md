# Guide pages

One structure for every article under `frontend/public/`: the rules pages, `/how-to-play/`, `/strategy/`, `/faq/`, `/play-with-friends/`, `/play-vs-computer/`, and any page added later. A reader should never have to relearn the layout, and Google should find the answer in the same place on every page.

The legal and contact pages (`/about/`, `/contact/`, `/privacy/`, `/terms/`) are not articles and do not follow this.

## The page, top to bottom

| # | Part | Markup | Rule |
| --- | --- | --- | --- |
| 1 | Breadcrumb | `nav.breadcrumb` | Home, then the section, then this page. |
| 2 | Headline | `h1`, with an optional `span.accent` second line | The words people search, in plain order. One per page. |
| 3 | Answer | `p.lead` | One or two sentences that answer the search on their own. No warm-up. |
| 4 | Quick answer | a `table.card-table` or a short list | Optional. Use it when the answer is a comparison or a list, as `/rules/stacking/` does. |
| 5 | Action | `div.cta-row` | One filled button (`btn-primary`) that opens the game. Any other action is a text link (`btn-ghost`). |
| 6 | Small print | `div.callout`, then `p.byline` | The Mattel trademark notice, then the author and the date the page was last checked. |
| 7 | Contents | `div.toc` | Links to each section below. |
| 8 | Sections | `section` with one `h2` each | See below. |
| 9 | Common questions | `section#questions` with `div.faq-item` | Optional. See below. |
| 10 | Closing action | `div.final-cta` | One short line and the same single button. |
| 11 | Footer | `footer.site-footer` | Identical on every page. `staticFooter.spec.ts` checks it. |

Parts 2 to 6 sit inside `div.hero`, in that order. `frontend/public/rules/guide.css` styles all of it. Do not restyle one page on its own: a change to the look goes in `guide.css` and reaches every page.

## Sections

- The `h2` is what a person would type or ask: "How your friends join", "Can you stack a Draw 4 on a Draw 2?".
- The first sentence under it answers the heading. Detail and examples come after.
- Use a numbered list for steps, a table for a comparison, a callout for one warning or tip. Otherwise write short paragraphs.
- Link to the page that goes deeper the first time a card or rule is named.
- State only what the live game does. Check a rule against `shared/engine/` or the running game before writing it.

## Common questions

- A question goes here only when the sections above do not already answer it.
- Word the question the way it is searched, and answer it in the first sentence.
- The `FAQPage` JSON-LD in the page head lists the same questions with the same answers, word for word.

## What goes in the head

- `title`: the search phrase first, then "- Open Mercy". 60 characters or fewer.
- `meta description`: what the page answers, in 160 characters or fewer.
- `link rel="canonical"`: the page's own address, with the trailing slash.
- JSON-LD: `Article` and `BreadcrumbList` on every page, `FAQPage` when the page has common questions.

## Naming Mattel's game

Open Mercy is the name of the game, the site and the app. "UNO No Mercy" describes the rules it follows.

- Write "plays by UNO No Mercy rules" or "UNO No Mercy rules". Never call Open Mercy "UNO No Mercy", and never write "official".
- A `title`, an `h1` or a page's opening sentence may use the words people search, "Play UNO No Mercy online" or "Play UNO online with friends" (the owner's call on 2026-11-22). The page then says "No Mercy rules" in the headline's second line or the sentence that follows.
- Plain text only. No Mattel logo, lettering, colours or card art.
- The trademark notice (part 6) is on every page that names the game.
- Page addresses do not contain "uno".

## When you add a page

1. Copy an existing page of the same kind and keep the order above.
2. Add the page to `frontend/public/sitemap.xml` and `frontend/public/llms.txt`.
3. Link to it from at least one existing page. `landingLinks.spec.ts` fails when the home page guide links to a page that does not exist, or a page is missing from the sitemap.
4. Open it in a browser at 390px and at desktop width before the PR.
