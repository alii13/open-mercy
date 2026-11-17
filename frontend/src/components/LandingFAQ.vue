<template>
  <section class="faq-section" ref="faqSection">
    <div class="faq-inner">
      <div class="section-label">07</div>
      <h2 class="section-heading" ref="faqHeading">
        YOUR QUESTIONS, <span class="accent-blue">ANSWERED</span>
      </h2>
      <p class="section-desc" ref="faqDesc">
        Everything about playing Open Mercy online, in one place.
      </p>

      <div class="faq-list">
        <details
          v-for="(item, i) in faqs"
          :key="i"
          class="faq-row"
          :ref="(el) => setRow(i, el)"
        >
          <summary class="faq-summary">
            <span class="faq-num">{{ String(i + 1).padStart(2, '0') }}</span>
            <span class="faq-question">{{ item.q }}</span>
            <ChevronDown class="faq-chevron" :stroke-width="2" aria-hidden="true" />
          </summary>
          <div class="faq-answer">{{ item.a }}</div>
        </details>
      </div>

      <!-- Answers stay plain text so they match the FAQPage JSON-LD the build
           writes from the same list; the deep link into the rules guide lives
           here instead of inside an answer. -->
      <p class="faq-more">
        Still deciding a rule mid-game?
        <a href="/rules/" class="faq-more-link">Read the full rules guide</a>
      </p>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ChevronDown } from 'lucide-vue-next'
import { ref, onMounted, onUnmounted } from 'vue'
import gsap from 'gsap'
import type { ScrollTrigger } from 'gsap/ScrollTrigger'
import { onFirstScroll } from '../composables/onFirstScroll'
import { Capacitor } from '@capacitor/core'
import { LANDING_FAQS } from '../data/landingFaqs'

const faqs = Capacitor.isNativePlatform() ? LANDING_FAQS.filter((f) => !f.webOnly) : LANDING_FAQS

const faqSection = ref<HTMLElement>()
const faqHeading = ref<HTMLElement>()
const faqDesc = ref<HTMLElement>()
const rowEls: HTMLElement[] = []
function setRow(i: number, el: unknown) {
  if (el) rowEls[i] = el as HTMLElement
}

let triggers: ScrollTrigger[] = []
let alive = true
let cancelWait = () => {}

onMounted(() => {
  // Below the fold: the reveal animations load on the first scroll.
  cancelWait = onFirstScroll(async () => {
    try {
      gsap.registerPlugin((await import('gsap/ScrollTrigger')).ScrollTrigger)
    } catch (err) {
      // The rows only hide inside initFaq, so they stay visible, unanimated.
      console.warn('landing FAQ: ScrollTrigger failed to load', err)
      return
    }
    if (alive) requestAnimationFrame(() => requestAnimationFrame(initFaq))
  })
})

onUnmounted(() => {
  alive = false
  cancelWait()
  triggers.forEach((t) => t.kill())
  triggers = []
})

function initFaq() {
  if (!faqSection.value) return

  const intro = [faqHeading.value, faqDesc.value].filter(Boolean) as HTMLElement[]
  const rows = rowEls.filter(Boolean)

  // Reduced motion: render the resolved frame, no animation.
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  if (reduce) {
    gsap.set([...intro, ...rows], { opacity: 1, x: 0, y: 0, rotation: 0, scale: 1 })
    return
  }

  gsap.set(intro, { opacity: 0, y: 34 })
  const introTween = gsap.to(intro, {
    opacity: 1,
    y: 0,
    duration: 0.5,
    ease: 'power3.out',
    stagger: 0.1,
    scrollTrigger: { trigger: faqSection.value, start: 'top 75%', toggleActions: 'play none none none' },
  })
  if (introTween.scrollTrigger) triggers.push(introTween.scrollTrigger)

  // Each row deals in from an alternating side as it scrolls into view, then
  // stays put. One shot per row, triggered by the row itself — so the reveal
  // always completes and never depends on scroll room below the section,
  // which sits just above the footer with little runway left.
  rows.forEach((row, i) => {
    gsap.set(row, {
      opacity: 0,
      x: i % 2 === 0 ? -70 : 70,
      y: 40,
      rotation: i % 2 === 0 ? -6 : 6,
      scale: 0.92,
      transformOrigin: '50% 50%',
    })
    const tween = gsap.to(row, {
      opacity: 1,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      duration: 0.55,
      ease: 'power3.out',
      scrollTrigger: { trigger: row, start: 'top 88%', toggleActions: 'play none none none' },
    })
    if (tween.scrollTrigger) triggers.push(tween.scrollTrigger)
  })
}
</script>

