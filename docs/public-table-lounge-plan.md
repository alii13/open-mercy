# Public table lounge - plan
TL;DR: Quick match becomes its own "Public table" card on the home page, and the public waiting room becomes a 3D card table where every player is their own card: you move, flick cards at each other, draw from the deck and emote until the deck deals and the camera drops into the game. We prove the look in a standalone Three.js prototype first, then wire it to the real room in four iterations. The game engine does not change; the server gains one relayed message type.
## What is wrong today
- Quick match is one row of three under "Or jump in". It is the only way to meet a live opponent and it reads as a utility.
  
- The waiting room is name pills and a countdown ring. Ten to sixty seconds with nothing to do, and a solo waiter stares at three pulsing empty seats.
  
- Nothing in the room makes the other players feel present. They are rows, not people.
  
## The idea - the table
- The lounge is the table you are about to play at, seen from a low seat across the felt, one lamp overhead, the room falling off into black.
  
- You are your card. A standing card with your photo on the face and your name tagged above it. Not an avatar, nothing to dress.
  
- Four gestures, each one tap or one drag, all of them fine on a phone:
  
  1. Drag your card, or tap the felt: your card slides there. Everyone sees it move.
    
  2. Tap someone's card: you flick a card at them across the felt. It skids, hits their card, theirs wobbles.
    
  3. Tap the deck: a card lifts, flips and shows a face to everyone. "WildCard drew +10."
    
  4. Tap your card: a bubble over your head, from the existing quick chat phrases.
    
- Alone: the deck shuffles itself, the lamp sways, dust drifts in the cone, the empty seats are dashed outlines, "waiting for 1 more". It looks like a place, not an error.
  
- The deal is the transition. At zero the deck deals seven cards to every seat in arcs, the camera drops to your seat, and the real hand slides in where the dealt cards landed.
  
- Why this over a walking-avatar room: no joystick, no character art, good with one player and better with every extra card, and every object is already the game's own, so it cannot look borrowed.
  
## What we build on (as the code is today)
- Quick match: `MultiplayerLobby.vue:995` calls `multiplayerStore.quickMatch`. It asks the directory DO for open rooms (`GET /public-rooms`), joins the fullest, or creates one (`POST /rooms {public:true}`). The route does not change; the waiting block is `gameStatus === 'waiting'` inside the same component (`MultiplayerLobby.vue:315-551`).
  
- Auto-start (`game-server/src/autoStart.ts`): 60 s once two players are connected, minus 5 s per extra join, floor 10 s, full room 5 s, one `extend-start` of 60 s per room. The clock rides on `presence` frames.
  
- Presence carries `userId, name, connected, skin` (`shared/protocol.ts:3-9`). No photo, no flag, no ready state. Every presence broadcast also writes the directory DO, so nothing high-frequency may ride on it.
  
- Socket limit is 10 messages a second per socket, chat is 1 a second (`socketLimit.ts`, `chatLimit.ts`).
  
- `three` 0.185 is already a dependency, used by `FxLayer` in the lazy-loaded game views. The lobby bundle does not carry it today. `gsap` is eager.
  
- Any wire change needs the Flutter mirror in the same PR, and the Worker is deployed by hand.
  
- Profile photos exist (PR 227) but are not in presence.
  
## Iterations
Each one ships on its own and is useful on its own.
### 0. Public table card on the home page
- Right column: Create game stays on top. Below it a "Public table" card with the live count, the countdown of the fullest open room, who is sitting (names and photos from `/live-tables`, which already polls every 15 s), and a Take a seat button. "Join with code" and "Play vs bot" drop to a compact row underneath.
  
- Copy: PUBLIC TABLE / "4 at the table" / "Dealing in 0:42" / "Strangers' game. Take a seat, it deals itself."
  
- No server change if `/live-tables` already returns seat counts and the clock. If it does not, add those two fields to the directory entry.
  
- Check: the card shows live numbers on prod data; clicking it lands in the same room the old row did.
  
- Size: half a day.
  
### 1. Standalone prototype - the amaze check
- One HTML page plus one JS module in `docs/lounge-proto/`, Three.js from the local copy, no Vue, no server. Fake players wander, flick, draw and emote on timers so the scene is alive on load.
  
