import { afterEach, describe, expect, it } from 'vitest'
import { holdAppInert } from '../useInertApp'

const app = { inert: false }
globalThis.document = { getElementById: () => app } as unknown as Document

describe('holdAppInert', () => {
    afterEach(() => { app.inert = false })

    it('keeps the page inert until the last open overlay closes', () => {
        const account = holdAppInert()
        const confirm = holdAppInert()
        expect(app.inert).toBe(true)
        confirm()
        expect(app.inert).toBe(true)
        account()
        expect(app.inert).toBe(false)
    })

    it('ignores a second release from the same overlay', () => {
        const release = holdAppInert()
        const other = holdAppInert()
        release()
        release()
        expect(app.inert).toBe(true)
        other()
        expect(app.inert).toBe(false)
    })
})
