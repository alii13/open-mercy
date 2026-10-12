// The daily challenge promises the same deal on every device, web included.
// Expected values come from running the TS seededRng and engine shuffle.

import 'package:app/engine/deck.dart';
import 'package:app/engine/seeded_rng.dart';
import 'package:flutter_test/flutter_test.dart';

void main() {
  test('matches the web seededRng sequence', () {
    final rng = seededRng('uno-daily-2026-08-14');
    final got = List.generate(5, (_) => rng());
    const want = [0.35869873291812837, 0.021667470689862967, 0.25042256829328835, 0.7226900029927492, 0.728393784025684];
    for (var i = 0; i < want.length; i++) {
      expect(got[i], closeTo(want[i], 1e-15));
    }
    expect(seededRng('')(), closeTo(0.7234337537083775, 1e-15));
  });

  test('deals the same daily shuffle as the web engine', () {
    final deck = shuffleDeck(generateFullDeck(), seededRng('uno-daily-2026-08-14'));
    // Cards are dealt with pop(), so the tail is what lands first.
    expect(
      deck.sublist(deck.length - 8).map((c) => c.id),
      ['card-147', 'card-34', 'card-37', 'card-164', 'card-119', 'card-41', 'card-3', 'card-60'],
    );
  });

  test('localDateString pads month and day', () {
    expect(localDateString(DateTime(2026, 3, 7)), '2026-03-07');
  });
}
