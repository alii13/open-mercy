import { Capacitor } from '@capacitor/core'

/**
 * The site's address, for links that leave this device (invites, profile
 * links, the links in sign-in emails) and for the site's own functions. On the
 * web it is the page's origin. In the iOS and Android apps the page's origin
 * is capacitor://localhost or https://localhost, which opens nothing on anyone
 * else's phone and serves no /api routes.
 */
export function siteOrigin(): string {
    return Capacitor.isNativePlatform() ? 'https://open-mercy.com' : window.location.origin
}
