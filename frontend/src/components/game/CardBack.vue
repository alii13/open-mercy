<template>
  <div
    class="card-back"
    :style="{
      width: `${size.width}px`,
      height: `${size.height}px`,
      '--card-back-accent': accent,
      '--card-back-stripe': stripe,
    }"
    role="img"
    aria-label="RUNE RIOT card back"
  >
    <svg viewBox="0 0 250 350" xmlns="http://www.w3.org/2000/svg" class="card-back-svg" aria-hidden="true">
      <defs>
        <radialGradient id="obsidianCore" cx="50%" cy="42%" r="72%">
          <stop offset="0%" stop-color="#2d1745" />
          <stop offset="52%" stop-color="#130d1c" />
          <stop offset="100%" stop-color="#07060a" />
        </radialGradient>
        <linearGradient id="oldGold" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f0d78f" />
          <stop offset="45%" stop-color="#9a7334" />
          <stop offset="100%" stop-color="#e8c46c" />
        </linearGradient>
        <filter id="runeGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation="5" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>

      <rect x="2" y="2" width="246" height="346" rx="18" fill="#07060a" stroke="#342742" stroke-width="4" />
      <rect x="10" y="10" width="230" height="330" rx="13" fill="url(#obsidianCore)" stroke="url(#oldGold)" stroke-width="2" />
      <path d="M26 48 48 26h154l22 22v254l-22 22H48l-22-22Z" fill="none" stroke="url(#oldGold)" stroke-width="2" opacity=".78" />
      <path d="M39 59 59 39h132l20 20v232l-20 20H59l-20-20Z" fill="none" stroke="var(--card-back-accent, #8d63d1)" stroke-width="1.5" opacity=".55" />

      <g opacity=".28" stroke="var(--card-back-stripe, #55c889)" fill="none" stroke-width="2">
        <path d="M38 82h28l12-20 12 40 14-28 13 18" />
        <path d="M212 268h-28l-12 20-12-40-14 28-13-18" />
        <path d="M46 122c24 17 27 42 8 64 22 15 24 41 4 62" />
        <path d="M204 102c-24 17-27 42-8 64-22 15-24 41-4 62" />
      </g>

      <g transform="translate(125 171)" filter="url(#runeGlow)">
        <circle r="77" fill="#09070d" stroke="url(#oldGold)" stroke-width="3" />
        <circle r="63" fill="none" stroke="var(--card-back-accent, #8d63d1)" stroke-width="2" stroke-dasharray="3 8" />
        <path d="M0-56 17-25 52-17 25 7 32 44 0 27-32 44-25 7-52-17-17-25Z" fill="none" stroke="url(#oldGold)" stroke-width="3" stroke-linejoin="round" />
        <path d="M0-36 10-11 37 0 10 11 0 36-10 11-37 0-10-11Z" fill="var(--card-back-accent, #8d63d1)" fill-opacity=".2" stroke="var(--card-back-accent, #8d63d1)" stroke-width="2" />
        <circle r="9" fill="#07150f" stroke="var(--card-back-stripe, #55c889)" stroke-width="3" />
      </g>

      <text x="125" y="278" text-anchor="middle" fill="#ead492" font-family="Georgia, serif" font-size="25" font-weight="700" letter-spacing="4">RUNE</text>
      <text x="125" y="305" text-anchor="middle" fill="var(--card-back-accent, #a77ae4)" font-family="Georgia, serif" font-size="19" font-weight="700" letter-spacing="7">RIOT</text>
    </svg>
    <div class="stone-grain" aria-hidden="true"></div>
  </div>
</template>

<script setup lang="ts">
interface Props {
  size?: { width: number; height: number }
  accent?: string
  stripe?: string
}

withDefaults(defineProps<Props>(), {
  size: () => ({ width: 100, height: 140 }),
  accent: undefined,
  stripe: undefined,
})
</script>

<style scoped>
.card-back {
  display: inline-block;
  position: relative;
  overflow: hidden;
  border-radius: 6%;
  background: #07060a;
  box-shadow:
    0 12px 25px rgba(0, 0, 0, 0.62),
    0 0 18px color-mix(in srgb, var(--card-back-accent, #8d63d1) 35%, transparent),
    inset 0 0 0 1px rgba(241, 211, 135, 0.18);
}
.card-back-svg { display: block; width: 100%; height: 100%; }
.stone-grain {
  position: absolute;
  inset: 0;
  pointer-events: none;
  opacity: 0.34;
  background:
    repeating-linear-gradient(118deg, transparent 0 9px, rgba(255,255,255,.025) 10px, transparent 11px 24px),
    radial-gradient(circle at 22% 31%, rgba(255,255,255,.05) 0 1px, transparent 1.5px),
    radial-gradient(circle at 73% 68%, rgba(0,0,0,.28) 0 1px, transparent 1.5px);
  background-size: auto, 17px 19px, 23px 21px;
}
</style>
