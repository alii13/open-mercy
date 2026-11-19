# Private rooms at the 3D table

## TL;DR

Private rooms (CREATE ROOM, a room code, an invite link) wait at the same 3D table as public rooms. Everything the private waiting room does today stays: the host starts the game, kicks players, and the room seats 20. There is no auto-deal clock. The work is about a day: a small Worker change, then the table learns a private mode.

## Goal and success criteria

The one-line test: "You see your friends' cards standing around the table, then the host taps START."

Done means:

1. A private room on the web shows the 3D table instead of the list.
2. Every private-room action still works from the table:
   - the room code and SHARE LINK, and the rules
   - START GAME for the host, once 2 or more people are connected
   - the HOST tag, and the host removing a player
   - renaming yourself
   - voice chat, with the per-seat mute (the host mutes for everyone)
   - INVITE FRIENDS, JOIN THEM (another waiting room), PLAY VS BOT INSTEAD, LEAVE ROOM
   - quick chat, and the tips while you wait alone
3. The host's START plays the same start on every screen: 3-2-1, the deal, SHOW NO MERCY, then the game.
4. Public tables do not change: 7 seats, the 30-second clock, house players, the next hand.
5. A private room never gets house players and still seats 20.
6. The list stays as the fallback: no WebGL, the table's code fails to load, or you joined just as a game ended.
7. The iPhone app (v0.1.1 bundles its own web build) keeps the list until its next release, and still plays in the same room as web players.

## What changes

### Worker (game-server), deployed first

1. **Relay table moves in private rooms.** The `lounge` case in `index.ts` drops its public-only check. It still only relays in the lobby and keeps its rate limit.
2. **The host's START becomes a 3-2-1** (decision 2). In a private lobby, `start` arms a 4-second clock instead of dealing at once.
   - A second START while the clock runs does nothing.
   - Presence frames carry the clock in private rooms too, so someone joining mid-count sees it.
   - At zero, the room deals to everyone connected if 2 or more are left. Otherwise it clears the clock and the table goes back to waiting.
   - REMATCH from the result screen still deals at once.
   - The rule goes in `autoStart.ts` as a pure function, so it is tested without the Cloudflare runtime.
3. **No changes needed:** house seats already skip private rooms (`armHouse` returns early), and `doorVerdict` already seats 20.

An old list client (the iPhone app) whose host taps START sees the countdown ring for 4 seconds, then the deal. Nothing breaks.

### Web app

1. **`MultiplayerLobby.vue`:** `atTable` stops requiring a public room. It skips the "joined as a game ended" case, which keeps the list.
2. **`PublicTableLounge.vue` becomes `TableLounge.vue`** with a private mode read from `mp.isPublicRoom`:
   - **Top left:** `ROOM · ABCD` and the rules, then `3 AT THE TABLE / 20`.
   - **Top right**, where the public clock sits: "WAITING FOR THE HOST", then `DEALING IN 0:03` once the host starts.
   - **Bottom, one primary at a time:** the host with 2 or more people gets START GAME (3). Anyone alone gets SHARE LINK. A guest sees "Waiting for Ali to start".
   - **No ROOM button.** The room lives on the table:
     - share is the big INVITE FRIENDS when you are alone. With company, the share button opens SHARE TO… (the phone's share sheet) and COPY CODE: at the top right on wide screens, beside START on phones
     - voice sits next to the speaker: JOIN VOICE, then MUTE / UNMUTE and LEAVE VOICE once you are in. On phones voice and LEAVE wait in a tray behind the more button, and the speaker sits at the top right
     - the host's name tag carries a HOST chip
     - tapping your own name tag opens the account sheet, which renames you in the room
     - tapping someone else's tag opens a small sheet: Remove from room (host), and their voice mute when they are in voice
     - guests see "Waiting for <host> to start" where the host's START would be
   - **Dropped at the table** (still in the list view): the invite-friends list, JOIN THEM, PLAY VS BOT INSTEAD (LEAVE goes home, where the bot game is) and the waiting tips.
   - **Phones:** a dark band behind the top and bottom text, a readable how-to line that leaves once you have played with the table, and one small toast at a time. These also apply to the public table.
   - **Hazard tapes** read `ROOM ABCD · 5 PLAYERS · 7 CARDS EACH`.
3. **`lounge/scene.js`:** a `rename(id, name)` call. Today a renamed player's card keeps the old name, because the table only reads names when a player joins.
4. **The deal at 20 players.** The deal deals 7 rounds to every seat, 0.035 s apart: about 5 s at 20 seats, close to the 9-second safety cap. The stagger shrinks with the seat count, so every deal takes about the same time as a 7-seat one.
5. **Music and voice** (decision 4): the table's track pauses while you are in a voice channel.

The account menu stays hidden at the table, as it is at the public table. LEAVE is the way out.

## Steps, each with its check

| # | Step | Check |
| --- | --- | --- |
| 1 | Worker: relay in private lobbies, the private START clock | New `autoStart` tests fail first, then pass. `tsc` passes. The existing "never runs in a private room" auto-start test still passes |
| 2 | Lobby: `atTable` for private rooms, list kept for the fallback cases | Private room opens at the table; forcing `loungeFailed` shows the list |
| 3 | Table: private HUD, START, share, voice controls | Every action in success criterion 2 works from the table |
| 4 | Scene: `rename`, deal stagger by seat count | Rename shows on every screen; a 20-seat deal fits the cap |
| 5 | Music pauses in voice | Join voice at the table: the track stops; leave voice: it resumes |
| 6 | Full pass | Tests, build, `tsc`; the multi-browser runs below |

## Verification in browsers

1. **Three browsers in one private room** (host, guest, late joiner):
   - each sees the others move, flick and draw
   - the late joiner sees everyone where they stand
   - rename shows on every card
   - the host removes a player
   - START plays the 3-2-1, the deal and the tapes on all three within a frame of each other
   - the game plays; REMATCH deals at once
   - LEAVE works
2. **A mixed room:** one browser forced onto the list, standing in for the iPhone app, starts and plays with two at the table.
3. **A crowded table:** 10 or more seats for crowding and the deal length. Frame rate on a throttled phone profile.
4. **Public regression:** quick match still deals at 30 seconds, with house players and the next hand.

## Rollout

1. Deploy the Worker (your OK).
2. Merge right after (your OK). Back to back, as with the public table, so production never runs a mismatched pair for long.
3. The iPhone app gets the table with its next release.

Ask at PR time: a changelog entry or not.

## Decisions (owner, 2026-11-19)

1. "Without time limit" means no auto-deal clock: the host starts. The 2-minute turn timer in the game stays.
2. START plays a synced 3-2-1 (needs the Worker change above), instead of dealing at once.
3. After a hand, REMATCH works as today, so the table shows only before the first game.
4. The table music pauses while you are in voice chat.
