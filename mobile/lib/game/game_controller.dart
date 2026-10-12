// Solo game host - the Flutter counterpart of frontend/src/stores/gameStore.ts.
// The engine owns the rules; this owns pacing, bot policy, MERCY catch
// windows and local progress. Timings and policy match the web store so a
// game feels the same on both.

import 'dart:async';

import 'package:flutter/foundation.dart';

import '../engine/bot.dart';
import '../engine/deck.dart';
import '../engine/engine.dart' as engine;
import '../engine/rules.dart';
import '../engine/seeded_rng.dart';
import '../engine/types.dart';
import 'local_store.dart';

/// Single tunable block, same values as the web store.
///
/// Bot delays are pure dead time. Comprehension stalls are the drama - the
/// time a human needs to read a stack landing or a roulette spin.
class Timings {
  static const botThink = 1100;
  static const botRoulette = 250;
  static const botRouletteColorPick = 600;
  static const drawStaggerPenalty = 200;
  static const drawUntilPlayableRetry = 280;
  static const drawnPlayableAutoPlay = 750;
  static const rouletteSpin = 520;
  static const rouletteSafeStall = 1100;
  static const rouletteEliminatedStall = 1500;
  static const botCatchWindow = 7000;
}

/// The store's sound calls (soundEffects.* on web). Injected so tests and
/// headless runs stay silent.
abstract class GameSounds {
  void playCardShuffle();
  void playCardPick();
  void playCardLand();
  void playSpecialCard();
}

class SilentSounds implements GameSounds {
  const SilentSounds();
  @override
  void playCardShuffle() {}
  @override
  void playCardPick() {}
  @override
  void playCardLand() {}
  @override
  void playSpecialCard() {}
}

const humanId = 'p-0';
const _cardsPerPlayer = 7;

/// A brutal draw 10 for a forgotten MERCY call.
const _unoPenalty = 10;

class PlayerStats {
  int peakCards = 0;
  int drawCardsPlayed = 0;
  int wildCardsPlayed = 0;
  int cardsPlayedTotal = 0;
  int skipsDealt = 0;
  int swapsMade = 0;
  int drawsTaken = 0;
  int biggestStackSurvived = 0;
  int unoCalls = 0;
  int unoPenalties = 0;
}

class LastPlay {
  const LastPlay(this.playerId, this.card, this.n);
  final String playerId;
  final Card card;

  /// Counter so consecutive identical plays still read as new.
  final int n;
}

class GameController extends ChangeNotifier {
  GameController(this._store, {this.sounds = const SilentSounds()}) {
    s.stackingMode = _store.stackingMode;
  }

  final LocalStore _store;
  final GameSounds sounds;
  final EngineState s = EngineState();

  bool isDealing = false;
  ({String playerId, Card card})? pendingDealCard;
  Card? pendingDrawnWildCard;

  /// Set right before a player-initiated play: the hand's flying clone is
  /// the visual, so the discard pile skips its own slam. The pile resets it.
  bool suppressDiscardSlam = false;

  /// A player who hit 1 card without calling MERCY - catchable until the
  /// window closes.
  String? catchableId;

  /// Re-entrancy guard so rapid taps don't queue actions mid-resolution.
  bool actionInProgress = false;
  LastPlay? lastPlay;

  /// One character per human turn: p played, d drew, x ate a stack.
  final List<String> turnLog = [];
  String? dailyDate;
  Map<String, BotProfile> botProfiles = {};
  Map<String, PlayerStats> playerStats = {};

  Rng _rng = defaultRng;
  int _playCounter = 0;

  // Bumped whenever the current game becomes obsolete. Every scheduled
  // callback checks it, so a timer that outlives its game can't touch the next.
  int _generation = 0;
  final Set<Timer> _timers = {};
  Timer? _catchTimer;
  bool _disposed = false;

  // --- Getters ---

