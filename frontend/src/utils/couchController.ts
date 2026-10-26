import type { TurnState } from '../types/card'

export type RealtimeStatus = 'CONNECTING' | 'SUBSCRIBED' | 'CLOSED'

const LAST_COUCH_NAME_KEY = 'rune_riot_couch_name'

export interface CouchStatusInput {
  realtimeStatus: RealtimeStatus
  turnState: TurnState | string | null | undefined
  isMyTurn: boolean
  activePlayerName?: string
  drawStack: number
}

export function couchStatusText(input: CouchStatusInput): string {
  if (input.realtimeStatus === 'CONNECTING') return 'Verbinde erneut …'
  if (input.realtimeStatus === 'CLOSED') return 'Verbindung unterbrochen'
  if (input.isMyTurn) {
    if (input.turnState === 'CHOOSING_DRAWN_WILD_COLOR' || input.turnState === 'CHOOSING_ROULETTE_COLOR') return 'Wähle eine Farbe'
    if (input.turnState === 'CHOOSING_PLAYER_TO_SWAP') return 'Wähle einen Spieler'
    if (input.turnState === 'CHOOSING_DISCARD_ALL_TOP') return 'Wähle die oberste Karte'
    if (input.drawStack > 0) return `Ziehe ${input.drawStack} Karten oder staple`
    return 'Du bist dran!'
  }
  return input.activePlayerName ? `${input.activePlayerName} ist dran` : 'Warte auf andere Spieler'
}

export function drawButtonLabel(drawStack: number): string {
  return drawStack > 0 ? `${drawStack} Karten ziehen` : 'Karte ziehen'
}

export function nextCardSelection(currentId: string | null, cardId: string, playable: boolean): string | null {
  if (!playable) return currentId
  return currentId === cardId ? null : cardId
}

export function showHandScrollHint(cardCount: number): boolean {
  return cardCount >= 10
}

export function savedCouchName(storage: Pick<Storage, 'getItem'>, roomCode: string): string {
  return storage.getItem(`rune_riot_couch_name_${roomCode}`)
    ?? storage.getItem(LAST_COUCH_NAME_KEY)
    ?? ''
}

export function rememberCouchName(storage: Pick<Storage, 'setItem'>, roomCode: string, name: string): void {
  storage.setItem(`rune_riot_couch_name_${roomCode}`, name)
  storage.setItem(LAST_COUCH_NAME_KEY, name)
}
