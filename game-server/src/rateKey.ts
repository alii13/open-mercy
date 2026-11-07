/**
 * Rate-limit key for a client address. An IPv6 host normally owns a whole /64
 * and can rotate its source address inside it per request, so IPv6 is keyed on
 * the /64 prefix; IPv4 (and IPv4-mapped IPv6) keeps the full address.
 */
export function rateKey(ip: string): string {
    if (!ip.includes(':') || ip.includes('.')) return ip
    const [head = '', tail = ''] = ip.toLowerCase().split('::')
    const h = head ? head.split(':') : []
    const t = tail ? tail.split(':') : []
    const groups = [...h, ...Array<string>(8 - h.length - t.length).fill('0'), ...t]
    return groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}