  List<Player> get players => s.players;
  Player? get currentPlayer => engine.currentPlayer(s);
  Card? get topCard => engine.topCard(s);
  Player? get human => players.where((p) => p.id == humanId).firstOrNull;
  bool get isMyTurn => currentPlayer?.id == humanId;
  StackingMode get stackingMode => s.stackingMode;
  int get deckCount => s.deck.length;

  /// Derived, never latched: only while calling MERCY is meaningful - the
  /// human's turn at exactly 2 cards, or while exposed in a catch window.
  bool get showUnoButton {
    if (s.gameState != GameState.playing) return false;
    final h = human;
    if (h == null || h.isEliminated || s.hasCalledUno[h.id] == true) return false;
    if (catchableId == h.id) return true;
    return isMyTurn &&
        (s.turnState == TurnState.waitingForAction || s.turnState == TurnState.choosingDrawnWildColor) &&
        h.hand.length == 2;
  }

  /// The bot the human can catch for a forgotten MERCY call, if any.
  Player? get catchableBot {
    final id = catchableId;
    if (id == null || id == humanId) return null;
    return players.where((p) => p.id == id).firstOrNull;
  }

  BotProfile profileFor(Player p) => botProfiles[p.id] ?? botLadder.first;

  // --- Lifecycle ---

  /// Port of gameStore.initializeGame. Players after the first are bots; the
  /// daily forces its own opponent and seed so no caller can change the deal.
  void initializeGame(List<String> playerNames, {StackingMode? mode, String? dailySeed, List<String>? botIds}) {
    dailyDate = dailySeed;
    _rng = dailySeed != null ? seededRng('uno-daily-$dailySeed') : defaultRng;
    _resetTimers();
    if (mode != null) setStackingMode(mode);
    s.players = [
      for (final (i, name) in playerNames.indexed)
        Player(id: 'p-$i', name: name, isBot: i > 0, score: 0),
    ];
    final bots = s.players.where((p) => p.isBot).toList();
    botProfiles = {
      for (final (i, p) in bots.indexed)
        p.id: dailySeed != null
            ? dailyBot()
            : botById(botIds != null && i < botIds.length ? botIds[i] : botLadder.first.id),
    };

    s
      ..deck = shuffleDeck(generateFullDeck(), _rng)
      ..discardPile = []
      ..currentPlayerIndex = 0
      ..direction = 1
      ..drawStack = 0
      ..gameState = GameState.playing
      ..winnerId = null
      ..turnState = TurnState.dealing
      ..rouletteTargetColor = null
      ..hasCalledUno = {}
      ..pendingDiscardAllCards = []
      ..swapInitiatorId = null;
    turnLog.clear();
    isDealing = true;
    // The view persists across rematches, so in-flight flags from the last
    // game must be cleared here or they leak into the new one.
    actionInProgress = false;
    suppressDiscardSlam = false;
    pendingDealCard = null;
    pendingDrawnWildCard = null;
    playerStats = {for (final p in s.players) p.id: PlayerStats()};
    _changed();
  }

  /// Deals 7 each, one card at a time, awaiting [onCardDealt] (the deal
  /// animation) per card. Then turns up the first discard.
  Future<void> dealInitialCards(Future<void> Function(String playerId, Card card) onCardDealt) async {
    final gen = _generation;
    for (var round = 0; round < _cardsPerPlayer; round++) {
      for (final player in s.players) {
        final card = drawCardFromDeck();
        if (card == null) continue;
        pendingDealCard = (playerId: player.id, card: card);
        // Animations are eye candy: if one throws, deal the card anyway.
        try {
          await onCardDealt(player.id, card);
        } catch (_) {}
        // Deal became obsolete while awaiting (left mid-deal, rematch).
        if (gen != _generation || _disposed) {
          pendingDealCard = null;
          return;
        }
        player.hand.add(card);
        pendingDealCard = null;
        _changed();
      }
    }
    if (gen != _generation || _disposed) return;

    final ev = <EngineEvent>[];
    engine.drawFirstDiscard(s, ev, _rng);
    _applyEvents(ev);
    isDealing = false;
    s.turnState = TurnState.waitingForAction;
    _changed();
  }

