// Port of shared/engine/__tests__/engine.test.ts. The same cases guard both
// engines, so a rules fix that lands in one and not the other shows up here.

import 'package:app/engine/deck.dart';
import 'package:app/engine/engine.dart';
import 'package:app/engine/rules.dart';
import 'package:app/engine/types.dart';
import 'package:flutter_test/flutter_test.dart';

Card card(String id, CardColor color, CardType type, [int? value]) =>
    Card(id: id, color: color, type: type, value: value);

Player player(String id, String name, [List<Card>? hand]) => Player(id: id, name: name, hand: hand, score: 0);

final red5 = card('c-red-5', CardColor.red, CardType.number, 5);

EngineState makeState({
  List<Player>? players,
  List<Card>? deck,
  List<Card>? discardPile,
  int currentPlayerIndex = 0,
  int drawStack = 0,
  TurnState turnState = TurnState.waitingForAction,
  CardColor? rouletteTargetColor,
}) =>
    EngineState(
      players: players,
      deck: deck,
      discardPile: discardPile ?? [red5],
      currentPlayerIndex: currentPlayerIndex,
      drawStack: drawStack,
      currentColor: CardColor.red,
      turnState: turnState,
      gameState: GameState.playing,
      rouletteTargetColor: rouletteTargetColor,
    );

List<String> ids(List<Card> cards) => cards.map((c) => c.id).toList();

