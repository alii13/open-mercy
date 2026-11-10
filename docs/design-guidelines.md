# Design guidelines

How to make a screen for Open Mercy that looks designed, not generated. Read this before any visual change: a new screen, an overlay, a component, or a restyle. The rules come from two places: what the owner rejected in this repo, and what the published design guidance agrees on (sources at the end).

## The one-line test

A screen is ready when you can say, in one sentence, what the player looks at first and what they do next.

"You see the big OUT stamp, then you tap Play again." That is a screen. If the sentence needs an "and", the screen has two heroes. If you cannot write the sentence, you have a list of parts, not a design.

## What "vibecoded" means

It does not mean ugly. It means undecided. Every value is a default, every block has the same weight, and nothing tells the player what matters. A generated screen can be clean and still be wrong, because it has no point of view.

Our own rejected screens all failed this way:

- Game-over boards, 2026-11-09: eleven full-width blocks, all centred, all the same size. No hero.
- Identity boards, 2026-11-10: hand-drawn phones with letter avatars, grey cards and bold colours. They looked like wireframes next to the real app.
- Earlier table passes: scan lines, grid backgrounds, watermarks, terminal labels like DRAW_PILE. Decoration instead of decisions.

## The approach, at a staff level

A staff designer at an Apple-like studio does not start with screens. They decide what the player should feel, write a few principles that settle arguments, and then spend most of the time on the seams: transitions, timing, the half pixel. Read this section at three altitudes. A director sets the principles and the arc. A staff designer owns the seams and the finish. Anyone shipping a component follows the numbered rules further down.

### Principles

Five, short. Each one settles an argument this repo has already had.

1. The table is the hero. Menus, lobbies and results happen over the table, never instead of it.
2. One thing at a time. One hero, one action, one glow per screen.
3. Show, do not tell. If a state can be felt through size, light, motion or sound, it gets no label.
4. Nothing jumps. Every object keeps its position and identity between states.
5. Pressure is a feeling. Mercy, the climb toward 25 and the clock are shown as light and motion first, numbers second.

### The arc

Design moments, not screens. Each moment has one feeling, and that feeling is the brief.

| Moment | Feeling | What carries it |
| --- | --- | --- |
| Arrive | I can play right now | The table visible behind, one button, seats filling |
| Sit | Anticipation | Seats fill one by one, the countdown ring |
| Deal | Weight | Cards fan in with mass, a sound per card, ease out |
| Your turn | Clarity | Everything else dims a step, playable cards lift, no text |
| Pressure | Dread | The mercy bar, the red bleed, a slower pulse as the count climbs |
| Out | Finality | A hard stop, silence, then the stamp |
| Result | Pride, or hunger | One number, what changed, one way back |
| Leave | A reason to return | One quiet line: tomorrow's daily, or the streak |

### Seamless means no seams

Apple's word for this is fluid: the interface behaves like a physical thing in your hand.

- Objects persist. The card you tap is the card that lands on the pile. The seat pill that showed the name is the pill that grows the rank word. A badge-up at game end rises out of that pill, not out of a new modal.
- States layer, they do not replace. The result rises over the frozen, dimmed table. The lobby is the table with empty seats.
- Motion is interruptible. The next tap cuts the current animation and redirects it. Nothing locks the player out while it moves.
- Position is memory. HUD elements never move between states. The eye learns where to look once.
- Latency is hidden. The move shows the instant you tap and is confirmed after. The broadcast-first commit in this repo already does this, and every new interaction follows it.
- Sound, motion and haptics land on the same frame, where the device supports them.

### Fit and finish

What a director checks that nobody can name but everybody feels.

- Optical centring, not mathematical. A stamp, an icon or a play triangle sits where it looks centred.
- Concentric corners. Inner radius equals outer radius minus padding.
- Hairlines at one device pixel (0.5px on 2x, 0.33px on 3x), or none.
- Counters use tabular numerals (`font-variant-numeric: tabular-nums`) so digits do not jitter as they change.
- Type sizes and the end of every transform land on whole pixels, so text stays sharp.
- Never a linear curve. Entries ease out, exits ease in and are shorter.
- One stroke everywhere: Lucide at 2px, in the three fixed sizes.

### How a director works

- Demos, not decks. Every proposal runs on a phone, in motion. A board is only for a layout with no motion, which is rare in a game.
- Side by side. Open Balatro or Marvel Snap on the same phone next to ours. If ours looks like a web page next to a game, it is not done.
- Say no. Each PR lists what was removed. Screens get better by subtraction far more often than by addition.
- Fewer, stronger proposals. One direction with its reason written in the PR beats three variants with no opinion.
- The brief is one line. Write the one-line test before the first pixel.

