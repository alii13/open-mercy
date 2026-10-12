# Open Mercy mobile

Flutter app for iOS and Android. Bundle ID `com.openmercy.app`.

## Prerequisites

- Flutter (stable)
- Xcode, with `xcode-select` pointing at `/Applications/Xcode.app/Contents/Developer`
- Android Studio + Android SDK, and a JDK between 17 and 25 for Gradle

## Commands

```bash
flutter analyze
flutter test
flutter run
```

## What's in it

Solo play, offline: the eight-rung bot ladder, all three stacking modes, the daily challenge, and the rules. Multiplayer, accounts and leaderboards are not ported yet.

```
lib/
  engine/   rules engine + bot AI, a line-for-line port of shared/engine/
  game/     GameController (port of frontend/src/stores/gameStore.ts) and device-local progress
  ui/       theme tokens (from frontend/src/style.css), screens, widgets
assets/
  cards/    card art, copied verbatim from frontend/src/assets/cards-webp/
  fonts/    Black Ops One + Chakra Petch (OFL, licenses alongside)
```

## Keeping it in step with the web

- **The engine is duplicated, not shared.** A rules change to `shared/engine/` lands in `mobile/lib/engine/` in the same PR. `test/engine/` ports the TS engine and bot suites case for case; port any new case with the fix.
- **The daily must deal the same cards on every device.** `seeded_rng.dart` is bit-identical to `frontend/src/utils/seededRng.ts`, and `shuffleDeck` and `generateFullDeck` consume it in the same order. `test/engine/seeded_rng_test.dart` pins both against values taken from the TS code. Do not reorder deck generation or rng calls on one side only.
- Bot timings, MERCY catch odds and the 10-card penalty live in `GameController`, with the same values as `gameStore.ts`.

## Signing

The Xcode project has no `DEVELOPMENT_TEAM` committed. Set your own team in Xcode locally and do not commit it.
