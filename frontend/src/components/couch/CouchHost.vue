<template>
  <main class="couch-host" :class="`phase-${phase}`">
    <div class="couch-ambient" aria-hidden="true"></div>
    <header class="couch-header">
      <div>
        <p class="eyebrow">RUNE RIOT · COUCH MODE</p>
        <h1>{{ phase === 'lobby' ? 'Versammelt eure Gilde' : phase === 'finished' ? 'Runde beendet' : 'Der Runentisch' }}</h1>
      </div>
      <div v-if="store.roomCode" class="host-tools">
        <span class="host-connection" :class="{ online: store.status === 'connected' }">
          <Wifi v-if="store.status === 'connected'" :size="14" />
          <WifiOff v-else :size="14" />
          {{ store.status === 'connected' ? 'VERBUNDEN' : 'VERBINDUNG WIRD WIEDERHERGESTELLT' }}
        </span>
        <div class="room-code" aria-label="Raumcode">
          <span>RAUMCODE</span><strong>{{ store.roomCode }}</strong>
        </div>
        <button v-if="store.status === 'connected'" class="host-menu-toggle" :aria-expanded="menuOpen" @click="menuOpen = !menuOpen">
          <Settings2 :size="16" /> HOST-MENÜ
        </button>
        <div v-if="menuOpen" class="host-menu">
          <strong>HOST-MENÜ</strong>
          <button v-if="phase === 'finished'" :disabled="store.hostActionPending || !store.canStart" @click="store.startGame()">
            <RefreshCw :size="16" /> Noch eine Runde
          </button>
          <button v-if="phase !== 'lobby'" :disabled="store.hostActionPending" @click="confirmHostAction('lobby')">
            <House :size="16" /> {{ confirming === 'lobby' ? 'Zur Lobby bestätigen' : 'Zur Lobby' }}
          </button>
          <button class="danger" :disabled="store.hostActionPending" @click="confirmHostAction('close')">
            <Power :size="16" /> {{ confirming === 'close' ? 'Raum schließen bestätigen' : 'Raum schließen' }}
          </button>
          <small v-if="confirming">Zur Sicherheit dieselbe Aktion erneut wählen.</small>
        </div>
      </div>
    </header>

    <section v-if="store.error" class="host-error" role="alert">
      <TriangleAlert :size="28" aria-hidden="true" />
      <div><strong>Verbindung unterbrochen</strong><p>{{ store.error }}</p></div>
      <button @click="store.retry()"><RefreshCw :size="18" /> Erneut versuchen</button>
    </section>

    <section v-else-if="store.status === 'idle' && !store.roomCode" class="host-intro">
      <div class="intro-sigil"><Sparkles :size="64" /></div>
      <p>RUNE RIOT · COUCH EDITION</p>
      <h2>Ein Tisch. Viele Hände.<br />Eine magische Schlacht.</h2>
      <button @click="store.createRoom()"><Swords :size="26" /> NEUES SPIEL ERSTELLEN</button>
      <span>2–8 Spieler · Smartphones werden zu privaten Handkarten</span>
    </section>

    <section v-else-if="store.status !== 'connected'" class="host-loading" role="status">
      <LoaderCircle class="spin" :size="42" />
      <p>Runenkreis wird beschworen …</p>
    </section>

    <template v-else-if="phase === 'lobby'">
      <section class="join-panel">
        <div class="qr-frame">
          <img v-if="qrDataUrl" :src="qrDataUrl" alt="QR-Code zum Beitritt" />
          <LoaderCircle v-else class="spin" :size="36" />
        </div>
        <div class="join-copy">
          <ScanLine :size="28" aria-hidden="true" />
          <h2>Mit dem Smartphone beitreten</h2>
          <p>QR-Code scannen oder diese Adresse öffnen:</p>
          <code>{{ store.joinUrl }}</code>
          <p class="privacy-note"><ShieldCheck :size="18" /> Handkarten bleiben ausschließlich auf dem jeweiligen Smartphone.</p>
        </div>
      </section>

      <section class="roster-panel">
        <div class="section-title">
          <h2>Spieler {{ store.connectedCount }}/8</h2>
          <span>{{ store.readyCount }} bereit</span>
        </div>
        <ul class="host-roster">
          <li v-for="(player, index) in store.presence" :key="player.userId" :class="{ offline: !player.connected }">
            <span class="seat">{{ index + 1 }}</span>
            <span class="name">{{ player.name }}</span>
            <span class="ready" :class="{ yes: player.ready }">
              <CheckCircle2 v-if="player.ready" :size="20" />
              <CircleDashed v-else :size="20" />
              {{ player.connected ? (player.ready ? 'BEREIT' : 'WARTET') : 'GETRENNT' }}
            </span>
            <button class="kick" title="Spieler vor dem Start entfernen" @click="store.kickPlayer(player.userId)"><UserX :size="18" /></button>
          </li>
          <li v-for="slot in Math.max(0, 2 - store.presence.length)" :key="`empty-${slot}`" class="empty">
            <span class="seat">+</span><span class="name">Freier Runenplatz</span>
          </li>
        </ul>
        <button class="start-button" :disabled="!store.canStart || store.hostActionPending" @click="store.startGame()">
          <Swords :size="26" /> PARTIE STARTEN
        </button>
        <p class="start-hint">{{ startHint }}</p>
      </section>
    </template>

    <section v-else class="public-table">
      <div class="direction" :class="{ reverse: store.view?.direction === -1 }">
        <RotateCw :size="34" /><span>SPIELRICHTUNG</span>
      </div>
      <ul class="table-roster">
        <li v-for="player in store.view?.players" :key="player.userId"
            :class="{ active: player.userId === store.view?.currentPlayerId, eliminated: player.isEliminated }">
          <span class="player-name">{{ player.name }}</span>
          <span class="card-count"><Layers3 :size="18" /> {{ player.handCount }}</span>
          <span class="player-connection" :class="{ online: player.connected }">{{ player.connected ? 'VERBUNDEN' : 'VERBINDUNG UNTERBROCHEN' }}</span>
          <span v-if="player.userId === store.view?.currentPlayerId" class="turn-label">AM ZUG</span>
        </li>
      </ul>
      <div class="table-center">
        <div class="deck-stack"><CardBack :size="{ width: 142, height: 204 }" /><span>{{ store.view?.deckCount }}</span></div>
        <div class="discard-glow" :class="`glow-${store.view?.currentColor}`">
          <Card v-if="store.view?.discardTop" :card="store.view.discardTop" :size="{ width: 160, height: 230 }" />
        </div>
        <div v-if="store.view?.drawStack" class="draw-stack">+{{ store.view.drawStack }}</div>
      </div>
      <div v-if="phase === 'finished'" class="victory-overlay">
        <Crown :size="54" />
        <p>RUNDE BEENDET</p>
        <h2>{{ winnerName }}</h2>
        <ul class="finish-roster">
          <li v-for="player in store.view?.players" :key="player.userId">
            <span>{{ player.name }}</span><b>{{ player.handCount }} Karten</b><small>{{ player.connected ? 'verbunden' : 'unterbrochen' }}</small>
          </li>
        </ul>
        <div class="finish-actions">
          <button :disabled="store.hostActionPending || !store.canStart" @click="store.startGame()"><RefreshCw :size="16" /> NOCH EINE RUNDE</button>
          <button class="secondary" :disabled="store.hostActionPending" @click="confirmHostAction('lobby')"><House :size="16" /> {{ confirming === 'lobby' ? 'ZUR LOBBY BESTÄTIGEN' : 'ZUR LOBBY' }}</button>
        </div>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { toDataURL } from 'qrcode'
