// Dart port of shared/engine/rules.ts.

import 'deck.dart';
import 'types.dart';

const defaultStackingMode = StackingMode.official;

/// Checks if a card can be played on top of the current top card.
///
/// Stacking modes:
///  - official: any draw card stacks only if its draw value >= the top card's
///  - house:    wild draw cards stack on any draw card; colored draw cards still need equal-or-higher
///  - casual:   any draw card stacks on any draw card
bool canPlayCard(
  Card card,
  Card topCard,
  CardColor currentColor,
  int drawStack, [
  StackingMode stackingMode = defaultStackingMode,
]) {
  // 1. Stacking logic - varies by stacking mode
  if (drawStack > 0) {
    final drawVal = getDrawValue(card);
    if (drawVal <= 0) return false;
    switch (stackingMode) {
      case StackingMode.casual:
        return true;
      case StackingMode.house:
        if (card.isWild) return true;
        return drawVal >= getDrawValue(topCard);
      case StackingMode.official:
        return drawVal >= getDrawValue(topCard);
    }
  }

  // 2. Standard matching
  if (card.isWild) return true;
  if (card.color == currentColor) return true;
  if (card.type == topCard.type) {
    if (card.type == CardType.number) return card.value == topCard.value;
    return true;
  }
  return false;
}

int getDrawValue(Card card) {
  switch (card.type) {
    case CardType.draw2:
      return 2;
    case CardType.draw4:
    case CardType.wildReverseDraw4:
      return 4;
    case CardType.draw6:
      return 6;
    case CardType.draw10:
      return 10;
    default:
      return 0;
  }
}

int calculateNextPlayerIndex(int currentIndex, int direction, int playerCount) {
  var next = currentIndex + direction;
  if (next < 0) next = playerCount - 1;
  if (next >= playerCount) next = 0;
  return next;
}

/// Score for a winning player based on opponents' remaining hands.
int calculateScore(List<List<Card>> hands, List<bool> eliminatedFlags) {
  var total = 0;
  for (var i = 0; i < hands.length; i++) {
    if (eliminatedFlags[i]) {
      // Causing an elimination is worth 250.
      total += 250;
      continue;
    }
    for (final card in hands[i]) {
      if (card.isWild) {
        total += 50;
      } else if (card.type != CardType.number) {
        total += 20;
      } else {
        total += card.value ?? 0;
      }
    }
  }
  return total;
}

/// Reshuffle the discard pile into the deck when the deck is empty. Mutates
/// both lists in place; returns false if there are not enough cards.
bool reshuffleDeck(List<Card> deck, List<Card> discardPile, [Rng rng = defaultRng]) {
  if (discardPile.length <= 1) return false;
  final top = discardPile.removeLast();
  final rest = [...discardPile];
  deck
    ..clear()
    ..addAll(shuffleDeck(rest, rng));
  discardPile
    ..clear()
    ..add(top);
  return true;
}

/// Mercy rule: 25+ cards in hand eliminates.
bool checkMercyRule(int handLength) => handLength >= 25;

/// Count a hand's cards per pickable color (wilds excluded). Used by the
/// color picker to show what each choice keeps playable.
Map<CardColor, int> countByColor(List<Card> hand) {
  final counts = {for (final c in pickableColors) c: 0};
  for (final card in hand) {
    if (!card.isWild) counts[card.color] = counts[card.color]! + 1;
  }
  return counts;
}

/// Rotate hands between players (the 0 card effect).
List<List<Card>> rotateHands(List<List<Card>> hands, int direction) {
  final count = hands.length;
  if (count < 2) return [for (final h in hands) [...h]];
  final rotated = <List<Card>>[];
  for (var i = 0; i < count; i++) {
    var source = i - direction;
    if (source < 0) source = count - 1;
    if (source >= count) source = 0;
    rotated.add([...hands[source]]);
  }
  return rotated;
}
