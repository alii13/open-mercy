// Dart port of shared/engine/types.ts. Keep the two in step: a rules change
// lands in both engines in the same PR.

import 'dart:math';

enum CardColor { red, blue, green, yellow, wild }

/// The four colours a wild can be called as.
const pickableColors = [CardColor.red, CardColor.blue, CardColor.green, CardColor.yellow];

enum CardType {
  number,
  skip,
  reverse,
  draw2,
  skipEveryone,
  discardAll,
  wild,
  draw4,
  draw6,
  draw10,
  wildReverseDraw4,
  wildColorRoulette,
}

class Card {
  const Card({required this.id, required this.color, required this.type, this.value});

  final String id;
  final CardColor color;
  final CardType type;

  /// 0-9 for number cards, null otherwise.
  final int? value;

  bool get isWild => color == CardColor.wild;

  @override
  String toString() => 'Card($id ${color.name} ${type.name}${value ?? ''})';
}

class Player {
  Player({
    required this.id,
    required this.name,
    List<Card>? hand,
    this.isEliminated = false,
    this.isBot = false,
    this.score,
  }) : hand = hand ?? [];

  final String id;
  final String name;
  List<Card> hand;
  bool isEliminated;
  final bool isBot;
  int? score;
}

enum GameState { lobby, playing, gameOver }

enum TurnState {
  waitingForAction,
  choosingColor,
  choosingPlayerToSwap,
  stackingResponse,
  rouletteDrawing,
  choosingRouletteColor,
  choosingDrawnWildColor,
  choosingDiscardAllTop,
  dealing,
}

enum StackingMode { official, house, casual }

typedef Rng = double Function();

final _random = Random();

/// The Math.random equivalent.
double defaultRng() => _random.nextDouble();

/// The complete rules-relevant state of a game. Engine functions mutate it in
/// place; the host (GameController) owns where it lives. Anything not here -
/// timers, animation flags, bot policy - is host concern.
class EngineState {
  EngineState({
    List<Player>? players,
    List<Card>? deck,
    List<Card>? discardPile,
    this.currentPlayerIndex = 0,
    this.direction = 1,
    this.drawStack = 0,
    this.currentColor = CardColor.red,
    this.turnState = TurnState.waitingForAction,
    this.gameState = GameState.lobby,
    this.winnerId,
    this.rouletteTargetColor,
    List<Card>? pendingDiscardAllCards,
    this.swapInitiatorId,
    Map<String, bool>? hasCalledUno,
    this.stackingMode = StackingMode.official,
  })  : players = players ?? [],
        deck = deck ?? [],
        discardPile = discardPile ?? [],
        pendingDiscardAllCards = pendingDiscardAllCards ?? [],
        hasCalledUno = hasCalledUno ?? {};

  List<Player> players;
  List<Card> deck;
  List<Card> discardPile;
  int currentPlayerIndex;

  /// 1 or -1.
  int direction;
  int drawStack;
  CardColor currentColor;
  TurnState turnState;
  GameState gameState;
  String? winnerId;
  CardColor? rouletteTargetColor;
  List<Card> pendingDiscardAllCards;
  String? swapInitiatorId;
  Map<String, bool> hasCalledUno;
  StackingMode stackingMode;
}

/// What happened during a transition, for the host to map onto sounds, stats
/// and policy (e.g. whether a bot auto-calls MERCY).
sealed class EngineEvent {
  const EngineEvent();
}

class ReshuffleEvent extends EngineEvent {
  const ReshuffleEvent();
}

class DrawEvent extends EngineEvent {
  const DrawEvent(this.playerId, this.card);
  final String playerId;
  final Card card;
}

class EliminatedEvent extends EngineEvent {
  const EliminatedEvent(this.playerId);
  final String playerId;
}

class GameOverEvent extends EngineEvent {
  const GameOverEvent(this.winnerId);
  final String winnerId;
}

class UnoPenaltyEvent extends EngineEvent {
  const UnoPenaltyEvent(this.playerId);
  final String playerId;
}

class AtOneUncalledEvent extends EngineEvent {
  const AtOneUncalledEvent(this.playerId);
  final String playerId;
}

class TurnAdvancedEvent extends EngineEvent {
  const TurnAdvancedEvent();
}

class PlayAgainEvent extends EngineEvent {
  const PlayAgainEvent();
}

class ChooseDiscardAllTopEvent extends EngineEvent {
  const ChooseDiscardAllTopEvent(this.playerId);
  final String playerId;
}