import { CheckCircle2, CircleDashed, Crown, House, Layers3, LoaderCircle, Power, RefreshCw, RotateCw, ScanLine, Settings2, ShieldCheck, Sparkles, Swords, TriangleAlert, UserX, Wifi, WifiOff } from 'lucide-vue-next'
import { useAuthStore } from '../../stores/authStore'
import { useCouchHostStore } from '../../stores/couchHostStore'
import Card from '../game/Card.vue'
import CardBack from '../game/CardBack.vue'

const auth = useAuthStore()
const store = useCouchHostStore()
const qrDataUrl = ref('')
const menuOpen = ref(false)
const confirming = ref<'lobby' | 'close' | null>(null)
const phase = computed(() => store.view?.status ?? 'lobby')
const winnerName = computed(() => store.view?.players.find(p => p.userId === store.view?.winnerId)?.name ?? 'Unbekannt')
const startHint = computed(() => {
  if (store.connectedCount < 2) return 'Mindestens zwei Spieler müssen verbunden sein.'
  if (!store.canStart) return 'Alle verbundenen Spieler bestätigen auf ihrem Smartphone „Bereit“.'
  return 'Der Runenkreis ist vollständig.'
})

function confirmHostAction(action: 'lobby' | 'close') {
  if (confirming.value !== action) {
    confirming.value = action
    return
  }
  confirming.value = null
  menuOpen.value = false
  if (action === 'lobby') store.returnToLobby()
  else store.closeRoom()
}

