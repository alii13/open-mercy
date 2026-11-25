/**
 * Generate a 1080x1920 share image for a winning game. Pure canvas, no
 * dependencies — the result is a Blob the caller can hand to the Web Share
 * API or download as a PNG.
 *
 * Format is vertical (story aspect) since most casual shares end up on
 * Instagram / WhatsApp Status / X cards which all favor 9:16.
 */

import type { DailyCell } from './dailyChallenge'

interface ShareImagePayload {
    isWinner: boolean
    opponentName: string  // For "I beat {opponent}"
    cardsPlayed: number
    biggestStack: number
    unosCalled: number
    peakHand: number
    siteUrl: string  // Footer URL
}

const W = 1080
const H = 1920

function drawBackground(ctx: CanvasRenderingContext2D) {
    // Radial dark gradient — same as the game bg pattern.
    const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, W)
    g.addColorStop(0, '#18191b')
    g.addColorStop(1, '#0a0a0b')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)

    // Subtle 45deg stripe overlay
    ctx.save()
    ctx.fillStyle = 'rgba(0, 0, 0, 0.18)'
    ctx.translate(W / 2, H / 2)
    ctx.rotate(Math.PI / 4)
    for (let i = -W; i < W; i += 8) {
        ctx.fillRect(i, -H, 2, H * 2)
    }
    ctx.restore()

    // Danger tape strips at top and bottom — brand recognition
    drawDangerTape(ctx, 0, 0, W, 24)
    drawDangerTape(ctx, 0, H - 24, W, 24)
}

function drawDangerTape(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
    ctx.save()
    ctx.fillStyle = '#ffcc00'
    ctx.fillRect(x, y, w, h)
    ctx.fillStyle = '#0a0a0b'
    const stripeW = 36
    for (let i = -h; i < w + h; i += stripeW * 2) {
        ctx.beginPath()
        ctx.moveTo(x + i, y)
        ctx.lineTo(x + i + stripeW, y)
        ctx.lineTo(x + i + stripeW + h, y + h)
        ctx.lineTo(x + i + h, y + h)
        ctx.closePath()
        ctx.fill()
    }
    ctx.restore()
}

function drawTitle(ctx: CanvasRenderingContext2D) {
    // OPEN MERCY logo, large
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // OPEN — huge red glow
    ctx.font = 'bold 240px "Black Ops One", Impact, sans-serif'
    ctx.fillStyle = '#ff2a2a'
    ctx.shadowColor = 'rgba(255, 42, 42, 0.7)'
    ctx.shadowBlur = 40
    ctx.fillText('OPEN', W / 2, 140)

    // MERCY — smaller, gold
    ctx.shadowColor = 'rgba(255, 204, 0, 0.55)'
    ctx.shadowBlur = 25
    ctx.font = 'bold 96px "Black Ops One", Impact, sans-serif'
    ctx.fillStyle = '#ffcc00'
    ctx.fillText('MERCY', W / 2, 400)
    ctx.restore()
}

function drawVerdict(ctx: CanvasRenderingContext2D, payload: ShareImagePayload) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // Verdict stamp
    ctx.translate(W / 2, 620)
    ctx.rotate(-0.05)
    ctx.font = 'bold 180px "Black Ops One", Impact, sans-serif'
    if (payload.isWinner) {
        ctx.fillStyle = '#ffcc00'
        ctx.shadowColor = 'rgba(255, 204, 0, 0.5)'
        ctx.shadowBlur = 35
        ctx.fillText('VICTORY', 0, 0)
    } else {
        ctx.fillStyle = '#ff2a2a'
        ctx.shadowColor = 'rgba(255, 42, 42, 0.5)'
        ctx.shadowBlur = 35
        ctx.fillText('DEFEATED', 0, 0)
    }
    ctx.restore()

    // Sub-line
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = '32px "Chakra Petch", sans-serif'
    ctx.fillStyle = '#a1a1aa'
    const subline = payload.isWinner
        ? `I broke ${payload.opponentName}.`
        : `${payload.opponentName} broke me.`
    ctx.fillText(subline, W / 2, 840)
    ctx.restore()
}

