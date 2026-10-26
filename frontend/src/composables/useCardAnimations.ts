/**
 * GSAP-based card animation composable for RUNE RIOT.
 * Handles card movements, flips, and pile animations
 */

import gsap from 'gsap'

export interface AnimationOptions {
    duration?: number
    ease?: string
    delay?: number
}

// ============================================================
// Card Back Element Factory
// ============================================================

/**
 * Style configuration for the card back element. Mirrors CardBack.vue's
 * shell so the flying clone reads as the same physical card that leaves the deck.
 */
const CARD_BACK_STYLES = {
    width: '60px',
    height: '84px',
    borderRadius: '6px',
    overflow: 'hidden',
    position: 'relative',
    boxShadow: '0 10px 24px rgba(0,0,0,0.62), 0 0 18px rgba(142,95,205,0.35)',
    pointerEvents: 'none'
} as const

// The RUNE RIOT seal, kept in sync with CardBack.vue. Definition ids are
// prefixed so they can't collide with the CardBack instances already in the DOM
// (duplicate SVG ids in one document break url() references).
const CARD_BACK_SVG = `<svg width="100%" height="100%" viewBox="0 0 250 350" xmlns="http://www.w3.org/2000/svg" style="display:block">
  <defs>
    <radialGradient id="fcObsidian" cx="50%" cy="42%" r="72%">
      <stop offset="0%" stop-color="#2d1745" />
      <stop offset="55%" stop-color="#130d1c" />
      <stop offset="100%" stop-color="#07060a" />
    </radialGradient>
    <linearGradient id="fcGold" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#f0d78f" />
      <stop offset="48%" stop-color="#9a7334" />
      <stop offset="100%" stop-color="#e8c46c" />
    </linearGradient>
  </defs>
  <rect x="2" y="2" width="246" height="346" rx="18" fill="#07060a" stroke="#342742" stroke-width="4" />
  <rect x="10" y="10" width="230" height="330" rx="13" fill="url(#fcObsidian)" stroke="url(#fcGold)" stroke-width="2" />
  <path d="M26 48 48 26h154l22 22v254l-22 22H48l-22-22Z" fill="none" stroke="url(#fcGold)" stroke-width="2" opacity=".78" />
  <circle cx="125" cy="171" r="77" fill="#09070d" stroke="url(#fcGold)" stroke-width="3" />
  <circle cx="125" cy="171" r="63" fill="none" stroke="#9b72db" stroke-width="2" stroke-dasharray="3 8" />
  <path d="m125 115 17 31 35 8-27 24 7 37-32-17-32 17 7-37-27-24 35-8Z" fill="none" stroke="url(#fcGold)" stroke-width="3" stroke-linejoin="round" />
  <path d="m125 135 10 25 27 11-27 11-10 25-10-25-27-11 27-11Z" fill="#9b72db" fill-opacity=".2" stroke="#9b72db" stroke-width="2" />
  <circle cx="125" cy="171" r="9" fill="#07150f" stroke="#55c889" stroke-width="3" />
  <text x="125" y="278" font-family="Georgia,serif" font-size="25" font-weight="700" letter-spacing="4" fill="#ead492" text-anchor="middle">RUNE</text>
  <text x="125" y="305" font-family="Georgia,serif" font-size="19" font-weight="700" letter-spacing="7" fill="#a77ae4" text-anchor="middle">RIOT</text>
</svg>`

const CARD_BACK_SCRATCHES = '<div style="position:absolute;inset:0;pointer-events:none;opacity:.35;background-image:repeating-linear-gradient(118deg,transparent 0 9px,rgba(255,255,255,.025) 10px,transparent 11px 24px);"></div>'

/**
 * Create a styled RUNE RIOT card back element for animations.
 */
function createCardBackElement(): HTMLElement {
    const cardEl = document.createElement('div')
    cardEl.className = 'flying-card-anim'
    Object.assign(cardEl.style, CARD_BACK_STYLES)
    cardEl.innerHTML = CARD_BACK_SVG + CARD_BACK_SCRATCHES
    return cardEl
}

