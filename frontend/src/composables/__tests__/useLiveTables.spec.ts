import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import { useLiveTables, type LiveTable } from '../useLiveTables'

const table = (over: Partial<LiveTable> = {}): LiveTable => ({
    code: 'AAAA', players: 2, seatsFree: 18, inProgress: false, mode: 'official', skins: [], ...over,
})

function mockFetch(payload: unknown, ok = true) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok, json: async () => payload })))
}

describe('useLiveTables', () => {
    beforeEach(() => { vi.useFakeTimers() })
    afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

    it('stays hidden until a fetch has actually succeeded', async () => {
        mockFetch([table()])
        const lt = useLiveTables()
        // Nothing fetched yet: an empty surface must not flash in on mount.
        expect(lt.hasAnything.value).toBe(false)
        await lt.refresh()
        expect(lt.hasAnything.value).toBe(true)
    })

    it('stays hidden when the directory is empty', async () => {
        mockFetch([])
        const lt = useLiveTables()
        await lt.refresh()
        expect(lt.loaded.value).toBe(true)
        expect(lt.hasAnything.value).toBe(false)
    })

    it('stays hidden when the route is not deployed yet', async () => {
        mockFetch('not found', false)
        const lt = useLiveTables()
        await lt.refresh()
        expect(lt.hasAnything.value).toBe(false)
    })

    it('survives a network failure without throwing', async () => {
        vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
        const lt = useLiveTables()
        await expect(lt.refresh()).resolves.toBeUndefined()
        expect(lt.hasAnything.value).toBe(false)
    })

    it('offers only rooms with a seat actually free', async () => {
        mockFetch([
            table({ code: 'OPEN' }),
            table({ code: 'FULL', seatsFree: 0 }),
            table({ code: 'RUNNING', inProgress: true }),
        ])
        const lt = useLiveTables()
        await lt.refresh()
        expect(lt.joinable.value.map((t) => t.code)).toEqual(['OPEN'])
    })

    it('counts running games separately, since they have no seat to take', async () => {
        mockFetch([table({ inProgress: true }), table({ code: 'B', inProgress: true }), table({ code: 'C' })])
        const lt = useLiveTables()
        await lt.refresh()
        expect(lt.inProgressCount.value).toBe(2)
    })

    it('shows the surface for running games even with nothing joinable', async () => {
        mockFetch([table({ inProgress: true, seatsFree: 0 })])
        const lt = useLiveTables()
        await lt.refresh()
        expect(lt.joinable.value).toEqual([])
        expect(lt.hasAnything.value).toBe(true)
    })

    it('totals the people already waiting, not the seats', async () => {
        mockFetch([table({ players: 3 }), table({ code: 'B', players: 1 })])
        const lt = useLiveTables()
        await lt.refresh()
        expect(lt.waitingPlayers.value).toBe(4)
    })

    it('ignores a payload that is not a list', async () => {
        mockFetch({ error: 'nope' })
        const lt = useLiveTables()
        await lt.refresh()
        expect(lt.loaded.value).toBe(false)
    })

    it('skips a hidden tab and reads again the moment it is back', async () => {
        mockFetch([table()])
        const doc = { visibilityState: 'visible', listeners: [] as (() => void)[] }
        vi.stubGlobal('document', {
            get visibilityState() { return doc.visibilityState },
            addEventListener: (_e: string, cb: () => void) => { doc.listeners.push(cb) },
            removeEventListener: () => { doc.listeners = [] },
        })
        const lt = useLiveTables()
        lt.start()
        const calls = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
        doc.visibilityState = 'hidden'
        const hiddenAt = calls()
        vi.advanceTimersByTime(60_000)
        expect(calls()).toBe(hiddenAt)

        doc.visibilityState = 'visible'
        doc.listeners.forEach((cb) => cb())
        expect(calls()).toBe(hiddenAt + 1)
        lt.stop()
    })

    it('stops polling when told to', async () => {
        mockFetch([table()])
        const lt = useLiveTables()
        lt.start()
        const calls = () => (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length
        const afterStart = calls()
        vi.advanceTimersByTime(16_000)
        expect(calls()).toBeGreaterThan(afterStart)
        lt.stop()
        const afterStop = calls()
        vi.advanceTimersByTime(60_000)
        expect(calls()).toBe(afterStop)
    })
})