<style scoped>
.faq-section {
  position: relative;
  z-index: 5;
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6rem 2rem;
  overflow: hidden;
}

.faq-inner {
  max-width: 760px;
  width: 100%;
  text-align: center;
}

.section-label {
  font-family: var(--font-mono);
  font-size: 0.7rem;
  color: var(--text-muted);
  letter-spacing: 6px;
  margin-bottom: 1.5rem;
}

.section-heading {
  font-family: var(--font-display);
  font-size: 4rem;
  margin: 0 0 1rem;
  color: var(--text-primary);
  line-height: 1;
}

.accent-blue {
  color: var(--color-neon-blue);
  text-shadow: 0 0 32px rgba(0, 243, 255, 0.35);
}

.section-desc {
  color: var(--text-muted);
  font-size: 1.15rem;
  margin: 0 auto 3.5rem;
  max-width: 460px;
  line-height: 1.6;
}

/* ========== FAQ ROWS ========== */
.faq-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  text-align: left;
}

.faq-more {
  color: var(--text-muted);
  font-size: 1rem;
  margin: 2rem 0 0;
  line-height: 1.6;
}

.faq-more-link {
  color: var(--color-neon-blue);
  text-decoration: underline;
  text-underline-offset: 3px;
}

.faq-more-link:hover {
  color: var(--text-primary);
}

.faq-row {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  transition: border-color 0.25s ease, background 0.25s ease, box-shadow 0.25s ease;
  will-change: transform, opacity;
}

.faq-row:hover {
  border-color: rgba(0, 243, 255, 0.28);
  background: rgba(0, 243, 255, 0.03);
}

.faq-row[open] {
  border-color: rgba(0, 243, 255, 0.45);
  background: rgba(0, 243, 255, 0.05);
  box-shadow: 0 0 28px rgba(0, 243, 255, 0.1), inset 0 0 24px rgba(0, 0, 0, 0.4);
}

.faq-summary {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.1rem 1.3rem;
  cursor: pointer;
  list-style: none;
  min-height: 56px;
}

.faq-summary::-webkit-details-marker {
  display: none;
}

.faq-num {
  flex: 0 0 auto;
  font-family: var(--font-mono);
  font-size: 0.72rem;
  letter-spacing: 2px;
  color: var(--text-muted);
  transition: color 0.25s ease, text-shadow 0.25s ease;
}

.faq-row:hover .faq-num,
.faq-row[open] .faq-num {
  color: var(--color-neon-blue);
  text-shadow: 0 0 12px rgba(0, 243, 255, 0.6);
}

.faq-question {
  flex: 1 1 auto;
  font-family: var(--font-body);
  font-weight: 600;
  font-size: 1.02rem;
  line-height: 1.35;
  color: var(--text-primary);
}

.faq-chevron {
  flex: 0 0 auto;
  width: 20px;
  height: 20px;
  color: var(--text-muted);
  transition: transform 0.3s ease, color 0.25s ease;
}

.faq-row[open] .faq-chevron {
  transform: rotate(180deg);
  color: var(--color-neon-blue);
}

.faq-answer {
  margin: 0 1.3rem 1.2rem calc(1.3rem + 0.72rem + 1rem);
  padding-left: 1rem;
  border-left: 2px solid rgba(0, 243, 255, 0.35);
  font-family: var(--font-body);
  font-size: 0.96rem;
  line-height: 1.7;
  color: var(--text-secondary);
}

@media (prefers-reduced-motion: reduce) {
  .faq-row,
  .faq-chevron,
  .faq-num {
    transition: none;
  }
}

/* ========== MOBILE ========== */
@media (max-width: 768px) {
  .faq-section {
    min-height: auto;
    padding: 4rem 1.5rem;
  }
  .section-heading {
    font-size: 2.8rem;
  }
  .section-desc {
    font-size: 1rem;
    margin-bottom: 2.5rem;
  }
  .faq-summary {
    gap: 0.75rem;
    padding: 1rem 1.1rem;
  }
  .faq-question {
    font-size: 0.96rem;
  }
  .faq-answer {
    margin-left: 1.1rem;
    margin-right: 1.1rem;
  }
}

@media (max-width: 480px) {
  .faq-section {
    padding: 3rem 1rem;
  }
  .section-heading {
    font-size: 2rem;
  }
  .faq-num {
    display: none;
  }
  .faq-answer {
    margin-left: 1.1rem;
  }
}
</style>
