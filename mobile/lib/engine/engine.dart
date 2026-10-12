// Dart port of shared/engine/engine.ts. Functions mutate the EngineState in
// place and append what happened to an event list for the host.

import 'deck.dart';
import 'rules.dart';
import 'types.dart';

Player? currentPlayer(EngineState s) =>
    s.currentPlayerIndex >= 0 && s.currentPlayerIndex < s.players.length
        ? s.players[s.currentPlayerIndex]
        : null;

Card? topCard(EngineState s) => s.discardPile.isEmpty ? null : s.discardPile.last;

Player? _playerById(EngineState s, String id) {
  for (final p in s.players) {
    if (p.id == id) return p;
  }
  return null;
}

Card? drawCardFromDeck(EngineState s, List<EngineEvent> ev, [Rng rng = defaultRng]) {
  if (s.deck.isEmpty) {
    if (!reshuffleDeck(s.deck, s.discardPile, rng)) return null;
    ev.add(const ReshuffleEvent());
  }
  return s.deck.removeLast();
}

Card? drawCardToHand(EngineState s, String playerId, List<EngineEvent> ev, [Rng rng = defaultRng]) {
  final player = _playerById(s, playerId);
  if (player == null) return null;
  final card = drawCardFromDeck(s, ev, rng);
  if (card != null) {
    player.hand.add(card);
    s.hasCalledUno[player.id] = false;
    ev.add(DrawEvent(player.id, card));
  }
  checkMercyElimination(s, player, ev);
  return card;
}

/// Eliminates the player if they crossed the mercy threshold; ends the game
/// if one player remains.
bool checkMercyElimination(EngineState s, Player player, List<EngineEvent> ev) {
  if (!checkMercyRule(player.hand.length)) return false;
  player.isEliminated = true;
  s.discardPile.addAll(player.hand);
  player.hand = [];
  ev.add(EliminatedEvent(player.id));

  final active = s.players.where((p) => !p.isEliminated).toList();
  if (active.length == 1) endGame(s, active.first.id, ev);
  return true;
}

/// Forced elimination (host kick, permanent leave). Unlike the mercy path -
/// whose callers own the turn advance - this also unparks the turn if the
/// dead seat was holding it.
bool eliminatePlayer(EngineState s, String playerId, List<EngineEvent> ev) {
  final player = _playerById(s, playerId);
  if (player == null || player.isEliminated) return false;
  final hadTurn = currentPlayer(s)?.id == playerId;
  player.isEliminated = true;
  s.discardPile.addAll(player.hand);
  player.hand = [];
  ev.add(EliminatedEvent(player.id));

  final active = s.players.where((p) => !p.isEliminated).toList();
  if (active.length == 1) {
    endGame(s, active.first.id, ev);
    return true;
  }
  if (s.gameState == GameState.playing && hadTurn) {
    s.turnState = TurnState.waitingForAction;
    s.drawStack = 0;
    s.pendingDiscardAllCards = [];
    advanceTurn(s, ev);
  }
  return true;
}

void endGame(EngineState s, String winnerId, List<EngineEvent> ev) {
  s.winnerId = winnerId;
  applyScoresToWinner(s, winnerId);
  s.gameState = GameState.gameOver;
  ev.add(GameOverEvent(winnerId));
}

void applyScoresToWinner(EngineState s, String winnerId) {
  final winner = _playerById(s, winnerId);
  if (winner == null) return;
  final hands = <List<Card>>[];
  final eliminated = <bool>[];
  for (final p in s.players) {
    if (p.id == winnerId) continue;
    hands.add(p.hand);
    eliminated.add(p.isEliminated);
  }
  winner.score = (winner.score ?? 0) + calculateScore(hands, eliminated);
}

void advanceTurn(EngineState s, List<EngineEvent> ev) {
  ev.add(const TurnAdvancedEvent());
  final count = s.players.length;
  s.currentPlayerIndex = calculateNextPlayerIndex(s.currentPlayerIndex, s.direction, count);

  // Coming from Roulette: don't reset the choosing/drawing state.
  if (s.turnState != TurnState.rouletteDrawing && s.turnState != TurnState.choosingRouletteColor) {
    s.turnState = TurnState.waitingForAction;
  }

  // Skip eliminated players.
  var sanity = 0;
  while (currentPlayer(s)?.isEliminated == true && sanity < 20) {
    s.currentPlayerIndex = calculateNextPlayerIndex(s.currentPlayerIndex, s.direction, count);
    sanity++;
  }
}

