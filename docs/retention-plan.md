# Retention plan - the first session and the way back
TL;DR: a third of new accounts never finish a game, the most common "one game and gone" is a 20-minute multiplayer elimination, and nothing calls a guest back the next day. Five phases, each its own PR, ordered by the size of the leak they close. Every phase names the number it moves and the hook it uses to hold the player.

Numbers are from the 2026-11-08 pull (Supabase `game_results` and `auth.users`, GA last 28 days). The earlier "fill the table so it feels full" idea is dropped: first-table size does not change return (1v1 18.5%, 3 players 20.7%, 4+ 18.5%), and small tables play twice as many hands on day one.
## The leaks, in order of size
| Leak | Number | Phase |
| --- | --- | --- |
| Accounts that never finish a game | 1,242 of 3,811 in October (33%) | 1, 4 |
| Entered a multiplayer room, no game ever started | ~950 users / month | 1   |
| Only game was a multiplayer elimination (133 of them walked away mid-hand) | 337 / month | 1   |
| Played one solo hand and left | 208 / month | 2   |
| Guests with no way back (no push, 9% claim) | 93% of players | 3   |
| Mobile visitors who never press play | 45% vs 33% on desktop | 4   |
| Nobody invites anybody | 20 inviters / month | 5   |
## Hooks we use
The game cannot change (it is UNO). What holds a player is what surrounds the hand. Each hook below is a known mechanic with a known reason it works; the column on the right says where it lands in this plan.

