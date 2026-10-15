# Bugs, open decisions, test gaps and mobile to-do

Found while porting the web app to `mobile/`. Nothing in **Bugs** is fixed yet. The mobile app copies the web's current behaviour, bugs included, until an entry is decided.

Sections:
1. Bugs (web, copied into mobile)
2. Open decisions
3. Not tested yet - web
4. Not tested yet - mobile
5. Mobile: things that differ from the web today
6. Mobile: what is left to build

## Bugs

### 1. Bot hit by Color Roulette draws extra cards

- **Where:** `frontend/src/stores/gameStore.ts`, `setRouletteColor` (line 866) starts the roulette draw loop, and the bot watcher (line 692, `ROULETTE_DRAWING` branch at line 716) starts a second one.
- **What happens:** When the human plays Color Roulette on a bot, the bot picks a colour and two draw loops then run at the same time. The bot keeps drawing after it has hit its colour, and the turn can advance twice.
- **Repro:** Bot holds only red, deck stacked so that red is the 6th card drawn, human plays Color Roulette. The bot should draw 6 cards. It drew **8**. Checked with a throwaway vitest case against the real store; the case was deleted afterwards.
- **Not affected:** a human victim, because the watcher only acts on bot turns.
- **Status:** open, not fixed. The mobile port copies this behaviour.

### 2. Plain Wild card shows the Color Roulette art

- **Where:** `frontend/src/utils/cardGenerator/assets/svgCardMapping.ts:127` (`wild: wildRoulette, // Use roulette as default wild`).
- **What happens:** The 4 plain Wild cards in the deck render with the Color Roulette image, so a player cannot tell them apart by look. The comment suggests it is a deliberate fallback (there is no plain-wild artwork), so this may be intended.
- **Status:** open, needs a decision. The mobile port shows the same image.

### 3. PLAY AGAIN after a solo game faces a fake "Terminator"

- **Where:** `frontend/src/components/game/GameView.vue:655-657`, `restart()` calls `store.initializeGame(['You', 'Terminator'])` with no `botIds`.
- **What happens:** With no bot id, `gameStore.initializeGame` gives the seat the first ladder profile (Scrap). The rematch opponent is *named* Terminator but plays with Scrap's settings. A win then records Scrap as beaten (`recordBotWin(prof.id)`), not whichever bot the player was climbing. The rematch also keeps the last stacking mode, and after a daily it starts a normal, unseeded game named Terminator.
- **How found:** reading the code while porting. Not yet reproduced in a browser.
- **Status:** open, not fixed. The mobile port copies this behaviour.

### 4. About 1% of solo games freeze on a drawn wild after a Roulette on the bot

- **Where:** a consequence of #1 in `frontend/src/stores/gameStore.ts`. The bot victim's second roulette draw loop also calls `finishRouletteTurn`, so the turn advances twice.
- **What happens:** the extra advance moves the turn away from the human while their draw-until-playable loop is still running. When that loop finds a playable wild 750ms later, it puts the game into `CHOOSING_DRAWN_WILD_COLOR` during the **bot's** turn. The colour picker only shows on the human's turn and the bot never answers it, so the game is stuck for good.
- **How found:** a seeded soak test. 2,000 solo games against the real web store in vitest, with fake timers and a simple human policy. **20 of 2,000 froze this way**, the same seeds every time (soak-68, 74, 84, 328, ...). The Dart port freezes on the same seeds in the same state, which also confirms the port matches the web.
- **Status:** open, not fixed. The mobile port copies this behaviour.

### 5. Human frozen with the action lock stuck after a stale bot timer

- **Where:** `gameStore.ts`, the bot watcher (line 692) re-checks only `currentPlayerIndex === players.indexOf(player)`, and `drawCardsForCurrentPlayer`'s 750ms auto-play calls `playerActionPlayCard`, which plays for whoever is current *at fire time*.
- **What happens:** after #1 skips a turn, a bot timer scheduled for an earlier turn fires on a later bot turn, so two bot draw loops run at once. The first finds a card, plays it, and passes the turn to the human. About 40ms later the second loop's auto-play fires and tries to play the *bot's* card as the human. The engine rejects it, but `actionInProgress` was already set to true and is never cleared (`playCard` returns early on `!res.ok`). The human can no longer play or draw.
- **How found:** the same soak, seed soak-99. Whether it triggers depends on how fast the human acts after the bot's play: under about 40ms the stray play lands on the bot's turn instead. Any real player is slower than that.
- **Status:** open, not fixed. The mobile port copies this behaviour.