  Card? drawCardFromDeck() {
    final ev = <EngineEvent>[];
    final card = engine.drawCardFromDeck(s, ev, _rng);
    _applyEvents(ev);
    return card;
  }

  void setStackingMode(StackingMode m) {
    s.stackingMode = m;
    _store.setStackingMode(m);
    _changed();
  }

  void returnToLobby() {
    _resetTimers();
    s
      ..gameState = GameState.lobby
      ..players = []
      ..deck = []
      ..discardPile = [];
    _changed();
  }

  @override
  void dispose() {
    _disposed = true;
    _resetTimers();
    super.dispose();
  }

  // --- Change propagation ---

  // The web store watches [currentPlayerIndex, gameState, turnState, topCard]
  // and drives bots from that watcher. Same here: batch changes into one
  // microtask so a burst of mutations reads as one transition.
  bool _watchScheduled = false;
  (int, GameState, TurnState, String?)? _lastWatchKey;
  GameState _lastGameState = GameState.lobby;

  void _changed() {
    if (_disposed) return;
    notifyListeners();
    if (_watchScheduled) return;
    _watchScheduled = true;
    scheduleMicrotask(() {
      _watchScheduled = false;
      if (_disposed) return;
      _onGameStateMaybeChanged();
      final key = (s.currentPlayerIndex, s.gameState, s.turnState, topCard?.id);
      if (key == _lastWatchKey) return;
      _lastWatchKey = key;
      _onTurnMaybeChanged();
    });
  }

  void _later(int ms, void Function() fn) {
    final gen = _generation;
    late final Timer timer;
    timer = Timer(Duration(milliseconds: ms), () {
      _timers.remove(timer);
      if (gen != _generation || _disposed) return;
      fn();
    });
    _timers.add(timer);
  }

  void _resetTimers() {
    _generation++;
    for (final t in _timers) {
      t.cancel();
    }
    _timers.clear();
    _closeCatchWindow();
  }

  // Map engine events onto host concerns: stats, the action guard, and MERCY
  // policy (bot auto-call odds / catch windows are host decisions).
  void _applyEvents(List<EngineEvent> events) {
    for (final e in events) {
      switch (e) {
        case ReshuffleEvent():
          sounds.playCardShuffle();
        case DrawEvent(:final playerId):
          sounds.playCardPick();
          final p = players.where((x) => x.id == playerId).firstOrNull;
          final st = playerStats[playerId];
          if (p != null && st != null && p.hand.length > st.peakCards) st.peakCards = p.hand.length;
        case TurnAdvancedEvent():
        case PlayAgainEvent():
          // The previous action fully resolved - release the guard.
          actionInProgress = false;
        case UnoPenaltyEvent(:final playerId):
          playerStats[playerId]?.unoPenalties++;
        case AtOneUncalledEvent(:final playerId):
          final p = players.where((x) => x.id == playerId).firstOrNull;
          if (p == null) break;
          if (p.isBot && willCatchMercy(profileFor(p), _rng)) {
            callUno(p.id);
          } else {
            _openCatchWindow(p);
          }
        case EliminatedEvent():
        case GameOverEvent():
        case ChooseDiscardAllTopEvent():
          break;
      }
    }
  }

  // --- MERCY calls ---

  void callUno(String playerId) {
    s.hasCalledUno[playerId] = true;
    if (catchableId == playerId) _closeCatchWindow();
    playerStats[playerId]?.unoCalls++;
    _changed();
  }

  void _closeCatchWindow() {
    catchableId = null;
    _catchTimer?.cancel();
    _catchTimer = null;
  }

