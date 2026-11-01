<template>
  <Teleport to="body">
    <div
      ref="overlayEl"
      class="ps-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ps-title"
      tabindex="-1"
      @click.self="close"
      @keydown.esc="close"
    >
      <div class="ps-sheet">
        <span class="ps-grabber" aria-hidden="true"></span>

        <!-- A guest's upload is refused by the bucket policy (supabase/avatars.sql),
             so the sheet explains it and hands them to the claim flow. The
             wish is remembered and the sheet reopens once they are claimed. -->
        <template v-if="isGuest">
          <div class="ps-gate-faces" aria-hidden="true">
            <Avatar :uid="uid" :name="name" :size="72" :badge="mine?.badge" />
            <ArrowRight :size="20" :stroke-width="2" class="ps-gate-arrow" />
            <span class="ps-gate-slot"><Camera :size="20" :stroke-width="2" /></span>
          </div>
          <h2 id="ps-title" class="ps-title ps-title--center">Claim your account to add a photo</h2>
          <p class="ps-copy">Guest profiles vanish if this browser forgets you. Claim it with Google or email, keep your name, rank and games, then pick a photo.</p>
          <button type="button" class="ps-btn ps-btn--claim" @click="$emit('claim')">CLAIM ACCOUNT</button>
          <button type="button" class="ps-link" @click="close">Not now</button>
        </template>

        <template v-else>
          <header class="ps-head">
            <h2 id="ps-title" class="ps-title">Profile photo</h2>
            <button type="button" class="ps-close" aria-label="Close" @click="close">
              <X :size="20" :stroke-width="2" aria-hidden="true" />
            </button>
          </header>

          <template v-if="photo">
            <div
              class="ps-crop"
              @pointerdown="startDrag"
              @pointermove="moveDrag"
              @pointerup="endDrag"
              @pointercancel="endDrag"
              @wheel.prevent="onWheel"
            >
              <img :src="photo.url" class="ps-crop-img" :style="imgStyle" alt="" draggable="false" />
              <span class="ps-ring" aria-hidden="true"></span>
              <span class="ps-hint"><Hand :size="14" :stroke-width="2" aria-hidden="true" /> Drag to move</span>
            </div>

            <label class="ps-zoom">
              <ZoomOut :size="16" :stroke-width="2" aria-hidden="true" />
              <input v-model.number="zoom" type="range" min="1" max="3" step="0.01" aria-label="Zoom" />
              <ZoomIn :size="16" :stroke-width="2" aria-hidden="true" />
            </label>

            <div class="ps-preview">
              <span class="ps-preview-label">At the table</span>
              <span class="ps-chip">
                <Avatar :uid="uid" :name="name" :size="32" :src="preview" :badge="mine?.badge" />
                <span class="ps-chip-name">{{ name }}</span>
              </span>
            </div>

            <button type="button" class="ps-btn ps-btn--save" :disabled="busy" @click="save">
              {{ busy ? 'SAVING...' : 'SAVE PHOTO' }}
            </button>
            <button type="button" class="ps-link" :disabled="busy" @click="pick">
              <ImageIcon :size="16" :stroke-width="2" aria-hidden="true" /> Choose another photo
            </button>
          </template>

          <template v-else>
            <div class="ps-current">
              <Avatar :uid="uid" :name="name" :size="128" :badge="mine?.badge" />
            </div>
            <button type="button" class="ps-btn ps-btn--save" :disabled="busy" @click="pick">
              <ImagePlus :size="16" :stroke-width="2" aria-hidden="true" /> {{ hasPhoto ? 'CHOOSE A NEW PHOTO' : 'CHOOSE PHOTO' }}
            </button>
            <button v-if="hasPhoto" type="button" class="ps-link ps-link--danger" :disabled="busy" @click="remove">
              <Trash2 :size="16" :stroke-width="2" aria-hidden="true" /> Remove photo
            </button>
          </template>

          <p v-if="error" class="ps-error" role="alert">{{ error }}</p>
          <p class="ps-fine">Everyone at your table and on your profile sees this. Saved small and square.</p>
          <input ref="fileEl" type="file" accept="image/*" class="ps-file" @change="onFile" />
        </template>
      </div>
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { ArrowRight, Camera, Hand, Image as ImageIcon, ImagePlus, Trash2, X, ZoomIn, ZoomOut } from 'lucide-vue-next'
import { computed, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue'
import Avatar from './Avatar.vue'
import { useAuthStore } from '../stores/authStore'
import { useBadges } from '../composables/useBadges'
import { avatarUrlFor, removeAvatar, uploadAvatar } from '../composables/useAvatars'
import { closePhotoSheet } from '../composables/usePhotoSheet'
import { cropRect } from '../utils/avatar'
import { track } from '../utils/analytics'

defineEmits<{ claim: [] }>()

/** Crop circle diameter, and the strip of photo shown around it. */
const VIEW = 248
const MARGIN = 24
const SAVE_SIZE = 256

const authStore = useAuthStore()
const uid = computed(() => authStore.user?.id ?? null)
const name = computed(() => authStore.profile?.username ?? '')
const isGuest = computed(() => authStore.isAnonymous)
const hasPhoto = computed(() => !!avatarUrlFor(uid.value))

const { badges, fetchBadges } = useBadges()
const mine = computed(() => (uid.value ? badges.value[uid.value] : undefined))

const overlayEl = ref<HTMLElement | null>(null)
const fileEl = ref<HTMLInputElement | null>(null)
const busy = ref(false)
const error = ref('')

onMounted(() => {
  overlayEl.value?.focus()
  if (uid.value) void fetchBadges([uid.value])
})

function close() {
  if (!busy.value) closePhotoSheet()
}

// ---- choosing a photo -----------------------------------------------------

interface Photo { url: string; width: number; height: number }
const photo = shallowRef<Photo | null>(null)
let image: HTMLImageElement | null = null

function pick() {
  error.value = ''
  fileEl.value?.click()
}

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  if (!file.type.startsWith('image/')) {
    error.value = 'That file is not a picture. Pick a photo.'
    return
  }
  const url = URL.createObjectURL(file)
  const next = new Image()
  next.src = url
  try {
    await next.decode()
  } catch {
    URL.revokeObjectURL(url)
    error.value = 'That picture could not be opened. Try another one.'
    return
  }
  if (photo.value) URL.revokeObjectURL(photo.value.url)
  image = next
  zoom.value = 1
  offset.x = 0
  offset.y = 0
  photo.value = { url, width: next.naturalWidth, height: next.naturalHeight }
  refreshPreview()
}

