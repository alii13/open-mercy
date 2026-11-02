/**
 * The photo sheet is one global surface (mounted in App.vue) opened from the
 * profile page and the account menu. A guest who taps it is sent to claim
 * their account first; claiming can leave the page (Google) or finish later
 * (email link), so the wish to add a photo is kept in localStorage and the
 * sheet reopens the next time this player is signed in as a claimed account.
 */

import { ref } from 'vue'

const RESUME_KEY = 'om:photo-after-claim'

export const photoSheetOpen = ref(false)

export function openPhotoSheet(): void {
    photoSheetOpen.value = true
}

export function closePhotoSheet(): void {
    photoSheetOpen.value = false
}

export function rememberPhotoAfterClaim(): void {
    try {
        localStorage.setItem(RESUME_KEY, '1')
    } catch {
        // Private mode: the player just reopens the sheet themselves.
    }
}

/** True once, the first time it is asked after a guest chose to claim. */
export function takePhotoAfterClaim(): boolean {
    try {
        const wanted = localStorage.getItem(RESUME_KEY) === '1'
        localStorage.removeItem(RESUME_KEY)
        return wanted
    } catch {
        return false
    }
}