- Everything from the idea section at full quality: lamp with a volumetric cone and dust, felt and chrome rail from a baked studio environment, real card art from `cards-webp` for draws and the deal, the `CardBack` art as a texture for backs, bloom on the lamp and the rings, slow camera drift, the deal sequence on a loop.
  
- Borrowed from throughline: the studio environment bake, the material family, canvas-texture labels, the WebGL fallback, the screenshot sweep script.
  
- Check: open it in a browser and decide. Screenshots at 1440, 1024 and phone width. Sixty frames a second on a MacBook, thirty on a mid Android.
  
- Size: one day. This is the gate for everything below.
  
### 2. The lounge in the real room
- Client: a `PublicTableLounge` component replaces the waiting block for public rooms only. Private rooms keep the list. Loaded with a dynamic import so the lobby bundle does not grow.
  
- Presence drives who is at the table. A player joins: a card rises out of the felt at a free seat. A player leaves: the card slides off the edge.
  
- Server: one new message, `lounge`, with `kind: 'move' | 'flick' | 'draw' | 'emote'` and a small payload. The DO relays it to the room and stores nothing. No tick, no physics on the server. Every client animates the same event from the same numbers.
  
- Late joiners: when presence changes, each client re-sends its own `move` once with a random delay under half a second. No server state needed.
  
- Photo: add a `photo` URL to the auth message and the presence player record. It changes only on join, so it is safe on presence.
  
- Rate: a player sends at most one lounge message every 250 ms, well under the 10 a second socket limit.
  
- Public rooms seat 7, not 20. The directory stops offering a full room, so the next player starts a new table. Private rooms keep 20 (assumption).
  
- Each player's card shows their tier badge and all-time global rank. Tiers already come from `player_points`. The rank needs a definer function that returns ranks for a list of user ids; today only `alltime_my_rank` exists, and it covers yourself.
  
- No clock while the table fills. A 15 s countdown starts when the seventh player sits, then the 3-2-1 and the deal. No cut per join and no +60 s. All of this is an `autoStart.ts` change.
  
- Only `move` and `emote` in this iteration. Countdown, extend, invite, leave and quick chat stay as HUD over the canvas.
  
- The deal transition plays at zero, then `MultiplayerGameView` mounts as it does today.
  
- Flutter: the mirror learns to ignore `lounge` frames in the same PR; the mobile lounge comes later.
  
- Check: two browsers in one public room see each other move and emote within a frame of each other; a third joining sees both at their real positions; leaving removes the card; the old list still renders in a private room.
  
- Size: two to three days.
  
### 3. Toys
- `flick`: payload is origin, direction and speed. Each client runs the same skid with friction and the same wobble on the card it hits.
  
- `draw`: payload is a card id from the deck art set. The top card lifts, flips and shows the face for two seconds, with the caption.
  
- Emote bubbles grow to a radial picker on your own card.
  
- Check: a flick fired on one client lands on the same card on another; a draw shows the same face everywhere; rate limit holds under spam.
  
- Size: two days.
  
### 4. Phone, fallback, polish
- Portrait camera from higher up, table fills the width, HUD top and bottom, every gesture verified on a real phone.
  
- No WebGL or reduced motion: the current list renders instead.
  
- Pixel ratio capped at 1.75, loop stops when the tab is hidden, textures uploaded before the first frame.
  
- Solo state with the idle deck and the "waiting for 1 more" line.
  
- Changelog entry in the same PR. Ask which volume before opening it.
  
- Check: screenshot sweep at four widths, a mid Android at thirty frames a second, Lighthouse on the lobby route unchanged.
  
- Size: two days.
  
### Later, not now
- Spectators standing at the rail (needs the spectator role from the spectator plan).
  
- Card skins on your lounge card.
  
- Sound: the shuffle, the flick, the deal.
  
- The lounge on Flutter.
  
## Decisions for you
1. The name. Public table is my pick. Public matches or Open table are the alternatives.
  
2. Public rooms only in the first version, private rooms keep the list. Or both from the start.
  
3. Prototype as a standalone page under `docs/lounge-proto/` first (my pick), or build straight into the Vue app and skip the gate.
  
4. Toy order. Move and emote first, then flick, then draw (my pick). Or all three in iteration 2.
  
5. Alone at the table: idle deck and "waiting for 1 more" (my pick), or a bot stand-in card that leaves when a human sits.