### 6. Possible page error when a draw animation targets an opponent seat (unconfirmed)

- **Where:** `frontend/src/components/game/GameView.vue`, `triggerDrawAnimation` / `animateSingleCardDeal` call `getBoundingClientRect()` on `opponentRefs[playerId]`.
- **What happened:** while taking reference screenshots of the web game in headless Chrome (Pixel 7 size), the page logged `pageerror: targetEl.getBoundingClientRect is not a function` once, during the first moves of a solo game. The game kept running.
- **How found:** seen once in headless Chrome. **Not reproduced in a real browser and not investigated.** It may be a headless-only timing artifact, or a seat ref that is sometimes a component instead of an element.
- **Status:** open, unconfirmed. Needs a check in a real browser.

## Open decisions

### A. Web-only parts in the mobile app

These exist on the web but only make sense in a browser. Undecided whether the mobile app gets them:

- Landing page SEO sections (`LandingScrollSections.vue`, `LandingFAQ.vue`, `LandingGuide.vue`, player guides)
- Cookie consent (`utils/consent.ts`)
- AdSense and Google Analytics (`utils/analytics.ts`)
- Browser AI tools (`mcp/registerTools.ts`, `mcp/webmcpServer.ts`)
- Shareable page links (`/leaderboard`, `/p/<code>`, `/badges`, `/changelog` in `utils/routes.ts`)

**Status:** open. Until decided, the port covers the screens players use and leaves these out.

### B. Mobile-only behaviour the web has no equivalent for

These were needed on a phone but are not copies of anything on the web. They are listed so they can be approved or removed:

- **Android back button.** In a game it opens the same "Leave the game?" dialog as the exit button. With the settings drawer open it closes the drawer (the web closes it with a tap outside).
- **Haptic tick** when a long-press peek lifts a card (the web calls `navigator.vibrate(12)`, so this is the phone equivalent).
- **Portrait lock.** The app is locked upright; the web has a separate short-landscape layout that is not ported.
- **Share buttons on game over.** On the web, X and WhatsApp open the platform's own share sheet with the image on phones. The app always opens the native share sheet with the image, which is the same thing a phone browser does.

**Status:** open, needs your OK.

### C. Points from the PR #193 review that were not fixed in that PR

- **Music credit licence.** The web credits Kevin MacLeod's CC BY track with the licence in `SiteFooter.vue`; the app copies only the settings drawer's credit (no licence name or link). Fix when the footer/about content is ported, or add "(CC BY 4.0)" to the drawer on both web and mobile.
- **Muted at game start, then unmuted: no music.** `useMusic.ts` never sets `isPlaying` when started muted, so unmuting mid-game does nothing. Inherited from the web; changing it means changing both.
- **iPad orientation.** `ios/Runner/Info.plist` still lists landscape orientations while the app locks to portrait; on iPad multitasking iOS can ignore the lock. Decide whether iPad is a target before the iOS build.
- **Android INTERNET permission** is missing from the release manifest. Not needed yet (the app is offline); it must be added with the first networking PR (Supabase / game server), or release builds fail only there.
- **Test singletons.** `SoundEffects`, `Music` and `SettingsStore` read prefs once per test isolate; a future test that seeds those prefs will be order-dependent. Add a test-only reset when that test is written.

**Status:** open.

## Not tested yet - web

Only the solo game store was exercised on the web (vitest probes against the real `gameStore`, plus headless screenshots of the solo table). Nothing below has been tested by me on the web:

