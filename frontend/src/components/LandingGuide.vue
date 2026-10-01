<template>
  <!-- Static on purpose: no scroll-in animation, so crawlers and slow phones
       always get the text that explains the game and links into the guides. -->
  <section class="guide-section" aria-labelledby="guide-heading">
    <div class="guide-inner">
      <h2 id="guide-heading" class="guide-heading">
        WHAT IS <span class="accent-yellow">OPEN MERCY?</span>
      </h2>
      <p class="guide-intro">
        Open Mercy is a free card game you play in your browser, built on the No Mercy rules:
        bigger draw cards, stacking, and a hard limit on how many cards you can hold.
      </p>
      <p class="guide-intro">
        It is made for friend groups who want a quick game over a call, but you can also
        practice alone against a ladder of eight bots, or play the daily deal that everyone
        gets the same shuffle for.
      </p>

      <div class="guide-grid">
        <div class="guide-block">
          <h3 class="guide-sub">Ways to play</h3>
          <ul>
            <li><strong>Play vs bot</strong> - one computer opponent, a new one each time you win.</li>
            <li><strong>CREATE GAME</strong> - a private room for up to 20 friends.</li>
            <li><strong>Quick match</strong> - join an open public room with strangers.</li>
            <li><strong>TODAY'S DEAL</strong> - you against the toughest bot, same cards for everyone.</li>
          </ul>
        </div>

        <div class="guide-block">
          <h3 class="guide-sub">What makes it mean</h3>
          <ul>
            <li>Draw cards stack, all the way up to +10.</li>
            <li>Hold 25 cards and you are out.</li>
            <li>A 7 swaps hands, a 0 passes every hand along.</li>
            <li>Color Roulette makes the next player draw until they hit a color.</li>
            <li>Forget to call MERCY! and it can cost you 10 cards.</li>
          </ul>
        </div>

        <div class="guide-block">
          <h3 class="guide-sub">How to start</h3>
          <ol>
            <li>Press PLAY NOW. You get a guest account, no email needed.</li>
            <li>Pick a bot, a private room, or Quick match in the lobby.</li>
            <li>Match the top card by color, number or symbol. Tap the deck if you can't.</li>
          </ol>
        </div>
      </div>

      <nav class="guide-links" aria-label="Guides">
        <a href="/how-to-play/">How to play</a>
        <a href="/rules/">Full rules</a>
        <a href="/rules/cards/">Every card</a>
        <a href="/rules/stacking/">Stacking rules</a>
        <a href="/strategy/">Strategy</a>
        <a href="/faq/">FAQ</a>
        <a href="/about/">About</a>
      </nav>
    </div>
  </section>
</template>

<style scoped>
.guide-section {
  position: relative;
  z-index: 5;
  padding: 6rem 2rem;
}

.guide-inner {
  max-width: 960px;
  margin: 0 auto;
}

.guide-heading {
  font-family: var(--font-display);
  font-size: 3.2rem;
  margin: 0 0 1.5rem;
  color: var(--text-primary);
  line-height: 1;
  text-align: center;
}

.accent-yellow {
  color: var(--color-hazard);
}

.guide-intro {
  color: var(--text-secondary);
  font-size: 1.1rem;
  line-height: 1.7;
  max-width: 640px;
  margin: 0 auto 1rem;
  text-align: center;
}

.guide-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1rem;
  margin-top: 2.5rem;
}

.guide-block {
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 10px;
  background: rgba(0, 0, 0, 0.35);
  padding: 1.25rem 1.3rem;
}

.guide-sub {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 3px;
  text-transform: uppercase;
  color: var(--color-neon-blue);
  margin: 0 0 0.9rem;
}

.guide-block ul,
.guide-block ol {
  margin: 0;
  padding-left: 1.1rem;
  color: var(--text-secondary);
  font-size: 0.95rem;
  line-height: 1.6;
}

.guide-block li + li {
  margin-top: 0.5rem;
}

.guide-block strong {
  color: var(--text-primary);
}

.guide-links {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.6rem;
  margin-top: 2rem;
}

.guide-links a {
  font-family: var(--font-mono);
  font-size: 0.8rem;
  letter-spacing: 1px;
  color: var(--text-primary);
  text-decoration: none;
  border: 1px solid rgba(0, 243, 255, 0.3);
  border-radius: 999px;
  padding: 0.5rem 0.9rem;
  min-height: 44px;
  display: inline-flex;
  align-items: center;
  transition: border-color 0.2s, color 0.2s;
}

.guide-links a:hover {
  border-color: var(--color-neon-blue);
  color: var(--color-neon-blue);
}

@media (max-width: 768px) {
  .guide-section {
    padding: 4rem 1.5rem;
  }
  .guide-heading {
    font-size: 2.4rem;
  }
  .guide-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 480px) {
  .guide-section {
    padding: 3rem 1rem;
  }
  .guide-heading {
    font-size: 1.9rem;
  }
  .guide-intro {
    font-size: 1rem;
  }
}
</style>
