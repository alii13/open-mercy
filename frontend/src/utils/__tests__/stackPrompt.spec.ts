import { describe, it, expect } from 'vitest'
import { stackPrompt } from '../stackPrompt'
import type { Card } from '../../types/card'

let nextId = 0
function card(color: Card['color'], type: Card['type'], value?: number): Card {
  return { id: `c${nextId++}`, color, type, value }
}

const fours = (n: number) => Array.from({ length: n }, () => card('blue', 'number', 4))
const topDraw4 = card('wild', 'draw4')

describe('stackPrompt', () => {
  it('names both ways out when the player holds a card that stacks', () => {
    expect(stackPrompt([card('red', 'draw4'), ...fours(4)], topDraw4, 'red', 4, 'official'))
      .toBe('STACK A DRAW CARD OR DRAW 4')
  })

  it('says taking the stack ends the game when it would reach 25', () => {
    expect(stackPrompt([card('red', 'draw4'), ...fours(20)], topDraw4, 'red', 4, 'official'))
      .toBe("STACK A DRAW CARD OR YOU'RE OUT")
  })

  it('does not offer a smaller draw card that official rules refuse', () => {
    expect(stackPrompt([card('red', 'draw2'), ...fours(4)], topDraw4, 'red', 4, 'official'))
      .toBe('NOTHING TO STACK. DRAW 4')
  })

  it('warns when the only way out puts the player out', () => {
    expect(stackPrompt(fours(21), topDraw4, 'red', 4, 'official'))
      .toBe("NOTHING TO STACK. YOU'RE OUT")
  })
})
