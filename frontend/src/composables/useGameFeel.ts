/**
 * Game-feel layer — seat-to-pile opponent throws, impact particles,
 * direction-reversal sweep, Skip Everyone shockwave, and the turn banner.
 * Everything here is cosmetic theatre: fixed-position clones and overlays
 * driven by GSAP, removed from the DOM when their timeline completes.
 */

import gsap from 'gsap'
import { MotionPathPlugin } from 'gsap/MotionPathPlugin'

gsap.registerPlugin(MotionPathPlugin)
import { useMotion } from './useMotion'
import { getCardImageUrl } from '../utils/cardGenerator'
import type { Card, CardColor } from '../types/card'

const GLOW: Record<string, string> = {
    red: '#ff2a2a',
    blue: '#00bfff',
    green: '#00ff66',
    yellow: '#ffcc00',
    wild: '#ff66dd'
}

function isReduced(): boolean {
    return useMotion().reduced
}

function centerOf(el: HTMLElement): { x: number; y: number } {
    const r = el.getBoundingClientRect()
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 }
}

/**
 * Color-matched shard burst at the discard pile when a power card lands.
 * Free-tier physics: each shard rides an outward x/y tween with a touch of
 * extra fall so the spray reads as gravity without the physics2D plugin.
 */
export function burstImpactParticles(originEl: HTMLElement, color: CardColor | 'wild', count = 8): void {
    if (isReduced()) return
    const { x, y } = centerOf(originEl)
    const glow = GLOW[color] || GLOW.wild

    for (let i = 0; i < count; i++) {
        const shard = document.createElement('div')
        const size = gsap.utils.random(5, 9)
        shard.style.cssText = `
            position: fixed;
            left: ${x - size / 2}px;
            top: ${y - size / 2}px;
            width: ${size}px;
            height: ${size * 1.35}px;
            background: ${glow};
            border-radius: 2px;
            box-shadow: 0 0 8px ${glow};
            pointer-events: none;
            z-index: 2100;
            will-change: transform, opacity;
        `
        document.body.appendChild(shard)

        const angle = gsap.utils.random(0, Math.PI * 2)
        const dist = gsap.utils.random(45, 95)
        gsap.to(shard, {
            x: Math.cos(angle) * dist,
            y: Math.sin(angle) * dist * 0.8 + gsap.utils.random(18, 42),
            rotation: gsap.utils.random(-300, 300),
            scale: 0.3,
            opacity: 0,
            duration: gsap.utils.random(0.45, 0.65),
            ease: 'power2.out',
            onComplete: () => shard.remove()
        })
    }
}

export interface OpponentThrowOptions {
    fromEl: HTMLElement
    toEl: HTMLElement
    card: Card
    layer: HTMLElement
    onImpact?: () => void
}

/**
 * Face-up card thrown from an opponent's seat to the discard pile — the same
 * anticipation → arc → hit-stop → settle grammar as the player's own throw,
 * so every play in the game reads with one motion language.
 */