class PlayCardOpts {
  const PlayCardOpts({this.selectedColor, this.discardAllTopPickId, this.rng = defaultRng});

  final CardColor? selectedColor;

  /// Which card goes on top of a multi-match Discard All - host policy (e.g.
  /// bot picks). Absent -> picker state.
  final String? discardAllTopPickId;
  final Rng rng;
}

class PlayResult {
  const PlayResult(this.ok, this.events);
  final bool ok;
  final List<EngineEvent> events;
}

PlayResult playCard(EngineState s, String playerId, String cardId, [PlayCardOpts opts = const PlayCardOpts()]) {
  final ev = <EngineEvent>[];
  final rng = opts.rng;

  final player = _playerById(s, playerId);
  if (player == null) return PlayResult(false, ev);
  final top = topCard(s);
  if (top == null) return PlayResult(false, ev);

  final cardIndex = player.hand.indexWhere((c) => c.id == cardId);
  if (cardIndex == -1) return PlayResult(false, ev);
  final card = player.hand[cardIndex];
  if (!canPlayCard(card, top, s.currentColor, s.drawStack, s.stackingMode)) return PlayResult(false, ev);

  final handSizeBeforePlay = player.hand.length;
  player.hand.removeAt(cardIndex);
  s.discardPile.add(card);

  if (card.type == CardType.wildColorRoulette) {
    // Roulette: color is chosen by the NEXT player (the victim) - leave as is.
  } else if (card.isWild) {
    s.currentColor = opts.selectedColor ?? CardColor.red;
  } else {
    s.currentColor = card.color;
  }

  // Counted before the effect runs, and after the played card is already out
  // of the hand: a Discard All whose colour is unique in the hand has nothing
  // left to dump, and the effect is then a no-op.
  final discardAllMatches =
      card.type == CardType.discardAll ? player.hand.where((c) => c.color == card.color).length : 0;

  applyCardEffect(s, card, ev, opts);

  // Discard All fully owns its own resolution when it had matches. With zero
  // matches it resolved nothing, so falling through keeps the turn from
  // stranding and still lets it count as a winning last card.
  if (card.type == CardType.discardAll && discardAllMatches > 0) return PlayResult(true, ev);

  // Win / MERCY-penalty checks run for EVERY card type, roulette included.
  if (player.hand.isEmpty) {
    // The penalty only applies if the player went from exactly 2 -> 1 -> 0.
    final neededUno = handSizeBeforePlay == 2;
    if (neededUno && s.hasCalledUno[player.id] != true) {
      ev.add(UnoPenaltyEvent(player.id));
      drawCardToHand(s, player.id, ev, rng);
      drawCardToHand(s, player.id, ev, rng);
      // The penalty draws can mercy-eliminate the player and end the game.
      if (s.gameState != GameState.gameOver) advanceTurn(s, ev);
      return PlayResult(true, ev);
    }
    endGame(s, player.id, ev);
    return PlayResult(true, ev);
  }

  // Reached 1 card without calling MERCY - the host decides what happens.
  if (player.hand.length == 1 && s.hasCalledUno[player.id] != true) {
    ev.add(AtOneUncalledEvent(player.id));
  }

  // Turn already advanced to the victim in applyCardEffect.
  if (card.type == CardType.wildColorRoulette) return PlayResult(true, ev);

  if (card.type != CardType.skipEveryone) {
    if (s.turnState == TurnState.waitingForAction ||
        s.turnState == TurnState.rouletteDrawing ||
        s.turnState == TurnState.choosingRouletteColor) {
      advanceTurn(s, ev);
    }
  } else {
    // Skip Everyone: the turn stays with the current player.
    ev.add(const PlayAgainEvent());
  }

  return PlayResult(true, ev);
}

void applyCardEffect(EngineState s, Card card, List<EngineEvent> ev, [PlayCardOpts opts = const PlayCardOpts()]) {
  final drawVal = getDrawValue(card);
  if (drawVal > 0 && card.type != CardType.wildColorRoulette) s.drawStack += drawVal;

  if (card.type == CardType.number) {
    if (card.value == 0) {
      rotateActiveHands(s);
    } else if (card.value == 7) {
      s.turnState = TurnState.choosingPlayerToSwap;
      s.swapInitiatorId = currentPlayer(s)?.id;
    }
    return;
  }

  switch (card.type) {
    case CardType.reverse:
    case CardType.wildReverseDraw4:
      _handleReverse(s, card, ev);
    case CardType.skip:
      advanceTurn(s, ev);
    case CardType.wildColorRoulette:
      s.turnState = TurnState.choosingRouletteColor;
      advanceTurn(s, ev);
    case CardType.discardAll:
      _handleDiscardAll(s, card, ev, opts);
    default:
      // skipEveryone: play again - the caller handles turn retention.
      break;
  }
}

