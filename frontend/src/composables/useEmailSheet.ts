/**
 * The change-email sheet is one global surface (mounted in App.vue), opened
 * from the account menu like the photo sheet.
 */

import { ref } from 'vue'

export const emailSheetOpen = ref(false)

export function openEmailSheet(): void {
    emailSheetOpen.value = true
}

export function closeEmailSheet(): void {
    emailSheetOpen.value = false
}