export function animateOpponentThrow({ fromEl, toEl, card, layer, onImpact }: OpponentThrowOptions): Promise<void> {
    if (isReduced()) {
        onImpact?.()
        return Promise.resolve()
    }

    const from = centerOf(fromEl)
    const toRect = toEl.getBoundingClientRect()
    const to = { x: toRect.left + toRect.width / 2, y: toRect.top + toRect.height / 2 }

    const w = Math.min(110, toRect.width * 0.62)
    const h = w * 1.4
    const clone = document.createElement('div')
    clone.style.cssText = `
        position: fixed;
        left: ${from.x - w / 2}px;
        top: ${from.y - h / 2}px;
        width: ${w}px;
        height: ${h}px;
        pointer-events: none;
        z-index: 1000;
        will-change: transform;
    `
    const img = document.createElement('img')
    img.src = getCardImageUrl(card)
    img.draggable = false
    img.style.cssText = `
        width: 100%;
        height: 100%;
        object-fit: contain;
        border-radius: 8px;
        filter: drop-shadow(0 10px 18px rgba(0, 0, 0, 0.55));
    `
    clone.appendChild(img)
    layer.appendChild(clone)

    const dx = to.x - from.x
    const dy = to.y - from.y
    const arcHeight = Math.max(60, Math.hypot(dx, dy) * 0.2)

    gsap.set(clone, { scale: 0.42, rotation: gsap.utils.random(-25, 25) })

    return new Promise<void>((resolve) => {
        const tl = gsap.timeline({
            onComplete: () => {
                clone.remove()
                resolve()
            }
        })

        // Anticipation — the seat "winds up" before the throw.
        tl.to(clone, {
            y: -8,
            scale: 0.48,
            duration: 0.08,
            ease: 'power2.in'
        })

        // Arc to the pile, growing to near pile-card size en route.
        tl.to(clone, {
            motionPath: {
                path: [
                    { x: dx / 2, y: dy / 2 - arcHeight },
                    { x: dx, y: dy }
                ],
                curviness: 1.5,
                autoRotate: false
            },
            rotation: gsap.utils.random(-18, 18),
            scale: 0.95,
            duration: 0.36,
            ease: 'power2.out'
        })

        // Impact — particles/sound fire here, then a hit-stop beat before the settle.
        if (onImpact) tl.call(onImpact)
        tl.to(clone, {
            scale: 0.86,
            duration: 0.13,
            ease: 'back.out(2.4)'
        }, '+=0.045')
    })
}

/**
 * Skip Everyone payoff — red shockwave rings out from the pile while every
 * skipped seat shakes and takes a SKIPPED stamp in turn order.
 */
export function skipEveryoneShockwave(pileEl: HTMLElement, victimEls: HTMLElement[]): void {
    if (isReduced()) return
    const { x, y } = centerOf(pileEl)

    for (let ring = 0; ring < 2; ring++) {
        const wave = document.createElement('div')
        wave.style.cssText = `
            position: fixed;
            left: ${x - 30}px;
            top: ${y - 30}px;
            width: 60px;
            height: 60px;
            border: 3px solid rgba(255, 42, 42, 0.9);
            border-radius: 50%;
            box-shadow: 0 0 30px rgba(255, 42, 42, 0.55), inset 0 0 18px rgba(255, 42, 42, 0.35);
            pointer-events: none;
            z-index: 2050;
            will-change: transform, opacity;
        `
        document.body.appendChild(wave)
        gsap.fromTo(wave,
            { scale: 0.5, opacity: 1 },
            {
                scale: 6 + ring * 2,
                opacity: 0,
                duration: 0.6,
                delay: ring * 0.09,
                ease: 'expo.out',
                onComplete: () => wave.remove()
            }
        )
    }

    victimEls.forEach((seat, i) => {
        const delay = 0.12 + i * 0.12

        gsap.fromTo(seat,
            { x: 0 },
            {
                keyframes: [{ x: -4 }, { x: 4 }, { x: -3 }, { x: 0 }],
                duration: 0.3,
                delay,
                ease: 'power1.inOut',
                clearProps: 'x'
            }
        )

        const rect = seat.getBoundingClientRect()
        const stamp = document.createElement('div')
        stamp.textContent = 'SKIPPED'
        stamp.style.cssText = `
            position: fixed;
            left: ${rect.left + rect.width / 2}px;
            top: ${rect.top + rect.height / 2}px;
            padding: 2px 8px;
            background: rgba(0, 0, 0, 0.78);
            border: 2px solid #ff2a2a;
            border-radius: 4px;
            color: #ff2a2a;
            font-family: var(--font-display), sans-serif;
            font-size: 0.65rem;
            letter-spacing: 0.18em;
            pointer-events: none;
            z-index: 2060;
            will-change: transform, opacity;
        `
        document.body.appendChild(stamp)
        gsap.set(stamp, { xPercent: -50, yPercent: -50, rotation: -8 })
        const tl = gsap.timeline({ onComplete: () => stamp.remove() })
        tl.fromTo(stamp,
            { scale: 2.2, opacity: 0 },
            { scale: 1, opacity: 1, duration: 0.18, delay, ease: 'back.out(3)' }
        )
        tl.to(stamp, { opacity: 0, y: -8, duration: 0.3, delay: 0.8, ease: 'power2.in' })
    })
}