onBeforeUnmount(() => {
  if (photo.value) URL.revokeObjectURL(photo.value.url)
})

// ---- cropping -------------------------------------------------------------

const zoom = ref(1)
const offset = reactive({ x: 0, y: 0 })
const rect = computed(() => (photo.value ? cropRect(photo.value, VIEW, zoom.value, offset) : null))

const imgStyle = computed(() => {
  const p = photo.value
  const r = rect.value
  if (!p || !r) return {}
  const scale = VIEW / r.size
  return {
    width: `${p.width * scale}px`,
    height: `${p.height * scale}px`,
    left: `${MARGIN - r.sx * scale}px`,
    top: `${MARGIN - r.sy * scale}px`,
  }
})

/** Keep the stored drag inside what cropRect allows, so dragging back responds at once. */
function settleOffset() {
  const p = photo.value
  const r = rect.value
  if (!p || !r) return
  const scale = VIEW / r.size
  offset.x = (p.width * scale - VIEW) / 2 - r.sx * scale
  offset.y = (p.height * scale - VIEW) / 2 - r.sy * scale
}

let dragFrom: { x: number; y: number; ox: number; oy: number } | null = null

function startDrag(e: PointerEvent) {
  if (!photo.value) return
  ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
  dragFrom = { x: e.clientX, y: e.clientY, ox: offset.x, oy: offset.y }
}

