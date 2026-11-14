/**
 * The account modal is one global surface (mounted in App.vue), opened from
 * the account menu and from every "claim your account" button. Moving between
 * its steps never resizes it: the steps swap inside the same frame.
 */

import { ref } from 'vue'

export type AccountStep = 'home' | 'friends' | 'photo' | 'email' | 'claim' | 'delete'

/** null while closed. */
export const accountStep = ref<AccountStep | null>(null)

export function openAccountModal(step: AccountStep = 'home'): void {
    accountStep.value = step
}

export function closeAccountModal(): void {
    accountStep.value = null
}