void _handleReverse(EngineState s, Card card, List<EngineEvent> ev) {
  // Reverse acts as Skip in 2p. Wild Reverse Draw 4 in 2p just reverses -
  // the penalty still goes to the opponent.
  if (s.players.length == 2 && card.type == CardType.reverse) advanceTurn(s, ev);
  s.direction = s.direction == 1 ? -1 : 1;
}

void _handleDiscardAll(EngineState s, Card card, List<EngineEvent> ev, PlayCardOpts opts) {
  final player = currentPlayer(s);
  if (player == null) return;

  final toDiscard = player.hand.where((c) => c.color == card.color).toList();
  if (toDiscard.isEmpty) return;

  // No choice to make (single match) or the host already picked (bot policy):
  // resolve through the SAME path as the picker so the top card's effect fires.
  if (toDiscard.length == 1 || opts.discardAllTopPickId != null) {
    final topChoice = toDiscard.length == 1
        ? toDiscard.first
        : toDiscard.firstWhere((c) => c.id == opts.discardAllTopPickId, orElse: () => toDiscard.first);
    s.pendingDiscardAllCards = toDiscard;
    s.turnState = TurnState.choosingDiscardAllTop;
    resolveDiscardAllTop(s, toDiscard, topChoice, ev, opts.rng);
    return;
  }

  // 2+ matches and no pick: enter picker state, host shows the chooser.
  s.pendingDiscardAllCards = toDiscard;
  s.turnState = TurnState.choosingDiscardAllTop;
  ev.add(ChooseDiscardAllTopEvent(player.id));
}

void _executeDiscardAll(EngineState s, List<Card> cards, Card top) {
  final player = currentPlayer(s);
  if (player == null) return;
  // Discard all except the chosen top card first, then the top card last.
  final ordered = [...cards.where((c) => c.id != top.id), top];
  for (final c in ordered) {
    final idx = player.hand.indexWhere((h) => h.id == c.id);
    if (idx > -1) {
      player.hand.removeAt(idx);
      s.discardPile.add(c);
    }
  }
}

/// Sole resolver for a Discard All - the picker and the auto paths both land here.
void resolveDiscardAllTop(EngineState s, List<Card> cards, Card top, List<EngineEvent> ev, [Rng rng = defaultRng]) {
  _executeDiscardAll(s, cards, top);
  s.pendingDiscardAllCards = [];
  s.turnState = TurnState.waitingForAction;

  final player = currentPlayer(s);

  // Bulk discard emptied the hand -> win (no MERCY call expected for a dump).
  if (player != null && player.hand.isEmpty) {
    endGame(s, player.id, ev);
    return;
  }

  // Apply the chosen TOP card's effect, exactly as if it had just been played.
  applyCardEffect(s, top, ev, PlayCardOpts(rng: rng));

  if (player != null && player.hand.length == 1 && s.hasCalledUno[player.id] != true) {
    ev.add(AtOneUncalledEvent(player.id));
  }

  // Mirror playCard's advance: Skip Everyone plays again; a swap/choosing
  // state waits for input; otherwise pass the turn.
  if (top.type == CardType.skipEveryone) {
    ev.add(const PlayAgainEvent());
  } else if (s.turnState == TurnState.waitingForAction) {
    advanceTurn(s, ev);
  }
}

List<EngineEvent> selectDiscardAllTop(EngineState s, String topCardId, [Rng rng = defaultRng]) {
  final ev = <EngineEvent>[];
  if (s.turnState != TurnState.choosingDiscardAllTop) return ev;
  final cards = s.pendingDiscardAllCards;
  final matches = cards.where((c) => c.id == topCardId);
  if (matches.isEmpty) return ev;
  resolveDiscardAllTop(s, cards, matches.first, ev, rng);
  return ev;
}

void rotateActiveHands(EngineState s) {
  // Rotate only among players still in the game. Including eliminated seats
  // would rotate an active hand into a dead seat and strand a player on 0.
  final active = s.players.where((p) => !p.isEliminated).toList();
  if (active.length < 2) return;
  final rotated = rotateHands([for (final p in active) p.hand], s.direction);
  for (var i = 0; i < active.length; i++) {
    active[i].hand = rotated[i];
  }
}