function drawStats(ctx: CanvasRenderingContext2D, payload: ShareImagePayload) {
    // 2x2 grid of stats
    ctx.save()
    const cells = [
        { value: String(payload.cardsPlayed), label: 'CARDS PLAYED' },
        { value: String(payload.biggestStack), label: 'STACK EATEN' },
        { value: String(payload.unosCalled), label: 'MERCY CALLS' },
        { value: String(payload.peakHand), label: 'PEAK HAND' },
    ]

    const gridLeft = 120
    const gridTop = 1020
    const cellW = 420
    const cellH = 220
    const gapX = 60
    const gapY = 60

    cells.forEach((cell, i) => {
        const col = i % 2
        const row = Math.floor(i / 2)
        const x = gridLeft + col * (cellW + gapX)
        const y = gridTop + row * (cellH + gapY)

        // Cell border
        ctx.strokeStyle = 'rgba(255, 204, 0, 0.18)'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, cellW, cellH)

        // Value
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.font = 'bold 140px "Black Ops One", Impact, sans-serif'
        ctx.fillStyle = payload.isWinner ? '#ffcc00' : '#e6e6e6'
        ctx.fillText(cell.value, x + cellW / 2, y + 24)

        // Label
        ctx.font = '24px "Chakra Petch", sans-serif'
        ctx.fillStyle = '#52525b'
        ctx.fillText(cell.label, x + cellW / 2, y + cellH - 50)
    })
    ctx.restore()
}

function drawFooter(ctx: CanvasRenderingContext2D, payload: { siteUrl: string }) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    ctx.font = '28px "Chakra Petch", sans-serif'
    ctx.fillStyle = '#a1a1aa'
    ctx.fillText('PLAY FREE', W / 2, H - 100)

    ctx.font = 'bold 34px "Chakra Petch", sans-serif'
    ctx.fillStyle = '#00f3ff'
    ctx.fillText(payload.siteUrl, W / 2, H - 60)
    ctx.restore()
}

/**
 * Render and return a PNG Blob.
 */
export async function generateShareImage(payload: ShareImagePayload): Promise<Blob | null> {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    drawBackground(ctx)
    drawTitle(ctx)
    drawVerdict(ctx, payload)
    drawStats(ctx, payload)
    drawFooter(ctx, payload)

    return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
}

/**
 * Trigger native share if supported, otherwise download. Returns true on
 * either successful share or download.
 */
export async function shareOrDownload(blob: Blob, filename = 'open-mercy-win.png'): Promise<boolean> {
    const file = new File([blob], filename, { type: 'image/png' })

    // Native share with file (mobile mainly)
    const navAny: any = navigator
    if (navAny.canShare && navAny.canShare({ files: [file] })) {
        try {
            await navAny.share({
                files: [file],
                title: 'Open Mercy',
                text: 'I just won at Open Mercy.',
            })
            return true
        } catch {
            // User cancelled — fall through to download
        }
    }

    // Desktop fallback: trigger download
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    return true
}

// --- Daily challenge ---------------------------------------------------------
// The daily's run is drawn, not typed. Wordle put its grid in the shared text
// because a tweet could only carry emoji; an image has no such limit, so the
// run gets the deck palette and the game's own type instead of coloured
// squares approximating them.


export interface DailyShareImagePayload {
    date: string
    result: 'won' | 'lost' | 'eliminated'
    turns: number
    cells: DailyCell[]
    percentile?: number | null
    siteUrl: string
}

const CELL_FILL: Record<DailyCell, string> = {
    played: '#00ff66',   // you acted
    drew: '#52525b',     // nothing happened
    stacked: '#ff2a2a',  // you got hit
}

const GRID_COLS = 5
const GRID_GAP = 18
const GRID_MAX_CELL = 124
/** Vertical band the run block is centred in, between head and footer. */
const BAND_TOP = 780
const BAND_BOTTOM = 1740

function gridMetrics(count: number) {
    const rows = Math.ceil(count / GRID_COLS)
    const size = rows
        ? Math.min(GRID_MAX_CELL, (BAND_BOTTOM - BAND_TOP - 200 - (rows - 1) * GRID_GAP) / rows)
        : 0
    const height = rows ? rows * size + (rows - 1) * GRID_GAP : 0
    return { rows, size, gap: GRID_GAP, height }
}

