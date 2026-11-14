/** Tier (1-20) → a small front render of its 3D medal (from the badge lab), for shelves and sheets. */
const FILES = import.meta.glob('../assets/badges-3d/*.png', { eager: true, import: 'default' }) as Record<string, string>

export const BADGE_RENDERS: Record<number, string> = Object.fromEntries(
    Object.entries(FILES).map(([path, url]) => [Number(/\/(\d+)-/.exec(path)![1]), url]),
)
