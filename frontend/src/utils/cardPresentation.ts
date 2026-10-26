import type { Card, CardColor, CardType } from '../types/card'
import { getDrawValue } from './gameRules'

export interface CardPresentation {
  name: string
  shortName: string
  effect: string
}

export const CARD_FAMILIES: Record<CardColor, string> = {
  red: 'Flammenrunen',
  blue: 'Frostsiegel',
  green: 'Waldzeichen',
  yellow: 'Sturmglyphen',
  wild: 'Arkane Relikte',
}

export const CARD_TYPE_PRESENTATIONS: Record<CardType, CardPresentation> = {
  number: {
    name: 'Runenzahl',
    shortName: 'Rune',
    effect: 'Kann auf dieselbe aktive Familie oder dieselbe Zahl gelegt werden.',
  },
  skip: {
    name: 'Sperrsiegel',
    shortName: 'Sperre',
    effect: 'Der nächste Spieler wird übersprungen.',
  },
  reverse: {
    name: 'Schicksalswende',
    shortName: 'Wende',
    effect: 'Kehrt die Spielrichtung um. Zu zweit bist du danach erneut am Zug.',
  },
  draw2: {
    name: 'Runenzug +2',
    shortName: 'Zug +2',
    effect: 'Erhöht den Ziehstapel um 2 Karten.',
  },
  skipEveryone: {
    name: 'Zeitbann',
    shortName: 'Zeitbann',
    effect: 'Alle anderen werden übersprungen; du bist erneut am Zug.',
  },
  discardAll: {
    name: 'Runenflut',
    shortName: 'Flut',
    effect: 'Legt alle übrigen Karten derselben Familie ab; die gewählte oberste Karte löst ihren Effekt aus.',
  },
  wild: {
    name: 'Farbwahl',
    shortName: 'Farbwahl',
    effect: 'Du bestimmst die neue aktive Kartenfamilie.',
  },
  draw4: {
    name: 'Runenbruch +4',
    shortName: 'Zug +4',
    effect: 'Erhöht den Ziehstapel um 4 Karten.',
  },
  draw6: {
    name: 'Arkaner Zug +6',
    shortName: 'Zug +6',
    effect: 'Wählt eine neue Familie und erhöht den Ziehstapel um 6 Karten.',
  },
  draw10: {
    name: 'Arkaner Zug +10',
    shortName: 'Zug +10',
    effect: 'Wählt eine neue Familie und erhöht den Ziehstapel um 10 Karten.',
  },
  wildReverseDraw4: {
    name: 'Schicksalsbruch +4',
    shortName: 'Wende +4',
    effect: 'Wählt eine neue Familie, kehrt die Spielrichtung um und erhöht den Ziehstapel um 4 Karten.',
  },
  wildColorRoulette: {
    name: 'Chaos-Roulette',
    shortName: 'Chaos',
    effect: 'Der nächste Spieler wählt eine Familie und zieht, bis eine Karte dieser Familie erscheint.',
  },
}

export function cardPresentation(card: Card): CardPresentation {
  if (card.type !== 'number') return CARD_TYPE_PRESENTATIONS[card.type]
  if (card.value === 0) {
    return {
      name: 'Runenzahl 0',
      shortName: CARD_FAMILIES[card.color],
      effect: 'Rotiert alle aktiven Kartenhände in Spielrichtung, sofern die Karte nicht die eigene Hand leert.',
    }
  }
  if (card.value === 7) {
    return {
      name: 'Runenzahl 7',
      shortName: CARD_FAMILIES[card.color],
      effect: 'Du darfst deine Kartenhand mit einem aktiven Spieler tauschen.',
    }
  }
  return {
    ...CARD_TYPE_PRESENTATIONS.number,
    name: `Runenzahl ${card.value ?? ''}`.trim(),
    shortName: CARD_FAMILIES[card.color],
  }
}

export function cardFamily(card: Card): string {
  return CARD_FAMILIES[card.color]
}

export interface PlayabilityExplanationInput {
  card: Card
  playable: boolean
  isMyTurn: boolean
  drawStack: number
  currentColor: CardColor
  topCard: Card | null
}

/** Explains an already-authoritative playability result; it never decides a move. */
export function playabilityExplanation(input: PlayabilityExplanationInput): string {
  if (!input.isMyTurn) return 'Nicht spielbar: Du bist gerade nicht am Zug.'
  if (input.playable) {
    if (input.drawStack > 0) return `Spielbar: Diese Ziehkarte darf den aktiven Ziehstapel von ${input.drawStack} Karten erhöhen.`
    if (input.card.color === 'wild') return 'Spielbar: Arkane Karten dürfen unabhängig von der aktiven Familie gelegt werden.'
    if (input.card.color === input.currentColor) return 'Spielbar: Die Karte gehört zur aktiven Familie.'
    if (input.card.type === 'number' && input.topCard?.type === 'number' && input.card.value === input.topCard.value) {
      return 'Spielbar: Die Zahl stimmt mit der Tischkarte überein.'
    }
    return 'Spielbar: Das Kartensymbol stimmt mit der Tischkarte überein.'
  }
  if (input.drawStack > 0) {
    if (getDrawValue(input.card) === 0) return `Nicht spielbar: Auf den Ziehstapel von ${input.drawStack} darf nur eine erlaubte Ziehkarte folgen.`
    return 'Nicht spielbar: Diese Ziehkarte erfüllt die aktuelle Stapelregel nicht.'
  }
  return 'Nicht spielbar: Familie, Zahl und Symbol stimmen nicht mit der Tischkarte überein.'
}
