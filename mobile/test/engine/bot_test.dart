// Port of shared/engine/__tests__/bot.test.ts.

import 'package:app/engine/bot.dart';
import 'package:app/engine/types.dart';
import 'package:flutter_test/flutter_test.dart';

Card card(String id, {CardColor color = CardColor.red, CardType type = CardType.number, int? value = 5}) =>
    Card(id: id, color: color, type: type, value: type == CardType.number ? value : null);

Player player(String id, int hand, {bool isEliminated = false}) => Player(
      id: id,
      name: id,
      hand: List.generate(hand, (i) => card('$id-$i')),
      isEliminated: isEliminated,
    );

/// Deterministic rng returning a fixed value, for testing a single branch.
Rng fixed(double v) => () => v;

BotProfile profile({
  double aggression = 0.5,
  double wildDiscipline = 0.5,
  double catchRate = 0.5,
  double targeting = 0.5,
}) =>
    BotProfile(
      id: 't',
      name: 'T',
      aggression: aggression,
      wildDiscipline: wildDiscipline,
      catchRate: catchRate,
      targeting: targeting,
    );

BotContext ctx(List<Card> playable, [int drawStack = 0]) => BotContext(playable: playable, drawStack: drawStack);

void main() {
  group('botLadder', () {
    test('has eight rungs with unique ids and names', () {
      expect(botLadder.length, 8);
      expect(botLadder.map((b) => b.id).toSet().length, 8);
      expect(botLadder.map((b) => b.name).toSet().length, 8);
    });

    test('keeps every dial in range', () {
      for (final b in botLadder) {
        for (final v in [b.aggression, b.wildDiscipline, b.catchRate, b.targeting]) {
          expect(v, inInclusiveRange(0, 1));
        }
      }
    });

    test('gets harder to catch out as the ladder climbs', () {
      final rates = botLadder.map((b) => b.catchRate).toList();
      expect([...rates]..sort(), rates);
    });

    test('matches the web ladder ids in order', () {
      expect(botLadder.map((b) => b.id), ['scrap', 'pilot', 'vera', 'rook', 'marla', 'kobra', 'zenith', 'terminator']);
    });
  });

  group('the daily bot', () {
    test('is pinned by id, not by ladder position', () {
      expect(dailyBot().id, dailyBotId);
      expect(botLadder.any((b) => b.id == dailyBotId), true);
    });

    test('falls back to a real profile for an unknown id', () {
      expect(botById('nope'), same(botLadder.first));
    });
  });

  group('chooseCard', () {
    test('draws when nothing is playable', () {
      expect(chooseCard(ctx([]), profile(), fixed(0.5)), isNull);
    });

    final two = card('d2', type: CardType.draw2);
    final ten = card('d10', color: CardColor.wild, type: CardType.draw10);

    test('escalates a live stack with its biggest draw when aggressive', () {
      expect(chooseCard(ctx([two, ten], 2), profile(aggression: 1), fixed(0.1)), same(ten));
    });

    test('passes a stack on with its smallest draw when passive', () {
      expect(chooseCard(ctx([two, ten], 2), profile(aggression: 0), fixed(0.9)), same(two));
    });

    final wild = card('w', color: CardColor.wild, type: CardType.wild);
    final num = card('n', value: 3);
    final skip = card('s', type: CardType.skip);

    test('holds a wild while a coloured card exists when disciplined', () {
      expect(chooseCard(ctx([wild, num]), profile(wildDiscipline: 1, aggression: 0), fixed(0)), same(num));
    });

    test('spends a wild when it is the only legal card, discipline regardless', () {
      expect(chooseCard(ctx([wild]), profile(wildDiscipline: 1), fixed(0)), same(wild));
    });

    test('prefers a special over a number when aggressive', () {
      expect(chooseCard(ctx([skip, num]), profile(aggression: 1, wildDiscipline: 0), fixed(0)), same(skip));
    });

    test('sheds a number over a special when passive', () {
      expect(chooseCard(ctx([skip, num]), profile(aggression: 0, wildDiscipline: 0), fixed(0.99)), same(num));
    });

    test('always returns a card from the playable set', () {
      final hand = [skip, wild, card('c', value: 1)];
      for (final p in botLadder) {
        for (var i = 0; i < 40; i++) {
          expect(hand, contains(chooseCard(ctx(hand), p, () => i / 40)));
        }
      }
    });
  });

  group('chooseSwapTarget', () {
    final opponents = [player('big', 9), player('small', 1), player('mid', 4)];

    test('aims at whoever is closest to winning when targeting', () {
      expect(chooseSwapTarget(BotContext(opponents: opponents), profile(targeting: 1), fixed(0))?.id, 'small');
    });

    test('ignores eliminated players', () {
      final withDead = [player('dead', 0, isEliminated: true), player('live', 5)];
      expect(chooseSwapTarget(BotContext(opponents: withDead), profile(targeting: 1), fixed(0))?.id, 'live');
    });

    test('returns null when there is nobody left to hit', () {
      expect(chooseSwapTarget(const BotContext(), profile(), fixed(0)), isNull);
    });
  });

  group('chooseWildColor', () {
    test('picks the colour it holds most of when targeting', () {
      final hand = [card('a', color: CardColor.blue), card('b', color: CardColor.blue), card('c')];
      expect(chooseWildColor(hand, profile(targeting: 1), fixed(0)), CardColor.blue);
    });

    test('still returns a real colour from an empty hand', () {
      expect(pickableColors, contains(chooseWildColor([], profile(), fixed(0))));
    });

    test('never returns wild', () {
      final hand = [card('w', color: CardColor.wild)];
      for (var i = 0; i < 20; i++) {
        expect(chooseWildColor(hand, profile(), () => i / 20), isNot(CardColor.wild));
      }
    });
  });

  test('willCatchMercy tracks the profile rate', () {
    expect(willCatchMercy(profile(catchRate: 0), fixed(0.5)), false);
    expect(willCatchMercy(profile(catchRate: 1), fixed(0.5)), true);
  });

  test('gives the identical sequence for the same seed and profile', () {
    final hand = [
      card('a', type: CardType.skip),
      card('b', color: CardColor.wild, type: CardType.wild),
      card('c', value: 1),
      card('d', type: CardType.draw2),
    ];
    List<String?> run() {
      var n = 0;
      double rng() {
        n = (n * 9301 + 49297) % 233280;
        return n / 233280;
      }

      return List.generate(30, (_) => chooseCard(BotContext(playable: hand), dailyBot(), rng)?.id);
    }

    expect(run(), run());
  });
}
