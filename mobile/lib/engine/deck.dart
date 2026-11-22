// Dart port of shared/engine/deck.ts.

import 'types.dart';

int _idCounter = 0;

Card _createCard(CardColor color, CardType type, [int? value]) =>
    Card(id: 'card-${_idCounter++}', color: color, type: type, value: value);

/// The full 168-card No Mercy deck.
List<Card> generateFullDeck() {
  _idCounter = 0;
  final deck = <Card>[];

  for (final color in pickableColors) {
    // Number cards: 0 (1 of each), 1-9 (2 of each)
    deck.add(_createCard(color, CardType.number, 0));
    for (var i = 1; i <= 9; i++) {
      deck.add(_createCard(color, CardType.number, i));
      deck.add(_createCard(color, CardType.number, i));
    }

    // Action cards: 3 of each per color
    for (var i = 0; i < 3; i++) {
      deck.add(_createCard(color, CardType.skip));
      deck.add(_createCard(color, CardType.reverse));
      deck.add(_createCard(color, CardType.draw2));
      deck.add(_createCard(color, CardType.draw4));
      deck.add(_createCard(color, CardType.skipEveryone));
      deck.add(_createCard(color, CardType.discardAll));
    }
  }

  // Plain wilds (choose color, no penalty)
  for (var i = 0; i < 4; i++) {
    deck.add(_createCard(CardColor.wild, CardType.wild));
  }
  // Special wilds: 4 of each type
  for (var i = 0; i < 4; i++) {
    deck.add(_createCard(CardColor.wild, CardType.wildReverseDraw4));
    deck.add(_createCard(CardColor.wild, CardType.draw6));
    deck.add(_createCard(CardColor.wild, CardType.draw10));
    deck.add(_createCard(CardColor.wild, CardType.wildColorRoulette));
  }

  return deck;
}

/// Fisher-Yates, consuming [rng] in the same order as the TS engine so a
/// seeded daily deals identically on web and mobile.
List<Card> shuffleDeck(List<Card> deck, [Rng rng = defaultRng]) {
  final out = [...deck];
  for (var i = out.length - 1; i > 0; i--) {
    final j = (rng() * (i + 1)).floor();
    final temp = out[i];
    out[i] = out[j];
    out[j] = temp;
  }
  return out;
}

Map<String, int> getDeckBreakdown(List<Card> deck) {
  final breakdown = <String, int>{};
  for (final card in deck) {
    final key = card.type == CardType.number
        ? '${card.type.name}-${card.value}'
        : '${card.type.name}-${card.color.name}';
    breakdown[key] = (breakdown[key] ?? 0) + 1;
  }
  return breakdown;
}