## How to work

1. Start from the real render. Run the app, put it in the state you are changing, and screenshot it at 390px wide. Change the code, screenshot again. Never draw an existing screen by hand.
2. Prototype in code, not on boards. For multiplayer states use the WebSocket stub, for ranks patch the points call. The screenshot of the running app is the design.
3. Pull references only for parts that do not exist yet. Mobbin for app patterns, the games listed below for table feel. Take the structure, never the material.
4. Before you draw, write the one-line test for the screen. Name the hero and the one action.
5. Before you open the PR, run the four tests at the end of this file on the screenshot.

## 1. One hero per screen

Every screen or overlay has one thing at real scale and everything else steps down from it. On a result screen that is the stamp or the one number. At the table it is the discard pile. In a lobby it is the play button.

- One filled button. The second action is a text link, not a second button.
- Data sits on the surface, not in boxes. A number with two small words under it beats a card with a label, a number and a hint.
- Delete legends, hint lines and duplicate strips. If the layout already says it, the label is noise.
- Generous space after the hero, tighter space between the small things below it.

Good: Deezer's quiz result. One big score, the best score in one small line under it, the rank, two actions. Nothing else.

## 2. Three levels of text, three tools

Hierarchy comes from size, weight and colour used together. Size alone makes the top too big and the bottom too small.

- At most three text levels on one screen: the hero, the body, the quiet line.
- Three text colours exist and they are the only three: `--text-primary`, `--text-secondary`, `--text-muted`. Do not invent a fourth grey, and do not use grey text on a coloured surface. On colour, use a tint of that colour instead.
- Two weights: 400 to 500 for reading, 600 to 700 for emphasis. Nothing under 400.
- Make the small thing smaller or quieter rather than the big thing bigger.

## 3. Tokens only

The scale exists so that nothing is decided twice. Today the code decides everything twice: 97 distinct font sizes (269 hard-coded against 234 from tokens), 30 letter-spacings, 24 radii, 73 hand-written durations. That spread is what reads as sloppy, the same way six icon sizes did before the 2026-08 icon cleanup.

New or touched CSS uses tokens from `frontend/src/style.css` and nothing else.

| Use | Token | Notes |
| --- | --- | --- |
| Stamp, result word | `--text-hero` 80px, `--text-display` 48px | `--font-display` (Black Ops One). One per screen, never in a list. |
| Big number, screen title | `--text-3xl` 32px, `--text-2xl` 24px | Body font, weight 700. |
| Section lead | `--text-xl` 20px, `--text-lg` 18px | |
| Body, buttons | `--text-base` 16px | Buttons are never smaller than this. |
| Second line | `--text-sm` 14px | `--text-secondary`. |
| Smallest label | `--text-xs` 12px | Uppercase, tracked. |

- 10px is the floor and only for a word the player already knows, like the rank word in a seat pill. Never for a number the player acts on. Apple's minimum is 11pt.
- Letter-spacing has three values: `0.06em` for uppercase at 16px and above, `0.12em` at 12 to 14px, `0.16em` under 12px. Never track lowercase text.
- Radius grows with the element: `--radius-sm` for tags and chips, `--radius-md` for buttons and cards, `--radius-lg` for panels and modals, `--radius-pill` for pills and avatars. A thing inside a rounded thing uses the outer radius minus the padding, so the corners stay concentric.
- Spacing: `--spacing-0..4, 6, 8, 12, 16, 24`. There is no `--spacing-5`. An undefined var kills the whole declaration. Verify in the browser, not in the file.
- Durations and easings come from `--duration-*` and `--ease-*`. No raw milliseconds.

## 4. Dark theme rules

The app is dark by design, so these are not optional.