  void _openCatchWindow(Player player) {
    _closeCatchWindow();
    catchableId = player.id;
    final gen = _generation;
    if (player.isBot) {
      // Bot forgot - the human can catch it until the window closes.
      _catchTimer = Timer(const Duration(milliseconds: Timings.botCatchWindow), () {
        if (gen != _generation || catchableId != player.id) return;
        _closeCatchWindow();
        _changed();
      });
    } else {
      // Human is exposed - a bot pounces 70% of the time before it closes.
      final willCatch = _rng() < 0.7;
      final delay = 1800 + (defaultRng() * 1600).round();
      _catchTimer = Timer(Duration(milliseconds: delay), () {
        if (gen != _generation || catchableId != player.id) return;
        if (willCatch) {
          _penalizeForgottenUno(player.id);
        } else {
          _closeCatchWindow();
          _changed();
        }
      });
    }
  }

  void _penalizeForgottenUno(String playerId) {
    _closeCatchWindow();
    playerStats[playerId]?.unoPenalties++;
    final ev = <EngineEvent>[];
    engine.penalizeUnoDraws(s, playerId, _unoPenalty, ev, _rng);
    _applyEvents(ev);
    _changed();
  }

  /// Human catches a bot that forgot to call MERCY.
  void catchNoUno(String targetId) {
    if (catchableId != targetId) return;
    _penalizeForgottenUno(targetId);
  }

  // --- Playing ---

  void _playCard(String playerId, Card card, [CardColor? selectedColor]) {
    final player = players.where((p) => p.id == playerId).firstOrNull;
    if (player == null) return;

    // Host policy: a bot facing a multi-match Discard All picks its top card
    // at random; the human gets the picker. Counted with the played card
    // still in hand, as on web - the rng draw must match for the daily.
    String? pickId;
    if (card.type == CardType.discardAll && player.isBot) {
      final matches = player.hand.where((c) => c.color == card.color).toList();
      if (matches.length > 1) pickId = matches[(_rng() * matches.length).floor()].id;
    }

    final res = engine.playCard(
      s,
      playerId,
      card.id,
      engine.PlayCardOpts(selectedColor: selectedColor, discardAllTopPickId: pickId, rng: _rng),
    );
    if (!res.ok) return;
    if (!player.isBot) turnLog.add('p');
    _applyEvents(res.events);

    final st = playerStats[playerId];
    if (st != null) {
      st.cardsPlayedTotal++;
      if (card.isWild) st.wildCardsPlayed++;
      if (getDrawValue(card) > 0) st.drawCardsPlayed++;
      if (card.type == CardType.skip || card.type == CardType.skipEveryone) st.skipsDealt++;
    }
    lastPlay = LastPlay(playerId, card, ++_playCounter);
    sounds.playCardLand();
    if (card.isWild ||
        card.type.name.contains('draw') ||
        card.type == CardType.skip ||
        card.type == CardType.reverse) {
      sounds.playSpecialCard();
    }
    _changed();
  }

  void playerActionPlayCard(Card card, [CardColor? selectedColor]) {
    final p = currentPlayer;
    if (p == null) return;
    actionInProgress = true;
    _playCard(p.id, card, selectedColor);
  }

