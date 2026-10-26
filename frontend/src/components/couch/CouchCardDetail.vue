<template>
  <section class="card-detail" :class="{ playable }" aria-live="polite">
    <template v-if="card">
      <div class="detail-title">
        <CircleCheckBig v-if="playable" :size="20" aria-hidden="true" />
        <LockKeyhole v-else :size="20" aria-hidden="true" />
        <div>
          <strong>{{ presentation.name }}</strong>
          <span>{{ family }}</span>
        </div>
      </div>
      <div class="detail-copy">
        <p><b>Effekt:</b> {{ presentation.effect }}</p>
        <p class="detail-status"><b>Status:</b> {{ explanation }}</p>
      </div>
    </template>
    <template v-else>
      <Info :size="20" aria-hidden="true" />
      <p><strong>Kartendetails</strong><span>Tippe eine Handkarte an, um Name und Wirkung zu sehen.</span></p>
    </template>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { CircleCheckBig, Info, LockKeyhole } from 'lucide-vue-next'
import type { Card } from '../../types/card'
import { cardFamily, cardPresentation } from '../../utils/cardPresentation'

const props = defineProps<{
  card: Card | null
  playable: boolean
  explanation: string
}>()

const presentation = computed(() => props.card ? cardPresentation(props.card) : cardPresentation({ id: 'empty', color: 'wild', type: 'wild' }))
const family = computed(() => props.card ? cardFamily(props.card) : '')
</script>

<style scoped>
.card-detail{min-width:0;min-height:90px;box-sizing:border-box;display:flex;flex-direction:column;justify-content:center;gap:5px;padding:7px 10px;border:1px solid #493953;background:rgba(14,10,19,.92);color:#bcb0c2}.card-detail.playable{border-color:#308c70;box-shadow:inset 3px 0 #54e3b5}.detail-title{min-width:0;display:flex;align-items:center;gap:8px;color:#ad9bb5}.playable .detail-title{color:#68edc0}.detail-title div{min-width:0;display:flex;flex-direction:row;align-items:baseline;gap:8px}.detail-title strong{overflow:hidden;color:#f0d586;font-family:var(--font-display);font-size:.8rem;letter-spacing:.035em;line-height:1.08;text-transform:uppercase}.detail-title span{font-size:.66rem;color:#a797aa;white-space:nowrap}.detail-copy{min-width:0}.detail-copy p{margin:0;font-size:.68rem;line-height:1.25;color:#d4c8d8}.detail-copy b{color:#a991b8}.detail-status{margin-top:3px!important;color:#a9e4cf!important}.card-detail>p{margin:0;display:flex;flex-direction:column;gap:2px;font-size:.72rem}.card-detail>p strong{color:#d9c27b;text-transform:uppercase;letter-spacing:.08em}.card-detail>svg{display:none}@media(max-width:380px){.card-detail{gap:4px;padding-inline:8px}.detail-title strong{font-size:.72rem}.detail-copy p{font-size:.64rem}}@media(max-height:700px){.card-detail{min-height:80px;padding-block:5px}.detail-copy p{font-size:.61rem}.detail-title span{display:none}}
</style>