function moveDrag(e: PointerEvent) {
  if (!dragFrom) return
  offset.x = dragFrom.ox + (e.clientX - dragFrom.x)
  offset.y = dragFrom.oy + (e.clientY - dragFrom.y)
}

function endDrag() {
  if (!dragFrom) return
  dragFrom = null
  settleOffset()
  refreshPreview()
}

function onWheel(e: WheelEvent) {
  zoom.value = Math.min(3, Math.max(1, zoom.value - e.deltaY * 0.002))
}

watch(zoom, () => {
  settleOffset()
  refreshPreview()
})

function renderCrop(size: number): HTMLCanvasElement | null {
  const r = rect.value
  if (!image || !r) return null
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, r.sx, r.sy, r.size, r.size, 0, 0, size, size)
  return canvas
}

const preview = ref<string | null>(null)
function refreshPreview() {
  preview.value = renderCrop(64)?.toDataURL('image/jpeg', 0.8) ?? null
}

// ---- saving ---------------------------------------------------------------

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(resolve, type, 0.85))
}

async function save() {
  const canvas = renderCrop(SAVE_SIZE)
  if (!canvas || !uid.value) return
  busy.value = true
  error.value = ''
  // Browsers that cannot encode WebP hand back a PNG; send a JPEG instead.
  let blob = await toBlob(canvas, 'image/webp')
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg')
  const result = blob ? await uploadAvatar(uid.value, blob) : { error: 'encode' }
  busy.value = false
  if (result.error) {
    error.value = "Couldn't save your photo. Check your connection and try again."
    return
  }
  track('avatar_saved', { content_type: blob?.type ?? 'unknown' })
  closePhotoSheet()
}

async function remove() {
  if (!uid.value) return
  busy.value = true
  error.value = ''
  const result = await removeAvatar(uid.value)
  busy.value = false
  if (result.error) {
    error.value = "Couldn't remove your photo. Try again."
    return
  }
  track('avatar_removed')
}
</script>

<style scoped>
.ps-overlay {
  position: fixed;
  inset: 0;
  z-index: var(--z-modal);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-4);
  background: rgba(0, 0, 0, 0.82);
  outline: none;
}

.ps-sheet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--spacing-4);
  width: 100%;
  max-width: 400px;
  max-height: 100%;
  overflow-y: auto;
  padding: var(--spacing-3) var(--spacing-6) var(--spacing-6);
  background: #121416;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: var(--radius-lg);
  font-family: var(--font-body);
  color: var(--text-primary);
}

.ps-grabber {
  display: none;
  width: 40px;
  height: 4px;
  border-radius: 2px;
  background: rgba(255, 255, 255, 0.18);
}

/* Phones get a bottom sheet. */
@media (max-width: 480px) {
  .ps-overlay {
    align-items: flex-end;
    padding: 0;
  }
  .ps-sheet {
    max-width: none;
    border-radius: 20px 20px 0 0;
    border-bottom: none;
    padding-bottom: calc(var(--spacing-8) + env(safe-area-inset-bottom));
  }
  .ps-grabber {
    display: block;
  }
}

.ps-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
}

.ps-title {
  margin: 0;
  font-family: var(--font-display);
  font-size: var(--text-xl);
  font-weight: 400;
  color: var(--text-primary);
}
.ps-title--center {
  text-align: center;
  font-size: var(--text-2xl);
  line-height: 1.2;
}

.ps-close {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border: none;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.06);
  color: var(--text-secondary);
  cursor: pointer;
}
.ps-close:hover,
.ps-close:focus-visible {
  color: var(--text-primary);
  background: rgba(255, 255, 255, 0.12);
}