  void drawCardsForCurrentPlayer() {
    final p = currentPlayer;
    if (p == null) return;
    actionInProgress = true;
    if (!p.isBot) turnLog.add(s.drawStack > 0 ? 'x' : 'd');

    if (s.drawStack > 0) {
      // Stacking penalty: eat the whole stack, one card at a time.
      final toDraw = s.drawStack;
      final st = playerStats[p.id];
      if (st != null) {
        st.drawsTaken++;
        if (toDraw > st.biggestStackSurvived) st.biggestStackSurvived = toDraw;
      }
      s.drawStack = 0;
      var drawn = 0;
      void drawNext() {
        // Eliminated mid-stack or game over: stop shovelling cards.
        if (p.isEliminated || s.gameState == GameState.gameOver) {
          if (s.gameState != GameState.gameOver) _advanceTurn();
          return;
        }
        if (drawn < toDraw) {
          _drawToHand(p);
          drawn++;
          _later(Timings.drawStaggerPenalty, drawNext);
        } else {
          _advanceTurn();
        }
      }

      drawNext();
      return;
    }

    // Standard draw: draw until playable, then play it immediately.
    void drawUntilPlayable() {
      // Dead-end bails must release the turn or the game soft-locks.
      final top = topCard;
      if (top == null) return _advanceTurn();
      playerStats[p.id]?.drawsTaken++;
      final card = _drawToHand(p);
      if (card == null) return _advanceTurn();

      if (canPlayCard(card, top, s.currentColor, 0, s.stackingMode)) {
        _later(Timings.drawnPlayableAutoPlay, () {
          if (card.isWild && card.type != CardType.wildColorRoulette && !p.isBot) {
            pendingDrawnWildCard = card;
            s.turnState = TurnState.choosingDrawnWildColor;
            _changed();
            return;
          }
          playerActionPlayCard(card, card.isWild ? _botColor(p) : null);
        });
        return;
      }
      if (p.isEliminated) return _advanceTurn();
      _later(Timings.drawUntilPlayableRetry, drawUntilPlayable);
    }

    drawUntilPlayable();
  }

  Card? _drawToHand(Player p) {
    final ev = <EngineEvent>[];
    final card = engine.drawCardToHand(s, p.id, ev, _rng);
    _applyEvents(ev);
    _changed();
    return card;
  }

  void _advanceTurn() {
    final ev = <EngineEvent>[];
    engine.advanceTurn(s, ev);
    _applyEvents(ev);
    _changed();
  }

  /// Human picked the colour for a wild they drew and must play.
  void playDrawnWildCard(CardColor color) {
    if (s.turnState != TurnState.choosingDrawnWildColor) return;
    final card = pendingDrawnWildCard;
    if (card == null) return;
    pendingDrawnWildCard = null;
    s.turnState = TurnState.waitingForAction;
    playerActionPlayCard(card, color);
  }

  void selectDiscardAllTop(String topCardId) {
    final ev = engine.selectDiscardAllTop(s, topCardId, _rng);
    _applyEvents(ev);
    _changed();
  }

  void swapHands(String targetId) {
    if (s.turnState != TurnState.choosingPlayerToSwap) return;
    final initiator = s.swapInitiatorId;
    final ev = <EngineEvent>[];
    final swapped = engine.swapHands(s, targetId, ev);
    if (swapped && initiator != null) playerStats[initiator]?.swapsMade++;
    _applyEvents(ev);
    _changed();
  }

  void skipSwap() {
    final ev = <EngineEvent>[];
    engine.skipSwap(s, ev);
    _applyEvents(ev);
    _changed();
  }

  // --- Roulette ---

  void setRouletteColor(CardColor color) {
    if (engine.setRouletteColor(s, color)) {
      _changed();
      _rouletteDraw();
    }
  }

  // The engine does one draw per step; the host owns the stalls between.
  void _rouletteDraw() {
    final ev = <EngineEvent>[];
    final outcome = engine.rouletteDrawStep(s, ev, _rng);
    _applyEvents(ev);
    _changed();
    switch (outcome) {
      case engine.RouletteOutcome.match:
        _later(Timings.rouletteSafeStall, _finishRoulette);
      case engine.RouletteOutcome.eliminated:
        _later(Timings.rouletteEliminatedStall, _finishRoulette);
      case engine.RouletteOutcome.continueDrawing:
        _later(Timings.rouletteSpin, _rouletteDraw);
      case engine.RouletteOutcome.exhausted:
      case engine.RouletteOutcome.invalid:
        break;
    }
  }

  void _finishRoulette() {
    final ev = <EngineEvent>[];
    engine.finishRouletteTurn(s, ev);
    _applyEvents(ev);
    _changed();
  }

  // --- Bot driver ---

  CardColor _botColor(Player bot) => chooseWildColor(bot.hand, profileFor(bot), _rng);

