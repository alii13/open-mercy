<template>
  <Teleport to="body">
    <Transition name="ssc-modal">
      <div v-if="open" class="ssc-overlay" @click.self="$emit('close')">
        <div class="ssc-modal" role="dialog" aria-modal="true" aria-label="Share your stats">
          <h3 class="ssc-title">SHARE YOUR STATS</h3>
          <canvas ref="canvasEl" width="600" height="400" class="ssc-preview"></canvas>
          <div class="ssc-actions">
            <Button variant="primary" size="md" block @click="download">DOWNLOAD PNG</Button>
            <Button variant="secondary" size="md" block @click="toX">SHARE TO X</Button>
            <Button variant="secondary" size="md" block @click="toWhatsApp">WHATSAPP</Button>
            <Button variant="ghost" size="md" block @click="copy">{{ copied ? 'COPIED' : 'COPY LINK' }}</Button>
          </div>
          <button class="ssc-close" @click="$emit('close')">CLOSE</button>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup lang="ts">
/**
 * The shareable stats card — a PNG a player can post, rendered to a canvas.
 *
 * Props rather than a composable: this used to live inside the stats dashboard
 * and read that page's `usePlayerStats`. The public profile has the same
 * numbers from a different source (`public_profile` aggregates), so the card
 * takes plain values and works from either.
 */
import { ref, watch, nextTick } from 'vue'
import type { Badge } from '../utils/badges'
import Button from './ui/Button.vue'

const props = defineProps<{
    open: boolean
    username: string
    badge: Badge
    games: number
    wins: number
    losses: number
    eliminated: number
    winRate: number
    bestStreak: number
    biggestStack: number
    peakCards: number
    shareUrl: string
}>()

defineEmits<{ (e: 'close'): void }>()

const canvasEl = ref<HTMLCanvasElement | null>(null)
const copied = ref(false)

function shareText(): string {
    const article = /^[AEIOU]/i.test(props.badge.title) ? 'an' : 'a'
    return `I'm ${article} ${props.badge.title} in Open Mercy - ${props.winRate}% win rate across ${props.games} games. Think you can beat me?`
}

function render() {
    const canvas = canvasEl.value
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return

    ctx.fillStyle = '#0a0a0b'
    ctx.fillRect(0, 0, 600, 400)

    ctx.strokeStyle = '#ffcc00'
    ctx.lineWidth = 2
    ctx.strokeRect(10, 10, 580, 380)

    ctx.fillStyle = '#e6e6e6'
    ctx.font = 'bold 28px monospace'
    ctx.fillText('OPEN MERCY', 30, 55)

    ctx.fillStyle = props.badge.color
    ctx.font = 'bold 18px monospace'
    ctx.fillText(props.badge.title.toUpperCase(), 30, 85)

    ctx.fillStyle = '#a1a1aa'
    ctx.font = '16px monospace'
    ctx.fillText(props.username, 280, 55)

    ctx.strokeStyle = '#333'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(30, 100)
    ctx.lineTo(570, 100)
    ctx.stroke()

    const statsY = 140
    ctx.fillStyle = '#e6e6e6'
    ctx.font = 'bold 32px monospace'
    ctx.fillText(String(props.games), 30, statsY)
    ctx.fillText(props.winRate + '%', 180, statsY)
    ctx.fillText(String(props.wins), 330, statsY)
    ctx.fillText(String(props.bestStreak), 470, statsY)

    ctx.fillStyle = '#52525b'
    ctx.font = '12px monospace'
    ctx.fillText('GAMES', 30, statsY + 20)
    ctx.fillText('WIN RATE', 180, statsY + 20)
    ctx.fillText('WINS', 330, statsY + 20)
    ctx.fillText('BEST RUN', 470, statsY + 20)

    ctx.fillStyle = '#ffcc00'
    ctx.font = '14px monospace'
    const hlY = 210
    ctx.fillText(`Biggest stack survived: +${props.biggestStack}`, 30, hlY)
    ctx.fillText(`Best win streak: ${props.bestStreak}`, 30, hlY + 25)
    ctx.fillText(`Peak cards held: ${props.peakCards}`, 30, hlY + 50)

    const barY = 320
    const barW = 540
    ctx.fillStyle = '#333'
    ctx.fillRect(30, barY, barW, 20)
    if (props.games > 0) {
        const wonW = (props.wins / props.games) * barW
        ctx.fillStyle = '#00ff66'
        ctx.fillRect(30, barY, wonW, 20)
        const lostW = (props.losses / props.games) * barW
        ctx.fillStyle = '#ff2a2a'
        ctx.fillRect(30 + wonW, barY, lostW, 20)
    }

    ctx.fillStyle = '#52525b'
    ctx.font = '11px monospace'
    ctx.fillText(`${props.wins}W / ${props.losses}L / ${props.eliminated}E`, 30, barY + 38)

    ctx.fillStyle = '#52525b'
    ctx.font = '12px monospace'
    ctx.fillText('open-mercy.com', 30, 380)
}

// The canvas only exists once the modal is in the DOM, so render after the
// teleported content mounts rather than on the click that opened it.
watch(() => props.open, async (isOpen) => {
    if (!isOpen) return
    copied.value = false
    await nextTick()
    render()
})

function download() {
    const canvas = canvasEl.value
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'open-mercy-stats.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
}

function toX() {
    const text = encodeURIComponent(shareText())
    const url = encodeURIComponent(props.shareUrl)
    window.open(`https://twitter.com/intent/tweet?text=${text}&url=${url}`, '_blank')
}

function toWhatsApp() {
    const text = encodeURIComponent(`${shareText()}\n\n${props.shareUrl}`)
    window.open(`https://wa.me/?text=${text}`, '_blank')
}

function copy() {
    void navigator.clipboard?.writeText(`${shareText()}\n\n${props.shareUrl}`)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
}
</script>

<style scoped>
.ssc-overlay {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: var(--spacing-4);
    background: rgba(0, 0, 0, 0.85);
    backdrop-filter: blur(6px);
}

.ssc-modal {
    display: flex;
    flex-direction: column;
    gap: var(--spacing-4);
    width: 100%;
    max-width: 640px;
    padding: var(--spacing-6);
    background: linear-gradient(180deg, #18191b 0%, #0a0a0b 100%);
    border: 1px solid rgba(255, 204, 0, 0.25);
    border-radius: var(--radius-md);
    box-shadow: 0 0 40px rgba(255, 204, 0, 0.12);
}

.ssc-title {
    margin: 0;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: 400;
    letter-spacing: 0.1em;
    text-align: center;
    color: var(--color-hazard);
}

.ssc-preview {
    display: block;
    width: 100%;
    max-width: 600px;
    height: auto;
    margin: 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: var(--radius-sm);
}

.ssc-actions {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: var(--spacing-2);
}

.ssc-close {
    padding: var(--spacing-2);
    background: none;
    border: none;
    cursor: pointer;
    font-family: var(--font-mono);
    font-size: var(--text-xs);
    letter-spacing: 0.2em;
    color: var(--text-muted);
    transition: color var(--duration-snap) var(--ease-snap);
}

.ssc-close:hover {
    color: var(--text-secondary);
}

.ssc-modal-enter-active,
.ssc-modal-leave-active {
    transition: opacity var(--duration-soft) var(--ease-soft);
}

.ssc-modal-enter-from,
.ssc-modal-leave-to {
    opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
    .ssc-modal-enter-active,
    .ssc-modal-leave-active {
        transition: none;
    }
}

@media (max-width: 600px) {
    .ssc-actions {
        grid-template-columns: 1fr;
    }
}
</style>