| Hook | Why it works | Where |
| --- | --- | --- |
| Instant start | The first fifteen seconds decide whether a visitor becomes a player. Candy Crush level 1 starts in two taps and cannot be lost. | Phase 1 |
| Stay seated | The default after a hand is the next hand, not a menu. Asking "play again?" invites "no". | Phase 1 |
| Mercy reveal | A loss shown as a near miss ("two cards from safety") is an unfinished story. An unfinished story pulls harder than a win (Zeigarnik). | Phase 1 |
| Endowed progress | A progress bar that starts partly filled gets finished more often than one that starts empty (Nunes and Dreze). The first hand counts as rung one. | Phase 2 |
| Always a next | The home screen always shows one unfinished thing: the next bot's face, the badge two steps away, today's deal. Candy Crush's level map is only this. | Phase 2 |
| Mystery drop | A small random reward (a card back) on some rungs, not every rung. Variable reward beats fixed reward for return. | Phase 2 |
| Streak with a shield | Streaks work through loss aversion, and a streak that dies on one missed day makes people quit for good. One free shield a week keeps the loss real and the quit rare (Duolingo's most effective mechanic). | Phase 3 |
| Appointment | "Today's deal is ready" at the hour the player usually plays. One a day, never more. | Phase 3 |
| Something to lose | Ask for the account when the ladder and the streak are worth saving, not on arrival. | Phase 3 |
| A face at the table | An invite that lands on "Ali is waiting at the table" with Ali's photo is a social obligation, not a link. Ludo King won India on this. | Phase 5 |

Not doing: lives or energy, paywalls, fake "3 people are watching", padded wait timers, more than one notification a day, tournaments (no liquidity to fill them). A hook that lies is a hook that works once.
## Phase 1: the first table deals in fifteen seconds
**Goal.** A new player who taps the public table sits at the 3D lounge table, watches it fill, and is holding cards within fifteen seconds, at a small table, and is still seated for hand two.

**Metric.** Room-joined-without-a-game from ~950 to under 500 a month. One-and-done multiplayer eliminations from 337 to under 170. Hands per player on day one up.

**What changes.**

1. The 3D lounge is the default public table. The clock starts when the first human sits: fifteen seconds, then the deal. Humans who arrive in that window take seats; house players fill the rest up to four: the ladder bots with names and photos, no bot tag on the roster. A lone waiter is never alone and never pushed into a solo game.
  
2. House players walk in during the fifteen seconds, one at a time with a few seconds between them, as cards sliding to their seats, and they flick cards and emote like anyone else. The wait is the show, and a table that fills in front of you is believable in a way a roster that appears at once is not.
  
3. Seven-seat tables stay as a choice ("big table"), not the default. It keeps today's rule (no clock until seven, then fifteen seconds) and never seats a house player. If nobody picks it after a month, it goes.
  
4. A human who arrives mid-hand spectates (exists) and takes a bot's seat at the next hand through the rematch join (exists). Bots yield seats to humans, never the other way round.
  
5. After a hand the table returns to the lounge for the next deal and everyone stays seated. Leaving is a button; staying is the default. "Hand 2 of 3, win one to earn your first badge" sits over the countdown (endowed progress).
  
6. The elimination screen gets the mercy reveal: the biggest stack survived, how many cards from safety, and the rematch button first. Today it says "eliminated" and offers a menu.
  
7. The turn timer keeps removing walk-aways, but the tab title and a sound say "your turn" when the tab is in the background, so a phone that only blinked gets its turn back.
  

**Status (2026-11-08).** Built as PR 1a on `feat/house-players`: the clock from the first person, house players (`game-server/src/house.ts`) that walk in, take their turns after a human-sized pause, call MERCY most of the time and leave after two to five hands, the return to the lounge ten seconds after each hand, a result screen whose main button goes back to the table, and `house_count` on the human rows (`supabase/house-players.sql`). A person always takes a house seat first, and a seat with no profile gets no ADD chip. Seven seats stay: house players top a table up to four, people can fill it to seven, so the "big table" option is not needed. The rules-page disclosure line was left out, per the owner. Moved to follow-ups: the mercy reveal, the background-tab "your turn", "hand 2 of 3", house players catching a missed MERCY, and joining a table mid-hand (quick match joins tables in their lounge only).

**Check first.** Whether the game server can run a bot turn inside the Durable Object. Answered: yes, `autoPlayTurn` already plays a turn with the bot brain from the alarm. The solo bot AI lives in the engine package the server already imports, so the question is alarm scheduling, not AI. If it cannot, phase 1 is a client-side "bot table" (solo engine, multiplayer screen) and the public table keeps its current rules until it can.

**Files.** `game-server/src/autoStart.ts` (clock from the first human, deal with house players), `game-server/src/seats.ts` (house seats yield), `shared/lounge.ts` (`PUBLIC_SEATS` becomes a per-table size), `frontend/src/components/PublicTableLounge.vue` and `frontend/src/lounge/scene.js` (house players walk in, the return to the lounge after a hand), `frontend/src/components/game/GameOverModal.vue` (mercy reveal, stay seated), `frontend/src/stores/multiplayerStore.ts` (house roster rendering).

**Verify.** Unit tests on `autoStartTick` and `doorVerdict` for the new rules. In a browser: a lone guest at `/public` sees the lounge fill and is dealt within fifteen seconds against house players; a second browser joining mid-hand spectates and sits at hand two; closing a tab mid-hand still ends in elimination; phone viewport.

**Cost and risk.** Three to four days. The lounge is live (PRs #235 and #236), so the work is the clock rule, the house players on the server, and their walk-in and return-to-lounge in the scene. One PR plus a game server deploy by hand before the frontend merges. Risk: house players get found out, and a table that was fun becomes a Reddit thread. Unlabelled seats need these guardrails to survive contact with players:

- House players behave like people: a think time that varies by hand, the odd slow turn, a quick-chat line now and then, and they leave after a few hands instead of sitting forever. A seat that answers in 1.2 seconds every turn at 4 am is a tell.
  
- They have no profile page, cannot be friended, send no pings, never appear on a leaderboard or a kill card, and never take a human's seat.
  
- A human always replaces a house player first, so a busy table is all human.
  
- Every hand with a house player is flagged in `game_results` (a `house_count` column) so our own numbers stay honest. The leak table above is built on `is_bot_game`; without the flag, phase 1 corrupts the metric it is measured by.
  
- One line in the rules page: "Public tables may be filled by house players." Nobody reads it, and it is the difference between a game that uses house players and a game that lies.
  
## Phase 2: the road on the home screen
**Goal.** The home screen always shows one unfinished thing, and a solo hand is a step on a road rather than a hand.

**Metric.** Solo one-and-done from 208 a month down by half. Share of new players in the 2 to 4 hands bucket up, 1-hand bucket down. D1 from 11.6%.

**What changes.**

1. A "Your road" strip under the play buttons: rung N of M with the next bot's face and name, the next badge with its progress ("2 of 3 stacks survived"), today's deal status. The first rung is "played a hand", so a new player's bar is never empty.
  
2. Card backs attach to rungs. Most rungs show what they unlock; two or three are "mystery" and drop a back the player has not seen. Cosmetics only, nothing bought.
  
3. The ladder moves from `localStorage` to the profile so a cleared browser or a second device keeps it. This is also phase 3's claim argument. New `profiles` columns need a column grant (see the profile photos PR).
  
4. The game over screen for a solo win shows the road advancing, not a stat sheet: the beaten bot's card flips face down, the next one slides in, the back drops if one was due.
  

**Files.** `frontend/src/utils/botLadder.ts` (profile-backed store with the local one as the fallback), `frontend/src/components/LandingPage.vue` (the strip), `frontend/src/utils/cosmetics.ts` (rung to back mapping), `frontend/src/components/game/GameOverModal.vue`, `supabase/ladder.sql` (additive columns plus grant).

**Verify.** Tests for rung to reward mapping and for the profile sync with the local fallback. In a browser: a fresh guest sees rung one filled after the first hand; a mystery rung drops a back; a cleared browser plus the claimed account restores the rung.

**Cost and risk.** About a week. Risk: the strip crowds the home screen on phones. It is one row, and the public table card keeps the top slot.
## Phase 3: a reason for tomorrow
**Goal.** A guest who played today has one thing waiting tomorrow and one way to hear about it.

**Metric.** Claim conversion from 9% to 15% of players shown the prompt. Claimed accounts from ~155 to 300 a month. Return within 7 days from 18.7%.

**What changes.**

1. The streak that already lives in `retentionStore` becomes the hazard-yellow loop on the home screen: today's deal, the streak count, and one shield a week that absorbs a missed day. The shield is free and cannot be bought.
  
2. Web push, opt-in, asked on the second day a player plays, never on the first visit. One message a day at the hour the player usually plays ("Today's deal is ready. Streak: 4"), quiet hours respected, one-tap unsubscribe in the same panel. Subscriptions in a `push_subscriptions` table (additive SQL); a scheduled handler sends them.
  
3. The claim prompt moves. Today it fires once from the game over screen. It fires instead when there is something to lose: a streak of three, a ladder past rung three, or a first multiplayer win. Copy names the thing: "Save your 4-day streak and rung 5".
  
4. A friend ping ("Ali pinged you") rides the same push channel. The `pings` table exists.
  

**Check first.** Where the scheduled sender runs. The game server Worker has no cron trigger today; adding `scheduled` to it is one line in `wrangler.toml`, but it then needs the Supabase service key as a Worker secret. A Pages Function cannot be scheduled.

**Files.** `frontend/public/sw.js` (new), `frontend/src/composables/usePush.ts` (new), `frontend/src/utils/claimSpotlight.ts` (trigger rules), `frontend/src/stores/retentionStore.ts` (shield), `supabase/push.sql`, `game-server/src/push.ts` plus a `scheduled` export.

**Verify.** Tests for the shield rules and the claim trigger rules. In a browser: opt in on day two, receive a test push from a local cron run, unsubscribe. A real Google claim from the new prompt on a phone.

**Cost and risk.** Two to three days. Risk: push on iOS Safari needs the site added to the home screen; the opt-in copy says so instead of failing silently.

**Status (2026-11-09).** Items 1 and 2 built. The shield is one free shield every 7 days, for streaks of 2 or more (`shared/streak.ts`, shared with the game server). Push uses `@block65/webcrypto-web-push` on the game server and an hourly cron. Changes from the plan:

- The ask comes after any finished game, not on day two, because most players never have a day two.
  
- 50 wordings rotate per player, so no one gets the same one two days running. Notifications carry "Play now" and "Turn off" buttons.
  
- Taps and sends are counted per wording (`reminder_opened`, `push_sends`).
  
- No reminder ever claims people are waiting at a table.
  

Deferred: iPhone (no web app manifest yet, so the card stays hidden there), item 3 (the claim prompt) and item 4 (friend pings).
## Phase 4: mobile's first click
**Goal.** A phone visitor presses play as often as a desktop one.

**Metric.** Mobile play-click from 55% to 65% of first visits. Mobile solo finish rate from 67% toward desktop's 78%. Mobile join failures (187 users a month, twice desktop's) halved.

**What changes.** Diagnosis first, one day: the landing page on an iPhone 13 viewport with a throttled CPU and a 3G profile, measuring time to the first interactive play button and frames per second on the hero (the bloom and fps item is already open). Then the fix is whatever that shows. The likely candidates are a lighter hero on phones, play above the fold, and the join failure's reason logged as an event parameter so the next pull can say why.

**Files.** `frontend/src/components/LandingPage.vue`, the hero shader, `frontend/src/utils/analytics.ts` (join failure reason).

**Verify.** Lighthouse mobile before and after; the GA play-click split after a week.

**Cost and risk.** One day to diagnose, one to three to fix. Low risk.
## Phase 5: a face at the table
**Goal.** A player who enjoyed a hand can put a friend at the table in two taps, and the friend arrives to a person, not a code.

**Metric.** Inviters from 20 to 100 a month. Referral plus social from 8% of sessions to 15%.

**What changes.**

1. After any hand, a "Play this with a friend" card with WhatsApp first (India is the largest and best-returning market), then copy link. The message carries the room link and the inviter's name.
  
2. The invite link (`/r/CODE`, exists) lands on the inviter's photo and name, "Ali is waiting at the table", and a single sit-down button. Guest sign-in already happens on that route.
  
3. The daily's share grid (growth plan phase 2) and the kill card (growth plan phase 1, `shareImage.ts` exists) ship as the two share surfaces. The `kill_cards` table has had no rows in 28 days, so the kill card is either unshipped or unreachable; find out which.
  

**Files.** `frontend/src/components/game/GameOverModal.vue`, `frontend/src/components/MultiplayerLobby.vue` (invite landing), `frontend/src/utils/shareImage.ts`.

**Verify.** On a phone: share to WhatsApp, open the link signed out, land in the room with the inviter visible.

**Cost and risk.** One to two days. Low risk.
## Sequencing and the weekly read
| Phase | Days | Baseline | Target |
| --- | --- | --- | --- |
| 1 First table | 3 to 4 | 950 no-game, 337 eliminations | 500, 170 |
| 2 The road | 5 to 7 | 208 solo one-and-done, D1 11.6% | 104, D1 15% |
| 3 Tomorrow | 2 to 3 | 9% claim, 155 claims | 15%, 300 |
| 4 Mobile click | 2 to 4 | 55% play-click | 65% |
| 5 Invite | 1 to 2 | 20 inviters | 100 |

Phase 4's diagnosis can run while phase 1 is in review. Phases 2 and 3 share the home screen strip, so 3 follows 2.

The seven numbers in the leak table come from four queries and two GA reports. They get saved as `supabase/health.sql` and a GA pull in the first PR so the weekly read is one run, not a session.

Everything here is correlation turned into a bet. Each phase ships behind its own metric, and a phase that does not move its number in two weeks gets reverted, not defended.
## Decisions for you
1. Server bots at the public table (phase 1) or a client-side bot table until the server can host a bot turn? My pick: check the server first; the client-side table is the fallback, not the plan.
  
2. House players unlabelled with the five guardrails, or a full disguise with none of them? Your direction is no label, and that is what phase 1 says. My pick is the guardrails: the rules-page line and the `house_count` flag cost an hour and are what keep the table believable and the metrics true.
  
3. Small tables by default, with the seven-seat table as a choice? My pick: yes. The data says size does not help return and small tables play more hands.
  
4. The streak shield: one free a week, never sold? My pick: yes.
  
5. Push sender: a `scheduled` handler on the game server Worker, which then holds the Supabase service key as a secret? My pick: yes, with the key scoped to the push table.
  
6. Changelog volume: phase 1 is the one loud card this quarter, the rest quiet? Your call, per the repo rule.
