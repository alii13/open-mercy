# CLAUDE.md

Guidance for working in this repo. Hard-won - read before changing CSS, raising PRs, or touching Supabase.

## UI conventions

- Icons come from `lucide-vue-next` (already a dependency) - never emoji glyphs in UI chrome. Country flag emoji on leaderboards/profiles are the one exception.
- **Never hand-roll an icon as inline `<svg>`, and never stand one in as a text glyph or HTML entity** (`&rarr;`, `&times;`, `✕`, `✓`). Import the Lucide component. Hand-drawn duplicates of Lucide shapes and entity arrows were the whole of the 2026-08 icon cleanup.
- **Icon scale is fixed: `:size="14"` inline-with-text, `16` buttons and chrome, `20` icon-only buttons and section headers, and `:stroke-width="2"` always.** Only large display/empty-state icons may sit outside it (currently two at 40). Deviating is what made the UI read as sloppy - there were six sizes and five stroke widths.
- Legitimate inline `<svg>` is limited to: brand marks Lucide does not carry (Google, GitHub, X, WhatsApp - prefer `simple-icons` paths), custom artwork (`CardBack`, `AutoStartRing`, the landing strike line), and genuinely two-tone icons Lucide cannot express (the `VoiceMicCluster` mic, whose slash is styled `--color-alert` separately).
- Concerns are color-zoned with the deck palette: hazard yellow = daily/streak loop, alert red = primary create action, neon cyan = multiplayer, neutral = practice/meta.

## CSS tokens

- The spacing scale in `frontend/src/style.css` is `--spacing-0..4`, then jumps to `6, 8, 12, 16, 24`. **There is no `--spacing-5`** (or 7, 9-11, etc.).
- An undefined CSS var is silently invalid: `gap: var(--spacing-5)` collapses to 0, and in a shorthand (`padding: var(--spacing-4) var(--spacing-5)`) the whole declaration dies - zero padding.
- The source looking right proves nothing. After using any token you haven't confirmed exists, verify the computed style in a browser (`getComputedStyle` or devtools), not the stylesheet.

## PR workflow

- Feature work goes on a branch with a PR into `main`. Cloudflare Pages auto-deploys `main`.
- **Every PR gets reviewed with the repo skill before merge**: run `.claude/skills/github-pr-review` (trigger: "review this PR"). It posts findings as inline comments on specific lines and reads `.claude/review-patterns.md` as a required repo overlay - the incident-earned checklist lives there. Then close the loop per that overlay: fix every Critical and Major finding, push the fixes to the same branch, and resolve each addressed comment thread (reply with what changed, then resolve). A PR with unresolved review threads is not merge-ready.
- **Stacked-PR merge trap**: GitHub only retargets a stacked PR to `main` when its base branch is deleted after the base PR merges. Merging a stack quickly without deleting branches makes each PR merge into its original base branch - `main` gets only the bottom of the stack and the rest strands on feature branches, silently.
  - Prefer PRs based directly on `main`.
  - If you must stack: delete each branch as its PR merges, and verify `git log origin/main` actually contains the work afterward.
- Run `npm run build` (from `frontend/`) and `npx vitest run` before pushing. Build = `vue-tsc -b && vite build`, not just typecheck.

## Shipping updates to players

- Every user-facing change ships its changelog entry **in the same PR** as the change. `frontend/src/data/changelog.ts` is the single source; the panel, the release card, and `/changelog` all read it. An entry that lands in a later PR announces a feature that is already old.
- **Ask the human which volume before you open the PR. Never pick it alone.** Two options, and the answer goes in the entry's `level`:
  - `quiet` - the entry appears in the What's New panel and puts a dot on the top-bar link. This is the default. Use it for anything a player does not need to be told about today.
  - `loud` - the entry also fires a one-time release card over the lobby. Reserve it for a change that alters what a player does. At most one per quarter. A card on every release trains people to close it unread, which kills the channel for the release that needs it.
- Entry shape: `{ id, level, tag, title, body, cta? }`. `id` is the ISO date (`2026-08-26`) and must sort. `tag` is `NEW`, `IMPROVED`, or `FIXED`. `title` is verb-first and under 50 characters. `body` is one or two sentences in plain words. `cta` is optional and must route somewhere in `utils/routes.ts` - no link is better than a link to the home page.
- The dot is driven by the newest `id` against a last-seen id in `localStorage`. Adding an entry is what makes the dot appear, so never add one for a change that has not deployed.
- **Both surfaces are for players, not visitors.** The panel lives in the lobby top bar and the card renders only when signed in, so someone who has never played is not told what changed in a product they have not used. A guest who plays is signed in, so "signed in" means "has played". `/changelog` stays public: a page someone navigates to is not a nudge.
- Write `body` for a signed-in reader; that is the only reader a card has. The optional `stat` field fetches a live number, and a card without one simply has no number line. `bodySignedOut` and `ctaSignedOut` are still on the type but nothing can reach them while the card is signed-in only — do not write new copy into them.