- The landing page, guest sign-in, email/Google sign-in, claiming a guest account, password reset.
- The lobby (`MultiplayerLobby.vue`), friends, invites, presence, quick chat, voice.
- Multiplayer games against the game server (the server was never started).
- Leaderboards, profiles, badges page, changelog, What's New, release card, polls.
- The game-over share image, X/WhatsApp share, daily share text.
- Sound and music playback in a browser.
- The web's 7-card swap sheet, Discard All picker and roulette picker in a real browser (only read in code).
- Bug #3 (fake "Terminator" rematch) and bug #6 (page error) in a real browser.

## Not tested yet - mobile

Played on the Pixel 7: launch, home, How to Play, the deal intro and deal, playing by tap and by long-press peek, drawing, eating a stack, the scrolling hand, calling MERCY, the wild colour picker, winning, the game-over screen, the settings drawer (sliders, How to Play, close, back), the audio toggle, and leaving through the confirm dialog. Everything below is **not** tested on the phone yet:

- **Game moments that did not come up in play:** the 7-card swap sheet, the Discard All top-card sheet, Color Roulette (as victim and as attacker), the CAUGHT! button for a bot that forgot MERCY, being caught yourself, being knocked out at 25 cards, the stack cam at +10, Skip Everyone's shockwave, a reverse's direction sweep, reshuffling an empty deck.
- **Game over:** losing, the badge-up banner, REMATCH, PLAY on the daily nudge, the X / WhatsApp / Image share buttons (sheet opening and the share image itself).
- **Fixes not re-seen on screen:** the narrower MERCY! button and the WhatsApp button overflow fix are in the installed build but have not been looked at on the phone since.
- **The daily challenge** end to end on the phone (it is covered by tests, including the same deal as the web).
- **Settings:** the REDUCED motion option, the slider changing real volume, the About links opening the browser.
- **Sound:** whether every sound effect and the music actually play and fade correctly (the phone's volume was at nearly zero during testing).
- **iPhone:** nothing. Xcode is not fully installed on this Mac, so the iOS app has never been built or run.
- **Other Android phones:** only the Pixel 7 (412x915). Small screens, tablets and landscape are untested.
- **Release build:** only debug builds were installed. `flutter build apk --release` has not been tried.

## Mobile: things that differ from the web today

- **Home screen is a temporary one,** not the web lobby. It has a ladder picker that lets you choose any unlocked bot; the web always offers the next unbeaten bot.
- **No accounts yet,** so the game-over "Save your stats" and "First win logged" prompts are switched off, results are not saved to Supabase, and badges use the guest (local) tally only.
- **No landing page or loading screen** yet.
- **No settings gear on the home screen** (the web's lobby has one).

## Mobile: what is left to build

In the order planned, each copied from the web code:

1. **Landing + start-up:** the loading screen, the landing hero, PLAY NOW (guest sign-in through Supabase), and the sign-in failure toast. Needs the Supabase URL and anon key in the app.
2. **Accounts:** `AuthView.vue` (email sign-in/sign-up, Google sign-in, claim a guest account, password reset). Google sign-in on a phone needs a redirect URL added in the Supabase dashboard and an Android/iOS OAuth client in Google Cloud - you will have to do those two steps.
3. **The lobby:** a full port of `MultiplayerLobby.vue` (about 3,000 lines): play vs bot, daily card with streak, rooms, quick match, invites, profile/badge header, What's New panel, release card and polls.
4. **Saving results:** `logGameResults` to `game_results`, server badge points (`player_points`), daily ranks.
5. **Multiplayer:** a WebSocket client for `game-server/` with a Dart copy of `shared/protocol.ts` (must change in the same PR as the TS file), `MultiplayerGameView.vue`, kicks, rematch, reconnect, quick chat. Tested against a local `wrangler dev` server, never production.
6. **Voice chat:** `voiceStore` / `VoiceMicCluster.vue` (Cloudflare RealtimeKit); needs a native WebRTC package.
7. **Other screens:** leaderboards (daily, weekly, all-time), profiles, badges page, friends page, changelog, What's New.
8. **Web-only parts:** whatever is decided in Open decision A.
9. **iOS:** install Xcode fully, build, and test on an iPhone. The `.ogg` sounds play through the same audio engine on iOS, but this is unverified.
10. **Store release:** app icon and splash (still Flutter's defaults), release signing for Android, App Store / Play Store listings.