bool swapHands(EngineState s, String targetPlayerId, List<EngineEvent> ev) {
  if (s.turnState != TurnState.choosingPlayerToSwap) return false;
  final initiator = s.swapInitiatorId == null ? null : _playerById(s, s.swapInitiatorId!);
  final target = _playerById(s, targetPlayerId);
  var swapped = false;
  // Never swap with an eliminated seat - its empty hand would hand the
  // initiator a 0-card "win" and revive the dead seat.
  if (initiator != null && target != null && !target.isEliminated) {
    final temp = [...initiator.hand];
    initiator.hand = [...target.hand];
    target.hand = temp;
    swapped = true;
  }
  s.turnState = TurnState.waitingForAction;
  advanceTurn(s, ev);
  return swapped;
}

bool skipSwap(EngineState s, List<EngineEvent> ev) {
  if (s.turnState != TurnState.choosingPlayerToSwap) return false;
  s.turnState = TurnState.waitingForAction;
  advanceTurn(s, ev);
  return true;
}

bool setRouletteColor(EngineState s, CardColor color) {
  if (s.turnState != TurnState.choosingRouletteColor) return false;
  s.rouletteTargetColor = color;
  s.turnState = TurnState.rouletteDrawing;
  return true;
}

enum RouletteOutcome { match, eliminated, continueDrawing, exhausted, invalid }

/// One roulette draw. [RouletteOutcome.match] and [RouletteOutcome.eliminated]
/// leave the turn open so the host can stall for drama before calling
/// [finishRouletteTurn]. [RouletteOutcome.exhausted] ends the turn immediately.
RouletteOutcome rouletteDrawStep(EngineState s, List<EngineEvent> ev, [Rng rng = defaultRng]) {
  if (s.turnState != TurnState.rouletteDrawing) return RouletteOutcome.invalid;
  final p = currentPlayer(s);
  if (p == null) return RouletteOutcome.invalid;

  final card = drawCardToHand(s, p.id, ev, rng);

  // Deck + discard ran dry mid-roulette - it can never resolve. Turn passes.
  if (card == null) {
    s.turnState = TurnState.waitingForAction;
    advanceTurn(s, ev);
    return RouletteOutcome.exhausted;
  }

  // Wilds revealed don't count - an actual colored card is needed. The match
  // stays in the victim's hand like every other roulette draw.
  if (s.rouletteTargetColor != null && card.color == s.rouletteTargetColor) {
    s.currentColor = s.rouletteTargetColor!;
    return RouletteOutcome.match;
  }

  if (p.isEliminated) return RouletteOutcome.eliminated;
  return RouletteOutcome.continueDrawing;
}

void finishRouletteTurn(EngineState s, List<EngineEvent> ev) {
  s.rouletteTargetColor = null;
  s.turnState = TurnState.waitingForAction;
  if (s.gameState != GameState.gameOver) advanceTurn(s, ev);
}

/// Draw [count] penalty cards, stopping if the player gets eliminated or the game ends.
void penalizeUnoDraws(EngineState s, String playerId, int count, List<EngineEvent> ev, [Rng rng = defaultRng]) {
  final p = _playerById(s, playerId);
  if (p == null) return;
  for (var i = 0; i < count; i++) {
    if (p.isEliminated || s.gameState == GameState.gameOver) break;
    drawCardToHand(s, p.id, ev, rng);
  }
}

/// Draw the opening discard (reshuffling wilds back in) and apply its effect:
/// skip/reverse act on the first player, draw cards start a stack.
Card? drawFirstDiscard(EngineState s, List<EngineEvent> ev, [Rng rng = defaultRng]) {
  var first = drawCardFromDeck(s, ev, rng);
  while (first != null && (first.type == CardType.wild || first.isWild)) {
    s.deck.add(first);
    s.deck = shuffleDeck(s.deck, rng);
    first = drawCardFromDeck(s, ev, rng);
  }
  if (first == null) return null;

  s.discardPile.add(first);
  s.currentColor = first.color;

  switch (first.type) {
    case CardType.skip:
      advanceTurn(s, ev);
    case CardType.reverse:
      // In 2-player the first player gets skipped.
      if (s.players.length == 2) {
        advanceTurn(s, ev);
      } else {
        s.direction = -1;
      }
    case CardType.draw2:
      s.drawStack = 2;
    case CardType.draw4:
      s.drawStack = 4;
    default:
      break;
  }
  return first;
}