/**
 * Comet-tail ring sweeping once around the play surface in the new direction
 * when a Reverse lands. sign matches store.direction: 1 = CW, -1 = CCW.
 */
export function sweepDirectionRing(hostEl: HTMLElement, sign: 1 | -1): void {
    if (isReduced()) return
    const w = hostEl.offsetWidth * 1.04
    const h = hostEl.offsetHeight * 1.45
    const ring = document.createElement('div')
    ring.style.cssText = `
        position: absolute;
        left: 50%;
        top: 50%;
        width: ${w}px;
        height: ${h}px;
        border-radius: 50%;
        background: conic-gradient(from 0deg, transparent 68%, rgba(0, 243, 255, 0.85) 100%);
        -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
        mask: radial-gradient(farthest-side, transparent calc(100% - 7px), #000 calc(100% - 6px));
        pointer-events: none;
        z-index: 60;
        will-change: transform, opacity;
    `
    hostEl.appendChild(ring)
    gsap.set(ring, { xPercent: -50, yPercent: -50, scaleX: sign === 1 ? 1 : -1, rotation: 0, opacity: 0 })
    const tl = gsap.timeline({ onComplete: () => ring.remove() })
    tl.to(ring, { opacity: 0.9, duration: 0.12, ease: 'power1.out' })
    tl.to(ring, { rotation: 360, duration: 0.72, ease: 'power2.inOut' }, 0)
    tl.to(ring, { opacity: 0, duration: 0.2, ease: 'power1.in' }, 0.62)
}

let activeBanner: HTMLElement | null = null

/**
 * Transient turn-handoff banner over the pit. Snaps in, holds under a second,
 * snaps out — turn ownership made unmissable without blocking anything.
 */
export function showTurnBanner(text = 'YOUR TURN'): void {
    activeBanner?.remove()
    const banner = document.createElement('div')
    activeBanner = banner
    banner.textContent = text
    banner.setAttribute('role', 'status')
    banner.style.cssText = `
        position: fixed;
        left: 50%;
        top: 40%;
        padding: 0.35em 0.9em;
        border-top: 2px solid rgba(0, 255, 102, 0.4);
        border-bottom: 2px solid rgba(0, 255, 102, 0.4);
        color: #00ff66;
        font-family: var(--font-display), sans-serif;
        font-size: clamp(1.5rem, 5vw, 2.6rem);
        letter-spacing: 0.22em;
        white-space: nowrap;
        text-shadow: 0 0 24px rgba(0, 255, 102, 0.6);
        pointer-events: none;
        z-index: 2200;
        will-change: transform, opacity;
    `
    document.body.appendChild(banner)
    const cleanup = () => {
        banner.remove()
        if (activeBanner === banner) activeBanner = null
    }

    if (isReduced()) {
        gsap.set(banner, { xPercent: -50, yPercent: -50 })
        setTimeout(cleanup, 900)
        return
    }

    gsap.set(banner, { xPercent: -50, yPercent: -50, scale: 1.4, opacity: 0 })
    const tl = gsap.timeline({ onComplete: cleanup })
    tl.to(banner, { opacity: 1, scale: 1, duration: 0.22, ease: 'expo.out' })
    tl.to(banner, { opacity: 0, scale: 0.92, y: -12, duration: 0.18, ease: 'power2.in' }, '+=0.8')
}

/**
 * One-shot scale punch on the seat whose turn just started.
 */
export function pulseSeat(el: HTMLElement | undefined | null): void {
    if (!el || isReduced()) return
    gsap.fromTo(el,
        { scale: 1 },
        { scale: 1.07, duration: 0.14, yoyo: true, repeat: 1, ease: 'power2.out', clearProps: 'scale' }
    )
}