watch(phase, () => { confirming.value = null })

watch(() => store.joinUrl, async url => {
  qrDataUrl.value = url ? await toDataURL(url, { width: 360, margin: 1, color: { dark: '#130d1d', light: '#f4e9c5' } }) : ''
}, { immediate: true })

onMounted(async () => {
  if (auth.loading) {
    await new Promise<void>(resolve => {
      const stop = watch(() => auth.loading, loading => {
        if (!loading) { stop(); resolve() }
      })
    })
  }
  if (!auth.isAuthenticated) await auth.signInAnonymously('Runentisch')
  await store.initialize()
})
onBeforeUnmount(() => store.dispose())
</script>

<style scoped>
.couch-host{min-height:100dvh;padding:clamp(20px,3vw,48px);color:#f6edda;background:radial-gradient(circle at 50% 48%,#34215b 0,#100c19 34%,#050407 76%);position:relative;overflow:hidden}.couch-ambient{position:fixed;inset:0;pointer-events:none;background:radial-gradient(circle at 20% 12%,rgba(29,255,181,.1),transparent 26%),linear-gradient(115deg,transparent 46%,rgba(199,156,62,.07) 50%,transparent 54%)}.couch-header{position:relative;display:flex;justify-content:space-between;gap:24px;align-items:center;max-width:1500px;margin:auto}.eyebrow{letter-spacing:.24em;color:#c9a34e;font-weight:800;font-size:clamp(11px,1.2vw,16px)}h1{font-family:var(--font-display);font-size:clamp(34px,5vw,76px);margin:.1em 0}.room-code{border:1px solid #a27b30;background:rgba(7,6,10,.78);padding:14px 24px;text-align:center;box-shadow:0 0 35px rgba(199,156,62,.12)}.room-code span{display:block;font-size:12px;letter-spacing:.2em;color:#baa978}.room-code strong{font-size:clamp(30px,4vw,58px);letter-spacing:.18em}.join-panel,.roster-panel{position:relative;background:rgba(8,7,13,.78);border:1px solid rgba(199,156,62,.32);box-shadow:0 24px 80px rgba(0,0,0,.45)}.join-panel{max-width:1100px;margin:5vh auto 24px;padding:clamp(22px,3vw,42px);display:flex;gap:clamp(25px,4vw,60px);align-items:center}.qr-frame{width:clamp(190px,24vw,330px);aspect-ratio:1;background:#f4e9c5;padding:12px;display:grid;place-items:center;flex:none}.qr-frame img{width:100%;height:100%}.join-copy h2,.roster-panel h2{font-family:var(--font-display);font-size:clamp(24px,3vw,40px);margin:.3em 0}.join-copy code{display:block;padding:12px;background:#0e0b14;border:1px solid #443654;color:#9fffdc;overflow-wrap:anywhere}.privacy-note{display:flex;gap:10px;color:#9bd7bd;align-items:center}.roster-panel{max-width:1100px;margin:auto;padding:clamp(20px,3vw,36px)}.section-title{display:flex;justify-content:space-between;align-items:center}.section-title span{color:#c9a34e}.host-roster,.table-roster{list-style:none;padding:0}.host-roster li{display:grid;grid-template-columns:44px 1fr auto 42px;gap:14px;align-items:center;padding:13px;border-bottom:1px solid rgba(255,255,255,.08)}.seat{display:grid;place-items:center;width:34px;height:34px;border:1px solid #655378;border-radius:50%;color:#d5bd7b}.name{font-size:20px;font-weight:800}.ready{display:flex;gap:8px;align-items:center;color:#9e93a8;font-size:13px;letter-spacing:.1em}.ready.yes{color:#62efb7}.kick{background:none;border:0;color:#887b8f;padding:8px}.offline{opacity:.5}.empty{opacity:.45}.start-button,.victory-overlay button{display:flex;gap:12px;align-items:center;justify-content:center;margin:24px auto 0;min-height:58px;padding:0 32px;background:linear-gradient(135deg,#d2ad54,#76531b);border:1px solid #efd884;color:#110c08;font-weight:900;letter-spacing:.12em}.start-button:disabled{filter:grayscale(1);opacity:.38}.start-hint{text-align:center;color:#a89dac}.host-loading,.host-error{min-height:55vh;display:flex;justify-content:center;align-items:center;gap:16px}.host-error button{padding:12px}.spin{animation:spin 1s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.public-table{position:relative;max-width:1500px;height:calc(100dvh - 150px);min-height:600px;margin:12px auto 0;border:2px solid rgba(199,156,62,.35);border-radius:45%;background:radial-gradient(ellipse,#251837 0,#110e16 55%,#080609 100%);box-shadow:inset 0 0 80px #000,0 0 45px rgba(97,45,143,.25)}.direction{position:absolute;left:50%;top:5%;translate:-50%;display:flex;gap:10px;color:#bda66d;align-items:center}.direction.reverse svg{transform:scaleX(-1)}.table-roster{position:absolute;inset:11% 5%;display:flex;flex-wrap:wrap;justify-content:space-between;align-content:space-between;gap:45%;pointer-events:none}.table-roster li{position:relative;min-width:180px;padding:14px 18px;background:#0c0910;border:1px solid #4c3e57;display:flex;gap:16px;align-items:center}.table-roster li.active{border-color:#4effbd;box-shadow:0 0 28px rgba(34,255,177,.4)}.table-roster li.eliminated{opacity:.35}.player-name{font-weight:900}.card-count{display:flex;gap:5px;color:#d9bd72}.turn-label{position:absolute;top:-20px;left:0;font-size:11px;color:#63ffc1;letter-spacing:.15em}.table-center{position:absolute;inset:50% auto auto 50%;translate:-50% -50%;display:flex;gap:45px;align-items:center}.deck-stack{position:relative}.deck-stack>span{position:absolute;right:-10px;top:-10px;background:#c49b40;color:#0b0810;padding:7px;border-radius:50%;font-weight:900}.discard-glow{filter:drop-shadow(0 0 25px rgba(171,83,255,.38))}.draw-stack{font-size:52px;color:#ffcf55;font-weight:900}.victory-overlay{position:absolute;inset:0;display:grid;place-content:center;text-align:center;background:rgba(5,4,7,.86);z-index:3}.victory-overlay svg{margin:auto;color:#e4bd5c}.victory-overlay p{letter-spacing:.3em;color:#bea25e}.victory-overlay h2{font-size:clamp(45px,8vw,100px);margin:0}.victory-overlay button{margin-top:24px}@media(max-width:720px){.couch-header{align-items:flex-start}.join-panel{flex-direction:column;text-align:center}.privacy-note{justify-content:center}.host-roster li{grid-template-columns:38px 1fr auto}.kick{display:none}.ready{font-size:0}.public-table{border-radius:24px}.table-roster{inset:12% 3%;gap:55%}.table-center{scale:.7;transform-origin:center}.room-code{padding:10px}.room-code strong{font-size:24px}}
.host-intro{min-height:68vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;position:relative}.intro-sigil{width:126px;height:126px;border:1px solid #a47b38;border-radius:50%;display:grid;place-items:center;color:#c99aff;box-shadow:0 0 55px rgba(161,81,255,.25),inset 0 0 30px rgba(199,156,62,.12)}.host-intro p{margin:24px 0 5px;color:#d0aa52;letter-spacing:.24em;font-weight:900}.host-intro h2{font-family:var(--font-display);font-size:clamp(30px,4vw,55px);margin:10px 0 24px}.host-intro button{display:flex;gap:12px;align-items:center;min-height:66px;padding:0 34px;background:linear-gradient(135deg,#d6b15a,#79551c);border:1px solid #f3d781;color:#0d0910;font-weight:1000;letter-spacing:.12em}.host-intro span{margin-top:18px;color:#95899e}
.host-tools{position:relative;display:grid;grid-template-columns:auto auto;gap:8px;justify-items:end}.host-connection{grid-column:1/-1;display:flex;align-items:center;gap:7px;color:#ff9aa5;font-size:11px;font-weight:900;letter-spacing:.08em}.host-connection.online{color:#68e5ba}.host-menu-toggle{min-height:44px;padding:0 13px;display:flex;align-items:center;gap:8px;border:1px solid #66506f;background:#17101f;color:#e0d3e4;font-size:12px;font-weight:900}.host-menu{position:absolute;z-index:20;right:0;top:calc(100% + 10px);width:260px;padding:14px;background:#0c0911;border:1px solid #9b7940;box-shadow:0 18px 50px #000;display:grid;gap:8px}.host-menu>strong{color:#d5b65f;letter-spacing:.12em}.host-menu button{min-height:46px;padding:0 12px;display:flex;align-items:center;gap:9px;border:1px solid #5e4969;background:#20162a;color:#eee3f2;font-weight:800;text-align:left}.host-menu button.danger{border-color:#884251;color:#ffb1ba}.host-menu button:disabled,.finish-actions button:disabled{opacity:.38}.host-menu small{color:#b09eaf}.table-roster li{display:grid;grid-template-columns:minmax(0,1fr) auto}.player-connection{grid-column:1/-1;color:#ff929d;font-size:10px;font-weight:900;letter-spacing:.08em}.player-connection.online{color:#62efb7}.finish-roster{list-style:none;margin:20px auto 0;padding:0;width:min(620px,80vw);display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:7px}.finish-roster li{display:grid;grid-template-columns:1fr auto;gap:4px 12px;padding:9px 12px;background:#100c16;border:1px solid #4b3a55;text-align:left}.finish-roster li span{font-weight:900}.finish-roster li b{color:#d8bd73}.finish-roster li small{grid-column:1/-1;color:#90d9bc}.finish-actions{display:flex;justify-content:center;gap:10px}.finish-actions .secondary{background:#1c1424;color:#e8ddee;border-color:#6a5375}
.phase-lobby{padding-block:24px}.phase-lobby .join-panel{margin:2vh auto 16px;padding:22px 28px}.phase-lobby .qr-frame{width:clamp(180px,18vw,250px)}.phase-lobby .roster-panel{padding:18px 28px}.phase-lobby .host-roster{margin-block:8px}.phase-lobby .host-roster li{padding-block:9px}.phase-lobby .start-button{margin-top:14px}.phase-lobby .start-hint{margin-bottom:0}
@media(max-width:720px){.host-tools{grid-template-columns:1fr}.host-connection{grid-column:1}.host-menu-toggle{font-size:0}.host-menu{position:fixed;top:90px;right:12px;left:12px;width:auto}.finish-roster{grid-template-columns:1fr}.finish-actions{flex-direction:column}}
@media(prefers-reduced-motion:reduce){.spin{animation:none}}
</style>
