<template>
    <span class="badged-name">
        <!-- The player's photo (or initial) with presence and the tier shield
             riding on it, so every row shows the same mark the seats do. -->
        <Avatar
            :uid="uid"
            :name="name"
            :size="24"
            :badge="badge"
            :points="points"
            :progress="progress"
            :badge-link="link"
            :presence="presence"
            class="bn-badge"
        />
        <span class="bn-name"><slot>{{ name }}</slot></span>
    </span>
</template>

<script setup lang="ts">
import Avatar from './Avatar.vue'
import type { Badge as BadgeType, Progress } from '../utils/badges'

withDefaults(
    defineProps<{
        /** Whose photo to show; without it the initial stands in. */
        uid?: string | null
        /** Plain-text name; or use the default slot for custom markup. */
        name?: string
        badge?: BadgeType
        points?: number
        progress?: Progress
        /** Emblem opens the /badges explainer on click. */
        link?: boolean
        /**
         * Last-seen timestamp, or null for a player who never checked in.
         * Leave it undefined to render no dot at all - which is what a
         * surface without presence data should do, rather than showing
         * everyone as offline.
         */
        presence?: string | null
    }>(),
    { uid: undefined, name: '', badge: undefined, points: undefined, progress: undefined, link: true, presence: undefined },
)
</script>

<style scoped>
.badged-name {
    display: inline-flex;
    align-items: center;
    gap: 0.6em;
    min-width: 0;
}
.bn-badge {
    flex: none;
}
.bn-name {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
</style>