  // Mirrors the web store's watcher line for line, including its re-check
  // after the delay and the roulette branch. BUGS.md #1: for a bot victim that
  // branch starts a second draw loop alongside setRouletteColor's; kept so
  // mobile plays exactly like the web until that entry is decided.
  void _onTurnMaybeChanged() {
    if (s.gameState != GameState.playing) return;
    final player = currentPlayer;
    if (player == null || !player.isBot) return;
    final delay = s.turnState == TurnState.rouletteDrawing ? Timings.botRoulette : Timings.botThink;
    _later(delay, () {
      if (s.gameState != GameState.playing) return;
      if (s.currentPlayerIndex != players.indexOf(player) &&
          s.turnState != TurnState.rouletteDrawing &&
          s.turnState != TurnState.choosingRouletteColor &&
          s.turnState != TurnState.choosingDiscardAllTop) {
        return;
      }
      switch (s.turnState) {
        case TurnState.choosingDiscardAllTop:
          final cards = s.pendingDiscardAllCards;
          if (cards.isNotEmpty) selectDiscardAllTop(cards[(_rng() * cards.length).floor()].id);
        case TurnState.choosingPlayerToSwap:
          _executeBotSwap();
        case TurnState.rouletteDrawing:
          _rouletteDraw();
        case TurnState.choosingRouletteColor:
          _executeBotRouletteChoice();
        default:
          _executeBotTurn();
      }
    });
  }

  void _executeBotRouletteChoice() {
    final bot = currentPlayer;
    if (bot == null || !bot.isBot || s.turnState != TurnState.choosingRouletteColor) return;
    final color = _botColor(bot);
    _later(Timings.botRouletteColorPick, () {
      if (s.turnState == TurnState.choosingRouletteColor) setRouletteColor(color);
    });
  }

  void _executeBotSwap() {
    final bot = currentPlayer;
    if (bot == null || !bot.isBot || s.turnState != TurnState.choosingPlayerToSwap) return;
    final target = chooseSwapTarget(
      BotContext(opponents: players.where((p) => p.id != bot.id && !p.isEliminated).toList()),
      profileFor(bot),
      _rng,
    );
    if (target != null) swapHands(target.id);
  }

  void _executeBotTurn() {
    final bot = currentPlayer;
    if (bot == null || !bot.isBot || s.gameState != GameState.playing) return;
    if (s.turnState == TurnState.rouletteDrawing) {
      _rouletteDraw();
      return;
    }
    if (s.turnState != TurnState.waitingForAction) return;
    _botTurn(bot);
  }

  void _botTurn(Player bot) {
    final top = topCard;
    if (top == null) return;
    final playable =
        bot.hand.where((c) => canPlayCard(c, top, s.currentColor, s.drawStack, s.stackingMode)).toList();
    final card = chooseCard(BotContext(playable: playable, drawStack: s.drawStack), profileFor(bot), _rng);
    if (card != null) {
      playerActionPlayCard(card, card.isWild ? _botColor(bot) : null);
    } else {
      drawCardsForCurrentPlayer();
    }
  }

  // --- Game over ---

  void _onGameStateMaybeChanged() {
    final now = s.gameState;
    if (now == _lastGameState) return;
    _lastGameState = now;
    if (now == GameState.gameOver) _onGameOver();
  }

  void _onGameOver() {
    final h = human;
    final won = h != null && s.winnerId == h.id;
    // Ladder progress is solo-only and never from the daily, which pins the
    // top bot and would otherwise skip every rung below it.
    if (dailyDate == null && won) {
      final beaten = botProfiles['p-1'];
      if (beaten != null) _store.recordBotWin(beaten.id);
    }
    final date = dailyDate;
    if (date != null && h != null) {
      final st = playerStats[h.id];
      _store.markDailyDone(DailyRecord(
        date: date,
        result: won ? DailyResult.won : (h.isEliminated ? DailyResult.eliminated : DailyResult.lost),
        turns: st == null ? 0 : st.cardsPlayedTotal + st.drawsTaken,
        log: turnLog.join(),
      ));
    }
    notifyListeners();
  }
}
