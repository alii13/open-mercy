<template>
  <main class="config-error" role="alert" aria-labelledby="config-error-title">
    <section class="config-error__card">
      <div class="config-error__sigil" aria-hidden="true">
        <AlertTriangle :size="30" :stroke-width="1.7" />
      </div>

      <p class="config-error__eyebrow">LOCAL START INCOMPLETE</p>
      <h1 id="config-error-title">RUNE RIOT needs configuration</h1>
      <p class="config-error__lead">
        The game could not start because its public Supabase client settings are missing or invalid.
        No secret key is required.
      </p>

      <ul v-if="issues.length" class="config-error__issues">
        <li v-for="issue in issues" :key="issue">{{ issue }}</li>
      </ul>

      <div class="config-error__steps">
        <Terminal :size="19" :stroke-width="1.8" aria-hidden="true" />
        <div>
          <strong>Windows quick start</strong>
          <p>Close this server, then run <code>Start-Rune-Riot.bat</code> from the repository root.</p>
        </div>
      </div>

      <p class="config-error__manual">
        Manual setup: create <code>frontend/.env.local</code> with real
        <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code> values, then restart Vite.
      </p>

      <button type="button" class="config-error__reload" @click="reload">
        <RefreshCw :size="18" :stroke-width="1.8" aria-hidden="true" />
        RETRY AFTER SETUP
      </button>
    </section>
  </main>
</template>

<script setup lang="ts">
import { AlertTriangle, RefreshCw, Terminal } from 'lucide-vue-next'

defineProps<{
  issues: string[]
}>()

function reload() {
  window.location.reload()
}
</script>

<style scoped>
.config-error {
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding: var(--spacing-4);
  background:
    radial-gradient(circle at 50% 20%, rgba(123, 74, 226, 0.2), transparent 38%),
    var(--bg-concrete);
}

.config-error__card {
  width: min(100%, 620px);
  padding: var(--spacing-8);
  border: 1px solid rgba(216, 181, 101, 0.35);
  border-radius: var(--radius-lg);
  background: linear-gradient(180deg, rgba(35, 24, 49, 0.96), rgba(10, 7, 15, 0.98));
  box-shadow: var(--shadow-lg), inset 0 1px rgba(255, 239, 184, 0.06);
}

.config-error__sigil {
  width: 52px;
  height: 52px;
  display: grid;
  place-items: center;
  margin-bottom: var(--spacing-4);
  color: var(--color-hazard);
  border: 1px solid rgba(216, 181, 101, 0.45);
  border-radius: 50%;
  background: rgba(216, 181, 101, 0.08);
}

.config-error__eyebrow {
  margin: 0 0 var(--spacing-2);
  color: var(--color-neon-magenta);
  font-size: var(--text-xs);
  font-weight: 700;
  letter-spacing: 0.2em;
}

h1 {
  margin: 0 0 var(--spacing-3);
  color: var(--color-hazard);
  font-family: var(--font-display);
  font-size: clamp(1.8rem, 6vw, 2.7rem);
  line-height: 1.1;
}

.config-error__lead,
.config-error__manual {
  color: var(--text-secondary);
  line-height: 1.65;
}

.config-error__issues {
  margin: var(--spacing-4) 0;
  padding: var(--spacing-3) var(--spacing-4) var(--spacing-3) var(--spacing-8);
  color: #f0a89d;
  border: 1px solid rgba(217, 85, 69, 0.35);
  border-radius: var(--radius-md);
  background: rgba(217, 85, 69, 0.07);
}

.config-error__steps {
  display: flex;
  gap: var(--spacing-3);
  margin: var(--spacing-4) 0;
  padding: var(--spacing-4);
  color: var(--color-neon-green);
  border: 1px solid rgba(81, 200, 137, 0.28);
  border-radius: var(--radius-md);
  background: rgba(81, 200, 137, 0.06);
}

.config-error__steps p {
  margin: var(--spacing-1) 0 0;
  color: var(--text-secondary);
}

code {
  color: var(--text-primary);
  font-family: var(--font-mono);
}

.config-error__reload {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--spacing-2);
  width: 100%;
  min-height: 48px;
  margin-top: var(--spacing-6);
  color: #100b15;
  border: 1px solid #f0d78f;
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, #e6cb80, #b68a3e);
  font-family: var(--font-display);
  font-weight: 700;
  letter-spacing: 0.1em;
  cursor: pointer;
}

@media (max-width: 520px) {
  .config-error__card { padding: var(--spacing-6) var(--spacing-4); }
}
</style>
