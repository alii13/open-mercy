# Contributing to Open Mercy

Thanks for your interest. This guide will get you set up.

## Quick start

```bash
git clone https://github.com/alii13/open-mercy.git
cd open-mercy/frontend
npm install
cp .env.example .env
# Fill in your Supabase credentials in .env
npm run dev
```

## How to contribute

1. **Fork** the repo and create a branch from `main`
2. **Make your changes** - keep commits focused and descriptive
3. **Test** - run `npm run build` to verify the production build passes
4. **Open a PR** - describe what you changed and why

## Development workflow

### Type checking

```bash
npx vue-tsc --noEmit
```

### Production build

```bash
npm run build
```

### Testing on mobile

Open Chrome DevTools, toggle the device toolbar (Ctrl+Shift+M), and test at:
- iPhone SE (375x667)
- iPhone 12 (390x844)
- iPad (768x1024)
- Desktop (1920x1080)

## Code style

- **Vue 3 Composition API** with `<script setup lang="ts">`
- **TypeScript** - no `any` unless unavoidable
- **CSS** - scoped styles in components, shared styles in `game-shared.css`
- **Naming** - PascalCase for components, camelCase for functions/variables
- **No comments** unless the why is non-obvious
- **Small, focused functions** - early returns over nested conditionals

## Project layout

```
frontend/src/
├── components/
│   ├── game/          # All in-game components (cards, hand, board, modals)
│   ├── AuthView.vue   # Login / signup
│   ├── LandingPage.vue
│   └── MultiplayerLobby.vue
├── composables/       # Shared reactive logic
├── stores/            # Pinia stores (gameStore, multiplayerStore, authStore)
├── utils/             # Pure functions (game rules, card generation, helpers)
├── types/             # TypeScript interfaces
├── assets/            # Shared CSS
└── App.vue
```

Outside the web app:

```
mobile/        # Flutter app (iOS + Android)
game-server/   # Multiplayer Worker + Durable Objects
shared/        # Engine + wire protocol (TS), used by frontend and game-server
functions/     # Cloudflare Pages Functions
supabase/      # SQL schema
```

## Responsive breakpoints

The app uses three breakpoints. When adding new UI, respect these:

| Breakpoint | Target |
|------------|--------|
| Default | Desktop (769px+) |
| `max-width: 768px` | Tablet |
| `max-width: 480px` | Phone |

Use the `useScreenSize` composable for JS-reactive sizing:

```ts
import { useScreenSize } from '@/composables/useScreenSize'
const { isMobile, isTablet, isDesktop } = useScreenSize()
```

## Game rules

The full ruleset is documented in `RULES-REFERENCE.md` at the repo root. Read it before modifying game logic.

## What makes a good PR

- Solves one thing well
- Doesn't break existing functionality
- Production build passes (`npm run build`)
- Tested on at least one mobile size and desktop
- Clear description of what changed and why

## What to avoid

- Don't commit `.env` files
- Don't add dependencies without discussing first
- Don't reformat files you didn't change
- Don't add features without opening an issue first for discussion

## Reporting bugs

Open an issue with:
- What you expected
- What actually happened
- Browser and device info
- Steps to reproduce

## Questions?

Open an issue. We'll get back to you.