/**
 * Position an element at a fixed location
 */
function positionAtRect(el: HTMLElement, rect: DOMRect, zIndex = 2000): void {
    Object.assign(el.style, {
        position: 'fixed',
        left: `${rect.left}px`,
        top: `${rect.top}px`,
        zIndex: String(zIndex)
    })
}

// Flying clones are appended to document.body, outside any component tree —
// if the game view unmounts mid-flight (player leaves during a big draw) the
// tweens and their card-back nodes would keep sailing over the lobby. Track
// the live ones so the view can kill them on unmount.
const activeFlyingCards = new Set<HTMLElement>()

function spawnFlyingCard(el: HTMLElement): void {
    activeFlyingCards.add(el)
    document.body.appendChild(el)
}

function despawnFlyingCard(el: HTMLElement): void {
    activeFlyingCards.delete(el)
    el.remove()
}

function killAllFlyingCards(): void {
    for (const el of activeFlyingCards) {
        gsap.killTweensOf(el)
        el.remove()
    }
    activeFlyingCards.clear()
}

// ============================================================
// Main composable
// ============================================================

export function useCardAnimations() {

    // ============================================================
    // UNO-specific animations (flying card from deck to hand)
    // ============================================================

    /**
     * Animate a single card being dealt from deck to target
     * Creates a temporary card element, animates it, then removes it
     */
    function animateFlyingCard(
        deckEl: HTMLElement,
        targetEl: HTMLElement,
        options: AnimationOptions = {}
    ): Promise<void> {
        const deckRect = deckEl.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()

        const cardEl = createCardBackElement()
        positionAtRect(cardEl, deckRect)
        spawnFlyingCard(cardEl)

        const targetLeft = targetRect.left + targetRect.width / 2 - 30
        const targetTop = targetRect.top + targetRect.height / 2 - 42

        gsap.set(cardEl, { x: 0, y: 0, willChange: 'transform' })

        return new Promise<void>((resolve) => {
            gsap.to(cardEl, {
                x: targetLeft - deckRect.left,
                y: targetTop - deckRect.top,
                rotation: gsap.utils.random(-10, 10),
                duration: options.duration || 0.3,
                delay: options.delay || 0,
                ease: options.ease || 'power2.out',
                onComplete: () => {
                    despawnFlyingCard(cardEl)
                    resolve()
                }
            })
        })
    }

    /**
     * Animate multiple cards being drawn with stagger (non-blocking)
     * Cards animate with delay between each, but function returns immediately
     */
    function animateDrawCardsStaggered(
        deckEl: HTMLElement,
        targetEl: HTMLElement,
        count: number,
        options: { staggerDelay?: number } & AnimationOptions = {},
        onEachComplete?: (index: number) => void
    ): void {
        const deckRect = deckEl.getBoundingClientRect()
        const targetRect = targetEl.getBoundingClientRect()
        const staggerDelay = options.staggerDelay ?? 0.12

        const targetLeft = targetRect.left + targetRect.width / 2 - 30
        const targetTop = targetRect.top + targetRect.height / 2 - 42

        for (let i = 0; i < count; i++) {
            const cardEl = createCardBackElement()
            positionAtRect(cardEl, deckRect)
            spawnFlyingCard(cardEl)
            gsap.set(cardEl, { x: 0, y: 0, willChange: 'transform' })

            gsap.to(cardEl, {
                x: targetLeft - deckRect.left,
                y: targetTop - deckRect.top,
                rotation: gsap.utils.random(-10, 10),
                duration: options.duration || 0.3,
                delay: i * staggerDelay,
                ease: options.ease || 'power2.out',
                onComplete: () => {
                    despawnFlyingCard(cardEl)
                    onEachComplete?.(i)
                }
            })
        }
    }

    return {
        // Flying card animations (deck ↔ hand ↔ discard)
        animateFlyingCard,
        animateDrawCardsStaggered,
        killAllFlyingCards,
        // Utilities
        createCardBackElement
    }
}
