/**
 * The home page's questions, in the order they are shown.
 *
 * One list, three readers: LandingFAQ.vue renders it, and the build writes it
 * into index.html twice (vite.config.ts) - as the FAQPage JSON-LD and as plain
 * HTML for crawlers that do not run JavaScript. Structured data must match the
 * visible answers exactly, so the answers stay plain text.
 *
 * `webOnly` questions are left out of the store apps, where naming another
 * company's game or the other phone platform gets a build rejected.
 */
export const LANDING_FAQS: readonly { q: string; a: string; webOnly?: true }[] = [
  {
    webOnly: true,
    q: 'Can I play UNO No Mercy online for free?',
    a: 'Yes. Open Mercy plays by the UNO No Mercy rules and is free in your browser, with friends or against the computer. It is an independent game, not the official UNO app.',
  },
  {
    q: 'Can I play Open Mercy online?',
    a: 'Yes. Open Mercy runs directly in your web browser at open-mercy.com. There is nothing to install - open the page and play.',
  },
  {
    q: 'Is the game free?',
    a: 'Yes, it is completely free to play. No purchase is required to play a full game.',
  },
  {
    q: 'Do I need to download anything?',
    a: 'No. It is a browser game that works on any modern desktop or mobile browser. No app or download is needed.',
  },
  {
    q: 'Do I need an account?',
    a: 'No account is required to play. You can jump in as a guest. Creating a free account is optional and only used to save your stats.',
  },
  {
    q: 'Can I play with friends?',
    a: 'Yes. Create a multiplayer room, share the room code or invite link, and your friends join the same game in real time.',
  },
  {
    q: 'Can I play against AI?',
    a: "Yes. Choose Play vs bot to face one computer opponent whenever you don't have other players. There are eight bots on a ladder, and beating one unlocks the next.",
  },
  {
    q: 'How many players are supported?',
    a: 'Each game supports 2 to 20 players.',
  },
  {
    q: 'Does the game work on mobile?',
    a: 'Yes. It works on iPhone, Android, and desktop browsers, with a layout built for touch screens.',
  },
  {
    webOnly: true,
    q: 'Is there an iPhone app?',
    a: 'Yes. Open Mercy is a free app on the App Store, with the same rooms, bots and daily deal as the website. On Android it runs in the browser.',
  },
  {
    q: 'Does the game include Draw 6 and Draw 10?',
    a: 'Yes. Both Draw 6 and Draw 10 cards are included, along with the other brutal action cards.',
  },
  {
    q: 'Is stacking supported?',
    a: 'Yes. Draw cards stack onto each other, so a Draw 2 can build into a much larger penalty before someone finally picks up.',
  },
  {
    q: 'What is the 25-card Mercy Rule?',
    a: 'If a player\'s hand ever reaches 25 or more cards, that player is eliminated from the game. It is the "no mercy" twist that ends runaway hands.',
  },
  {
    q: 'Is Open Mercy an official UNO or Mattel game?',
    a: "No. Open Mercy is an independent game. Its ruleset was popularized by Mattel's UNO Show 'Em No Mercy® card game, but this project is not affiliated with, endorsed by, or associated with Mattel or the official UNO brand.",
  },
]