/* Crop: the photo under a ring, the outside dimmed by the ring's own shadow. */
.ps-crop {
  position: relative;
  flex: none;
  width: 296px;
  height: 296px;
  overflow: hidden;
  border-radius: var(--radius-lg);
  background: #000;
  cursor: grab;
  touch-action: none;
  user-select: none;
}
.ps-crop:active {
  cursor: grabbing;
}
.ps-crop-img {
  position: absolute;
  max-width: none;
  pointer-events: none;
}
.ps-ring {
  position: absolute;
  left: 24px;
  top: 24px;
  width: 248px;
  height: 248px;
  border-radius: 50%;
  border: 2px solid rgba(255, 255, 255, 0.85);
  box-shadow: 0 0 0 400px rgba(5, 5, 6, 0.72);
  pointer-events: none;
}
.ps-hint {
  position: absolute;
  left: 50%;
  bottom: var(--spacing-3);
  transform: translateX(-50%);
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-3);
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.6);
  font-size: var(--text-xs);
  color: var(--text-primary);
  white-space: nowrap;
  pointer-events: none;
}

.ps-zoom {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  width: 100%;
  color: var(--text-secondary);
}
.ps-zoom input {
  flex: 1;
  accent-color: var(--text-primary);
}

.ps-preview {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding: var(--spacing-3);
  border-radius: var(--radius-md);
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.06);
}
.ps-preview-label {
  font-size: var(--text-sm);
  color: var(--text-secondary);
}
.ps-chip {
  display: inline-flex;
  align-items: center;
  gap: var(--spacing-2);
  padding: var(--spacing-1) var(--spacing-3) var(--spacing-1) var(--spacing-1);
  border-radius: var(--radius-pill);
  background: rgba(0, 0, 0, 0.4);
  border: 1px solid rgba(255, 255, 255, 0.08);
}
.ps-chip-name {
  font-size: var(--text-xs);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.ps-current {
  padding: var(--spacing-6) 0 var(--spacing-3);
}

.ps-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  width: 100%;
  min-height: 52px;
  border-radius: var(--radius-sm);
  font-family: var(--font-display);
  font-size: var(--text-base);
  letter-spacing: 0.1em;
  cursor: pointer;
  transition: background var(--duration-snap) var(--ease-snap), opacity var(--duration-snap) var(--ease-snap);
}
.ps-btn:disabled {
  opacity: 0.6;
  cursor: wait;
}
.ps-btn--save {
  border: none;
  background: var(--text-primary);
  color: var(--bg-concrete);
}
.ps-btn--save:hover:not(:disabled),
.ps-btn--save:focus-visible {
  background: #fff;
}
.ps-btn--claim {
  border: 2px solid var(--color-neon-blue);
  background: transparent;
  color: var(--color-neon-blue);
}
.ps-btn--claim:hover,
.ps-btn--claim:focus-visible {
  background: rgba(0, 243, 255, 0.08);
}

.ps-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  min-height: 44px;
  padding: 0 var(--spacing-3);
  border: none;
  background: none;
  font-family: var(--font-body);
  font-size: var(--text-base);
  font-weight: 500;
  color: var(--text-primary);
  cursor: pointer;
}
.ps-link:hover,
.ps-link:focus-visible {
  text-decoration: underline;
}
.ps-link--danger {
  color: #ff5a5a;
}

.ps-error {
  margin: 0;
  font-size: var(--text-sm);
  color: var(--color-alert);
  text-align: center;
}

.ps-fine {
  margin: 0;
  font-size: var(--text-sm);
  line-height: 1.45;
  color: var(--text-muted);
  text-align: center;
}

.ps-copy {
  margin: 0;
  font-size: var(--text-base);
  line-height: 1.45;
  color: var(--text-secondary);
  text-align: center;
}

.ps-gate-faces {
  display: flex;
  align-items: center;
  gap: var(--spacing-4);
  padding: var(--spacing-6) 0 var(--spacing-2);
}
.ps-gate-arrow {
  color: var(--text-muted);
}
.ps-gate-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 72px;
  height: 72px;
  border-radius: 50%;
  border: 2px dashed rgba(0, 243, 255, 0.5);
  color: var(--color-neon-blue);
}

.ps-file {
  display: none;
}
</style>
