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
    g.addColorStop(0, '#241433')
    g.addColorStop(0.55, '#120c1b')
    g.addColorStop(1, '#08060c')
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
    drawRuneRail(ctx, 0)
    drawRuneRail(ctx, H - 24)
}

function drawRuneRail(ctx: CanvasRenderingContext2D, y: number) {
    ctx.save()
    ctx.fillStyle = '#d4af37'
    ctx.fillRect(0, y, W, 3)
    ctx.fillStyle = 'rgba(155,123,232,0.45)'
    for (let x = 18; x < W; x += 48) {
        ctx.beginPath()
        ctx.moveTo(x, y + 5)
        ctx.lineTo(x + 12, y + 12)
        ctx.lineTo(x, y + 19)
        ctx.lineTo(x - 12, y + 12)
        ctx.closePath()
        ctx.fill()
    }
    ctx.restore()
}

function drawTitle(ctx: CanvasRenderingContext2D) {
    // RUNE RIOT wordmark, large
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // OPEN — huge red glow
    ctx.font = 'bold 220px Cinzel, Georgia, serif'
    ctx.fillStyle = '#d4af37'
    ctx.shadowColor = 'rgba(212, 175, 55, 0.55)'
    ctx.shadowBlur = 40
    ctx.fillText('RUNE', W / 2, 140)

    // MERCY — smaller, gold
    ctx.shadowColor = 'rgba(123, 74, 226, 0.6)'
    ctx.shadowBlur = 25
    ctx.font = 'bold 96px Cinzel, Georgia, serif'
    ctx.fillStyle = '#9b7be8'
    ctx.fillText('RIOT', W / 2, 390)
    ctx.restore()
}

function drawVerdict(ctx: CanvasRenderingContext2D, payload: ShareImagePayload) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'

    // Verdict stamp
    ctx.translate(W / 2, 620)
    ctx.rotate(-0.05)
    ctx.font = 'bold 160px Cinzel, Georgia, serif'
    if (payload.isWinner) {
        ctx.fillStyle = '#d4af37'
        ctx.shadowColor = 'rgba(212, 175, 55, 0.5)'
        ctx.shadowBlur = 35
        ctx.fillText('VICTORY', 0, 0)
    } else {
        ctx.fillStyle = '#9b7be8'
        ctx.shadowColor = 'rgba(123, 74, 226, 0.55)'
        ctx.shadowBlur = 35
        ctx.fillText('DEFEATED', 0, 0)
    }
    ctx.restore()

    // Sub-line
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'top'
    ctx.font = '32px Inter, sans-serif'
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
        { value: String(payload.biggestStack), label: 'BIGGEST STACK' },
        { value: String(payload.unosCalled), label: 'RIOT CALLS' },
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
        ctx.strokeStyle = 'rgba(212, 175, 55, 0.28)'
        ctx.lineWidth = 2
        ctx.strokeRect(x, y, cellW, cellH)

        // Value
        ctx.textAlign = 'center'
        ctx.textBaseline = 'top'
        ctx.font = 'bold 140px Cinzel, Georgia, serif'
        ctx.fillStyle = payload.isWinner ? '#d4af37' : '#f5ecd8'
        ctx.fillText(cell.value, x + cellW / 2, y + 24)

        // Label
        ctx.font = '24px Inter, sans-serif'
        ctx.fillStyle = '#52525b'
        ctx.fillText(cell.label, x + cellW / 2, y + cellH - 50)
    })
    ctx.restore()
}

function drawFooter(ctx: CanvasRenderingContext2D, payload: { siteUrl: string }) {
    ctx.save()
    ctx.textAlign = 'center'
    ctx.textBaseline = 'bottom'

    ctx.font = '28px Inter, sans-serif'
    ctx.fillStyle = '#a1a1aa'
    ctx.fillText('PLAY FREE', W / 2, H - 100)

    ctx.font = 'bold 34px Inter, sans-serif'
    ctx.fillStyle = '#55d6a7'
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
export async function shareOrDownload(blob: Blob, filename = 'rune-riot-win.png'): Promise<boolean> {
    const file = new File([blob], filename, { type: 'image/png' })

    // Native share with file (mobile mainly)
    const navAny: any = navigator
    if (navAny.canShare && navAny.canShare({ files: [file] })) {
        try {
            await navAny.share({
                files: [file],
                title: 'RUNE RIOT',
                text: 'I just won at RUNE RIOT.',
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

    ctx.font = '30px Inter, sans-serif'
    ctx.fillStyle = '#a1a1aa'
    ctx.letterSpacing = '6px'
    ctx.fillText(`DAILY DEAL · ${p.date}`, W / 2, 545)
    ctx.letterSpacing = '0px'

    const headline =
        p.result === 'won' ? `CLEARED IN ${p.turns}` :
        p.result === 'eliminated' ? 'RUIN CLAIMED ME' : 'DIDN’T CLEAR IT'
    ctx.font = 'bold 104px Cinzel, Georgia, serif'
    ctx.fillStyle = p.result === 'won' ? '#d4af37' : '#9b7be8'
    ctx.shadowColor = p.result === 'won' ? 'rgba(212,175,55,0.45)' : 'rgba(123,74,226,0.5)'
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
    ctx.font = '26px Inter, sans-serif'
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
    ctx.font = 'bold 42px Inter, sans-serif'
    ctx.fillStyle = '#55d6a7'
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
