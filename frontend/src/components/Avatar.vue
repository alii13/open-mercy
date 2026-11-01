<template>
    <!-- Photo (or initial) with the tier shield as a pip at the bottom-right
         and presence at the bottom-left. Size comes from --av-size, set by the
         parent or the `size` prop, so breakpoints can resize it in CSS. -->
    <span class="av" :class="state ? `av--${state}` : undefined" :style="size ? { '--av-size': `${size}px` } : undefined">
        <img v-if="url && !failed" class="av-face" :src="url" alt="" draggable="false" @error="failed = true" />
        <span v-else class="av-face av-initial" :style="{ background: tint.bg, color: tint.fg }" aria-hidden="true">{{ initial }}</span>
        <Badge
            v-if="badge"
            :badge="badge"
            :points="points"
            :progress="progress"
            :link="badgeLink"
            size="mark"
            class="av-pip"
        />
        <PresenceDot v-if="presence !== undefined" :last-seen-at="presence" class="av-dot" />
    </span>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Badge from './Badge.vue'
import PresenceDot from './PresenceDot.vue'
import { avatarUrlFor, requestAvatars } from '../composables/useAvatars'
import { avatarTint, initialOf } from '../utils/avatar'
import type { Badge as BadgeType, Progress } from '../utils/badges'

const props = defineProps<{
    uid?: string | null
    name: string
    size?: number
    badge?: BadgeType
    points?: number
    progress?: Progress
    badgeLink?: boolean
    /** Leave undefined to draw no dot; null is a player who never checked in. */
    presence?: string | null
    state?: 'turn' | 'speaking' | 'disconnected' | 'out' | null
    /** Shows this photo instead of the saved one (the photo sheet preview). */
    src?: string | null
}>()

watch(() => props.uid, uid => requestAvatars([uid]), { immediate: true })

const url = computed(() => props.src ?? avatarUrlFor(props.uid))
const failed = ref(false)
watch(url, () => { failed.value = false })

const tint = computed(() => avatarTint(props.uid || props.name))
const initial = computed(() => initialOf(props.name))
</script>

<style scoped>
.av {
    position: relative;
    display: inline-block;
    flex: none;
    width: var(--av-size, 32px);
    height: var(--av-size, 32px);
    vertical-align: middle;
}

.av-face {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 100%;
    height: 100%;
    border-radius: 50%;
    object-fit: cover;
    box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.1);
    transition: box-shadow var(--duration-soft, 0.2s) ease, opacity var(--duration-soft, 0.2s) ease;
}

.av-initial {
    font-family: var(--font-display);
    font-size: calc(var(--av-size, 32px) * 0.42);
    line-height: 1;
    user-select: none;
}

/* Rank pip: a little under half the avatar, never below 14px, hanging off the
   bottom-right edge. The thin white edge traces the shield's own outline so
   it separates from any photo; it sits on the art, not the emblem, so the top
   tiers keep their glow. */
.av .av-pip {
    position: absolute;
    --emblem-size: max(14px, calc(var(--av-size, 32px) * 0.45));
    right: calc(var(--emblem-size) * -0.3);
    bottom: calc(var(--emblem-size) * -0.2);
}
.av-pip :deep(.badge-art) {
    filter:
        drop-shadow(1px 0 0 #fff) drop-shadow(-1px 0 0 #fff)
        drop-shadow(0 1px 0 #fff) drop-shadow(0 -1px 0 #fff);
}

.av .av-dot {
    position: absolute;
    left: 2%;
    bottom: 2%;
    --pdot-size: clamp(8px, 18%, 18px);
    box-shadow: 0 0 0 1px #fff;
}

/* State lives on the ring around the face, never on top of it. Same colours
   the seat already speaks: cyan is whose turn it is, green is who is talking. */
.av--turn .av-face {
    box-shadow: 0 0 0 2px var(--bg-concrete), 0 0 0 4px var(--color-neon-blue), 0 0 14px 2px rgba(0, 243, 255, 0.4);
}
.av--speaking .av-face {
    box-shadow: 0 0 0 2px var(--bg-concrete), 0 0 0 3px var(--color-neon-green), 0 0 12px rgba(0, 255, 102, 0.7);
}
.av--disconnected .av-face {
    opacity: 0.35;
    box-shadow: 0 0 0 2px var(--bg-concrete), 0 0 0 3px rgba(255, 42, 42, 0.7);
}
.av--out .av-face {
    filter: grayscale(1) brightness(0.6);
}
</style>
