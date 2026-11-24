# Announcements, with optional bonus points

## TL;DR

The owner posts an announcement by adding one row in the Supabase SQL editor, with no deploy. A row can also carry a points multiplier: players who tap the button get, for example, 2x points on games they finish before it ends. The server decides every doubled game when the result is saved, so nothing a browser sends can fake it.

Design: Paper, page "Open Mercy · 2x points announcement" (phone sheet, desktop dialog, and the "you're in" top bar for both).

## What the owner controls

One table, `announcements`. One row is one announcement.

| Column | Example | Notes |
| --- | --- | --- |
| `id` | `2026-11-25-10k` | ISO date first, never reused |
| `starts_at`, `ends_at` | `2026-11-24 18:30Z`, `2026-11-25 18:30Z` | Midnight to midnight India time |
| `eyebrow` | `WE JUST PASSED 10,000 PEOPLE` | Small red line |
| `hero` | `2X` | Big display text, short |
| `hero_title`, `hero_note` | `POINTS`, `FOR 24 HOURS` | The two lines beside the hero |
| `body` | One or two sentences | Plain text, never HTML |
| `image_path` | `/announcements/ga-10k.png` | A file under `frontend/public/announcements/`; optional |
| `image_caption` | `Our Google Analytics, last 30 days` | |
| `button_label` | `COUNT ME IN` | |
| `points_multiplier` | `2` | Empty for an announcement with no points |

- **End it early:** `update announcements set ends_at = now() where id = '...'`.
- **Move it:** change `starts_at` and `ends_at` before it starts.
- The SQL file carries a ready-to-copy insert as a comment.
- If two rows overlap, players see the one that started last. A game is boosted by the bigger multiplier among points announcements the player joined.

## What a player sees

- **Who and where:** anyone signed in, guests included, in the lobby and not in a match. This is the same rule the release card uses.
- **When:** while an announcement is live and the player has not tapped its button.
  - The modal shows a player at most twice. "Not now" the first time brings it back on the next visit; after the second "Not now" that player can't join. The server counts the showings, so clearing the browser doesn't reset them.
  - An announcement with no points just has an OK button and goes away for good once tapped.
- **No stacking:** a visit that shows an announcement does not also show the release card or a poll. They wait for the next visit.
- **After tapping a points announcement:**
  - the button turns into a green "YOU'RE IN", and under it "Want people to play with?" offers a blurple JOIN OUR DISCORD button (the invite, no check) and Done
  - a red `2X 14:21:53` countdown in the top bar until it ends
  - the countdown runs on server time, so a wrong phone clock doesn't matter
- **iPhone app:** it bundles its own copy of the website, so it gets this in its next App Store release. Until then, iPhone players can't opt in.

## How the points work

1. `game_results` gets a `points_multiplier` column, default 1.
2. A trigger stamps the column as each result is saved. It sets the announcement's multiplier only when all three are true:
   - a points announcement is live at the game's `played_at`
   - the player tapped the button at or before `played_at`

   Anything else gets 1. A value sent by the saver is always overwritten.
4. Every place that turns a game into points multiplies that game's points by the column:
   - `add_game_to_alltime_totals` and the rebuild in `alltime-score-totals.sql` (ranks)
   - `player_points` (badge tiers)
   - `badge_holders`, `my_badge_dates`, `profile_promotions`, `profile_recent_games`
   - the browser's `gameContribution` (the badge-up shown right after a game)
5. The +25 for a day played is multiplied too: a day with a boosted game is worth 25 times that game's multiplier.
6. A spec fails if any of those SQL copies lose the multiplier, the same way `walkoverGuardSql.spec.ts` guards the walkover rule.

## How it stops abuse

I checked these facts against the live database on 2026-11-24:
- Browsers cannot insert into `game_results`. The `authenticated` and `anon` roles have no insert grant.
- Results arrive only through `record_bot_result`, which stamps `now()`, or from the game server, which stamps its own clock when the game ends and keeps that time on retries.

| Someone tries to | What stops it |
| --- | --- |
| Tap the button before it starts or after it ends | The tap goes through a server function that refuses outside the window. The taps table can't be written directly |
| Backdate a game into the window | `played_at` comes from the server, never the browser |
| Send `points_multiplier = 2` | The trigger overwrites it |
| Get games from before the tap doubled | Only games finished after the tap count |
| Finish games after the end | Not doubled. A game finished at 23:59 and saved late on retry still counts, because the game server keeps its end time |
| Skip twice, then tap | The server counts showings and refuses the tap after the second skip |
| Script fake bot wins all day | Only the existing limit of 40 bot results per 10 minutes. No extra cap, by the owner's call on 2026-11-24 |
| Change the row after it ends | Saved games keep their stamp. Editing a row only affects games saved afterwards |
| Rebuild the totals | The rebuild reads the stamped column, so doubled points survive |

**Known gap, accepted:** the browser reports bot game results. A cheater can already fake bot wins up to the rate limit, and for this day each is worth double. The owner chose no cap (2026-11-24).

## Steps

| # | Step | Check |
| --- | --- | --- |
| 1 | `supabase/announcements.sql`: two tables, the stamp trigger, the tap and read functions, the six points functions recreated from their live bodies | The new spec fails first, then passes. I compare each live function body with the repo before editing |
| 2 | Browser: `useAnnouncement`, `AnnouncementModal.vue`, top-bar chip, `gameContribution` | `npm run build` and `npx vitest run` |
| 3 | Browser check at 390 and 1440 wide, with a test row in a local copy | Every state: live, tapped, not now, ended, no announcement |
| 4 | PR, repo review skill, fix findings | Threads resolved, CI green |
| 5 | Owner runs the SQL, merge, then insert the row | The modal shows on open-mercy.com; a test game saves with multiplier 2 |

No changelog entry, by the owner's call on 2026-11-24: the modal is the announcement.

The SQL is additive. Until a row exists nothing changes, so merging and running the SQL can happen in either order.

**Time:** about one working day before the PR is ready, so the event row goes in after merge.
