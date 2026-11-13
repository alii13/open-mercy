<template>
  <ConfirmDialog
    :open="!!target"
    title="Report this player?"
    :message="`We'll mute ${target?.name ?? 'them'} for you and read your report.`"
    :confirm-label="sending ? 'SENDING' : 'REPORT'"
    cancel-label="CANCEL"
    :confirm-disabled="!reason || sending"
    @confirm="send"
    @cancel="$emit('close')"
  >
    <div class="report-reasons" role="radiogroup" aria-label="What happened?">
      <label v-for="r in REASONS" :key="r.value" class="report-option">
        <input v-model="reason" type="radio" name="report-reason" :value="r.value" />
        <span>{{ r.label }}</span>
      </label>
    </div>
    <label class="report-option report-block">
      <input v-model="alsoBlock" type="checkbox" />
      <span>
        Block them too
        <span class="report-note">They can't invite you or send you a friend request.</span>
      </span>
    </label>
    <p v-if="failed" class="report-error" role="alert">That didn't send. Try again.</p>
  </ConfirmDialog>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue'
import ConfirmDialog from '../ConfirmDialog.vue'
import { supabase } from '../../lib/supabase'
import { useSocialStore } from '../../stores/socialStore'
import { useVoiceStore } from '../../stores/voiceStore'

type Reason = 'voice' | 'name_or_photo' | 'cheating' | 'other'
const REASONS: { value: Reason; label: string }[] = [
  { value: 'voice', label: 'Offensive voice chat' },
  { value: 'name_or_photo', label: 'Offensive name or photo' },
  { value: 'cheating', label: 'Cheating or stalling' },
  { value: 'other', label: 'Something else' },
]

const props = defineProps<{ target: { id: string; name: string } | null; roomCode: string }>()
const emit = defineEmits<{ close: [] }>()

const voice = useVoiceStore()
const social = useSocialStore()
const reason = ref<Reason | null>(null)
const alsoBlock = ref(false)
const sending = ref(false)
const failed = ref(false)

watch(() => props.target, () => {
  reason.value = null
  alsoBlock.value = false
  failed.value = false
})

async function send() {
  const target = props.target
  if (!target || !reason.value) return
  // Muted at once, whether or not the report reaches the server.
  if (!voice.localMutedUserIds.has(target.id)) voice.toggleMuteForMe(target.id)
  sending.value = true
  failed.value = false
  const { data, error } = await supabase.rpc('report_player', {
    p_user: target.id,
    p_reason: reason.value,
    p_room: props.roomCode || null,
  })
  sending.value = false
  if (error || data !== 'reported') {
    failed.value = true
    return
  }
  if (alsoBlock.value) void social.block(target.id)
  emit('close')
}
</script>

<style scoped>
.report-reasons {
  display: grid;
  margin: 0 0 var(--spacing-3);
  text-align: left;
}

.report-option {
  display: flex;
  align-items: center;
  gap: var(--spacing-3);
  min-height: 44px;
  color: var(--text-primary);
  font-size: var(--text-base);
  text-align: left;
  cursor: pointer;
}

.report-option input {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  margin: 0;
  accent-color: var(--color-alert);
}

.report-block {
  align-items: flex-start;
  padding-top: var(--spacing-3);
  margin-bottom: var(--spacing-6);
}

.report-block input {
  margin-top: 2px;
}

.report-note {
  display: block;
  color: var(--text-secondary);
  font-size: var(--text-sm);
  line-height: 1.4;
}

.report-error {
  margin: 0 0 var(--spacing-4);
  color: var(--color-alert);
  font-size: var(--text-sm);
  text-align: left;
}
</style>
