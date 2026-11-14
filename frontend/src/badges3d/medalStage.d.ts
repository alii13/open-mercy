export interface MedalStage {
    /** Shows a tier (1-20). Locked medals are cold: one dark metal, no charm. */
    show(tier: number, opts?: { locked?: boolean }): Promise<void>
    /** Screen position (CSS px from the canvas's top left) of a point on the badge, in SVG units of its 96 box. */
    project(point: [number, number]): { x: number; y: number; facing: number } | null
    /** Called on a tap (not a drag) on the medal. */
    onTap(fn: () => void): void
    dispose(): void
}

export function createMedalStage(opts: {
    canvas: HTMLCanvasElement
    /** 'hero' turns on its own; 'showcase' sways so fact lines stay on their parts. */
    mode?: 'hero' | 'showcase'
    reducedMotion?: boolean
}): MedalStage
