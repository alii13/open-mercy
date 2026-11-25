import type { Card, CardColor } from '../types/card'
import { canPlayCard, type StackingMode } from './gameRules'
import { checkMercyRule } from './gameHelpers'

/**
 * What a player with a draw stack on them can do, in one line. A first-timer
 * sees "+30" land and the table go red with no idea what to do, so this names
 * both ways out and says when taking the stack ends the game. The stack's size
 * is already on screen, which keeps the line short enough for a 320px phone.
 */
export function stackPrompt(
  hand: readonly Card[],
  top: Card,
  color: CardColor,
  stack: number,
  mode: StackingMode,
): string {
  const canStack = hand.some(c => canPlayCard(c, top, color, stack, mode))
  const fatal = checkMercyRule(hand.length + stack)
  if (canStack) return fatal ? "STACK A DRAW CARD OR YOU'RE OUT" : `STACK A DRAW CARD OR DRAW ${stack}`
  return fatal ? "NOTHING TO STACK. YOU'RE OUT" : `NOTHING TO STACK. DRAW ${stack}`
}