## Asking players a question

- The loud card has a second job: one question, two or three options, answered in one tap. Copy lives in `frontend/src/data/polls.ts`, answers in `poll_votes` (`supabase/polls.sql`, already run).
- **Adding a question is one edit.** Append to `POLLS` with a fresh ISO-dated id and ship it. `poll_votes` is generic, so a new question needs no SQL and no deploy beyond the copy.
- **Never change a shipped poll's `id` or its `options`.** The id is the local answered flag, so reusing one asks people who already answered; the options are stored verbatim as `choice`, so rewriting one splits the tally against rows already written. A changed question is a new entry.
- Read the tally in the SQL Editor - both queries are in `supabase/polls.sql`, including the one that counts only players with real games behind them. Nothing in the app reads the results.
- **A release card always wins the corner, for the whole visit.** The question renders in the same slot with `v-else-if`, and it is only picked up when nothing is owed from the changelog at load. Dismissing a release card does not summon a question into the space it just left - that player is asked on their next visit. Two interruptions in one corner is how a channel stops being read.
- One question at a time, and one per visit: the first entry in `POLLS` they have not closed. A second entry waits for their next load, not for the first card to clear. Answering or dismissing retires it for good, and both write the same local flag - a question that comes back is worse than a lost answer.
- Same budget as a loud entry. Every question spends the same attention a release card does, so ask one when the answer decides something, not to fill the slot.
- The flag is `localStorage`, so it is not a boundary: clearing site data asks again. The table's primary key is what stops a second answer from counting, and anonymous sign-in means it stops one account, not one person.

## Cloudflare Pages

- **Do not add `/* /index.html 200` to `_redirects`** - Pages flags it as an infinite loop and ignores it. Deep links (`/leaderboard`, `/p/<code>`) work via Pages' automatic SPA fallback, which applies because the build output has no `404.html`.
- **`_redirects` cannot host-match**: absolute-URL sources (`https://old-domain.com/*`) are rejected with "Only relative URLs are allowed" - and one invalid line reports in the build log while the whole file parses to 0 rules. Host-level redirects (domain bridge, www→apex) live in `functions/_middleware.js`. Check the deploy log's "Parsed N valid redirect rules" line whenever `_redirects` changes.
- **The Pages project's root directory is the REPO ROOT**, not `frontend/` (the project config has `pages_build_output_dir = "frontend/dist"`). Pages Functions therefore live at repo-root `functions/` - a `frontend/functions/` directory is silently ignored (no build error; the routes just serve the SPA shell instead). Verify with `npx wrangler pages download config uno-no-mercy` if in doubt, and delete the downloaded `wrangler.toml` afterward - committing it would switch the project to file-managed config.
- Functions deploy with the normal Pages build - no separate wrangler deploy.
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are available to Pages Functions as env bindings.
- Verify function behavior locally with `npx wrangler pages dev frontend/dist` from the repo root; env can be overridden per-run with `--binding KEY=VALUE`. Pass `--compatibility-date=<yesterday>` too: with no date wrangler defaults to *today*, and the bundled runtime only supports dates up to its own release, so the Worker fails to start with "requires compatibility date X, but the newest date supported by this server binary is X-1".
- A function that fails to deploy is indistinguishable from a working page at the HTTP level (200 + HTML via SPA fallback). When consuming a function from the client, check the response content-type, and after deploying a new function, curl its route on the deployment URL and confirm you get its actual output.

## Game server (Cloudflare Worker + Durable Objects)

- Multiplayer runs on the standalone `uno-game-server` Worker (`game-server/`), not the Pages frontend. One `GameRoomDO` per room holds the authoritative engine; the client (`frontend/src/stores/multiplayerStore.ts`) is a thin WebSocket mirror that sends intents and renders personalized snapshots. This supersedes the old Supabase-broadcast path - stale "broadcast" comments in the client describe the retired flow.
- **It is NOT auto-deployed.** Merging to `main` deploys only the Pages frontend; the Worker goes live only when someone runs `cd game-server && npx wrangler deploy`. Use `npx` (wrangler is a project dep, not global) and run it from `game-server/`. Needs `npx wrangler login` first (interactive browser OAuth, persists to `~/.wrangler`); a headless run needs `CLOUDFLARE_API_TOKEN`.
- After deploying, smoke-check: `curl https://uno-game-server.shekhaliul44.workers.dev/health` → `{"ok":true,...}`, and `/public-rooms`.
- The game server has no Cloudflare test runner. Put pure, testable logic in its own module (e.g. `game-server/src/roomGc.ts`) and cover it via the frontend vitest runner - its `include` in `frontend/vite.config.ts` reaches `../game-server/src/**/*.test.ts`. Test files are excluded from the Worker's `tsc` build (`game-server/tsconfig.json`).
- Room GC: an empty room is deleted after a per-visibility window (`game-server/src/roomGc.ts`) - public rooms 10 min (so quick-match never serves a dead room), private invite-link rooms 1 h (so a shared link survives a join-later gap). The DO also unregisters public rooms from the quick-match directory on GC, which is why the two windows differ.