function drawDailyHead(ctx: CanvasRenderingContext2D, p: DailyShareImagePayload) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    ctx.font = '30px "Chakra Petch", sans-serif'
    ctx.fillStyle = '#a1a1aa'
    ctx.letterSpacing = '6px'
    ctx.fillText(`DAILY DEAL · ${p.date}`, W / 2, 545)
    ctx.letterSpacing = '0px'

    const headline =
        p.result === 'won' ? `CLEARED IN ${p.turns}` :
        p.result === 'eliminated' ? 'MERCY GOT ME' : 'DIDN’T CLEAR IT'
    ctx.font = 'bold 104px "Black Ops One", Impact, sans-serif'
    ctx.fillStyle = p.result === 'won' ? '#ffcc00' : '#ff2a2a'
    ctx.shadowColor = p.result === 'won' ? 'rgba(255,204,0,0.45)' : 'rgba(255,42,42,0.45)'
    ctx.shadowBlur = 30
    ctx.fillText(headline, W / 2, 620)
    ctx.restore()
}

/**
 * Squares laid out five to a row, scaled down so any run fits its band.
 * Returns the bottom edge so the legend and percentile can sit directly under
 * the grid — anchoring them at a fixed y left a short run with a visible hole.
 */
function drawDailyGrid(ctx: CanvasRenderingContext2D, cells: DailyCell[], top: number): number {
    if (!cells.length) return top
    const { size, gap, height } = gridMetrics(cells.length)
    const gridW = GRID_COLS * size + (GRID_COLS - 1) * gap
    const left = (W - gridW) / 2

    ctx.save()
    cells.forEach((cell, i) => {
        const x = left + (i % GRID_COLS) * (size + gap)
        const y = top + Math.floor(i / GRID_COLS) * (size + gap)
        ctx.fillStyle = CELL_FILL[cell]
        ctx.fillRect(x, y, size, size)
        // A thin dark inset keeps adjacent same-colour cells legible.
        ctx.strokeStyle = 'rgba(10,10,11,0.85)'
        ctx.lineWidth = 3
        ctx.strokeRect(x + 1.5, y + 1.5, size - 3, size - 3)
    })
    ctx.restore()
    return top + height
}

function drawDailyLegend(ctx: CanvasRenderingContext2D, y: number) {
    const items: Array<[DailyCell, string]> = [
        ['played', 'PLAYED'],
        ['drew', 'DREW'],
        ['stacked', 'STACKED ON'],
    ]
    ctx.save()
    ctx.font = '26px "Chakra Petch", sans-serif'
    ctx.textBaseline = 'middle'

    const swatch = 24
    const pad = 12
    const gapBetween = 48
    const widths = items.map(([, label]) => swatch + pad + ctx.measureText(label).width)
    const total = widths.reduce((a, b) => a + b, 0) + gapBetween * (items.length - 1)

    let x = (W - total) / 2
    items.forEach(([kind, label], i) => {
        ctx.fillStyle = CELL_FILL[kind]
        ctx.fillRect(x, y - swatch / 2, swatch, swatch)
        ctx.fillStyle = '#a1a1aa'
        ctx.textAlign = 'left'
        ctx.fillText(label, x + swatch + pad, y)
        x += widths[i]! + gapBetween
    })
    ctx.restore()
}

function drawDailyPercentile(ctx: CanvasRenderingContext2D, pct: number, y: number) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.font = 'bold 42px "Chakra Petch", sans-serif'
    ctx.fillStyle = '#00f3ff'
    ctx.fillText(`TOP ${pct}% TODAY`, W / 2, y)
    ctx.restore()
}

export async function generateDailyShareImage(p: DailyShareImagePayload): Promise<Blob | null> {
    const canvas = document.createElement('canvas')
    canvas.width = W
    canvas.height = H
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    drawBackground(ctx)
    drawTitle(ctx)
    drawDailyHead(ctx, p)
    // Centre the run block in the band so a short game does not leave a hole
    // above the footer and a long one does not crowd it.
    const { height } = gridMetrics(p.cells.length)
    const blockH = height + 72 + 24 + (p.percentile ? 76 : 0)
    const gridTop = BAND_TOP + Math.max(0, (BAND_BOTTOM - BAND_TOP - blockH) / 2)
    const gridBottom = drawDailyGrid(ctx, p.cells, gridTop)
    drawDailyLegend(ctx, gridBottom + 72)
    if (p.percentile) drawDailyPercentile(ctx, p.percentile, gridBottom + 148)
    drawFooter(ctx, p)

    return await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((blob) => resolve(blob), 'image/png')
    })
}
