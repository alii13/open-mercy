import { describe, expect, it } from 'vitest'
import { rateKey } from './rateKey'

describe('rateKey', () => {
    it('keeps an IPv4 address as is', () => {
        expect(rateKey('203.0.113.7')).toBe('203.0.113.7')
    })

    it('gives every address in one IPv6 /64 the same key', () => {
        const a = rateKey('2001:db8:aa:bb::1')
        expect(rateKey('2001:db8:aa:bb:ffff:1234:5678:9abc')).toBe(a)
        expect(rateKey('2001:0DB8:00aa:00bb:0:0:0:2')).toBe(a)
    })

    it('separates neighbouring /64s, including ones written with ::', () => {
        expect(rateKey('2001:db8::1')).not.toBe(rateKey('2001:db8:0:1::1'))
        expect(rateKey('2001:db8::1')).toBe(rateKey('2001:db8:0:0:ffff::'))
    })

    it('does not collapse IPv4-mapped addresses into one key', () => {
        expect(rateKey('::ffff:203.0.113.7')).not.toBe(rateKey('::ffff:198.51.100.9'))
    })
})