## Mobile (Flutter)

- `mobile/` is one Flutter app for iOS and Android (bundle ID `com.openmercy.app`, permanent once published). Run `flutter test` and `flutter analyze` from `mobile/`.
- Multiplayer on mobile is a WebSocket client of `game-server/`, same as the web client. The wire format lives in `shared/protocol.ts`; any Dart mirror of it must change in the same PR as the TS file.

## Supabase

- **supabase-js derives its session storage key from the client URL** (`sb-<first-hostname-label>-auth-token`). Changing `supabaseUrl` - proxy on or off, a custom domain - therefore signs every existing session out silently, and guests are lost permanently because an anonymous identity cannot sign back in. This shipped as the #162 regression and was fixed by #167. The key is now pinned via `auth.storageKey` in `lib/supabase.ts`, sourced from `DIRECT_SESSION_KEY` in `utils/sessionMigration.ts`. Never remove the pin. Never change its value without shipping a key migration like `migrateLegacySession()`.
- Review rule for any auth- or URL-adjacent diff: list what supabase-js derives from the changed input (storage key from the URL, redirect origin from auth config) before merging - derived state is where silent sign-outs come from.
- `game_results` RLS is owner-select-only. Any public read (leaderboards, profiles, opponent stats) goes through a `SECURITY DEFINER` function granted to `anon, authenticated` - never widen RLS.
- Schema changes ship as SQL files in `supabase/` for manual runs in the SQL Editor, additive only. Run order matters when files depend on each other's columns (e.g. `leaderboards-v2.sql` before `profile-pages.sql`).
- Changing a function's return columns requires `drop function` + recreate - `create or replace` can't do it. The drop triggers the SQL Editor's destructive-operation warning; that's expected.
- The frontend feature-detects every definer function (probe once, hide the surface on error), so merging frontend and running SQL can happen in either order without breaking prod.

### OAuth (Google)

- **The authorize hop must bypass the Supabase proxy.** `supabase-proxy` forwards with `redirect: 'follow'`, so a top-level navigation to its `/auth/v1/authorize` makes the worker chase Supabase's 302 to Google and return Google's sign-in HTML from the `workers.dev` origin, where the login can never complete. Mint the URL with `skipBrowserRedirect: true` and swap the origin back (`utils/oauthRedirect.ts`). Only that navigation skips the proxy; the PKCE token exchange still runs on the client's configured URL.
- Guest conversion uses `linkIdentity()`, not a fresh sign-in: attaching an identity to the anonymous user keeps the same user id, which is what keeps the profile row, share code and `game_results` attached. It needs **manual linking** enabled on the project, or it fails with `manual_linking_disabled`.
- `linkIdentity()` navigates away, so its failures never reject at the call site. A collision comes back as `error_code=identity_already_exists` in the return URL and is read once in `authStore.initialize()`. Clear those params surgically - `?join=<code>` carries multiplayer invites and `App.vue` reads it immediately after `initialize()`.
- The Google consent screen must be **published**, not left in Testing. Only `openid email profile` is requested, all non-sensitive, so publishing needs no verification review and carries no user cap; Testing status silently caps or warns instead.

## Tests

- `src/lib/supabase.ts` **throws at import time** when `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` are unset, and the CI workflow passes no env. So any spec whose import graph reaches that module must `vi.mock('../../lib/supabase', ...)` — see `stores/__tests__/gameStore.test.ts`. This passes locally either way because `frontend/.env` exists, so it only ever shows up as a red CI on a green local run. Reproduce with `mv .env .env.hidden && npx vitest run` (restore it afterwards).
- `npm run build` does **not** catch this: `import.meta.env` compiles to `undefined` and the throw is runtime.

## Data quality

- Multiplayer walkover wins (every opponent left) record near-zero cards played and seconds-long durations. Speed/efficiency records and achievements gate on `cards_played_total >= 5` - keep that filter consistent between SQL (`public_profile`, `weekly_spotlights`) and `frontend/src/utils/achievements.ts`, which has an agreement test suite for exactly this.