void main() {
  group('deck composition', () {
    test('generates the full 168-card No Mercy deck', () {
      final deck = generateFullDeck();
      expect(deck.length, 168);
      final b = getDeckBreakdown(deck);
      expect(b['number-0'], 4);
      expect(b['number-5'], 8);
      expect(b['skipEveryone-red'], 3);
      expect(b['discardAll-blue'], 3);
      expect(b['wild-wild'], 4);
      expect(b['wildColorRoulette-wild'], 4);
    });
  });

  group('canPlayCard stacking', () {
    final topDraw4 = card('t', CardColor.red, CardType.draw4);
    test('official mode requires equal-or-higher draw value', () {
      expect(canPlayCard(card('a', CardColor.blue, CardType.draw2), topDraw4, CardColor.red, 4, StackingMode.official), false);
      expect(canPlayCard(card('b', CardColor.blue, CardType.draw4), topDraw4, CardColor.red, 4, StackingMode.official), true);
      expect(canPlayCard(card('c', CardColor.wild, CardType.draw6), topDraw4, CardColor.red, 4, StackingMode.official), true);
    });
    test('house mode lets wild draws stack on anything', () {
      final topDraw10 = card('t', CardColor.wild, CardType.draw10);
      expect(canPlayCard(card('a', CardColor.wild, CardType.wildReverseDraw4), topDraw10, CardColor.red, 10, StackingMode.house), true);
      expect(canPlayCard(card('b', CardColor.red, CardType.draw4), topDraw10, CardColor.red, 10, StackingMode.house), false);
    });
    test('non-draw cards never answer a stack', () {
      expect(canPlayCard(red5, topDraw4, CardColor.red, 4, StackingMode.casual), false);
    });
  });

  group('playCard', () {
    test('detects a win when wildColorRoulette is played as the last card', () {
      final roulette = card('c-roul', CardColor.wild, CardType.wildColorRoulette);
      final s = makeState(players: [player('p-0', 'You', [roulette]), player('p-1', 'Bot')]);
      final res = playCard(s, 'p-0', 'c-roul');
      expect(res.ok, true);
      expect(s.winnerId, 'p-0');
      expect(s.gameState, GameState.gameOver);
    });

    test('rotates hands only among active players when a 0 is played', () {
      final zero = card('c-zero', CardColor.red, CardType.number, 0);
      final a = card('c-a', CardColor.blue, CardType.number, 1);
      final b = card('c-b', CardColor.green, CardType.number, 2);
      final c = card('c-c', CardColor.yellow, CardType.number, 3);
      final elim = player('p-1', 'Elim')..isEliminated = true;
      final s = makeState(players: [player('p-0', 'You', [zero, a]), elim, player('p-2', 'Bot', [b, c])]);

      playCard(s, 'p-0', 'c-zero');

      expect(s.players[1].hand, isEmpty);
      expect(ids(s.players[0].hand)..sort(), ['c-b', 'c-c']);
      expect(ids(s.players[2].hand), ['c-a']);
    });

    test('applies the top card effect on a single-match Discard All', () {
      final s = makeState(players: [
        player('p-0', 'You', [
          card('c-da', CardColor.red, CardType.discardAll),
          card('c-rr', CardColor.red, CardType.reverse),
          card('c-b3', CardColor.blue, CardType.number, 3),
        ]),
        player('p-1', 'B1'),
        player('p-2', 'B2'),
      ]);

      playCard(s, 'p-0', 'c-da');

      expect(s.direction, -1);
      expect(ids(s.players[0].hand), ['c-b3']);
    });

    test('wins through the picker when a Discard All empties the hand', () {
      final s = makeState(players: [
        player('p-0', 'You', [
          card('c-da', CardColor.red, CardType.discardAll),
          card('c-r3', CardColor.red, CardType.number, 3),
          card('c-r9', CardColor.red, CardType.number, 9),
        ]),
        player('p-1', 'B1'),
      ]);

      playCard(s, 'p-0', 'c-da');
      expect(s.turnState, TurnState.choosingDiscardAllTop);

      selectDiscardAllTop(s, 'c-r3');
      expect(s.winnerId, 'p-0');
      expect(s.gameState, GameState.gameOver);
      expect(s.pendingDiscardAllCards, isEmpty);
    });

    test('advances the turn when a Discard All matches nothing else in hand', () {
      final s = makeState(players: [
        player('p-0', 'You', [card('c-da', CardColor.red, CardType.discardAll), card('c-b3', CardColor.blue, CardType.number, 3)]),
        player('p-1', 'B1'),
      ]);

      final res = playCard(s, 'p-0', 'c-da');

      expect(res.ok, true);
      expect(s.turnState, TurnState.waitingForAction);
      expect(s.currentPlayerIndex, 1);
      expect(res.events.whereType<TurnAdvancedEvent>(), isNotEmpty);
    });

    test('wins when a Discard All that matches nothing else is the last card', () {
      final s = makeState(players: [
        player('p-0', 'You', [card('c-da', CardColor.red, CardType.discardAll)]),
        player('p-1', 'B1'),
      ]);
      expect(playCard(s, 'p-0', 'c-da').ok, true);
      expect(s.winnerId, 'p-0');
      expect(s.gameState, GameState.gameOver);
    });

    test('enters the picker state on a multi-match Discard All without a pick', () {
      final s = makeState(players: [
        player('p-0', 'You', [
          card('c-da', CardColor.red, CardType.discardAll),
          card('c-r3', CardColor.red, CardType.number, 3),
          card('c-r9', CardColor.red, CardType.number, 9),
          card('c-b3', CardColor.blue, CardType.number, 3),
        ]),
        player('p-1', 'B1'),
      ]);

      final res = playCard(s, 'p-0', 'c-da');

      expect(s.turnState, TurnState.choosingDiscardAllTop);
      expect(ids(s.pendingDiscardAllCards)..sort(), ['c-r3', 'c-r9']);
      expect(res.events.whereType<ChooseDiscardAllTopEvent>(), isNotEmpty);

      selectDiscardAllTop(s, 'c-r9');
      expect(s.turnState, TurnState.waitingForAction);
      expect(s.currentPlayerIndex, 1);
      expect(s.discardPile.last.id, 'c-r9');
      expect(ids(s.players[0].hand), ['c-b3']);
    });

    test('keeps the turn after Skip Everyone and reports PLAY_AGAIN', () {
      final s = makeState(players: [
        player('p-0', 'You', [card('c-se', CardColor.red, CardType.skipEveryone), red5]),
        player('p-1', 'B1'),
      ]);

      final res = playCard(s, 'p-0', 'c-se');

      expect(s.currentPlayerIndex, 0);
      expect(res.events.whereType<PlayAgainEvent>(), isNotEmpty);
      expect(res.events.whereType<TurnAdvancedEvent>(), isEmpty);
    });

    test('flags AT_ONE_UNCALLED at 1 card and wins on going out', () {
      final s = makeState(
        players: [
          player('p-0', 'You', [card('c-play', CardColor.red, CardType.number, 5), card('c-extra', CardColor.red, CardType.number, 2)]),
          player('p-1', 'B1', [red5]),
        ],
        deck: List.generate(10, (i) => card('d-$i', CardColor.blue, CardType.number, 3)),
      );

      final res = playCard(s, 'p-0', 'c-play');
      expect(res.events.whereType<AtOneUncalledEvent>(), isNotEmpty);
      expect(s.players[0].hand.length, 1);

      s
        ..currentPlayerIndex = 0
        ..turnState = TurnState.waitingForAction;
      playCard(s, 'p-0', 'c-extra');
      expect(s.winnerId, 'p-0');
      expect(s.gameState, GameState.gameOver);
    });

    test('rejects an illegal card without changing state', () {
      final s = makeState(players: [
        player('p-0', 'You', [card('c-b3', CardColor.blue, CardType.number, 3)]),
        player('p-1', 'B1'),
      ]);
      final res = playCard(s, 'p-0', 'c-b3');
      expect(res.ok, false);
      expect(s.players[0].hand.length, 1);
      expect(s.discardPile.length, 1);
    });
  });

  group('roulette', () {
    test('ends the turn instead of spinning forever when nothing can be drawn', () {
      final s = makeState(
        players: [player('p-0', 'You'), player('p-1', 'Friend')],
        deck: [],
        currentPlayerIndex: 1,
        turnState: TurnState.rouletteDrawing,
        rouletteTargetColor: CardColor.blue,
      );
      final ev = <EngineEvent>[];

      expect(rouletteDrawStep(s, ev), RouletteOutcome.exhausted);
      expect(s.turnState, TurnState.waitingForAction);
      expect(s.currentPlayerIndex, 0);
      expect(ev.whereType<TurnAdvancedEvent>(), isNotEmpty);
    });

    test('keeps the matching card in the hand and reports match', () {
      final s = makeState(
        players: [player('p-0', 'You'), player('p-1', 'Victim', [red5])],
        deck: [card('d-blue', CardColor.blue, CardType.number, 4)],
        discardPile: [card('d-roul', CardColor.wild, CardType.wildColorRoulette)],
        currentPlayerIndex: 1,
        turnState: TurnState.rouletteDrawing,
        rouletteTargetColor: CardColor.blue,
      );

      expect(rouletteDrawStep(s, []), RouletteOutcome.match);
      expect(ids(s.players[1].hand), ['c-red-5', 'd-blue']);
      expect(s.discardPile.last.id, 'd-roul');
      expect(s.currentColor, CardColor.blue);
    });

    test('clears the target color once the roulette turn finishes', () {
      final s = makeState(
        players: [player('p-0', 'You'), player('p-1', 'Victim', [red5])],
        currentPlayerIndex: 1,
        turnState: TurnState.rouletteDrawing,
        rouletteTargetColor: CardColor.blue,
      );

      finishRouletteTurn(s, []);

      expect(s.rouletteTargetColor, isNull);
      expect(s.turnState, TurnState.waitingForAction);
      expect(s.currentPlayerIndex, 0);
    });
  });

  group('forced elimination (kick)', () {
    test('dumps the hand, unparks the turn, and clears a pending stack', () {
      final s = makeState(
        players: [
          player('p-0', 'A', [red5]),
          player('p-1', 'B', [card('k-1', CardColor.blue, CardType.number, 3), card('k-2', CardColor.blue, CardType.number, 3)]),
          player('p-2', 'C', [red5]),
        ],
        currentPlayerIndex: 1,
        drawStack: 4,
      );
      final ev = <EngineEvent>[];

      expect(eliminatePlayer(s, 'p-1', ev), true);
      expect(s.players[1].isEliminated, true);
      expect(s.players[1].hand, isEmpty);
      expect(s.drawStack, 0);
      expect(s.currentPlayerIndex, 2);
      expect(s.gameState, GameState.playing);
      expect(ev.whereType<EliminatedEvent>(), isNotEmpty);
    });

    test('ends the game when only one player remains', () {
      final s = makeState(players: [player('p-0', 'A', [red5]), player('p-1', 'B', [red5])]);
      eliminatePlayer(s, 'p-1', []);
      expect(s.winnerId, 'p-0');
      expect(s.gameState, GameState.gameOver);
    });
  });

  group('mercy rule', () {
    test('eliminates at 25 cards and ends the game when one player remains', () {
      final bigHand = List.generate(24, (i) => card('h-$i', CardColor.green, CardType.number, 2));
      final s = makeState(
        players: [player('p-0', 'You', bigHand), player('p-1', 'B1', [red5])],
        deck: [card('d-0', CardColor.blue, CardType.number, 3)],
      );
      final ev = <EngineEvent>[];

      drawCardToHand(s, 'p-0', ev);

      expect(s.players[0].isEliminated, true);
      expect(s.players[0].hand, isEmpty);
      expect(s.winnerId, 'p-1');
      expect(s.gameState, GameState.gameOver);
      expect(ev.whereType<EliminatedEvent>(), isNotEmpty);
      expect(ev.whereType<GameOverEvent>(), isNotEmpty);
    });
  });
}