- Base is near-black, not black. `--bg-concrete` (#0a0a0b) is right. Pure black makes white text halo.
- Height is lighter, not shadowed. A panel above the table is a lighter surface: `--surface-metal-dark`, then `--bg-concrete-light`, then `--surface-metal`. Shadows alone are invisible on dark and read as a smudge.
- Saturated neon is for shapes, glows and large type. For text under 24px, mix it toward white, the way the rank word does with `color-mix(in srgb, colour 85%, white)`. Pure saturated colour on dark vibrates and fails contrast.
- Measure every text colour on the surface it sits on: 4.5:1 or better for text, 7:1 for anything under 12px, 3:1 for display type over 24px. The rank word shipped at 3.5:1 before review caught it.
- One glow per screen, and it means a live state: your turn, the hazard count, the card that just landed. Today the code has 182 glow shadows. A glow on everything is a glow on nothing.
- Borders are a step lighter than their surface, never white at 20%. Prefer a surface step or spacing over a border.
- Colour means something. The zones are fixed: hazard yellow for the daily and streak loop, alert red for the one primary action, neon cyan for multiplayer, neutral for practice and meta. One accent per screen. A second accent needs a second meaning.

## 5. The table is dense, overlays breathe

These two rules look like they fight. They do not, because they apply to different places.

- At the table, premium means intentional density: the felt light, the hatched floor, the stacked deck, the mercy bar, the opponents in view. Empty black reads as unfinished. Keep the centre clear for the cards and anchor every HUD element in a fixed spot so the eye learns where to look.
- On overlays and result screens, premium means one hero and air. Stop the game noise, show one thing, offer one action.
- Never "clean up" the table as a redesign. That is a polish pass. Never pile stats onto a result screen. That is a dashboard.

## 6. Group with space, not boxes

- More space around a group than inside it. The eye reads the gap as the border.
- Fewer borders. Separate with a surface step or spacing first, a border last.
- No card inside a card. If a block needs a frame to be read as a block, the spacing is wrong.
- Equal-width identical cards in a row say every item has equal weight. That is almost never true. Vary the size or drop the cards.

## 7. Built for a thumb

Phones are the main screen. Design from the thumb out.

- Tap targets are 44 by 44 CSS px at least, with 8px of dead space between them. An icon can be 16px drawn and still have a 44px target.
- Primary actions live in the bottom third. Leave, settings and anything you do not want tapped by accident live in the top corners, where reaching them is a feature.
- Nothing the player must read to act goes behind their own hand or under a chip that moves.
- Test on the real device, not the emulator. Print size is the only honest size.

## 8. Motion

Motion confirms, it does not decorate.

- Feedback on a tap starts within 100ms or the tap feels dead.
- `--duration-snap` (180ms) for direct feedback: press, hover, toggle, a card snapping into place.
- `--duration-soft` (320ms) for things that enter or leave: panels, toasts, the seat swap.
- `--duration-bounce` (500ms) for one celebration per screen. `--duration-strut` (800ms) only for the hero reveal on a result screen.
- Exits are shorter than entries. Entries ease out (`--ease-snap`, `--ease-strut`). Nothing moves at a steady speed.
- One animation is not for everything. If the hero, the cards, the toast and the modal all fade up the same way, that is the generated look.
- Animate `transform` and `opacity` only. Respect `prefers-reduced-motion` with no motion, not slower motion.
- Sound and motion land together. A card that lands silently or a sound with no visual change both break the feel.

## 9. Words

- Plain words a player would say. "7 cards", not "CARDS: 7". "Your turn", not "STATUS: ACTION_REQUIRED".
- Labels are a last resort. Show the value in a way that explains itself. If a label is needed, it is smaller and quieter than the value.
- Buttons start with a verb and fit on one line. One label per intent on a screen.
- No emoji in the UI. Icons are Lucide at the fixed sizes in CLAUDE.md.
- Sentence case everywhere except the small tracked labels. Uppercase display type is the stamp, not the paragraph.

## 10. Alignment

- Centre only one thing: the hero or a single number. Everything over two lines is left-aligned.
- Numbers in a column are right-aligned so the digits line up.
- Text of different sizes on one line aligns on the baseline, not the centre.
- You do not have to fill the width. A 600px panel on a 1440px screen is fine.

## Our signature, and what to ban

Keep one signature element per screen. These are ours:

- The diagonal hatching floor at 2%, floor markings not noise.
- The felt light and vignette under the play area.
- The mercy bar that fills toward 25.
- The hazard-stripe card back.
- The Black Ops One stamp for a result word.

Ban these on sight. They are what a model draws when nobody decided:

- Scan-line overlays, grid backgrounds, noise textures over everything.
- Brand watermarks in the background, L-shaped corner marks.
- Terminal labels (DRAW_PILE, PLAYER: You), emoji as icons, a sparkle icon.
- Purple or blue gradients, gradient text, a glow on every element.
- Three identical cards in a row, cards inside cards, a 1px border around every block.
- Everything centred, everything the same size, every section with an eyebrow label.
- The same fade-up animation on every element.
- Placeholder copy: "Elevate", "Seamless", "Unleash".

## Before you open the PR

1. Write the one-line test for the screen and put it in the PR description.
2. Screenshot at 390px wide from the running app, plus desktop if the layout differs.
3. Every font size, radius, spacing and duration comes from a token. Grep your diff for raw `rem`, `px` and `ms`.
4. Every text colour measured on its surface: 4.5:1, or 7:1 under 12px.
5. Every tap target 44px with 8px gaps. Check the computed box, not the icon.
6. One filled button, one glow, one display-type element on the screen.
7. Reduced motion checked once.

## Four tests for a screenshot

- Two-second test. Show it to someone for two seconds and ask what they saw. If the answer is not the hero, fix the hierarchy.
- Grayscale test. Desaturate the screenshot. If the hierarchy disappears, colour was doing the work size and weight should do.
- Worst-background test. Put the text over the busiest state the table can produce: full hand, flying cards, a toast. If it fails there, it fails.
- Thumb test. Hold the phone in one hand. Reach every primary action without shifting your grip.

## Reference screens

Study these for structure, not for colours or copy.

- Deezer, quiz result: one big number, best score as one quiet line, rank, two actions. https://mobbin.com/screens/03f4524c-58f4-43e8-8863-58b2cd9e6a97
- Burger King, score screen: one number inside one frame, nothing competing. https://mobbin.com/screens/731296e3-f01a-4c50-9c42-aacb964e18cc
- Runbuds, head to head: one headline, two faces, the rest of the screen is air. https://mobbin.com/screens/66e1a5fd-e65b-4cbc-99c2-36613627f74d
- Balatro: information on the left, interaction at the bottom, status at the top, and the zones never cross. The score numbers are never covered by effects.
- Hearthstone: cards on the board shrink to a reduced shape so the board stays readable. A third of the screen is given to the table fantasy on purpose.
- Marvel Snap: the location border glows toward whoever is winning. Colour that carries a meaning.

## Sources

- Nielsen Norman Group, Visual hierarchy in UX: scale, contrast and grouping; no more than three contrast levels. https://www.nngroup.com/articles/visual-hierarchy-ux-definition/
- Nielsen Norman Group, Executing UX animations: 100ms for direct feedback, 200 to 300ms for screen changes, exits shorter than entries. https://www.nngroup.com/articles/animation-duration/
- Refactoring UI (Wathan and Schoger): start with too much white space, size is not the only tool, no grey text on colour, labels are a last resort, fewer borders, scale values at least 25% apart. https://www.refactoringui.com/
- Material Design, Dark theme: desaturate accents, lighter surfaces for elevation, 4.5:1 at every elevation, saturated colour vibrates on dark. https://m2.material.io/design/color/dark-theme
- Apple Human Interface Guidelines, Dark mode: 4.5:1 minimum, aim for 7:1 on small text, base and elevated backgrounds. https://developer.apple.com/design/human-interface-guidelines/dark-mode
- Apple Human Interface Guidelines, Accessibility: 44pt controls, 11pt minimum text on iOS. https://developer.apple.com/design/human-interface-guidelines/accessibility
- WCAG 2.2, Target size minimum (2.5.8): 24px floor, 44px enhanced. https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum
- web.dev, Accessible tap targets: 48px targets, 8px apart. https://web.dev/articles/accessible-tap-targets
- Made Good Designs, Game UI design guide: urgency-based hierarchy, stable anchors, test over the busiest scene. https://madegooddesigns.com/game-ui-design
- WANDR, Mobile game UI design: bottom third for primary actions, top corners for the rare and destructive, subtraction review. https://www.wandr.studio/blog/mobile-game-ui-design
- GDKeys, The card games UI design of Fairtravel Battle: Hearthstone, Arena and Runeterra zoning breakdowns. https://gdkeys.com/the-card-games-ui-design-of-fairtravel-battle
- cccChoice, Balatro design analysis: zones that do not interfere, core numbers always readable. https://medium.com/@yyh19971004/balatro-design-analysis-visual-packaging-and-interactive-feedback-cc6fa6a65370
- Attuna, Why AI-generated UI looks generic: models sample the most probable design, so give them real constraints and exclusions. https://attuna.design/blog/why-ai-generated-ui-looks-generic
- The Fountain Institute, 7 signs a UI has been vibe coded: neon that prioritises nothing, emoji icons, purple gradients, cards for every block. https://www.thefountaininstitute.com/blog/signs-vibe-coded-ui
